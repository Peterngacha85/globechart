const { z } = require('zod');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { isKenyanPhone, normalizePhone, paginate } = require('../utils/helpers');
const { getSettings } = require('../services/settings');
const { initiateDeposit, settleDeposit } = require('../services/depositService');
const { parseCallback, isValidCallbackSecret } = require('../services/mpesa');
const { requestWithdrawal } = require('../services/withdrawalService');

const phoneField = z
  .string()
  .refine(isKenyanPhone, 'Enter a valid Kenyan phone number, e.g. 0712345678')
  .transform(normalizePhone);

const rechargeSchema = z.object({
  amount: z.number().int('Amount must be a whole number of shillings'),
  mpesaPhone: phoneField.optional(),
});
const withdrawSchema = z.object({ amount: z.number().positive(), mpesaPhone: phoneField.optional() });

const txPayload = (t) => ({
  transactionId: t._id,
  type: t.type,
  wallet: t.wallet,
  amount: t.amount,
  status: t.status,
  description: t.description,
  reference: t.reference || t.mpesaReceiptNumber,
  createdAt: t.createdAt,
  completedAt: t.completedAt,
});

const withdrawalPayload = (w) => ({
  withdrawalId: w._id,
  amount: w.amount,
  status: w.status,
  method: w.method,
  mpesaPhone: w.mpesaPhone,
  requestedAt: w.requestedAt,
  processedAt: w.processedAt,
  transactionReference: w.transactionReference,
  rejectionReason: w.rejectionReason,
});

exports.getLimits = asyncHandler(async (req, res) => {
  const s = await getSettings();
  sendSuccess(res, {
    minWithdrawal: s.min_withdrawal,
    maxWithdrawalDaily: s.max_withdrawal_daily,
    minDeposit: s.min_deposit,
    maxDeposit: s.max_deposit,
    depositQuickAmounts: [50, 100, 200, 500, 1000, 2000],
  });
});

exports.recharge = asyncHandler(async (req, res) => {
  const { amount, mpesaPhone } = rechargeSchema.parse(req.body);
  const s = await getSettings();
  if (amount < s.min_deposit || amount > s.max_deposit) {
    throw new ApiError(422, `Deposit must be between Ksh ${s.min_deposit} and Ksh ${s.max_deposit}`);
  }
  const phone = mpesaPhone || req.user.mpesaPhone || req.user.phone;
  const tx = await initiateDeposit(req.user, { amount, phone }, req.app.locals.io);
  sendSuccess(res, { transactionId: tx._id, amount, status: tx.status, checkoutRequestId: tx.checkoutRequestId }, 'M-Pesa prompt sent. Enter your PIN to confirm.');
});

// Public endpoint called by Safaricom. Always acknowledges; only a request carrying our secret is acted on.
exports.mpesaCallback = asyncHandler(async (req, res) => {
  const ack = { ResultCode: 0, ResultDesc: 'Accepted' };
  if (!isValidCallbackSecret(req.query.s)) return res.status(200).json(ack);

  const result = parseCallback(req.body);
  if (result) {
    try {
      await settleDeposit(result, req.app.locals.io);
    } catch (err) {
      console.error('M-Pesa callback processing failed:', err.message);
    }
  }
  res.status(200).json(ack);
});

// Lets the frontend poll a deposit it just started
exports.getDeposit = asyncHandler(async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user._id, type: 'deposit' }).catch(() => null);
  if (!tx) throw new ApiError(404, 'Deposit not found');
  sendSuccess(res, { ...txPayload(tx), failureReason: tx.failureReason, balance: req.user.mainWallet.balance });
});

exports.withdraw = asyncHandler(async (req, res) => {
  const { amount, mpesaPhone } = withdrawSchema.parse(req.body);
  const phone = mpesaPhone || req.user.mpesaPhone || req.user.phone;
  const w = await requestWithdrawal(req.user, { amount, phone }, req.app.locals.io);
  sendSuccess(res, { withdrawalId: w._id, amount: w.amount, status: w.status, requestedAt: w.requestedAt }, 'Withdrawal request submitted', 201);
});

exports.getWithdrawalHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 10);
  const filter = { user: req.user._id };
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;

  const [total, withdrawals, counts] = await Promise.all([
    Withdrawal.countDocuments(filter),
    Withdrawal.find(filter).sort('-requestedAt').skip(skip).limit(limit),
    Withdrawal.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    withdrawals: withdrawals.map(withdrawalPayload),
    totalWithdrawn: req.user.totalWithdrawn,
    counts: { approved: byStatus.approved || 0, pending: byStatus.pending || 0, rejected: byStatus.rejected || 0 },
  });
});

exports.getTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { user: req.user._id };
  if (req.query.type) filter.type = String(req.query.type);
  const [total, items] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter).sort('-createdAt').skip(skip).limit(limit),
  ]);
  sendSuccess(res, { total, page, limit, totalPages: Math.ceil(total / limit), transactions: items.map(txPayload) });
});

exports.txPayload = txPayload;
exports.withdrawalPayload = withdrawalPayload;
