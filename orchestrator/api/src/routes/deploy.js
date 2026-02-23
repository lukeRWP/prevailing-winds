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

function initiator(req) {
  return req.authRole === 'admin' ? 'admin' : `app:${req.authorizedApp || 'unknown'}`;
}

router.post('/api/_y_/apps/:app/envs/:env/provision', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'provision', { ref, vars, callbackUrl, initiatedBy: initiator(req) });
  return success(res, { opId }, 'Provision queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/deploy', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'deploy', { ref, vars, callbackUrl, initiatedBy: initiator(req) });
  return success(res, { opId }, 'Deploy queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/deploy/server', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'deploy-server', { ref, vars, callbackUrl, initiatedBy: initiator(req) });
  return success(res, { opId }, 'Server deploy queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/deploy/client', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'deploy-client', { ref, vars, callbackUrl, initiatedBy: initiator(req) });
  return success(res, { opId }, 'Client deploy queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/rollback', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'rollback', { ref, vars, callbackUrl, initiatedBy: initiator(req) });
  return success(res, { opId }, 'Rollback queued', 202);
});

module.exports = router;
