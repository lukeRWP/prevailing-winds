const { error } = require('../utils/response');

// Valid identifier pattern: lowercase alphanumeric, hyphens, underscores. 1-64 chars.
const VALID_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Validates :app and :env route parameters to prevent path traversal and injection.
 */
function validateParams() {
  return (req, res, next) => {
    if (req.params.app && !VALID_NAME.test(req.params.app)) {
      return error(res, `Invalid app name: '${req.params.app}'. Must match ${VALID_NAME}`, 400);
    }
    if (req.params.env && !VALID_NAME.test(req.params.env)) {
      return error(res, `Invalid env name: '${req.params.env}'. Must match ${VALID_NAME}`, 400);
    }
    next();
  };
}

module.exports = { validateParams };
