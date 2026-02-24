const client = require('prom-client');

// Collect default Node.js metrics (GC, event loop, memory, etc.)
client.collectDefaultMetrics({ prefix: 'orchestrator_' });

// Custom metrics
const operationsTotal = new client.Counter({
  name: 'orchestrator_operations_total',
  help: 'Total number of orchestrator operations',
  labelNames: ['type', 'status', 'app', 'env'],
});

const operationDuration = new client.Histogram({
  name: 'orchestrator_operation_duration_seconds',
  help: 'Duration of orchestrator operations in seconds',
  labelNames: ['type', 'app', 'env'],
  buckets: [5, 15, 30, 60, 120, 300, 600, 1200, 2400],
});

const operationsActive = new client.Gauge({
  name: 'orchestrator_operations_active',
  help: 'Number of currently active operations',
  labelNames: ['app', 'env'],
});

const httpRequestDuration = new client.Histogram({
  name: 'orchestrator_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

module.exports = {
  registry: client.register,
  operationsTotal,
  operationDuration,
  operationsActive,
  httpRequestDuration,
};
