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

// In-memory ring buffer for structured log querying
const RING_SIZE = 2000;
const ringBuffer = new Array(RING_SIZE);
let ringIdx = 0;
let ringCount = 0;

function pushEntry(level, context, message, meta) {
  ringBuffer[ringIdx % RING_SIZE] = {
    level,
    time: new Date().toISOString(),
    context: context || '',
    msg: message || '',
    ...meta,
  };
  ringIdx++;
  if (ringCount < RING_SIZE) ringCount++;
}

// Preserve existing API: logger.info(context, message, meta)
const logger = {
  info(context, message, meta) {
    pinoLogger.info({ context, ...meta }, message);
    pushEntry('info', context, message, meta);
  },
  warn(context, message, meta) {
    pinoLogger.warn({ context, ...meta }, message);
    pushEntry('warn', context, message, meta);
  },
  error(context, message, meta) {
    pinoLogger.error({ context, ...meta }, message);
    pushEntry('error', context, message, meta);
  },
  debug(context, message, meta) {
    pinoLogger.debug({ context, ...meta }, message);
    pushEntry('debug', context, message, meta);
  },

  /**
   * Query recent log entries from the ring buffer.
   * @param {Object} opts
   * @param {number} [opts.limit=200] - Max entries to return
   * @param {string} [opts.level] - Filter by level (info, warn, error, debug)
   * @param {string} [opts.search] - Search in context + msg fields
   * @param {string} [opts.context] - Filter by exact context
   * @returns {Array} Log entries, newest first
   */
  getRecentLogs({ limit = 200, level, search, context } = {}) {
    const entries = [];
    const start = ringIdx - 1;
    const end = ringIdx - ringCount;

    for (let i = start; i > end && entries.length < limit; i--) {
      const entry = ringBuffer[((i % RING_SIZE) + RING_SIZE) % RING_SIZE];
      if (!entry) continue;
      if (level && entry.level !== level) continue;
      if (context && entry.context !== context) continue;
      if (search) {
        const hay = `${entry.context} ${entry.msg}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) continue;
      }
      entries.push(entry);
    }

    return entries;
  },
};

module.exports = logger;
