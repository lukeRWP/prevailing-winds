const { Router } = require('express');
const { success } = require('../utils/response');
const appRegistry = require('../services/appRegistry');

const router = Router();

router.get('/health/live', (req, res) => {
  return success(res, { status: 'ok' }, 'Alive');
});

router.get('/health/status', (req, res) => {
  const apps = appRegistry.getAll();
  return success(res, {
    status: 'ok',
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    apps: apps.length,
    nodeVersion: process.version
  }, 'Healthy');
});

module.exports = router;
