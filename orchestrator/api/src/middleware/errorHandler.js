const { error } = require('../utils/response');
const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error('server', `Unhandled error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : err.message;
  return error(res, message, statusCode);
}

module.exports = { errorHandler };
