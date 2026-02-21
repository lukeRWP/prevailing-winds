const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { createAuthMiddleware } = require('./src/middleware/auth');
const { errorHandler } = require('./src/middleware/errorHandler');
const vault = require('./src/services/vault');
const appRegistry = require('./src/services/appRegistry');
const operationQueue = require('./src/services/operationQueue');

// Route modules
const healthRoutes = require('./src/routes/health');
const appRoutes = require('./src/routes/apps');
const envRoutes = require('./src/routes/environments');
const deployRoutes = require('./src/routes/deploy');
const infraRoutes = require('./src/routes/infra');
const databaseRoutes = require('./src/routes/database');
const operationRoutes = require('./src/routes/operations');

async function start() {
  logger.info('server', `Starting orchestrator API (${config.nodeEnv})`);

  // Initialize Vault (best-effort — falls back to env var)
  await vault.initVault();

  // Load app manifests
  appRegistry.loadApps();

  // Initialize SQLite operation queue
  operationQueue.init();

  // Log token configuration
  const appTokenCount = Object.keys(config.appTokens).length;
  logger.info('auth', `Configured: admin=${config.adminToken ? 'yes' : 'no'}, app tokens=${appTokenCount}`);

  // Express app
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(createAuthMiddleware());

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 400 ? 'warn' : 'debug';
      logger[level]('http', `${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
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
