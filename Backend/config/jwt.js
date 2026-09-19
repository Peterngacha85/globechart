const jwt = require('jsonwebtoken');
const { config } = require('./env');

// tokenVersion lets us invalidate every issued token for a user (password change, admin credential change)
const generateAccessToken = (user) =>
  jwt.sign({ userId: String(user._id), tokenVersion: user.tokenVersion }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  });

const generateRefreshToken = (user, rememberMe = false) =>
  jwt.sign({ userId: String(user._id), tokenVersion: user.tokenVersion }, config.jwt.refreshSecret, {
    expiresIn: rememberMe ? config.jwt.refreshExpire : '1d',
  });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    return null;
  }
};

module.exports = { generateAccessToken, generateRefreshToken, verifyToken, verifyRefreshToken };
