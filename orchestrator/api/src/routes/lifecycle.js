const { Router } = require('express');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const lifecycle = require('../services/lifecycleOrchestrator');
const credentialGenerator = require('../services/credentialGenerator');
const proxmoxClient = require('../services/proxmoxClient');
const githubClient = require('../services/githubClient');

const router = Router();

function requireAppEnv(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) { error(res, `Environment '${req.params.env}' not found`, 404); return null; }
  return { appName: req.params.app, envName: req.params.env };
}

// Generate and store secrets for an environment
router.post('/api/_y_/apps/:app/envs/:env/secrets/generate', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const { force } = req.body || {};
    const result = await credentialGenerator.generateEnvSecrets(ctx.appName, ctx.envName, { force });
    return success(res, result, result.created ? 'Secrets generated and stored in Vault' : 'Secrets already exist');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// List Proxmox cluster nodes
router.get('/api/_x_/infra/nodes', async (req, res) => {
  try {
    const nodes = await proxmoxClient.listNodes();
    return success(res, nodes, 'Cluster nodes retrieved');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Fetch commit info from GitHub for a batch of SHAs
router.get('/api/_x_/apps/:app/git/commits', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const repoSlug = githubClient.parseRepoSlug(app.repo);
    if (!repoSlug) return error(res, 'No GitHub repo configured for this app', 400);

    const shas = (req.query.shas || '').split(',').filter(Boolean).slice(0, 20);
    if (shas.length === 0) return error(res, 'shas query parameter required', 400);

    const commits = await githubClient.getCommitInfoBatch(repoSlug, shas);
    return success(res, commits, 'Commit info retrieved');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Verify infra secrets exist in Vault
router.get('/api/_x_/infra/secrets/verify', async (req, res) => {
  try {
    const result = await credentialGenerator.verifyInfraSecrets();
    return success(res, result, 'Infra secrets verified');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Build entire environment from scratch (creds → terraform → provision → deploy)
router.post('/api/_y_/apps/:app/envs/:env/build', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const { ref, force } = req.body || {};
    const result = await lifecycle.buildEnvironment(ctx.appName, ctx.envName, { ref, force });
    return success(res, result, result.message, 202);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Resume a build from a specific step (e.g., after fixing a failure)
router.post('/api/_y_/apps/:app/envs/:env/build/resume', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const { ref, resumeFrom } = req.body || {};
    if (!resumeFrom) {
      return error(res, 'resumeFrom is required (e.g., "provision", "deploy")', 400);
    }

    const result = await lifecycle.buildEnvironment(ctx.appName, ctx.envName, { ref, resumeFrom });
    return success(res, result, result.message, 202);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Destroy environment infrastructure
router.post('/api/_y_/apps/:app/envs/:env/destroy', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const { ref } = req.body || {};
    const result = await lifecycle.destroyEnvironment(ctx.appName, ctx.envName, { ref });
    return success(res, result, result.message, 202);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// List VMs for an environment (live Proxmox discovery)
router.get('/api/_x_/apps/:app/envs/:env/vms', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const envConfig = appRegistry.getEnvironment(ctx.appName, ctx.envName);
    const vms = await proxmoxClient.findEnvironmentVMs(ctx.appName, ctx.envName, envConfig);
    return success(res, vms, `Found ${vms.length} VMs`);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Destroy orphan VMs for an environment via Proxmox API
router.post('/api/_y_/apps/:app/envs/:env/vms/destroy', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const envConfig = appRegistry.getEnvironment(ctx.appName, ctx.envName);
    const result = await proxmoxClient.destroyEnvironmentVMs(ctx.appName, ctx.envName, envConfig);
    return success(res, result, `Destroyed ${result.destroyed.length} VMs`);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

module.exports = router;
