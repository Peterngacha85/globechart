const crypto = require('crypto');
const Transaction = require('../models/Transaction');
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
async function settleDeposit({ checkoutRequestId, success, amount, receipt, reason }, io) {
  const settled = await runInTransaction(async (session) => {
    const tx = await Transaction.findOneAndUpdate(
      { checkoutRequestId, type: 'deposit', status: 'pending' },
      { status: 'cancelled' }, // claimed; finalised below inside the same transaction
      { new: true, session }
    );
    if (!tx) return null;

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

module.exports = { initiateDeposit, settleDeposit };
