class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sendSuccess = (res, data, message = 'Operation successful', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data, statusCode });

module.exports = { ApiError, asyncHandler, sendSuccess };
