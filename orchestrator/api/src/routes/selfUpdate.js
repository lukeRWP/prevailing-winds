const { Router } = require('express');
const { execSync, spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { success, error } = require('../utils/response');

const router = Router();

/**
 * POST /api/_y_/self/update
 *
 * Self-update the orchestrator by pulling latest code and restarting.
 * Admin-only. Used by PW deploy workflow after push to master.
 *
 * Flow:
 *   1. git pull origin master in the PW repo
 *   2. Run deploy-orchestrator.sh (syncs code, installs deps, restarts PM2)
 *   3. Return success (caller should verify health after restart)
 */
router.post('/api/_y_/self/update', async (req, res) => {
  const repoDir = path.join(config.orchestratorHome, 'pw-repo');
  const scriptPath = path.join(repoDir, 'scripts', 'deploy-orchestrator.sh');

  try {
    logger.info('self-update', 'Self-update triggered');

    // Step 1: Pull latest code
    const pullOutput = execSync('git fetch origin master && git reset --hard origin/master', {
      cwd: repoDir,
      timeout: 30000,
      env: { ...process.env, HOME: config.orchestratorHome },
      encoding: 'utf-8',
    });
    logger.info('self-update', `Git pull: ${pullOutput.trim()}`);

    // Step 2: Run deploy script (syncs files, installs deps)
    // Run synchronously so we can report success/failure before restart
    const deployOutput = execSync(`bash ${scriptPath}`, {
      cwd: repoDir,
      timeout: 120000,
      env: { ...process.env, HOME: config.orchestratorHome },
      encoding: 'utf-8',
    });
    logger.info('self-update', `Deploy script completed (${deployOutput.length} chars output)`);

    // Respond before restart — PM2 will restart the process
    success(res, {
      updated: true,
      pullOutput: pullOutput.trim().split('\n').slice(-5).join('\n'),
      message: 'Update applied. PM2 will restart the service.',
    }, 'Self-update completed');

    // Step 3: Trigger PM2 restart after response is sent
    // Small delay so the HTTP response completes before the process exits
    setTimeout(() => {
      logger.info('self-update', 'Triggering PM2 restart...');
      try {
        execSync('pm2 restart orchestrator-api', {
          timeout: 10000,
          env: { ...process.env, HOME: config.orchestratorHome },
        });
      } catch (restartErr) {
        // If PM2 restart fails, systemd will restart us
        logger.warn('self-update', `PM2 restart failed: ${restartErr.message}`);
      }
    }, 1000);

  } catch (err) {
    logger.error('self-update', `Self-update failed: ${err.message}`, { stderr: err.stderr });
    error(res, `Self-update failed: ${err.message}`, 500);
  }
});

module.exports = router;
