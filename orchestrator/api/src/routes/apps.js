const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { Router } = require('express');
const { success, error } = require('../utils/response');
const config = require('../config');
const logger = require('../utils/logger');
const appRegistry = require('../services/appRegistry');

const router = Router();

router.get('/api/_x_/apps', (req, res) => {
  const apps = appRegistry.getAll();
  return success(res, apps, `Found ${apps.length} app(s)`);
});

router.get('/api/_x_/apps/:app', (req, res) => {
  const app = appRegistry.get(req.params.app);
  if (!app) return error(res, `App '${req.params.app}' not found`, 404);

  return success(res, {
    name: app.name,
    displayName: app.displayName,
    repo: app.repo,
    infraPath: app.infraPath,
    vaultPrefix: app.vaultPrefix,
    vmTemplate: app.vmTemplate,
    environments: app.environments
  });
});

router.get('/api/_x_/apps/:app/envs', (req, res) => {
  const app = appRegistry.get(req.params.app);
  if (!app) return error(res, `App '${req.params.app}' not found`, 404);

  const envs = app.environments || {};
  let entries = Object.entries(envs);

  if (req.query.pipeline === 'true') {
    entries = entries.filter(([, cfg]) => cfg.pipeline);
  }

  const result = entries.map(([name, cfg]) => {
    const entry = {
      name,
      vlan: cfg.vlan,
      cidr: cfg.cidr,
      hosts: Object.keys(cfg.hosts || {}),
      pipeline: cfg.pipeline || null
    };
    // Flatten pipeline config for CI matrix consumption
    if (req.query.pipeline === 'true' && cfg.pipeline) {
      entry.autoDeployBranch = cfg.pipeline.autoDeployBranch || null;
      entry.deployOnTag = cfg.pipeline.deployOnTag || null;
      entry.requiresApproval = cfg.pipeline.requiresApproval || false;
    }
    return entry;
  });

  return success(res, result, `Found ${result.length} environment(s)`);
});

// Register or update an app manifest (admin-only)
router.put('/api/_u_/apps/:app/manifest', (req, res) => {
  const { app: appName } = req.params;
  const { yaml: rawYaml } = req.body;

  if (!rawYaml) {
    return error(res, 'Request body must include "yaml" field with raw app.yml content', 400);
  }

  // Parse and validate
  let manifest;
  try {
    manifest = yaml.load(rawYaml);
  } catch (e) {
    return error(res, `Invalid YAML: ${e.message}`, 400);
  }

  if (!manifest || !manifest.name) {
    return error(res, 'Manifest must include a "name" field', 400);
  }

  if (manifest.name !== appName) {
    return error(res, `Manifest name "${manifest.name}" does not match URL param "${appName}"`, 400);
  }

  // Write to apps directory
  const appDir = path.join(config.appsDir, appName);
  fs.mkdirSync(appDir, { recursive: true });

  const manifestPath = path.join(appDir, 'app.yml');
  fs.writeFileSync(manifestPath, rawYaml, 'utf8');

  // Reload registry
  appRegistry.loadApps();

  logger.info('apps', `Registered/updated manifest for app "${appName}"`);
  return success(res, { app: appName, path: manifestPath }, `App "${appName}" manifest registered`);
});

module.exports = router;
