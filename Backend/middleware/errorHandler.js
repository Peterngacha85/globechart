const { ZodError } = require('zod');
const { config } = require('../config/env');

const notFound = (req, res) =>
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, statusCode: 404 });

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    message = `That ${field} is already in use`;
  } else if (err.name === 'ValidationError') {
    statusCode = 422;
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = 'Validation failed';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
  }

  // Coming Soon is an expected 503, not a crash: keep its message and don't log it
  if (statusCode >= 500 && !err.comingSoon) {
    console.error(err);
    if (config.isProd) message = 'Internal server error';
  }

  res.status(statusCode).json({ success: false, message, statusCode, ...(errors && { errors }), ...(err.comingSoon && { comingSoon: true }) });
};

module.exports = { notFound, errorHandler };
