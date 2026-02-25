const { Router } = require('express');
const { success, error } = require('../utils/response');
const operationQueue = require('../services/operationQueue');
const logger = require('../utils/logger');

const router = Router();

// Operations over time — bucketed by day or hour
router.get('/api/_x_/metrics/ops-over-time', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const bucket = req.query.bucket === 'hour' ? '%Y-%m-%dT%H:00' : '%Y-%m-%d';
    const db = operationQueue.getDb();

    const rows = db.prepare(`
      SELECT strftime(?, created_at) as bucket, status, COUNT(*) as count
      FROM operations
      WHERE created_at >= datetime('now', ?)
      GROUP BY bucket, status
      ORDER BY bucket
    `).all(bucket, `-${days} days`);

    // Pivot into { bucket, success, failed, cancelled, queued, running }
    const byBucket = {};
    for (const row of rows) {
      if (!byBucket[row.bucket]) {
        byBucket[row.bucket] = { bucket: row.bucket, success: 0, failed: 0, cancelled: 0, queued: 0, running: 0 };
      }
      byBucket[row.bucket][row.status] = row.count;
    }

    return success(res, Object.values(byBucket), `${Object.keys(byBucket).length} buckets`);
  } catch (err) {
    logger.error('metrics', `ops-over-time failed: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// Average and P95 duration by operation type
router.get('/api/_x_/metrics/duration-by-type', (req, res) => {
  try {
    const db = operationQueue.getDb();

    const rows = db.prepare(`
      SELECT type,
        COUNT(*) as total,
        CAST(AVG(duration_ms) AS INTEGER) as avg_ms,
        MIN(duration_ms) as min_ms,
        MAX(duration_ms) as max_ms
      FROM operations
      WHERE status = 'success' AND duration_ms IS NOT NULL
      GROUP BY type
      ORDER BY total DESC
    `).all();

    // Compute P95 per type (SQLite doesn't have PERCENTILE, so use subquery)
    const result = rows.map(row => {
      const p95Row = db.prepare(`
        SELECT duration_ms FROM operations
        WHERE type = ? AND status = 'success' AND duration_ms IS NOT NULL
        ORDER BY duration_ms ASC
        LIMIT 1 OFFSET CAST(? * 0.95 AS INTEGER)
      `).get(row.type, row.total);

      return {
        type: row.type,
        total: row.total,
        avgMs: row.avg_ms,
        minMs: row.min_ms,
        maxMs: row.max_ms,
        p95Ms: p95Row ? p95Row.duration_ms : row.max_ms,
      };
    });

    return success(res, result, `${result.length} operation types`);
  } catch (err) {
    logger.error('metrics', `duration-by-type failed: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// Success rate over time
router.get('/api/_x_/metrics/success-rate', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const db = operationQueue.getDb();

    const rows = db.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) as bucket,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(*) as total
      FROM operations
      WHERE created_at >= datetime('now', ?)
        AND status IN ('success', 'failed')
      GROUP BY bucket
      ORDER BY bucket
    `).all(`-${days} days`);

    const result = rows.map(row => ({
      bucket: row.bucket,
      success: row.success,
      failed: row.failed,
      total: row.total,
      rate: row.total > 0 ? Math.round((row.success / row.total) * 100) : 0,
    }));

    return success(res, result, `${result.length} days`);
  } catch (err) {
    logger.error('metrics', `success-rate failed: ${err.message}`);
    return error(res, err.message, 500);
  }
});

module.exports = router;
