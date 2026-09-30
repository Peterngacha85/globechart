const crypto = require('crypto');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { ApiError } = require('../utils/ApiError');
const { config } = require('../config/env');
const { stkPush } = require('./mpesa');
const { credit } = require('./wallet');
const { runInTransaction } = require('../utils/dbTransaction');
const NotificationEmitter = require('../utils/notificationEmitter');

async function initiateDeposit(user, { amount, phone }, io) {
  const tx = await Transaction.create({
    user: user._id,
    type: 'deposit',
    wallet: 'main',
    amount,
    status: 'pending',
    description: 'M-Pesa deposit',
    mpesaPhone: phone,
  });

  let push;
  try {
    push = await stkPush({ phone, amount, reference: 'Globechart', description: 'Deposit' });
  } catch (err) {
    tx.status = 'failed';
    tx.failureReason = err.message;
    await tx.save();
    throw err;
  }

  tx.checkoutRequestId = push.checkoutRequestId;
  await tx.save();

  // Simulated payments "confirm" by themselves (never in production: enforced in config)
  if (push.simulated && !config.isTest) {
    setTimeout(() => {
      settleDeposit(
        { checkoutRequestId: push.checkoutRequestId, success: true, amount, receipt: `SIM${crypto.randomBytes(4).toString('hex').toUpperCase()}` },
        io
      ).catch((err) => console.error('Simulated deposit failed:', err.message));
    }, 2000).unref();
  }

  return tx;
}

/**
 * Applies an M-Pesa result to a pending deposit. Idempotent: a deposit is settled at most once,
 * so repeated or forged callbacks for an already-settled checkout id do nothing.
 */
async function settleDeposit({ checkoutRequestId, success, amount, receipt, reason, processedBy }, io) {
  const settled = await runInTransaction(async (session) => {
    const tx = await Transaction.findOneAndUpdate(
      { checkoutRequestId, type: 'deposit', status: 'pending' },
      { status: 'cancelled' }, // claimed; finalised below inside the same transaction
      { new: true, session }
    );
    if (!tx) return null;
    if (processedBy) tx.processedBy = processedBy;

    const amountMatches = amount === undefined || Number(amount) === tx.amount;
    if (!success || !amountMatches) {
      tx.status = 'failed';
      tx.failureReason = success ? 'Paid amount did not match the request' : reason || 'Payment was not completed';
      await tx.save({ session });
      return { tx, ok: false };
    }

    tx.status = 'completed';
    tx.completedAt = new Date();
    tx.mpesaReceiptNumber = receipt;
    await tx.save({ session });
    const user = await credit(tx.user, 'main', tx.amount, session);
    return { tx, ok: true, balance: user.mainWallet.balance };
  });

  if (!settled) return null;
  const notifier = new NotificationEmitter(io);
  if (settled.ok) {
    notifier.emitBalanceUpdate(settled.tx.user, settled.balance);
    await notifier.notifyUser(settled.tx.user, {
      title: 'Deposit received',
      message: `Ksh ${settled.tx.amount} was added to your main wallet.`,
      type: 'success',
      category: 'transaction',
      relatedData: { transactionId: settled.tx._id },
    });
  } else {
    await notifier.notifyUser(settled.tx.user, {
      title: 'Deposit failed',
      message: settled.tx.failureReason,
      type: 'error',
      category: 'transaction',
      relatedData: { transactionId: settled.tx._id },
    });
  }
  return settled.tx;
}

// A code counts as used while a deposit claiming it is awaiting review or already credited
const codeInUse = (code) =>
  Transaction.exists({ type: 'deposit', mpesaReceiptNumber: code, status: { $in: ['pending', 'completed'] } });

/**
 * Manual mode: the user has already sent money to the business number and reports the M-Pesa code.
 * Nothing is credited until an admin matches the code against the M-Pesa statement.
 */
async function submitManualDeposit(user, { amount, phone, code }, io) {
  if (await codeInUse(code)) throw new ApiError(409, 'This M-Pesa code has already been submitted');

  const tx = await Transaction.create({
    user: user._id,
    type: 'deposit',
    wallet: 'main',
    amount,
    status: 'pending',
    description: 'M-Pesa deposit (manual)',
    mpesaPhone: phone,
    mpesaReceiptNumber: code,
    checkoutRequestId: `MANUAL-${crypto.randomBytes(8).toString('hex')}`,
  });

  const notifier = new NotificationEmitter(io);
  try {
    await notifier.notifyUser(user._id, {
      title: 'Deposit submitted',
      message: `Your deposit of Ksh ${amount} (code ${code}) is awaiting confirmation.`,
      type: 'info',
      category: 'transaction',
      relatedData: { transactionId: tx._id },
    });
    notifier.notifyAdmins({ title: 'New deposit to confirm', message: `${user.username} sent Ksh ${amount} (${code})`, transactionId: tx._id });
  } catch (err) {
    console.error('Deposit notification failed:', err.message);
  }
  return tx;
}

async function loadManualDeposit(id) {
  const tx = mongoose.isValidObjectId(id) ? await Transaction.findOne({ _id: id, type: 'deposit' }) : null;
  if (!tx) throw new ApiError(404, 'Deposit not found');
  if (tx.status !== 'pending') throw new ApiError(409, 'This deposit has already been processed');
  return tx;
}

/** Admin found the code on the M-Pesa statement with the right amount: credit the wallet. */
async function approveManualDeposit(id, admin, io) {
  const tx = await loadManualDeposit(id);
  const alreadyCredited = await Transaction.exists({ type: 'deposit', mpesaReceiptNumber: tx.mpesaReceiptNumber, status: 'completed', _id: { $ne: tx._id } });
  if (alreadyCredited) {
    throw new ApiError(409, 'Another deposit with this M-Pesa code was already credited');
  }
  const settled = await settleDeposit({ checkoutRequestId: tx.checkoutRequestId, success: true, receipt: tx.mpesaReceiptNumber, processedBy: admin._id }, io);
  if (!settled) throw new ApiError(409, 'This deposit has already been processed');
  return settled;
}

async function rejectManualDeposit(id, admin, { reason }, io) {
  const tx = await loadManualDeposit(id);
  const settled = await settleDeposit({ checkoutRequestId: tx.checkoutRequestId, success: false, reason, processedBy: admin._id }, io);
  if (!settled) throw new ApiError(409, 'This deposit has already been processed');
  return settled;
}

module.exports = { initiateDeposit, settleDeposit, submitManualDeposit, approveManualDeposit, rejectManualDeposit };
