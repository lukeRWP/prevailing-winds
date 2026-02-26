const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { v4: uuidv4 } = require('uuid');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const executor = require('../services/executor');
const vault = require('../services/vault');
const sshFileService = require('../services/sshFileService');

const router = Router();

function requireAppEnv(req, res) {
  const app = appRegistry.get(req.params.app);
  if (!app) { error(res, `App '${req.params.app}' not found`, 404); return null; }
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) { error(res, `Environment '${req.params.env}' not found`, 404); return null; }
  return { appName: req.params.app, envName: req.params.env };
}

// Get database connection info for an environment
router.get('/api/_x_/apps/:app/envs/:env/db/connection', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const app = appRegistry.get(ctx.appName);
    const envConfig = appRegistry.getEnvironment(ctx.appName, ctx.envName);
    const dbHost = envConfig.hosts?.database;
    if (!dbHost) return error(res, 'No database host configured for this environment', 404);

    const secrets = await vault.readSecret(`secret/data/apps/${ctx.appName}/${ctx.envName}`);

    return success(res, {
      host: dbHost.ip,
      port: 3306,
      user: secrets?.mysql_user || `${ctx.appName}_api_001`,
      password: secrets?.mysql_password || null,
      rootPassword: secrets?.mysql_root_password || null,
      sslUser: secrets?.mysql_ssl_user || null,
      sslPassword: secrets?.mysql_ssl_password || null,
      databases: app.databases?.list || [],
    }, 'Connection info retrieved');
  } catch (err) {
    return error(res, err.message, 500);
  }
});

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

router.post('/api/_y_/apps/:app/envs/:env/db/restore', async (req, res) => {
  const ctx = requireAppEnv(req, res);
  if (!ctx) return;
  const { ref, vars, callbackUrl } = req.body || {};
  const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-restore', { ref, vars, callbackUrl });
  return success(res, { opId }, 'Database restore queued', 202);
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

// --- Backup file management ---

const BACKUP_DIR_TEMPLATE = '/opt/{app}-db/backups';
const FILENAME_RE = /^(backup|pre-deploy|pre-migrate|pre-restore|seed)-[\w.T-]+\.sql(\.gz)?$/;
const UPLOADS_DIR = '/run/orchestrator/uploads';

function backupDir(appName) {
  return BACKUP_DIR_TEMPLATE.replace('{app}', appName);
}

function resolveDbHost(appName, envName) {
  const env = appRegistry.getEnvironment(appName, envName);
  return env?.hosts?.database?.ip || null;
}

function classifyBackup(filename) {
  if (filename.startsWith('backup-')) return 'scheduled';
  if (filename.startsWith('pre-deploy-')) return 'pre-deploy';
  if (filename.startsWith('pre-migrate-')) return 'pre-migrate';
  if (filename.startsWith('pre-restore-')) return 'pre-restore';
  if (filename.startsWith('seed-')) return 'seed';
  return 'unknown';
}

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

// List available backups on the DB host
router.get('/api/_x_/apps/:app/envs/:env/db/backups', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const host = resolveDbHost(ctx.appName, ctx.envName);
    if (!host) return error(res, 'No database host configured', 404);

    const dir = backupDir(ctx.appName);
    const files = await sshFileService.listFiles(host, dir, '*.sql*');

    const backups = files.map((f) => ({
      name: f.name,
      size: f.size,
      sizeHuman: humanSize(f.size),
      modified: new Date(f.modified * 1000).toISOString(),
      type: classifyBackup(f.name),
      compressed: f.name.endsWith('.gz'),
    }));

    return success(res, { host, backupDir: dir, backups });
  } catch (err) {
    return error(res, err.message, 500);
  }
});

// Download a backup file from the DB host
router.get('/api/_x_/apps/:app/envs/:env/db/backups/:filename', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const { filename } = req.params;
    if (!FILENAME_RE.test(filename)) {
      return error(res, 'Invalid backup filename', 400);
    }

    const host = resolveDbHost(ctx.appName, ctx.envName);
    if (!host) return error(res, 'No database host configured', 404);

    const remotePath = `${backupDir(ctx.appName)}/${filename}`;
    const fileSize = await sshFileService.statFile(host, remotePath);
    if (fileSize === null) return error(res, 'Backup file not found', 404);

    const contentType = filename.endsWith('.gz') ? 'application/gzip' : 'application/sql';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const handle = sshFileService.streamFile(host, remotePath, res);
    req.on('close', () => handle.kill());
  } catch (err) {
    if (!res.headersSent) return error(res, err.message, 500);
  }
});

// Upload a backup file and queue a restore operation
router.post('/api/_y_/apps/:app/envs/:env/db/restore/upload', async (req, res) => {
  try {
    const ctx = requireAppEnv(req, res);
    if (!ctx) return;

    const filename = req.query.filename || req.headers['x-filename'];
    if (!filename || !/\.(sql|sql\.gz)$/.test(filename)) {
      return error(res, 'Filename required (query param or X-Filename header), must end in .sql or .sql.gz', 400);
    }

    const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempPath = path.join(UPLOADS_DIR, `${uuidv4()}-${safeName}`);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const writeStream = fs.createWriteStream(tempPath);
    await pipeline(req, writeStream);

    const stat = fs.statSync(tempPath);
    if (stat.size === 0) {
      fs.unlinkSync(tempPath);
      return error(res, 'Uploaded file is empty', 400);
    }

    const vars = {
      restore_file_local: tempPath,
      restore_filename: safeName,
    };
    const opId = await executor.enqueue(ctx.appName, ctx.envName, 'db-restore', { vars });

    return success(res, { opId, filename: safeName, size: stat.size, sizeHuman: humanSize(stat.size) }, 'Restore queued', 202);
  } catch (err) {
    return error(res, err.message, 500);
  }
});

module.exports = router;
