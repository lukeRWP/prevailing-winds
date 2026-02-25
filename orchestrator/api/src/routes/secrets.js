const { Router } = require('express');
const { success, error } = require('../utils/response');
const vault = require('../services/vault');
const appRegistry = require('../services/appRegistry');
const logger = require('../utils/logger');

const router = Router();

const VALID_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/;

function validateSecrets(secrets) {
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    return 'Request body must include "secrets" object';
  }
  const invalidKeys = Object.keys(secrets).filter(k => !VALID_KEY.test(k));
  if (invalidKeys.length > 0) {
    return `Invalid key name(s): ${invalidKeys.join(', ')}`;
  }
  // Ensure all values are strings
  const nonStringKeys = Object.entries(secrets).filter(([, v]) => typeof v !== 'string').map(([k]) => k);
  if (nonStringKeys.length > 0) {
    return `Values must be strings for key(s): ${nonStringKeys.join(', ')}`;
  }
  return null;
}

// --- App-level secrets ---

router.get('/api/_x_/apps/:app/secrets', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const vaultPath = `secret/data/apps/${req.params.app}`;
    const secrets = await vault.readSecret(vaultPath);
    return success(res, {
      path: vaultPath,
      secrets: secrets || {},
    }, `Retrieved ${secrets ? Object.keys(secrets).length : 0} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to read app secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.put('/api/_u_/apps/:app/secrets', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const validationErr = validateSecrets(req.body.secrets);
    if (validationErr) return error(res, validationErr, 400);

    const vaultPath = `secret/data/apps/${req.params.app}`;
    const result = await vault.mergeSecret(vaultPath, req.body.secrets);
    return success(res, result, `Updated ${result.keysUpdated.length} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to write app secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.delete('/api/_d_/apps/:app/secrets/:key', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const vaultPath = `secret/data/apps/${req.params.app}`;
    const result = await vault.deleteSecretKey(vaultPath, req.params.key);
    return success(res, result, `Deleted secret '${req.params.key}'`);
  } catch (err) {
    if (err.message.includes('not found')) {
      return error(res, err.message, 404);
    }
    logger.error('secrets', `Failed to delete app secret: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// --- Environment-level secrets ---

router.get('/api/_x_/apps/:app/envs/:env/secrets', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const env = appRegistry.getEnvironment(req.params.app, req.params.env);
    if (!env) return error(res, `Environment '${req.params.env}' not found`, 404);

    const vaultPath = `secret/data/apps/${req.params.app}/${req.params.env}`;
    const secrets = await vault.readSecret(vaultPath);
    return success(res, {
      path: vaultPath,
      secrets: secrets || {},
    }, `Retrieved ${secrets ? Object.keys(secrets).length : 0} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to read env secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.put('/api/_u_/apps/:app/envs/:env/secrets', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const env = appRegistry.getEnvironment(req.params.app, req.params.env);
    if (!env) return error(res, `Environment '${req.params.env}' not found`, 404);

    const validationErr = validateSecrets(req.body.secrets);
    if (validationErr) return error(res, validationErr, 400);

    const vaultPath = `secret/data/apps/${req.params.app}/${req.params.env}`;
    const result = await vault.mergeSecret(vaultPath, req.body.secrets);
    return success(res, result, `Updated ${result.keysUpdated.length} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to write env secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.delete('/api/_d_/apps/:app/envs/:env/secrets/:key', async (req, res) => {
  try {
    const app = appRegistry.get(req.params.app);
    if (!app) return error(res, `App '${req.params.app}' not found`, 404);

    const env = appRegistry.getEnvironment(req.params.app, req.params.env);
    if (!env) return error(res, `Environment '${req.params.env}' not found`, 404);

    const vaultPath = `secret/data/apps/${req.params.app}/${req.params.env}`;
    const result = await vault.deleteSecretKey(vaultPath, req.params.key);
    return success(res, result, `Deleted secret '${req.params.key}'`);
  } catch (err) {
    if (err.message.includes('not found')) {
      return error(res, err.message, 404);
    }
    logger.error('secrets', `Failed to delete env secret: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// --- Entra OAuth config (admin-only, consumed by UI startup) ---

router.get('/api/_x_/entra/config', async (req, res) => {
  try {
    const vaultPath = 'secret/data/pw/entra';
    const secrets = await vault.readSecret(vaultPath);
    return success(res, {
      path: vaultPath,
      secrets: secrets || {},
    }, `Retrieved ${secrets ? Object.keys(secrets).length : 0} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to read Entra config: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// --- Infrastructure secrets (admin-only via auth middleware) ---

router.get('/api/_x_/infra/secrets', async (req, res) => {
  try {
    const vaultPath = 'secret/data/pw/infra';
    const secrets = await vault.readSecret(vaultPath);
    return success(res, {
      path: vaultPath,
      secrets: secrets || {},
    }, `Retrieved ${secrets ? Object.keys(secrets).length : 0} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to read infra secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.put('/api/_u_/infra/secrets', async (req, res) => {
  try {
    const validationErr = validateSecrets(req.body.secrets);
    if (validationErr) return error(res, validationErr, 400);

    const vaultPath = 'secret/data/pw/infra';
    const result = await vault.mergeSecret(vaultPath, req.body.secrets);
    return success(res, result, `Updated ${result.keysUpdated.length} secret(s)`);
  } catch (err) {
    logger.error('secrets', `Failed to write infra secrets: ${err.message}`);
    return error(res, err.message, 500);
  }
});

router.delete('/api/_d_/infra/secrets/:key', async (req, res) => {
  try {
    const vaultPath = 'secret/data/pw/infra';
    const result = await vault.deleteSecretKey(vaultPath, req.params.key);
    return success(res, result, `Deleted secret '${req.params.key}'`);
  } catch (err) {
    if (err.message.includes('not found')) {
      return error(res, err.message, 404);
    }
    logger.error('secrets', `Failed to delete infra secret: ${err.message}`);
    return error(res, err.message, 500);
  }
});

module.exports = router;
