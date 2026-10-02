const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { ApiError } = require('../utils/ApiError');
const { round2 } = require('../utils/money');

/**
 * Charges a feature fee (hotel review, chat unlock) from bonus credit first, then the main wallet,
 * in one conditional update. Writes one ledger entry per wallet touched.
 * `tx` holds the shared Transaction fields: type, description, related*.
 */
async function chargeFee(userId, amount, tx, session) {
  if (amount <= 0) return { fromBonus: 0, fromMain: 0, user: await User.findById(userId).session(session) };

  const current = await User.findById(userId).select('mainWallet bonusWallet').session(session);
  if (!current) throw new ApiError(404, 'User not found');
  const fromBonus = round2(Math.min(current.bonusWallet?.balance || 0, amount));
  const fromMain = round2(amount - fromBonus);

  // Accounts created before the bonus wallet existed have no such field, so only check what is used
  const filter = { _id: userId };
  const inc = {};
  if (fromBonus > 0) {
    filter['bonusWallet.balance'] = { $gte: fromBonus };
    inc['bonusWallet.balance'] = -fromBonus;
  }
  if (fromMain > 0) {
    filter['mainWallet.balance'] = { $gte: fromMain };
    inc['mainWallet.balance'] = -fromMain;
  }
  const user = await User.findOneAndUpdate(filter, { $inc: inc }, { new: true, session });
  if (!user) throw new ApiError(402, 'Insufficient balance');

  const base = { ...tx, user: userId, status: 'completed', completedAt: new Date() };
  const entries = [];
  if (fromBonus > 0) entries.push({ ...base, wallet: 'bonus', amount: fromBonus, description: `${tx.description} (bonus credit)` });
  if (fromMain > 0) entries.push({ ...base, wallet: 'main', amount: fromMain });
  await Transaction.create(entries, { session, ordered: true });
  return { user, fromBonus, fromMain };
}

/** Returns a fee to the wallets it was paid from. `tx` is as in chargeFee; type is always "refund". */
async function refundFee(userId, { fee, feeFromBonus = 0 }, tx, session) {
  const fromBonus = round2(Math.min(feeFromBonus, fee));
  const fromMain = round2(fee - fromBonus);
  const inc = {};
  if (fromBonus > 0) inc['bonusWallet.balance'] = fromBonus;
  if (fromMain > 0) inc['mainWallet.balance'] = fromMain;
  const user = await User.findByIdAndUpdate(userId, { $inc: inc }, { new: true, session });

  const base = { ...tx, type: 'refund', user: userId, status: 'completed', completedAt: new Date() };
  const entries = [];
  if (fromBonus > 0) entries.push({ ...base, wallet: 'bonus', amount: fromBonus, description: `${tx.description} (to bonus credit)` });
  if (fromMain > 0) entries.push({ ...base, wallet: 'main', amount: fromMain });
  await Transaction.create(entries, { session, ordered: true });
  return user;
}

module.exports = { chargeFee, refundFee };
