const mongoose = require('mongoose');
const { z } = require('zod');
const User = require('../models/User');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const Commission = require('../models/Commission');
const SystemSettings = require('../models/SystemSettings');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { escapeRegex, paginate } = require('../utils/helpers');
const { DEFAULTS, getSettings } = require('../services/settings');
const { approveWithdrawal, rejectWithdrawal } = require('../services/withdrawalService');
const { productPayload, CATEGORIES } = require('./productController');
const { withdrawalPayload } = require('./financeController');

const objectId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
  return id;
};

// ---------- Users ----------
const userRow = (u) => ({
  userId: u._id,
  username: u.username,
  email: u.email,
  phone: u.phone,
  country: u.country,
  status: u.status,
  role: u.role,
  joinedAt: u.createdAt,
  mainBalance: u.mainWallet.balance,
  commissionBalance: u.commissionWallet.balance,
  totalEarnings: u.commissionWallet.totalEarned,
  referrals: u.networkTree.level1Count,
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['active', 'inactive', 'suspended', 'banned'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(String(req.query.search)), 'i');
    filter.$or = [{ username: rx }, { email: rx }, { phone: rx }];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
  ]);
  sendSuccess(res, { total, page, limit, totalPages: Math.ceil(total / limit), users: users.map(userRow) });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(objectId(req.params.id, 'User'));
  if (!user) throw new ApiError(404, 'User not found');
  const [referrer, transactions, withdrawals, commissions] = await Promise.all([
    user.referredBy ? User.findById(user.referredBy).select('username') : null,
    Transaction.find({ user: user._id }).sort('-createdAt').limit(20),
    Withdrawal.find({ user: user._id }).sort('-requestedAt').limit(20),
    Commission.find({ user: user._id }).sort('-createdAt').limit(20),
  ]);
  sendSuccess(res, {
    ...userRow(user),
    suspensionReason: user.suspensionReason,
    referralCode: user.referralCode,
    referredBy: referrer ? { username: referrer.username } : null,
    networkTree: user.networkTree,
    totalWithdrawn: user.totalWithdrawn,
    lastLogin: user.lastLogin,
    transactions,
    withdrawals: withdrawals.map(withdrawalPayload),
    commissions,
  });
});

const setStatus = (status) =>
  asyncHandler(async (req, res) => {
    const user = await User.findById(objectId(req.params.id, 'User'));
    if (!user) throw new ApiError(404, 'User not found');
    if (user.role === 'super_admin') throw new ApiError(403, 'Admin accounts cannot be suspended');
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body || {});
    user.status = status;
    user.suspensionReason = status === 'suspended' ? reason : undefined;
    await user.save();
    sendSuccess(res, null, status === 'suspended' ? 'User suspended successfully' : 'User reactivated successfully');
  });
exports.suspendUser = setStatus('suspended');
exports.reactivateUser = setStatus('active');

// ---------- Withdrawals ----------
exports.listWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  const sort = req.query.sort === 'requestedAt' ? 'requestedAt' : '-requestedAt';
  const [total, items] = await Promise.all([
    Withdrawal.countDocuments(filter),
    Withdrawal.find(filter).sort(sort).skip(skip).limit(limit).populate('user', 'username phone'),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    withdrawals: items.map((w) => ({ ...withdrawalPayload(w), user: w.user ? { userId: w.user._id, username: w.user.username, phone: w.user.phone } : null })),
  });
});

exports.approveWithdrawal = asyncHandler(async (req, res) => {
  const { transactionReference } = z
    .object({ transactionReference: z.string().trim().min(3, 'Enter the M-Pesa transaction code').max(40) })
    .parse(req.body);
  const w = await approveWithdrawal(req.params.id, req.user, { transactionReference }, req.app.locals.io);
  sendSuccess(res, { withdrawalId: w._id, status: w.status, approvedAt: w.processedAt }, 'Withdrawal approved');
});

exports.rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'A reason is required').max(300) }).parse(req.body);
  const w = await rejectWithdrawal(req.params.id, req.user, { reason }, req.app.locals.io);
  sendSuccess(res, { withdrawalId: w._id, status: w.status }, 'Withdrawal rejected');
});

// ---------- Analytics ----------
const PERIOD_DAYS = { day: 1, week: 7, month: 30, year: 365 };

exports.financeAnalytics = asyncHandler(async (req, res) => {
  const days = PERIOD_DAYS[req.query.period];
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date(0);
  const inPeriod = { createdAt: { $gte: since } };
  const sum = async (Model, match, field = 'amount') => {
    const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } } }]);
    return { total: row?.total || 0, count: row?.count || 0 };
  };

  const [deposits, paidOut, pendingOut, sales, commissions, newUsers, totalUsers, buyers, topEarners] = await Promise.all([
    sum(Transaction, { type: 'deposit', status: 'completed', ...inPeriod }),
    sum(Withdrawal, { status: 'approved', ...inPeriod }),
    sum(Withdrawal, { status: 'pending' }),
    sum(Purchase, { status: 'completed', ...inPeriod }, 'purchasePrice'),
    sum(Commission, inPeriod),
    User.countDocuments(inPeriod),
    User.countDocuments({}),
    Purchase.distinct('user', { status: 'completed', ...inPeriod }),
    User.find({ 'commissionWallet.totalEarned': { $gt: 0 } }).sort('-commissionWallet.totalEarned').limit(5).select('username commissionWallet.totalEarned'),
  ]);

  sendSuccess(res, {
    period: req.query.period || 'all',
    totalDeposits: deposits.total,
    totalSales: sales.total,
    salesCount: sales.count,
    totalCommissions: commissions.total,
    totalWithdrawals: paidOut.total,
    pendingWithdrawals: pendingOut.total,
    pendingWithdrawalCount: pendingOut.count,
    netRevenue: sales.total - commissions.total,
    avgOrderValue: sales.count ? Math.round((sales.total / sales.count) * 100) / 100 : 0,
    totalUsers,
    newUsers,
    activeBuyers: buyers.length,
    topEarners: topEarners.map((u) => ({ username: u.username, earnings: u.commissionWallet.totalEarned })),
  });
});

// ---------- Settings ----------
exports.getSettings = asyncHandler(async (req, res) => {
  const values = await getSettings();
  sendSuccess(res, Object.entries(DEFAULTS).map(([setting, d]) => ({ setting, value: values[setting], category: d.category, description: d.description })));
});

exports.upsertSetting = asyncHandler(async (req, res) => {
  const body = z.object({ setting: z.enum(Object.keys(DEFAULTS)), value: z.number().nonnegative() }).parse(req.body);
  const d = DEFAULTS[body.setting];
  await SystemSettings.findOneAndUpdate(
    { setting: body.setting },
    { value: body.value, category: d.category, description: d.description, modifiedBy: req.user._id },
    { upsert: true, new: true }
  );
  sendSuccess(res, null, 'Setting created/updated successfully');
});

// ---------- Products ----------
const commissionSchema = z.object({
  referralLevel1: z.number().min(0).max(50).optional(),
  referralLevel2: z.number().min(0).max(50).optional(),
  referralLevel3: z.number().min(0).max(50).optional(),
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).optional(),
  category: z.enum(CATEGORIES),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  image: z.string().trim().url().optional(),
  content: z.string().trim().max(2000).optional(),
  commission: commissionSchema.optional(),
  stockQuantity: z.number().int().min(-1).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

exports.listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['active', 'inactive', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('seller', 'username'),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    products: products.map((p) => ({ ...productPayload(p), status: p.status, content: p.content, stockQuantity: p.stockQuantity })),
  });
});

exports.createProduct = asyncHandler(async (req, res) => {
  const data = productSchema.parse(req.body);
  const product = await Product.create({ ...data, seller: req.user._id });
  sendSuccess(res, { productId: product._id }, 'Product created successfully', 201);
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const data = productSchema.partial().parse(req.body);
  const product = await Product.findById(objectId(req.params.id, 'Product'));
  if (!product) throw new ApiError(404, 'Product not found');
  const { commission, ...rest } = data;
  product.set(rest);
  if (commission) product.set('commission', { ...product.commission.toObject(), ...commission });
  await product.save();
  sendSuccess(res, { productId: product._id }, 'Product updated successfully');
});

// Products with sales are archived, never deleted, so purchase history stays intact
exports.archiveProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(objectId(req.params.id, 'Product'), { status: 'archived' });
  if (!product) throw new ApiError(404, 'Product not found');
  sendSuccess(res, null, 'Product archived');
});
