const crypto = require('crypto');
const vault = require('./vault');
const logger = require('../utils/logger');

function randomPassword(length = 32) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

function randomHex(length = 64) {
  return crypto.randomBytes(length / 2).toString('hex');
}

async function generateEnvSecrets(appName, envName, { force = false } = {}) {
  const secretPath = `secret/data/apps/${appName}/${envName}`;

  if (!force) {
    const existing = await vault.readSecret(secretPath);
    if (existing && existing.mysql_root_password) {
      logger.info('credgen', `Secrets already exist at ${secretPath}, skipping (use force=true to regenerate)`);
      return { created: false, path: secretPath };
    }
  }

  const secrets = {
    mysql_root_password: randomPassword(32),
    mysql_user: `${appName}_api_001`,
    mysql_password: randomPassword(32),
    mysql_ssl_user: `${appName}_ssl_user`,
    mysql_ssl_password: randomPassword(32),
    minio_access_key: randomPassword(20),
    minio_secret_key: randomPassword(40),
    auth_secret_key: randomHex(64),
    cookie_secret: randomHex(64),
    file_encryption_key: randomHex(64),
    sync_encryption_key: randomHex(64),
  };

  await vault.writeSecret(secretPath, secrets);
  logger.info('credgen', `Generated and stored secrets at ${secretPath}`);
  return { created: true, path: secretPath };
}

async function verifyInfraSecrets() {
  const infraPath = 'secret/data/pw/infra';
  const existing = await vault.readSecret(infraPath);

  const required = [
    'proxmox_api_url', 'proxmox_api_token', 'unifi_api_key',
    'ssh_public_key', 'ssh_private_key',
    'minio_access_key', 'minio_secret_key'
  ];
  const missing = required.filter(k => !existing || !existing[k]);

  if (missing.length > 0) {
    throw new Error(`Missing infra secrets at ${infraPath}: ${missing.join(', ')}`);
  }

  logger.info('credgen', 'Infra secrets verified');
  return { valid: true, path: infraPath };
}

module.exports = { generateEnvSecrets, verifyInfraSecrets, randomPassword, randomHex };
