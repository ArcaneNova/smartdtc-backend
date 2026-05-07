const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message    = err.message    || 'Internal Server Error';

  logger.error(`${req.method} ${req.originalUrl} — ${statusCode} — ${message}`);

  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({ success: false, message, stack: err.stack });
  }

  res.status(statusCode).json({ success: false, message });
};

module.exports = errorMiddleware;
