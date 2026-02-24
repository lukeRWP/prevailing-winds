/**
 * Change History — stores applied change sets with before/after manifest snapshots.
 * Uses SQLite (same DB as operations) for persistence.
 * Enables rollback by restoring previous manifest state.
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const logger = require('../utils/logger');
const config = require('../config');
const appRegistry = require('./appRegistry');

let db;

function init() {
  const dbDir = path.join(config.orchestratorHome, 'data');
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'changes.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS change_sets (
      id TEXT PRIMARY KEY,
      app TEXT NOT NULL,
      changes TEXT NOT NULL,
      manifest_before TEXT NOT NULL,
      manifest_after TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'applied',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      applied_by TEXT
    )
  `);

  logger.info('change-history', 'Change history database initialized');
}

/**
 * Record a change set with before/after manifest snapshots.
 */
function record(appName, changes, manifestBefore, manifestAfter, appliedBy) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO change_sets (id, app, changes, manifest_before, manifest_after, applied_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    appName,
    JSON.stringify(changes),
    typeof manifestBefore === 'string' ? manifestBefore : yaml.dump(manifestBefore),
    typeof manifestAfter === 'string' ? manifestAfter : yaml.dump(manifestAfter),
    appliedBy || null
  );
  logger.info('change-history', `Recorded change set ${id} for app ${appName} (${changes.length} changes)`);
  return id;
}

/**
 * List change sets for an app.
 */
function list(appName, limit = 50) {
  const stmt = db.prepare(`
    SELECT id, app, changes, status, created_at, applied_by
    FROM change_sets
    WHERE app = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(appName, limit);
  return rows.map((row) => ({
    id: row.id,
    app: row.app,
    changes: JSON.parse(row.changes),
    status: row.status,
    createdAt: row.created_at,
    appliedBy: row.applied_by,
  }));
}

/**
 * Get a single change set by ID.
 */
function get(changeSetId) {
  const stmt = db.prepare(`
    SELECT id, app, changes, manifest_before, manifest_after, status, created_at, applied_by
    FROM change_sets
    WHERE id = ?
  `);
  const row = stmt.get(changeSetId);
  if (!row) return null;
  return {
    id: row.id,
    app: row.app,
    changes: JSON.parse(row.changes),
    manifestBefore: row.manifest_before,
    manifestAfter: row.manifest_after,
    status: row.status,
    createdAt: row.created_at,
    appliedBy: row.applied_by,
  };
}

/**
 * Rollback a change set — restores the manifest_before snapshot.
 * Returns the rollback change set ID.
 */
function rollback(changeSetId) {
  const changeSet = get(changeSetId);
  if (!changeSet) throw new Error(`Change set ${changeSetId} not found`);
  if (changeSet.status === 'rolled_back') throw new Error('Change set already rolled back');

  const appName = changeSet.app;
  const app = appRegistry.get(appName);
  if (!app) throw new Error(`App ${appName} not found`);

  // Get current manifest as the "before" for the rollback
  const currentManifest = yaml.dump(app);

  // Write the pre-change manifest back to disk
  const appDir = path.join(config.appsDir, appName);
  const manifestPath = path.join(appDir, 'app.yml');
  fs.writeFileSync(manifestPath, changeSet.manifestBefore, 'utf8');

  // Reload registry
  appRegistry.loadApps();

  // Mark original as rolled back
  const updateStmt = db.prepare('UPDATE change_sets SET status = ? WHERE id = ?');
  updateStmt.run('rolled_back', changeSetId);

  // Record the rollback as a new change set
  const rollbackId = record(
    appName,
    [{ target: 'rollback', description: `Rollback of change set ${changeSetId}`, source: 'system' }],
    currentManifest,
    changeSet.manifestBefore,
    'system:rollback'
  );

  logger.info('change-history', `Rolled back change set ${changeSetId} for app ${appName}`);
  return rollbackId;
}

module.exports = { init, record, list, get, rollback };
