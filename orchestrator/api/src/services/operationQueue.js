const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');

let db;

const STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

function init() {
  const dbDir = path.dirname(config.dbPath);
  fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      app TEXT NOT NULL,
      env TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      ref TEXT,
      vars TEXT,
      callback_url TEXT,
      started_at TEXT,
      completed_at TEXT,
      output TEXT DEFAULT '',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_ops_app_env ON operations (app, env)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ops_status ON operations (status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ops_created ON operations (created_at DESC)`);

  // Add columns for audit trail (graceful migration — ignore if already exist)
  const addColumn = (col, type) => {
    try { db.exec(`ALTER TABLE operations ADD COLUMN ${col} ${type}`); } catch { /* already exists */ }
  };
  addColumn('duration_ms', 'INTEGER');
  addColumn('initiated_by', 'TEXT');

  logger.info('queue', 'Operation queue initialized');
}

function create({ app, env, type, ref, vars, callbackUrl, initiatedBy }) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO operations (id, app, env, type, status, ref, vars, callback_url, initiated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, app, env || null, type, STATUSES.QUEUED, ref || null, vars ? JSON.stringify(vars) : null, callbackUrl || null, initiatedBy || null);
  return id;
}

function get(id) {
  const row = db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
  if (!row) return null;
  return deserialize(row);
}

function list({ app, env, status, limit = 50, offset = 0 } = {}) {
  let sql = 'SELECT * FROM operations WHERE 1=1';
  const params = [];

  if (app) { sql += ' AND app = ?'; params.push(app); }
  if (env) { sql += ' AND env = ?'; params.push(env); }
  if (status) { sql += ' AND status = ?'; params.push(status); }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params).map(deserialize);
}

function markRunning(id) {
  db.prepare(`UPDATE operations SET status = ?, started_at = datetime('now') WHERE id = ?`)
    .run(STATUSES.RUNNING, id);
}

function markSuccess(id) {
  db.prepare(`
    UPDATE operations SET status = ?, completed_at = datetime('now'),
    duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
    WHERE id = ?
  `).run(STATUSES.SUCCESS, id);
}

function markFailed(id, errorMsg) {
  db.prepare(`
    UPDATE operations SET status = ?, completed_at = datetime('now'), error = ?,
    duration_ms = CAST((julianday('now') - julianday(started_at)) * 86400000 AS INTEGER)
    WHERE id = ?
  `).run(STATUSES.FAILED, errorMsg, id);
}

function cancel(id) {
  const op = get(id);
  if (!op) return false;
  if (op.status !== STATUSES.QUEUED) return false;
  db.prepare(`UPDATE operations SET status = ?, completed_at = datetime('now') WHERE id = ?`)
    .run(STATUSES.CANCELLED, id);
  return true;
}

function appendOutput(id, text) {
  db.prepare(`UPDATE operations SET output = output || ? WHERE id = ?`).run(text, id);
}

function hasRunningOp(app, env) {
  const row = db.prepare(
    'SELECT id FROM operations WHERE app = ? AND env = ? AND status IN (?, ?) LIMIT 1'
  ).get(app, env, STATUSES.QUEUED, STATUSES.RUNNING);
  return !!row;
}

function getNextQueued(app, env) {
  return db.prepare(
    'SELECT * FROM operations WHERE app = ? AND env = ? AND status = ? ORDER BY created_at ASC LIMIT 1'
  ).get(app, env, STATUSES.QUEUED);
}

function deserialize(row) {
  let vars = null;
  if (row.vars) {
    try {
      vars = JSON.parse(row.vars);
    } catch (err) {
      logger.warn('queue', `Failed to parse vars for operation ${row.id}: ${err.message}`);
    }
  }
  return { ...row, vars };
}

function close() {
  if (db) db.close();
}

module.exports = {
  init, create, get, list,
  markRunning, markSuccess, markFailed, cancel,
  appendOutput, hasRunningOp, getNextQueued, close,
  getDb: () => db,
  STATUSES
};
