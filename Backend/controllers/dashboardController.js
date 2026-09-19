const Commission = require('../models/Commission');
const Transaction = require('../models/Transaction');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const { asyncHandler, sendSuccess } = require('../utils/ApiError');
const { startOfDayNairobi } = require('../utils/money');
const { getSettings } = require('../services/settings');

// A direct referral counts as "active" once they have bought something
async function activeDirectReferrals(userId) {
  const ids = await User.find({ referredBy: userId }).distinct('_id');
  if (!ids.length) return { total: 0, active: 0 };
  const buyers = await Purchase.distinct('user', { user: { $in: ids }, status: 'completed' });
  return { total: ids.length, active: buyers.length };
}

exports.summary = asyncHandler(async (req, res) => {
  const u = req.user;
  const [today, txCount, referrals, settings] = await Promise.all([
    Commission.aggregate([
      { $match: { user: u._id, createdAt: { $gte: startOfDayNairobi() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.countDocuments({ user: u._id }),
    activeDirectReferrals(u._id),
    getSettings(),
  ]);
  const withdrawnToday = await Transaction.aggregate([
    { $match: { user: u._id, type: 'withdrawal', status: { $in: ['pending', 'completed'] }, createdAt: { $gte: startOfDayNairobi() } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  sendSuccess(res, {
    availableBalance: u.commissionWallet.balance,
    mainBalance: u.mainWallet.balance,
    todaysEarnings: today[0]?.total || 0,
    totalWithdrawn: u.totalWithdrawn,
    lifetimeConfirmed: u.commissionWallet.totalEarned,
    withdrawnToday: withdrawnToday[0]?.total || 0,
    directReferrals: referrals.total,
    activeDownlines: referrals.active,
    transactions: txCount,
    accountStatus: u.status,
    minWithdrawal: settings.min_withdrawal,
  });
});

exports.earnings = asyncHandler(async (req, res) => {
  const rows = await Commission.aggregate([
    { $match: { user: req.user._id } },
    { $group: { _id: '$level', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const byLevel = Object.fromEntries(rows.map((r) => [r._id, r]));
  const level = (n) => ({ amount: byLevel[n]?.amount || 0, count: byLevel[n]?.count || 0 });

  sendSuccess(res, {
    level1: level(1),
    level2: level(2),
    level3: level(3),
    totalEarnings: req.user.commissionWallet.totalEarned,
  });
});
