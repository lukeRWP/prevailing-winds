const { Router } = require('express');
const { success, error } = require('../utils/response');
const queue = require('../services/operationQueue');
const executor = require('../services/executor');

const router = Router();

router.get('/api/_x_/ops', (req, res) => {
  const { app, env, status, limit, offset } = req.query;

  // App-scoped tokens can only see their own operations
  const effectiveApp = req.authorizedApp || app;

  const ops = queue.list({
    app: effectiveApp,
    env,
    status,
    limit: limit ? parseInt(limit, 10) : 50,
    offset: offset ? parseInt(offset, 10) : 0
  });
  return success(res, ops, `Found ${ops.length} operation(s)`);
});

router.get('/api/_x_/ops/:opId', (req, res) => {
  const op = queue.get(req.params.opId);
  if (!op) return error(res, 'Operation not found', 404);

  // App-scoped tokens can only view their own operations
  if (req.authorizedApp && op.app !== req.authorizedApp) {
    return error(res, 'Operation not found', 404);
  }

  return success(res, op);
});

router.get('/api/_x_/ops/:opId/stream', (req, res) => {
  const op = queue.get(req.params.opId);
  if (!op) return error(res, 'Operation not found', 404);

  if (req.authorizedApp && op.app !== req.authorizedApp) {
    return error(res, 'Operation not found', 404);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send existing output as initial replay
  if (op.output) {
    res.write(`event: log\ndata: ${JSON.stringify(op.output)}\n\n`);
  }

  // Send current status
  res.write(`event: status\ndata: ${JSON.stringify(op.status)}\n\n`);

  // If already terminal, close immediately
  if (['success', 'failed', 'cancelled'].includes(op.status)) {
    res.write(`event: done\ndata: ""\n\n`);
    return res.end();
  }

  executor.addSSEClient(req.params.opId, res);
});

router.post('/api/_y_/ops/:opId/cancel', (req, res) => {
  const op = queue.get(req.params.opId);
  if (!op) return error(res, 'Operation not found', 404);

  if (req.authorizedApp && op.app !== req.authorizedApp) {
    return error(res, 'Operation not found', 404);
  }

  const cancelled = executor.cancelProcess(req.params.opId);
  if (!cancelled) {
    return error(res, 'Operation cannot be cancelled (already running or completed)', 409);
  }

  return success(res, { opId: req.params.opId }, 'Operation cancelled');
});

module.exports = router;
