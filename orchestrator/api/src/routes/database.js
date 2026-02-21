const { Router } = require('express');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const executor = require('../services/executor');

const router = Router();

function requireAppEnv(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) { error(res, `Environment '${req.params.env}' not found`, 404); return null; }
  return { appName: req.params.app, envName: req.params.env };
}

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
