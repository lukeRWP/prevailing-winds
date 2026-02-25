const { error } = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config');

// Routes that require admin token (no app-scoped access)
const ADMIN_ONLY_PATTERNS = [
  { method: 'GET', path: '/api/_x_/apps' },          // List all apps
  { method: 'PUT', path: /^\/api\/_u_\/apps\/[^/]+\/manifest$/ },  // Register app manifest
  { method: 'DELETE', path: /^\/api\/_d_\/apps\/[^/]+$/ },  // Delete app
  // Entra config — admin only
  { method: 'GET', path: '/api/_x_/entra/config' },
  // Infra secrets — admin only
  { method: 'GET', path: '/api/_x_/infra/secrets' },
  { method: 'PUT', path: '/api/_u_/infra/secrets' },
  { method: 'DELETE', path: /^\/api\/_d_\/infra\/secrets\/[^/]+$/ },
];

// Routes that are public (no auth required)
function isPublicRoute(req) {
  return req.path.startsWith('/health') || req.path === '/metrics';
}

// Check if this route is admin-only
function isAdminOnly(req) {
  return ADMIN_ONLY_PATTERNS.some(pattern => {
    if (pattern.method && pattern.method !== req.method) return false;
    if (typeof pattern.path === 'string') return req.path === pattern.path;
    return pattern.path.test(req.path);
  });
}

// Extract app name from URL path (e.g. /api/_x_/apps/imp/envs/dev → "imp")
function extractAppFromPath(path) {
  const match = path.match(/^\/api\/[_a-z]+\/apps\/([^/]+)/);
  return match ? match[1] : null;
}

function createAuthMiddleware() {
  return (req, res, next) => {
    // Public routes — no auth
    if (isPublicRoute(req)) return next();

    // Extract bearer token
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return error(res, 'Missing or malformed Authorization header', 401);
    }
    const token = header.slice(7);

    // Check admin token first
    if (config.adminToken && token === config.adminToken) {
      req.authRole = 'admin';
      req.authorizedApp = null; // Admin can access everything
      return next();
    }

    // Admin-only routes reject non-admin tokens
    if (isAdminOnly(req)) {
      // Check if it might be a valid app token (for better error message)
      const appTokens = config.appTokens;
      const isAppToken = Object.values(appTokens).includes(token);
      if (isAppToken) {
        return error(res, 'This endpoint requires admin access', 403);
      }
      return error(res, 'Invalid token', 403);
    }

    // App-scoped routes — match token to app
    const appTokens = config.appTokens;
    const appName = extractAppFromPath(req.path);

    if (!appName) {
      // Non-app routes (like /api/_x_/ops) — require admin or any valid app token
      const matchedApp = Object.entries(appTokens).find(([, t]) => t === token);
      if (matchedApp) {
        req.authRole = 'app';
        req.authorizedApp = matchedApp[0];
        return next();
      }
      return error(res, 'Invalid token', 403);
    }

    // App-specific route — token must match this specific app
    const expectedToken = appTokens[appName];
    if (expectedToken && token === expectedToken) {
      req.authRole = 'app';
      req.authorizedApp = appName;
      return next();
    }

    // Check if no tokens configured at all (misconfiguration)
    if (!config.adminToken && Object.keys(appTokens).length === 0) {
      logger.error('auth', 'No tokens configured — rejecting request');
      return error(res, 'Server authentication not configured', 503);
    }

    return error(res, 'Invalid token for this app', 403);
  };
}

module.exports = { createAuthMiddleware };
