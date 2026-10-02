const Commission = require('../models/Commission');
const Transaction = require('../models/Transaction');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const JobApplication = require('../models/JobApplication');
const HotelReview = require('../models/HotelReview');
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
  const [today, reviewBonusToday, txCount, referrals, settings] = await Promise.all([
    Commission.aggregate([
      { $match: { user: u._id, createdAt: { $gte: startOfDayNairobi() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { user: u._id, type: 'review_bonus', status: 'completed', createdAt: { $gte: startOfDayNairobi() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.countDocuments({ user: u._id }),
    activeDirectReferrals(u._id),
    getSettings(),
  ]);
  const [withdrawnToday, [refunds], [heldJob], [heldReview]] = await Promise.all([
    Transaction.aggregate([
      { $match: { user: u._id, type: 'withdrawal', status: { $in: ['pending', 'completed'] }, createdAt: { $gte: startOfDayNairobi() } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { user: u._id, type: 'refund', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // Fees still waiting on an outcome: refunded automatically unless the member is hired / approved
    JobApplication.aggregate([{ $match: { user: u._id, status: 'pending' } }, { $group: { _id: null, total: { $sum: '$fee' } } }]),
    HotelReview.aggregate([
      { $match: { user: u._id, status: { $in: ['reserved', 'submitted'] } } },
      { $group: { _id: null, total: { $sum: '$fee' } } },
    ]),
  ]);

  sendSuccess(res, {
    availableBalance: u.commissionWallet.balance,
    mainBalance: u.mainWallet.balance,
    bonusBalance: u.bonusWallet?.balance || 0,
    todaysEarnings: (today[0]?.total || 0) + (reviewBonusToday[0]?.total || 0),
    totalWithdrawn: u.totalWithdrawn,
    lifetimeConfirmed: u.commissionWallet.totalEarned,
    withdrawnToday: withdrawnToday[0]?.total || 0,
    directReferrals: referrals.total,
    activeDownlines: referrals.active,
    transactions: txCount,
    accountStatus: u.status,
    minWithdrawal: settings.min_withdrawal,
    refunds: { total: refunds?.total || 0, count: refunds?.count || 0 },
    feesAwaitingOutcome: (heldJob?.total || 0) + (heldReview?.total || 0),
  });
});

exports.earnings = asyncHandler(async (req, res) => {
  const [rows, [reviewBonuses]] = await Promise.all([
    Commission.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: '$level', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { user: req.user._id, type: 'review_bonus', status: 'completed' } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);
  const byLevel = Object.fromEntries(rows.map((r) => [r._id, r]));
  const level = (n) => ({ amount: byLevel[n]?.amount || 0, count: byLevel[n]?.count || 0 });

  sendSuccess(res, {
    level1: level(1),
    level2: level(2),
    level3: level(3),
    hotelReviews: { amount: reviewBonuses?.amount || 0, count: reviewBonuses?.count || 0 },
    totalEarnings: req.user.commissionWallet.totalEarned,
  });
});
