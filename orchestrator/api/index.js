const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { createAuthMiddleware } = require('./src/middleware/auth');
const { validateParams } = require('./src/middleware/validation');
const { errorHandler } = require('./src/middleware/errorHandler');
const vault = require('./src/services/vault');
const appRegistry = require('./src/services/appRegistry');
const operationQueue = require('./src/services/operationQueue');
const changeHistory = require('./src/services/changeHistory');
const { httpRequestDuration } = require('./src/metrics');

// Route modules
const healthRoutes = require('./src/routes/health');
const appRoutes = require('./src/routes/apps');
const envRoutes = require('./src/routes/environments');
const deployRoutes = require('./src/routes/deploy');
const infraRoutes = require('./src/routes/infra');
const databaseRoutes = require('./src/routes/database');
const operationRoutes = require('./src/routes/operations');
const lifecycleRoutes = require('./src/routes/lifecycle');
const secretsRoutes = require('./src/routes/secrets');
const selfUpdateRoutes = require('./src/routes/selfUpdate');
const metricsDataRoutes = require('./src/routes/metricsData');
const logsRoutes = require('./src/routes/logs');
const serverLogsRoutes = require('./src/routes/serverLogs');

async function start() {
  logger.info('server', `Starting orchestrator API (${config.nodeEnv})`);

  // Initialize Vault (best-effort — falls back to env var)
  await vault.initVault();

  // Load app manifests
  appRegistry.loadApps();

  // Initialize SQLite operation queue
  operationQueue.init();

  // Initialize change history database
  changeHistory.init();

  // Log token configuration
  const appTokenCount = Object.keys(config.appTokens).length;
  logger.info('auth', `Configured: admin=${config.adminToken ? 'yes' : 'no'}, app tokens=${appTokenCount}`);

  // Express app
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(createAuthMiddleware());

  // Input validation for :app and :env route params
  app.use(validateParams());

  // Request logging + Prometheus HTTP duration tracking
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'debug';
      logger[level]('http', `${req.method} ${req.originalUrl} ${res.statusCode} (${durationMs}ms)`);

      // Track in Prometheus (normalize route to avoid high cardinality)
      const route = req.route?.path || req.path.replace(/[0-9a-f-]{36}/g, ':id');
      httpRequestDuration.observe(
        { method: req.method, route, status_code: String(res.statusCode) },
        durationMs / 1000
      );
    });
    next();
  });

  // Routes
  app.use(healthRoutes);
  app.use(appRoutes);
  app.use(envRoutes);
  app.use(deployRoutes);
  app.use(infraRoutes);
  app.use(databaseRoutes);
  app.use(operationRoutes);
  app.use(lifecycleRoutes);
  app.use(secretsRoutes);
  app.use(selfUpdateRoutes);
  app.use(metricsDataRoutes);
  app.use(logsRoutes);
  app.use(serverLogsRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.path}` });
  });

  // Global error handler
  app.use(errorHandler);

  // Start listening
  const server = app.listen(config.port, () => {
    logger.info('server', `Orchestrator API listening on port ${config.port}`);
    logger.info('server', `Home: ${config.orchestratorHome}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info('server', `Received ${signal}, shutting down`);
    server.close(() => {
      operationQueue.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('server', `Fatal startup error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});
