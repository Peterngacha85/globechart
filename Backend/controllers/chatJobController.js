const mongoose = require('mongoose');
const { z } = require('zod');
const Business = require('../models/Business');
const JobApplication = require('../models/JobApplication');
const ChatMessage = require('../models/ChatMessage');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { escapeRegex, paginate, isKenyanPhone, normalizePhone } = require('../utils/helpers');
const { round2 } = require('../utils/money');
const jobs = require('../services/chatJobService');

const STATUSES = ['pending', 'hired', 'not_selected', 'no_response', 'expired'];

const isAccepting = (b) =>
  b.status === 'active' && b.hiredCount < b.openings && b.pendingCount < (b.openings - b.hiredCount) * jobs.APPLICANTS_PER_OPENING;

const applicationPayload = (a) =>
  a && {
    applicationId: a._id,
    status: a.status,
    fee: a.fee,
    replyDeadline: a.replyDeadline,
    decisionDeadline: a.decisionDeadline,
    respondedAt: a.respondedAt,
    decidedAt: a.decidedAt,
    note: a.note,
    refunded: a.refunded,
    refundedAt: a.refundedAt,
    lastMessageAt: a.lastMessageAt,
    createdAt: a.createdAt,
  };

const businessPayload = (b, myApplication) => ({
  businessId: b._id,
  name: b.name,
  description: b.description,
  roleTitle: b.roleTitle,
  payInfo: b.payInfo,
  city: b.city,
  image: b.image,
  unlockFee: b.unlockFee,
  openingsLeft: Math.max(b.openings - b.hiredCount, 0),
  accepting: isAccepting(b),
  myApplication: applicationPayload(myApplication),
});

const businessSummary = (b) => (b ? { businessId: b._id, name: b.name, roleTitle: b.roleTitle, image: b.image, city: b.city } : null);

// ---------- Members ----------
exports.list = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query, 12);
  const filter = { status: 'active' };
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(String(req.query.search)), 'i');
    filter.$or = [{ name: rx }, { city: rx }, { roleTitle: rx }];
  }
  const [total, businesses, open] = await Promise.all([
    Business.countDocuments(filter),
    Business.find(filter).sort('-createdAt').skip(skip).limit(limit),
    JobApplication.findOne({ user: req.user._id, status: 'pending' }).populate('business', 'name'),
  ]);
  const mine = await JobApplication.find({ user: req.user._id, business: { $in: businesses.map((b) => b._id) } }).sort('-createdAt');
  const latest = new Map();
  for (const a of mine) if (!latest.has(String(a.business))) latest.set(String(a.business), a);

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    replyHours: jobs.REPLY_HOURS,
    decisionDays: jobs.DECISION_DAYS,
    openApplication: open ? { ...applicationPayload(open), business: { businessId: open.business._id, name: open.business.name } } : null,
    businesses: businesses.map((b) => businessPayload(b, latest.get(String(b._id)))),
  });
});

exports.unlock = asyncHandler(async (req, res) => {
  const app = await jobs.unlock(req.user, req.params.id, req.app.locals.io);
  sendSuccess(res, applicationPayload(app), 'Chat unlocked', 201);
});

exports.myApplications = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query, 10);
  const filter = { user: req.user._id };
  const [total, items, [refunds = { total: 0 }]] = await Promise.all([
    JobApplication.countDocuments(filter),
    JobApplication.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('business', 'name roleTitle image city'),
    JobApplication.aggregate([{ $match: { user: req.user._id, refunded: true } }, { $group: { _id: null, total: { $sum: '$fee' } } }]),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalRefunded: refunds.total,
    applications: items.map((a) => ({ ...applicationPayload(a), business: businessSummary(a.business) })),
  });
});

// ---------- Any participant (member, the business, or the admin) ----------
exports.getApplication = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const { app, role } = await jobs.loadForParticipant(req.params.id, req.user);
  sendSuccess(res, {
    ...applicationPayload(app),
    viewerRole: role,
    member: { userId: app.user._id, username: app.user.username },
    business: { ...businessSummary(app.business), payInfo: app.business.payInfo },
    replyHours: jobs.REPLY_HOURS,
    decisionDays: jobs.DECISION_DAYS,
  });
});

exports.listMessages = asyncHandler(async (req, res) => {
  const { app } = await jobs.loadForParticipant(req.params.id, req.user);
  const messages = await ChatMessage.find({ application: app._id }).sort('-createdAt').limit(300).populate('sender', 'username');
  sendSuccess(res, { messages: messages.reverse().map((m) => jobs.messagePayload(m, m.sender?.username)) });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1, 'Type a message').max(2000) }).parse(req.body);
  const message = await jobs.sendMessage(req.params.id, req.user, text, req.app.locals.io);
  sendSuccess(res, jobs.messagePayload(message, req.user.username), 'Message sent', 201);
});

exports.decide = asyncHandler(async (req, res) => {
  const body = z
    .object({ outcome: z.enum(['hired', 'not_selected']), note: z.string().trim().max(300).optional() })
    .parse(req.body);
  const app = await jobs.decide(req.params.id, req.user, body, req.app.locals.io);
  sendSuccess(res, applicationPayload(app), body.outcome === 'hired' ? 'Applicant hired' : 'Applicant not selected; fee refunded');
});

// ---------- Business accounts ----------
exports.inbox = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const business = await Business.findOne({ account: req.user._id });
  if (!business) throw new ApiError(404, 'No business is linked to this account. Contact the admin.');
  const { page, limit, skip } = paginate(req.query);
  const filter = { business: business._id };
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const [total, items] = await Promise.all([
    JobApplication.countDocuments(filter),
    JobApplication.find(filter).sort('-lastMessageAt -createdAt').skip(skip).limit(limit).populate('user', 'username'),
  ]);
  sendSuccess(res, {
    business: { ...businessSummary(business), openings: business.openings, hiredCount: business.hiredCount, pendingCount: business.pendingCount, status: business.status },
    replyHours: jobs.REPLY_HOURS,
    decisionDays: jobs.DECISION_DAYS,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    applications: items.map((a) => ({ ...applicationPayload(a), member: { username: a.user?.username } })),
  });
});

// ---------- Admin ----------
const phoneField = z.string().refine(isKenyanPhone, 'Enter a valid Kenyan phone number, e.g. 0712345678').transform(normalizePhone);
const businessFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  roleTitle: z.string().trim().min(2).max(120).optional(),
  payInfo: z.string().trim().max(300).optional(),
  city: z.string().trim().max(60).optional(),
  image: z.string().trim().url().optional(),
  unlockFee: z.number().int().min(0).max(100000),
  openings: z.number().int().min(0).max(10000),
  status: z.enum(['active', 'paused', 'archived']).optional(),
};
const createBusinessSchema = z.object({
  ...businessFields,
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Login username: 3-30 letters, numbers or underscore').transform((v) => v.toLowerCase()),
  phone: phoneField,
  password: z.string().min(8, 'Business password must be at least 8 characters').max(128),
});
const updateBusinessSchema = z.object(businessFields).partial().extend({ newPassword: z.string().min(8).max(128).optional() });

exports.adminListBusinesses = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['active', 'paused', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const [total, businesses] = await Promise.all([
    Business.countDocuments(filter),
    Business.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('account', 'username phone status'),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    businesses: businesses.map((b) => ({
      ...businessPayload(b),
      status: b.status,
      openings: b.openings,
      hiredCount: b.hiredCount,
      pendingCount: b.pendingCount,
      account: b.account ? { userId: b.account._id, username: b.account.username, phone: b.account.phone, status: b.account.status } : null,
    })),
  });
});

exports.adminCreateBusiness = asyncHandler(async (req, res) => {
  const { username, phone, password, ...details } = createBusinessSchema.parse(req.body);
  const taken = await User.findOne({ $or: [{ username }, { phone }] }).select('username');
  if (taken) throw new ApiError(409, taken.username === username ? 'That login username is taken' : 'That phone number is already registered');

  const account = await User.create({ username, phone, password, role: 'business', country: 'Kenya' });
  try {
    const business = await Business.create({ ...details, account: account._id, createdBy: req.user._id });
    sendSuccess(res, { businessId: business._id, username: account.username }, 'Business added', 201);
  } catch (err) {
    await User.deleteOne({ _id: account._id }); // don't leave a login with no business behind
    throw err;
  }
});

exports.adminUpdateBusiness = asyncHandler(async (req, res) => {
  const { newPassword, ...data } = updateBusinessSchema.parse(req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Business not found');
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, 'Business not found');
  business.set(data);
  await business.save();
  if (newPassword) {
    const account = await User.findById(business.account);
    account.password = newPassword;
    account.tokenVersion += 1; // sign out old sessions
    await account.save();
  }
  sendSuccess(res, { businessId: business._id }, 'Business updated');
});

// Archived businesses keep their history; open applications still get decided or refunded
exports.adminArchiveBusiness = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Business not found');
  const business = await Business.findByIdAndUpdate(req.params.id, { status: 'archived' });
  if (!business) throw new ApiError(404, 'Business not found');
  sendSuccess(res, null, 'Business archived');
});

exports.adminListApplications = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (mongoose.isValidObjectId(req.query.business)) filter.business = req.query.business;
  const [total, items] = await Promise.all([
    JobApplication.countDocuments(filter),
    JobApplication.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('user', 'username phone').populate('business', 'name roleTitle'),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    applications: items.map((a) => ({
      ...applicationPayload(a),
      member: a.user ? { userId: a.user._id, username: a.user.username, phone: a.user.phone } : null,
      business: businessSummary(a.business),
    })),
  });
});

exports.adminSummary = asyncHandler(async (req, res) => {
  await jobs.expireOverdue(req.app.locals.io);
  const sum = async (match) => {
    const [row] = await Transaction.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
    return { total: row?.total || 0, count: row?.count || 0 };
  };
  const [fees, refunds, byStatus] = await Promise.all([
    sum({ type: 'unlock_fee', status: 'completed' }),
    sum({ type: 'refund', status: 'completed', relatedApplication: { $exists: true } }),
    JobApplication.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, fees: { $sum: '$fee' } } }]),
  ]);
  const status = (s) => byStatus.find((r) => r._id === s) || { count: 0, fees: 0 };
  sendSuccess(res, {
    feesCharged: fees.total,
    refunded: { total: refunds.total, count: refunds.count },
    feesKept: round2(fees.total - refunds.total),
    pending: { count: status('pending').count, fees: status('pending').fees }, // refunded unless hired
    hired: status('hired').count,
  });
});
