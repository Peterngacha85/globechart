const crypto = require('crypto');
const Spin = require('../models/Spin');
const SpinDay = require('../models/SpinDay');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { getSetting } = require('./settings');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const { startOfDayNairobi } = require('../utils/money');
const NotificationEmitter = require('../utils/notificationEmitter');

const SPINS_PER_DAY = 3;

// The wheel: 40 equal slices, clockwise from 12 o'clock. A prize's chance is simply how many
// slices carry it (Ksh 30 is on 14 of 40 = 35%; each of 150/210/300 is on 1 = 2.5%).
// The members' wheel is drawn from this same list.
const WHEEL = [
  30, 35, 45, 30, 50, 55, 30, 300, 35, 30,
  60, 45, 30, 70, 50, 30, 100, 35, 30, 55,
  80, 30, 45, 150, 30, 35, 60, 30, 50, 90,
  30, 55, 210, 30, 35, 70, 30, 45, 50, 30,
];
const TOTAL_WEIGHT = 10000; // rolls are 0-9999
const ROLLS_PER_SLICE = TOTAL_WEIGHT / WHEEL.length; // 250
const MAX_PRIZE = Math.max(...WHEEL);
const AVERAGE_PRIZE = WHEEL.reduce((s, p) => s + p, 0) / WHEEL.length;

const sliceForRoll = (roll) => {
  if (!Number.isInteger(roll) || roll < 0 || roll >= TOTAL_WEIGHT) throw new Error(`Roll ${roll} out of range`);
  return Math.floor(roll / ROLLS_PER_SLICE);
};

/** Maps a roll in [0, 10000) to its prize: the slice it lands on is roll ÷ 250. */
const prizeForRoll = (roll) => WHEEL[sliceForRoll(roll)];

const oddsTable = () =>
  [...new Set(WHEEL)]
    .sort((a, b) => a - b)
    .map((amount) => {
      const slices = WHEEL.filter((p) => p === amount).length;
      return { amount, slices, chance: slices / WHEEL.length };
    });

const dayKey = (now = new Date()) => new Date(startOfDayNairobi(now).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function ensureDay(day) {
  try {
    await SpinDay.updateOne({ day }, { $setOnInsert: { paid: 0, spins: 0 } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err; // another request created it first
  }
}

async function status(user) {
  const day = dayKey();
  const [used, today, budget] = await Promise.all([Spin.countDocuments({ user: user._id, day }), SpinDay.findOne({ day }), getSetting('spin_daily_budget')]);
  return {
    day,
    spinsPerDay: SPINS_PER_DAY,
    spinsUsed: used,
    spinsLeft: Math.max(SPINS_PER_DAY - used, 0),
    // Prizes are only paid while the rest of today's budget can cover the biggest prize
    prizesAvailable: (today?.paid || 0) + MAX_PRIZE <= budget,
  };
}

/** One free spin: draws a prize with a cryptographic random number and credits it to the bonus wallet. */
async function spin(user, io) {
  if (user.role !== 'user') throw new ApiError(403, 'Only member accounts can spin');
  const day = dayKey();
  const used = await Spin.countDocuments({ user: user._id, day });
  if (used >= SPINS_PER_DAY) throw new ApiError(429, `You have used all ${SPINS_PER_DAY} spins for today. New spins at midnight.`);

  const budget = await getSetting('spin_daily_budget');
  await ensureDay(day);
  const roll = crypto.randomInt(0, TOTAL_WEIGHT);
  const prize = prizeForRoll(roll);

  let result;
  try {
    result = await runInTransaction(async (session) => {
      // Reserve the prize from today's budget. Refused unless the biggest prize would still fit,
      // so the odds never change: every spin that happens uses the published table.
      const reserved = await SpinDay.findOneAndUpdate(
        { day, paid: { $lte: budget - MAX_PRIZE } },
        { $inc: { paid: prize, spins: 1 } },
        { new: true, session }
      );
      if (!reserved) throw new ApiError(409, "Today's spin prizes have all been given out. Come back after midnight.");

      const [record] = await Spin.create([{ user: user._id, day, number: used + 1, roll, prize }], { session });
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $inc: { 'bonusWallet.balance': prize, 'bonusWallet.totalWon': prize } },
        { new: true, session }
      );
      await Transaction.create(
        [
          {
            user: user._id,
            type: 'spin_prize',
            wallet: 'bonus',
            amount: prize,
            status: 'completed',
            completedAt: new Date(),
            description: `Lucky spin prize (spin ${used + 1} of ${SPINS_PER_DAY})`,
            reference: `roll ${roll}`,
          },
        ],
        { session }
      );
      return { record, bonusBalance: updated.bonusWallet.balance };
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Spin already in progress, please try again'); // concurrent taps
    throw err;
  }

  try {
    new NotificationEmitter(io).emitBalanceUpdate(user._id, result.bonusBalance);
  } catch (err) {
    console.error('Spin notification failed:', err.message);
  }
  return { ...result, spinsLeft: SPINS_PER_DAY - (used + 1) };
}

module.exports = { SPINS_PER_DAY, WHEEL, ROLLS_PER_SLICE, MAX_PRIZE, AVERAGE_PRIZE, sliceForRoll, prizeForRoll, oddsTable, dayKey, status, spin };
