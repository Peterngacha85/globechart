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

// Weights are out of 10,000 so every chance is exact. These are the odds shown on the wheel.
const PRIZES = [
  { amount: 30, weight: 7000 },
  { amount: 50, weight: 2000 },
  { amount: 100, weight: 700 },
  { amount: 200, weight: 200 },
  { amount: 300, weight: 100 },
];
const TOTAL_WEIGHT = PRIZES.reduce((s, p) => s + p.weight, 0);
const MAX_PRIZE = Math.max(...PRIZES.map((p) => p.amount));
const AVERAGE_PRIZE = PRIZES.reduce((s, p) => s + (p.amount * p.weight) / TOTAL_WEIGHT, 0);

/** Maps a roll in [0, TOTAL_WEIGHT) to its prize: 0-6999 -> 30, 7000-8999 -> 50, and so on. */
function prizeForRoll(roll) {
  let edge = 0;
  for (const p of PRIZES) {
    edge += p.weight;
    if (roll < edge) return p.amount;
  }
  throw new Error(`Roll ${roll} out of range`);
}

const oddsTable = () =>
  PRIZES.map((p, i) => {
    const from = PRIZES.slice(0, i).reduce((s, x) => s + x.weight, 0);
    return { amount: p.amount, chance: p.weight / TOTAL_WEIGHT, rolls: [from, from + p.weight - 1] };
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

module.exports = { SPINS_PER_DAY, PRIZES, MAX_PRIZE, AVERAGE_PRIZE, prizeForRoll, oddsTable, dayKey, status, spin };
