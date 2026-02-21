const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const logger = require('../utils/logger');
const config = require('../config');

let apps = new Map();

function loadApps() {
  const appsDir = config.appsDir;
  apps.clear();

  if (!fs.existsSync(appsDir)) {
    logger.warn('registry', `Apps directory not found: ${appsDir}`);
    return;
  }

  const entries = fs.readdirSync(appsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(appsDir, entry.name, 'app.yml');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = yaml.load(raw);
      manifest._dir = path.join(appsDir, entry.name);
      apps.set(manifest.name, manifest);
      logger.info('registry', `Loaded app: ${manifest.name} (${Object.keys(manifest.environments || {}).length} envs)`);
    } catch (err) {
      logger.error('registry', `Failed to load manifest ${manifestPath}: ${err.message}`);
    }
  }
}

function getAll() {
  return Array.from(apps.values()).map(summarize);
}

function get(name) {
  return apps.get(name) || null;
}

function getEnvironments(name) {
  const app = apps.get(name);
  if (!app || !app.environments) return null;
  return app.environments;
}

function getEnvironment(appName, envName) {
  const envs = getEnvironments(appName);
  if (!envs) return null;
  return envs[envName] || null;
}

function summarize(app) {
  return {
    name: app.name,
    displayName: app.displayName,
    repo: app.repo,
    infraPath: app.infraPath,
    environments: Object.keys(app.environments || {})
  };
}

function reload() {
  loadApps();
  return apps.size;
}

module.exports = { loadApps, getAll, get, getEnvironments, getEnvironment, reload };
