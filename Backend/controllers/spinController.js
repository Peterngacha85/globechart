const Spin = require('../models/Spin');
const SpinDay = require('../models/SpinDay');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { asyncHandler, sendSuccess } = require('../utils/ApiError');
const { round2 } = require('../utils/money');
const { getSetting } = require('../services/settings');
const spins = require('../services/spinService');

const spinPayload = (s) => ({
  spinId: s._id,
  day: s.day,
  number: s.number,
  roll: s.roll,
  slice: spins.sliceForRoll(s.roll) + 1, // 1-40, counted clockwise from 12 o'clock
  prize: s.prize,
  createdAt: s.createdAt,
});

exports.status = asyncHandler(async (req, res) => {
  const [state, history] = await Promise.all([spins.status(req.user), Spin.find({ user: req.user._id }).sort('-createdAt').limit(20)]);
  sendSuccess(res, {
    ...state,
    wheel: spins.WHEEL,
    rollsPerSlice: spins.ROLLS_PER_SLICE,
    odds: spins.oddsTable(),
    averagePrize: round2(spins.AVERAGE_PRIZE),
    bonusBalance: req.user.bonusWallet?.balance || 0,
    totalWon: req.user.bonusWallet?.totalWon || 0,
    history: history.map(spinPayload),
  });
});

exports.spin = asyncHandler(async (req, res) => {
  const { record, bonusBalance, spinsLeft } = await spins.spin(req.user, req.app.locals.io);
  sendSuccess(res, { ...spinPayload(record), bonusBalance, spinsLeft }, `You won Ksh ${record.prize}!`, 201);
});

// What the admin has given away and how much of it members still hold
exports.adminSummary = asyncHandler(async (req, res) => {
  const day = spins.dayKey();
  const sum = async (match) => {
    const [row] = await Transaction.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    return row?.total || 0;
  };
  const [budget, today, recentDays, won, spentOnFees, refundedToBonus, [outstanding]] = await Promise.all([
    getSetting('spin_daily_budget'),
    SpinDay.findOne({ day }),
    SpinDay.find({}).sort('-day').limit(14),
    sum({ type: 'spin_prize', status: 'completed' }),
    sum({ wallet: 'bonus', type: { $in: ['review_fee', 'unlock_fee'] }, status: 'completed' }),
    sum({ wallet: 'bonus', type: 'refund', status: 'completed' }),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$bonusWallet.balance' } } }]),
  ]);
  sendSuccess(res, {
    day,
    budget,
    today: { paid: today?.paid || 0, spins: today?.spins || 0 },
    days: recentDays.map((d) => ({ day: d.day, paid: d.paid, spins: d.spins })),
    totalWon: won,
    spentOnFees: round2(spentOnFees - refundedToBonus),
    creditOutstanding: outstanding?.total || 0,
    odds: spins.oddsTable(),
    averagePrize: round2(spins.AVERAGE_PRIZE),
    spinsPerDay: spins.SPINS_PER_DAY,
  });
});
