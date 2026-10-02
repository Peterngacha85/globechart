const crypto = require('crypto');
const User = require('../models/User');
const { config } = require('../config/env');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../config/jwt');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { randomCode, sha256 } = require('../utils/helpers');
const { sendEmail } = require('../services/email');
const { isClosed, comingSoonError } = require('../utils/comingSoon');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../utils/validators');

const NETWORK_DEPTH = 5;

const issueTokens = (user, rememberMe = false) => ({
  token: generateAccessToken(user),
  refreshToken: generateRefreshToken(user, rememberMe),
  expiresIn: config.jwt.expire,
});

const authPayload = (user) => ({
  userId: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  referralCode: user.referralCode,
});

async function findReferrer(code) {
  if (!code) return null;
  return User.findOne({ $or: [{ referralCode: code.toUpperCase() }, { username: code.toLowerCase() }] });
}

// referralCode is unique + sparse; retry on the (very unlikely) collision
async function createUserWithCode(fields) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await User.create({ ...fields, referralCode: randomCode() });
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.referralCode) continue;
      throw err;
    }
  }
  throw new ApiError(500, 'Could not generate a referral code, please retry');
}

// Increment L1..L5 counters on every ancestor of the new user
async function updateUpline(referrer) {
  let ancestor = referrer;
  for (let level = 1; level <= NETWORK_DEPTH && ancestor; level += 1) {
    await User.updateOne({ _id: ancestor._id }, { $inc: { [`networkTree.level${level}Count`]: 1 } });
    ancestor = ancestor.referredBy ? await User.findById(ancestor.referredBy).select('referredBy') : null;
  }
}

exports.register = asyncHandler(async (req, res) => {
  if (isClosed()) throw comingSoonError();
  const { username, email, phone, country, password, referralCode } = registerSchema.parse(req.body);

  const duplicate = await User.findOne({ $or: [{ username }, { phone }, ...(email ? [{ email }] : [])] }).select('username phone email');
  if (duplicate) {
    const field = duplicate.username === username ? 'Username' : duplicate.phone === phone ? 'Phone number' : 'Email';
    throw new ApiError(409, `${field} already exists`);
  }

  const referrer = await findReferrer(referralCode);
  if (referralCode && !referrer) throw new ApiError(422, 'Invalid referral code');

  // role is never taken from the request: everyone who registers is a regular user
  const user = await createUserWithCode({
    username,
    email,
    phone,
    country,
    password,
    referredBy: referrer ? referrer._id : null,
  });
  if (referrer) await updateUpline(referrer);

  sendSuccess(res, { ...authPayload(user), ...issueTokens(user, true) }, 'User registered successfully', 201);
});

exports.login = asyncHandler(async (req, res) => {
  if (isClosed()) throw comingSoonError();
  const { username, password, rememberMe } = loginSchema.parse(req.body);

  const user = await User.findOne({ username }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, 'Invalid username or password');
  if (user.status === 'suspended' || user.status === 'banned') throw new ApiError(403, `Your account is ${user.status}`);

  user.lastLogin = new Date();
  user.loginCount += 1;
  await user.save();

  sendSuccess(res, { ...authPayload(user), ...issueTokens(user, rememberMe) }, 'Login successful');
});

exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) throw new ApiError(401, 'Invalid refresh token');

  const user = await User.findById(decoded.userId);
  if (!user || user.tokenVersion !== decoded.tokenVersion || user.status === 'suspended' || user.status === 'banned') {
    throw new ApiError(401, 'User not found or inactive');
  }
  if (isClosed()) throw comingSoonError();

  sendSuccess(res, { token: generateAccessToken(user), expiresIn: config.jwt.expire }, 'Token refreshed');
});

exports.logout = (req, res) => sendSuccess(res, null, 'Logout successful');

// Always answers the same way so it cannot be used to discover which emails are registered
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const generic = 'If that email is registered, a reset link has been sent';

  const user = await User.findOne({ email });
  // The env-managed admin password can only be changed in .env
  if (!user || user.isSystemAdmin) return sendSuccess(res, null, generic);

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = sha256(rawToken);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  await sendEmail({
    to: user.email,
    subject: 'Reset your Globechart password',
    text: `Reset your password (valid for 1 hour): ${config.frontendUrl}/reset-password/${rawToken}`,
  });

  sendSuccess(res, null, generic);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = resetPasswordSchema.parse(req.body);
  const user = await User.findOne({
    passwordResetToken: sha256(req.params.token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');
  if (!user) throw new ApiError(400, 'Reset link is invalid or has expired');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.tokenVersion += 1;
  await user.save();

  sendSuccess(res, null, 'Password reset successful');
});
