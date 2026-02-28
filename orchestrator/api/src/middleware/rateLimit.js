const logger = require('../utils/logger');

/**
 * Simple in-memory rate limiter. Tracks requests per IP within a sliding window.
 * @param {{ windowMs?: number, max?: number, message?: string }} opts
 */
function createRateLimiter({ windowMs = 60000, max = 100, message = 'Too many requests' } = {}) {
  const hits = new Map(); // ip → { count, resetAt }

  // Periodically clean up expired entries (every 5 minutes)
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now > entry.resetAt) hits.delete(ip);
    }
  }, 300000);
  cleanup.unref();

  return (req, res, next) => {
    // Skip rate limiting for health checks
    if (req.path.startsWith('/health') || req.path === '/metrics') return next();

    const ip = req.ip || req.socket.remoteAddress;
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count++;

    if (entry.count > max) {
      logger.warn('rate-limit', `Rate limit exceeded for ${ip} (${entry.count}/${max})`);
      return res.status(429).json({ success: false, message });
    }

    next();
  };
}

module.exports = { createRateLimiter };
