const pino = require('pino');

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino/file',
    options: { destination: 1 },  // stdout
  } : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Preserve existing API: logger.info(context, message, meta)
const logger = {
  info(context, message, meta) {
    pinoLogger.info({ context, ...meta }, message);
  },
  warn(context, message, meta) {
    pinoLogger.warn({ context, ...meta }, message);
  },
  error(context, message, meta) {
    pinoLogger.error({ context, ...meta }, message);
  },
  debug(context, message, meta) {
    pinoLogger.debug({ context, ...meta }, message);
  },
};

module.exports = logger;
