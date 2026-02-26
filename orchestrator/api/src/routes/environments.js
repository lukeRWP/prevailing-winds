const { Router } = require('express');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const executor = require('../services/executor');
const inventoryGenerator = require('../services/inventoryGenerator');
const proxmoxClient = require('../services/proxmoxClient');

const router = Router();

function requireAppEnv(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) { error(res, `Environment '${req.params.env}' not found`, 404); return null; }
  return { app, env, appName: req.params.app, envName: req.params.env };
}

router.get('/api/_x_/apps/:app/envs/:env/status', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;

  const data = {
    app: ctx.appName,
    env: ctx.envName,
    vlan: ctx.env.vlan,
    cidr: ctx.env.cidr,
    hosts: ctx.env.hosts,
    pipeline: ctx.env.pipeline || null,
    vms: [],
  };

  // Include live VM state from Proxmox (best-effort)
  try {
    data.vms = await proxmoxClient.findEnvironmentVMs(ctx.appName, ctx.envName, ctx.env);
  } catch (err) {
    data.vmsError = err.message;
  }

  return success(res, data);
});

router.post('/api/_y_/apps/:app/envs/:env/start', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'env-start', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Environment start queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/stop', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'env-stop', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Environment stop queued', 202);
});

router.post('/api/_y_/apps/:app/envs/:env/restart', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'env-stop', { ref, vars, callbackUrl });
  // Chain start after stop by enqueuing — the queue serializes per app:env
  await executor.enqueue(ctx.appName, ctx.envName, 'env-start', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Environment restart queued', 202);
});

// Migrate a VM to another Proxmox node
router.post('/api/_y_/apps/:app/envs/:env/vms/migrate', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;

  const { vmid, targetNode } = req.body || {};
  if (!vmid || !targetNode) {
    return error(res, 'vmid and targetNode are required', 400);
  }

  try {
    // Verify the VM belongs to this environment
    const vms = await proxmoxClient.findEnvironmentVMs(ctx.appName, ctx.envName, ctx.env);
    const vm = vms.find((v) => v.vmid === vmid);
    if (!vm) {
      return error(res, `VM ${vmid} not found in ${ctx.appName}:${ctx.envName}`, 404);
    }

    if (vm.node === targetNode) {
      return success(res, { vmid, from: vm.node, to: targetNode }, 'VM already on target node');
    }

    // Trigger migration and wait for completion
    const upid = await proxmoxClient.migrateVM(vm.node, vmid, targetNode);
    await proxmoxClient.waitForTask(vm.node, upid);

    return success(res, { vmid, name: vm.name, from: vm.node, to: targetNode }, 'VM migrated successfully');
  } catch (err) {
    return error(res, `Migration failed: ${err.message}`, 500);
  }
});

// Generate/preview Ansible inventory from app manifest
router.get('/api/_x_/apps/:app/envs/:env/inventory', (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;

  try {
    const content = inventoryGenerator.renderInventory(ctx.appName, ctx.envName);
    return success(res, { inventory: content });
  } catch (err) {
    return error(res, err.message, 500);
  }
});

router.post('/api/_y_/apps/:app/envs/:env/inventory', (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;

  try {
    const app = appRegistry.get(ctx.appName);
    const repoPath = req.body.repoPath || app._dir.replace(/\/apps\/[^/]+$/, '/repos/' + ctx.appName);
    const hostsPath = inventoryGenerator.writeInventory(ctx.appName, ctx.envName, repoPath);
    return success(res, { path: hostsPath }, 'Inventory generated');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

module.exports = router;
