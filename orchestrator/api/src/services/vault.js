const logger = require('../utils/logger');
const config = require('../config');

let vaultClient = null;
let vaultToken = null;
let tokenExpiry = 0;

async function initVault() {
  if (!config.vault.roleId || !config.vault.secretId) {
    logger.warn('vault', 'Vault credentials not configured — using env fallback');
    return null;
  }

  try {
    const vault = require('node-vault')({
      apiVersion: 'v1',
      endpoint: config.vault.addr,
      requestOptions: { strictSSL: false }
    });

    const result = await vault.approleLogin({
      role_id: config.vault.roleId,
      secret_id: config.vault.secretId
    });

    vaultToken = result.auth.client_token;
    tokenExpiry = Date.now() + (result.auth.lease_duration * 1000 * 0.8);
    vault.token = vaultToken;
    vaultClient = vault;

    logger.info('vault', 'Authenticated with Vault via AppRole');
    return vault;
  } catch (err) {
    logger.error('vault', `Vault authentication failed: ${err.message}`);
    return null;
  }
}

async function ensureToken() {
  if (!vaultClient || Date.now() > tokenExpiry) {
    await initVault();
  }
}

async function readSecret(path) {
  await ensureToken();

  if (!vaultClient) return null;

  try {
    const result = await vaultClient.read(path);
    return result.data.data || result.data;
  } catch (err) {
    logger.error('vault', `Failed to read secret at ${path}: ${err.message}`);
    return null;
  }
}

async function getAppSecrets(app) {
  const vaultPrefix = `secret/data/apps/${app}`;
  const secrets = await readSecret(vaultPrefix);
  return secrets || {};
}

async function getApiKey() {
  if (config.apiKey) return config.apiKey;

  const secrets = await readSecret('secret/data/orchestrator');
  return secrets?.api_key || null;
}

module.exports = { initVault, readSecret, getAppSecrets, getApiKey };
