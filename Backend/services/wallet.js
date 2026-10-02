const User = require('../models/User');
const { ApiError } = require('../utils/ApiError');

const WALLETS = {
  main: { balance: 'mainWallet.balance' },
  commission: { balance: 'commissionWallet.balance' },
  bonus: { balance: 'bonusWallet.balance' },
};

// Atomic conditional debit: the balance check and the decrement are one database operation,
// so two concurrent requests can never spend the same money twice.
async function debit(userId, wallet, amount, session) {
  const field = WALLETS[wallet].balance;
  const user = await User.findOneAndUpdate(
    { _id: userId, [field]: { $gte: amount } },
    { $inc: { [field]: -amount } },
    { new: true, session }
  );
  if (!user) throw new ApiError(402, 'Insufficient balance');
  return user;
}

async function credit(userId, wallet, amount, session, { earned = false } = {}) {
  const field = WALLETS[wallet].balance;
  const inc = { [field]: amount };
  if (earned) inc['commissionWallet.totalEarned'] = amount;
  return User.findByIdAndUpdate(userId, { $inc: inc }, { new: true, session });
}

module.exports = { debit, credit };
