const User = require('../models/User');
const Purchase = require('../models/Purchase');
const { config } = require('../config/env');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { updateProfileSchema, changePasswordSchema } = require('../utils/validators');
const { escapeRegex } = require('../utils/helpers');

const teamSize = (tree = {}) =>
  [1, 2, 3, 4, 5].reduce((sum, level) => sum + (tree[`level${level}Count`] || 0), 0);

const profilePayload = (user, referrer, directReferrals) => ({
  userId: user._id,
  username: user.username,
  email: user.email,
  phone: user.phone,
  country: user.country,
  status: user.status,
  role: user.role,
  isVerified: user.isVerified,
  referralCode: user.referralCode,
  mpesaPhone: user.mpesaPhone,
  mainWallet: user.mainWallet,
  commissionWallet: user.commissionWallet,
  bonusWallet: { balance: user.bonusWallet?.balance || 0, totalWon: user.bonusWallet?.totalWon || 0 },
  totalWithdrawn: user.totalWithdrawn,
  referredBy: referrer ? { username: referrer.username, country: referrer.country } : null,
  directReferrals,
  totalTeamSize: teamSize(user.networkTree),
  createdAt: user.createdAt,
});

exports.getProfile = asyncHandler(async (req, res) => {
  const [referrer, directReferrals] = await Promise.all([
    req.user.referredBy ? User.findById(req.user.referredBy).select('username country') : null,
    User.countDocuments({ referredBy: req.user._id }),
  ]);
  sendSuccess(res, profilePayload(req.user, referrer, directReferrals));
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const updates = updateProfileSchema.parse(req.body);
  if (updates.email && req.user.isSystemAdmin) {
    throw new ApiError(403, 'The admin email is managed in the server .env file');
  }
  Object.assign(req.user, updates);
  await req.user.save();
  sendSuccess(res, null, 'Profile updated successfully');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  if (req.user.isSystemAdmin) {
    throw new ApiError(403, 'The admin password is managed in the server .env file');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw new ApiError(401, 'Current password is incorrect');

  user.password = newPassword;
  user.tokenVersion += 1; // signs out every other session
  await user.save();
  sendSuccess(res, null, 'Password changed successfully. Please sign in again.');
});

exports.getReferralStats = asyncHandler(async (req, res) => {
  const tree = req.user.networkTree;
  sendSuccess(res, {
    referralCode: req.user.referralCode,
    referralLink: `${config.frontendUrl}/register?ref=${req.user.referralCode}`,
    directReferrals: tree.level1Count,
    levels: [1, 2, 3, 4, 5].map((level) => ({ level, count: tree[`level${level}Count`] })),
    totalTeamSize: teamSize(tree),
  });
});

// Direct downlines, newest first, with optional search
exports.getTeamMembers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { referredBy: req.user._id };
  if (req.query.search) {
    filter.username = new RegExp(escapeRegex(String(req.query.search).toLowerCase()));
  }

  const [total, members] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .select('username phone country status createdAt networkTree'),
  ]);

  // "Active" = has bought at least one product
  const buyers = new Set((await Purchase.distinct('user', { user: { $in: members.map((m) => m._id) }, status: 'completed' })).map(String));

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    members: members.map((m) => ({
      userId: m._id,
      username: m.username,
      phone: m.phone,
      country: m.country,
      status: m.status,
      isActive: buyers.has(String(m._id)),
      joinedAt: m.createdAt,
      referrals: m.networkTree.level1Count,
    })),
  });
});
