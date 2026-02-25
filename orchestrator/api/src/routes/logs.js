const { Router } = require('express');
const { success } = require('../utils/response');
const logger = require('../utils/logger');

const router = Router();

// Structured log query from in-memory ring buffer (admin-only)
router.get('/api/_x_/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 2000);
  const level = req.query.level || undefined;
  const search = req.query.search || undefined;
  const context = req.query.context || undefined;

  const entries = logger.getRecentLogs({ limit, level, search, context });
  return success(res, entries, `${entries.length} log entries`);
});

module.exports = router;
