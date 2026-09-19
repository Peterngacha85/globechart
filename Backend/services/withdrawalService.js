const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { debit, credit } = require('./wallet');
const { getSettings } = require('./settings');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const NotificationEmitter = require('../utils/notificationEmitter');

/** Moves money out of the commission wallet immediately (so it cannot be spent twice) and queues it for the admin. */
async function requestWithdrawal(user, { amount, phone }, io) {
  const settings = await getSettings();
  if (amount < settings.min_withdrawal) {
    throw new ApiError(422, `You need at least Ksh ${settings.min_withdrawal} to withdraw`);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ total = 0 } = {}] = await Withdrawal.aggregate([
    { $match: { user: user._id, status: { $in: ['pending', 'approved'] }, requestedAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  if (total + amount > settings.max_withdrawal_daily) {
    throw new ApiError(422, `Daily withdrawal limit of Ksh ${settings.max_withdrawal_daily} exceeded`);
  }

  const { withdrawal, balance } = await runInTransaction(async (session) => {
    const updated = await debit(user._id, 'commission', amount, session);
    const [tx] = await Transaction.create(
      [{ user: user._id, type: 'withdrawal', wallet: 'commission', amount, status: 'pending', mpesaPhone: phone, description: 'Withdrawal request' }],
      { session }
    );
    const [w] = await Withdrawal.create([{ user: user._id, amount, mpesaPhone: phone, transaction: tx._id }], { session });
    return { withdrawal: w, balance: updated.commissionWallet.balance };
  });

  const notifier = new NotificationEmitter(io);
  try {
    notifier.emitBalanceUpdate(user._id, balance);
    await notifier.notifyUser(user._id, {
      title: 'Withdrawal submitted',
      message: `Your withdrawal of Ksh ${amount} is awaiting approval.`,
      type: 'info',
      category: 'withdrawal',
      relatedData: { withdrawalId: withdrawal._id },
    });
    notifier.notifyAdmins({ title: 'New withdrawal request', message: `${user.username} requested Ksh ${amount}`, withdrawalId: withdrawal._id });
  } catch (err) {
    console.error('Withdrawal notification failed:', err.message);
  }
  return withdrawal;
}

async function loadPending(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Withdrawal not found');
  const withdrawal = await Withdrawal.findById(id);
  if (!withdrawal) throw new ApiError(404, 'Withdrawal not found');
  return withdrawal;
}

/** Admin confirms the M-Pesa payout was sent. */
async function approveWithdrawal(id, admin, { transactionReference }, io) {
  await loadPending(id);
  const withdrawal = await runInTransaction(async (session) => {
    // Only one admin action can move a withdrawal out of "pending"
    const w = await Withdrawal.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { status: 'approved', processedBy: admin._id, processedAt: new Date(), transactionReference },
      { new: true, session }
    );
    if (!w) throw new ApiError(409, 'This withdrawal has already been processed');
    await Transaction.updateOne(
      { _id: w.transaction },
      { status: 'completed', completedAt: new Date(), reference: transactionReference },
      { session }
    );
    await User.updateOne({ _id: w.user }, { $inc: { totalWithdrawn: w.amount } }, { session });
    return w;
  });

  try {
    const notifier = new NotificationEmitter(io);
    notifier.emitWithdrawalUpdate(withdrawal.user, withdrawal);
    await notifier.notifyUser(withdrawal.user, {
      title: 'Withdrawal approved',
      message: `Ksh ${withdrawal.amount} has been sent to ${withdrawal.mpesaPhone}.`,
      type: 'success',
      category: 'withdrawal',
      relatedData: { withdrawalId: withdrawal._id },
    });
  } catch (err) {
    console.error('Withdrawal notification failed:', err.message);
  }
  return withdrawal;
}

/** Admin declines: the reserved amount goes back to the user's commission wallet. */
async function rejectWithdrawal(id, admin, { reason }, io) {
  await loadPending(id);
  const { withdrawal, balance } = await runInTransaction(async (session) => {
    const w = await Withdrawal.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { status: 'rejected', processedBy: admin._id, processedAt: new Date(), rejectionReason: reason },
      { new: true, session }
    );
    if (!w) throw new ApiError(409, 'This withdrawal has already been processed');
    await Transaction.updateOne({ _id: w.transaction }, { status: 'cancelled', failureReason: reason }, { session });
    const user = await credit(w.user, 'commission', w.amount, session);
    return { withdrawal: w, balance: user.commissionWallet.balance };
  });

  try {
    const notifier = new NotificationEmitter(io);
    notifier.emitBalanceUpdate(withdrawal.user, balance);
    notifier.emitWithdrawalUpdate(withdrawal.user, withdrawal);
    await notifier.notifyUser(withdrawal.user, {
      title: 'Withdrawal rejected',
      message: `Your withdrawal of Ksh ${withdrawal.amount} was rejected: ${reason}. The amount was returned to your wallet.`,
      type: 'error',
      category: 'withdrawal',
      relatedData: { withdrawalId: withdrawal._id },
    });
  } catch (err) {
    console.error('Withdrawal notification failed:', err.message);
  }
  return withdrawal;
}

module.exports = { requestWithdrawal, approveWithdrawal, rejectWithdrawal };
