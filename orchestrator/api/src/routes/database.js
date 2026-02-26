const { Router } = require('express');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const executor = require('../services/executor');
const vault = require('../services/vault');

const router = Router();

function requireAppEnv(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) { error(res, `Environment '${req.params.env}' not found`, 404); return null; }
  return { appName: req.params.app, envName: req.params.env };
}

// Get database connection info for an environment
router.get('/api/_x_/apps/:app/envs/:env/db/connection', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const app = appRegistry.get(ctx.appName);
    const envConfig = appRegistry.getEnvironment(ctx.appName, ctx.envName);
    const dbHost = envConfig.hosts?.database;
    if (!dbHost) return error(res, 'No database host configured for this environment', 404);

    const secrets = await vault.readSecret(`secret/data/apps/${ctx.appName}/${ctx.envName}`);

    return success(res, {
      host: dbHost.ip,
      port: 3306,
      user: secrets?.mysql_user || `${ctx.appName}_api_001`,
      password: secrets?.mysql_password || null,
      rootPassword: secrets?.mysql_root_password || null,
      sslUser: secrets?.mysql_ssl_user || null,
      sslPassword: secrets?.mysql_ssl_password || null,
      databases: app.databases?.list || [],
    }, 'Connection info retrieved');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

router.post('/api/_y_/apps/:app/envs/:env/db/setup', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-setup', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Database setup queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/db/migrate', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-migrate', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Database migration queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/db/backup', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-backup', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Database backup queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/db/seed', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, sourceEnv, callbackUrl } = req.body || {};
  const mergedVars = { ...vars, source_env: sourceEnv };
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-seed', { ref, vars: mergedVars, callbackUrl });
  return success(res, { opId }, 'Database seed queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/seed', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, sourceEnv, callbackUrl } = req.body || {};
  const mergedVars = { ...vars, source_env: sourceEnv };
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'seed', { ref, vars: mergedVars, callbackUrl });
  return success(res, { opId }, 'Full seed queued', 202);
});

module.exports = router;
