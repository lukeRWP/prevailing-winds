const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');

const exec = promisify(execFile);

const DEFAULT_SSH_KEY = path.join(config.orchestratorHome, '.ssh', 'deploy_key');

function gitEnv() {
  const env = { ...process.env };
  if (fs.existsSync(DEFAULT_SSH_KEY)) {
    env.GIT_SSH_COMMAND = `ssh -i ${DEFAULT_SSH_KEY} -o StrictHostKeyChecking=accept-new`;
  }
  return env;
}

function repoDir(appName) {
  return path.join(config.reposDir, appName);
}

async function ensureRepo(appName, repoUrl) {
  const dir = repoDir(appName);

  if (fs.existsSync(path.join(dir, '.git'))) {
    logger.debug('git', `Repo exists: ${dir}`);
    return dir;
  }

  fs.mkdirSync(dir, { recursive: true });
  logger.info('git', `Cloning ${repoUrl} to ${dir}`);
  await exec('git', ['clone', repoUrl, dir], { timeout: 120000, env: gitEnv() });
  return dir;
}

async function checkout(appName, ref = 'main') {
  const dir = repoDir(appName);

  logger.info('git', `Fetching and checking out ${ref} in ${appName}`);
  await exec('git', ['fetch', '--all', '--prune'], { cwd: dir, timeout: 60000, env: gitEnv() });

  try {
    await exec('git', ['checkout', ref], { cwd: dir });
  } catch {
    await exec('git', ['checkout', '-b', ref, `origin/${ref}`], { cwd: dir });
  }

  await exec('git', ['reset', '--hard', `origin/${ref}`], { cwd: dir }).catch(() => {
    // ref might be a tag or SHA, not a tracking branch
  });

  return dir;
}

async function pull(appName, ref = 'main') {
  const dir = repoDir(appName);
  await exec('git', ['fetch', '--all', '--prune'], { cwd: dir, timeout: 60000, env: gitEnv() });

  try {
    await exec('git', ['checkout', ref], { cwd: dir, env: gitEnv() });
    await exec('git', ['pull', '--ff-only'], { cwd: dir, env: gitEnv() });
  } catch {
    await exec('git', ['checkout', ref], { cwd: dir, env: gitEnv() });
  }

  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: dir });
  const sha = stdout.trim();
  logger.info('git', `${appName} at ${sha.substring(0, 8)} (${ref})`);
  return sha;
}

module.exports = { ensureRepo, checkout, pull, repoDir };
