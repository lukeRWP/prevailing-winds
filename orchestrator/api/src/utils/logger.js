const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, context, message, meta) {
  const parts = [timestamp(), level.toUpperCase().padEnd(5)];
  if (context) parts.push(`[${context}]`);
  parts.push(message);
  if (meta && Object.keys(meta).length > 0) {
    parts.push(JSON.stringify(meta));
  }
  return parts.join(' ');
}

function shouldLog(level) {
  return (LEVELS[level] ?? LEVELS.info) <= currentLevel;
}

const logger = {
  info(context, message, meta) {
    if (shouldLog('info')) console.log(formatMessage('info', context, message, meta));
  },
  warn(context, message, meta) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', context, message, meta));
  },
  error(context, message, meta) {
    if (shouldLog('error')) console.error(formatMessage('error', context, message, meta));
  },
  debug(context, message, meta) {
    if (shouldLog('debug')) console.log(formatMessage('debug', context, message, meta));
  }
};

module.exports = logger;
