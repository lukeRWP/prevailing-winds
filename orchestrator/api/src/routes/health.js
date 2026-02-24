const { Router } = require('express');
const { success } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const { registry } = require('../metrics');

const router = Router();

router.get('/health/live', (req, res) => {
  return success(res, { status: 'ok' }, 'Alive');
});

router.get('/health/status', (req, res) => {
  const apps = appRegistry.getAll();
  const mem = process.memoryUsage();
  return success(res, {
    status: 'ok',
    uptime: process.uptime(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    memoryMB: Math.round(mem.rss / 1024 / 1024),
    apps: apps.length,
    nodeVersion: process.version
  }, 'Healthy');
});

// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

module.exports = router;
