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

function requireApp(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  return { appName: req.params.app };
}

router.post('/api/_y_/apps/:app/envs/:env/infra/plan', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'infra-plan', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Terraform plan queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/infra/apply', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'infra-apply', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Terraform apply queued', 202);
});

router.post('/api/_y_/apps/:app/infra/plan/shared', async (req, res) => {
  const ctx = requireApp(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, 'shared', 'infra-plan-shared', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Shared infra plan queued', 202);
});

router.post('/api/_y_/apps/:app/infra/apply/shared', async (req, res) => {
  const ctx = requireApp(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, 'shared', 'infra-apply-shared', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Shared infra apply queued', 202);
});

module.exports = router;
