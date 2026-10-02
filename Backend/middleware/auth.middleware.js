const User = require('../models/User');
const { verifyToken } = require('../config/jwt');
const { ApiError, asyncHandler } = require('../utils/ApiError');
const { isClosed, comingSoonError } = require('../utils/comingSoon');

// Resolve the bearer token to a live user. Role and status always come from the database,
// so suspending a user or changing a password takes effect immediately.
async function resolveUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const decoded = verifyToken(authHeader.split(' ')[1]);
  if (!decoded) return null;
  const user = await User.findById(decoded.userId);
  if (!user || user.tokenVersion !== decoded.tokenVersion) return null;
  return user;
}

const protect = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization) throw new ApiError(401, 'No token provided. Authorization required.');
  const user = await resolveUser(req.headers.authorization);
  if (!user) throw new ApiError(401, 'Invalid or expired token');
  if (user.status === 'suspended' || user.status === 'banned') {
    throw new ApiError(403, `Your account is ${user.status}`);
  }
  if (isClosed()) throw comingSoonError();
  req.user = user;
  next();
});

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'super_admin') return next(new ApiError(403, 'Admin access required'));
  next();
};

const businessOnly = (req, res, next) => {
  if (req.user?.role !== 'business') return next(new ApiError(403, 'Business account required'));
  next();
};

const optional =asyncHandler(async (req, res, next) => {
  const user = await resolveUser(req.headers.authorization);
  if (user && user.status !== 'suspended' && user.status !== 'banned') req.user = user;
  next();
});

module.exports = { protect, adminOnly, businessOnly, optional, resolveUser };
