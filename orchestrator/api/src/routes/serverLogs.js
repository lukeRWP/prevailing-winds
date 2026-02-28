const { Router } = require('express');
const { success, error } = require('../utils/response');
const appRegistry = require('../services/appRegistry');
const sshLogService = require('../services/sshLogService');
const logger = require('../utils/logger');

const router = Router();

const VALID_SERVICES = Object.keys(sshLogService.SERVICE_LOG_COMMANDS);

/**
 * Resolve the host IP for a service in a given app/env.
 */
function resolveHost(appName, envName, service) {
  const env = appRegistry.getEnvironment(appName, envName);
  if (!env) return null;

  const role = sshLogService.SERVICE_TO_ROLE[service];
  if (!role) return null;

  const host = env.hosts?.[role];
  return host?.ip || null;
}

// List available services and their host mappings for an environment
router.get('/api/_x_/apps/:app/envs/:env/server-logs', (req, res) => {
  const env = appRegistry.getEnvironment(req.params.app, req.params.env);
  if (!env) return error(res, `Environment '${req.params.env}' not found`, 404);

  const services = VALID_SERVICES.map((service) => {
    const role = sshLogService.SERVICE_TO_ROLE[service];
    const host = env.hosts?.[role];
    return {
      service,
      role,
      host: host?.ip || null,
      available: !!host?.ip,
    };
  });

  return success(res, services, `${services.filter((s) => s.available).length} services available`);
});

// Snapshot: fetch last N lines from a service log
router.get('/api/_x_/apps/:app/envs/:env/server-logs/snapshot', async (req, res) => {
  const { app, env } = req.params;
  const service = req.query.service;
  const lines = Math.min(parseInt(req.query.lines) || 500, 5000);

  if (!service || !VALID_SERVICES.includes(service)) {
    return error(res, `Invalid service. Must be one of: ${VALID_SERVICES.join(', ')}`, 400);
  }

  const host = resolveHost(app, env, service);
  if (!host) {
    return error(res, `No host found for service '${service}' in ${app}/${env}`, 404);
  }

  try {
    const logLines = await sshLogService.snapshot(host, service, lines);
    return success(res, { host, service, lines: logLines }, `${logLines.length} lines`);
  } catch (err) {
    logger.error('server-logs', `Snapshot failed for ${service}@${host}: ${err.message}`);
    return error(res, err.message, 500);
  }
});

// Stream: live tail of a service log via SSE
router.get('/api/_x_/apps/:app/envs/:env/server-logs/stream', (req, res) => {
  const { app, env } = req.params;
  const service = req.query.service;

  if (!service || !VALID_SERVICES.includes(service)) {
    return res.status(400).json({ success: false, message: `Invalid service. Must be one of: ${VALID_SERVICES.join(', ')}` });
  }

  const host = resolveHost(app, env, service);
  if (!host) {
    return res.status(404).json({ success: false, message: `No host found for service '${service}' in ${app}/${env}` });
  }

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial metadata
  res.write(`event: meta\ndata: ${JSON.stringify({ host, service, app, env })}\n\n`);

  let handle;
  try {
    handle = sshLogService.stream(host, service, res);
  } catch (err) {
    res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
    res.end();
    return;
  }

  // Clean up on client disconnect
  req.on('close', () => {
    logger.info('server-logs', `Client disconnected from ${service}@${host}`);
    if (handle) handle.kill();
  });
});

module.exports = router;
