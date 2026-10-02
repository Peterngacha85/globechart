const mongoose = require('mongoose');
const { z } = require('zod');
const Training = require('../models/Training');
const TrainingRegistration = require('../models/TrainingRegistration');
const Transaction = require('../models/Transaction');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { paginate } = require('../utils/helpers');
const { round2 } = require('../utils/money');
const trainings = require('../services/trainingService');

// ?program=ai_prompt|y99 narrows a list to one programme; anything else means all
const programFilter = (query) => (Training.PROGRAMS.includes(query.program) ? { program: query.program } : {});

const trainingPayload = (t) => ({
  trainingId: t._id,
  program: t.program,
  title: t.title,
  description: t.description,
  venue: t.venue,
  mapUrl: t.mapUrl,
  startsAt: t.startsAt,
  durationMinutes: t.durationMinutes,
  fee: t.fee,
  seats: t.seats,
  seatsLeft: Math.max(t.seats - t.seatsTaken, 0),
  status: t.status,
  cancelReason: t.cancelReason,
});

const registrationPayload = (r) =>
  r && {
    registrationId: r._id,
    status: r.status,
    ticketCode: r.ticketCode,
    fee: r.fee,
    refunded: r.refunded,
    refundedAt: r.refundedAt,
    cancelledBy: r.cancelledBy,
    attendedAt: r.attendedAt,
    certificateCode: r.certificateCode,
    certifiedAt: r.certifiedAt,
    createdAt: r.createdAt,
  };

// ---------- Members ----------
exports.list = asyncHandler(async (req, res) => {
  const upcoming = await Training.find({ ...programFilter(req.query), status: 'scheduled', startsAt: { $gt: new Date() } }).sort('startsAt').limit(50);
  const mine = await TrainingRegistration.find({ user: req.user._id, training: { $in: upcoming.map((t) => t._id) }, locked: true });
  const byTraining = new Map(mine.map((r) => [String(r.training), r]));
  sendSuccess(res, {
    cancelHours: trainings.CANCEL_HOURS,
    trainings: upcoming.map((t) => ({ ...trainingPayload(t), myRegistration: registrationPayload(byTraining.get(String(t._id))) })),
  });
});

exports.mine = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 20);
  const filter = { user: req.user._id };
  const byProgram = programFilter(req.query);
  if (byProgram.program) filter.training = { $in: await Training.find(byProgram).distinct('_id') };
  const [total, items] = await Promise.all([
    TrainingRegistration.countDocuments(filter),
    TrainingRegistration.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('training'),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    cancelHours: trainings.CANCEL_HOURS,
    registrations: items.map((r) => ({ ...registrationPayload(r), training: r.training ? trainingPayload(r.training) : null })),
  });
});

exports.register = asyncHandler(async (req, res) => {
  const reg = await trainings.register(req.user, req.params.id, req.app.locals.io);
  sendSuccess(res, registrationPayload(reg), 'Seat booked', 201);
});

exports.cancel = asyncHandler(async (req, res) => {
  const reg = await trainings.cancelByMember(req.user, req.params.id, req.app.locals.io);
  sendSuccess(res, registrationPayload(reg), 'Registration cancelled and refunded');
});

// Public: lets anyone (an employer, say) confirm a certificate is genuine
exports.verifyCertificate = asyncHandler(async (req, res) => {
  const code = String(req.params.code).trim().toUpperCase();
  const reg = await TrainingRegistration.findOne({ certificateCode: code }).populate('user', 'username').populate('training', 'title startsAt venue');
  if (!reg) throw new ApiError(404, 'No certificate with that code');
  sendSuccess(res, {
    certificateCode: reg.certificateCode,
    holder: reg.user?.username,
    course: reg.training?.title,
    heldOn: reg.training?.startsAt,
    venue: reg.training?.venue,
    issuedAt: reg.certifiedAt,
  });
});

// ---------- Admin ----------
const trainingFields = {
  program: z.enum(Training.PROGRAMS).optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  venue: z.string().trim().min(3).max(200),
  mapUrl: z.string().trim().url().optional(),
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(1440).optional(),
  fee: z.number().int().min(0).max(100000),
  seats: z.number().int().min(0).max(10000),
};

exports.adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = programFilter(req.query);
  if (['scheduled', 'completed', 'cancelled'].includes(req.query.status)) filter.status = req.query.status;
  const [total, items, fees, refunds] = await Promise.all([
    Training.countDocuments(filter),
    Training.find(filter).sort('-startsAt').skip(skip).limit(limit),
    Transaction.aggregate([{ $match: { type: 'training_fee', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Transaction.aggregate([{ $match: { type: 'refund', status: 'completed', relatedRegistration: { $exists: true } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const counts = await TrainingRegistration.aggregate([
    { $match: { training: { $in: items.map((t) => t._id) } } },
    { $group: { _id: { training: '$training', status: '$status' }, count: { $sum: 1 }, certified: { $sum: { $cond: [{ $ifNull: ['$certificateCode', false] }, 1, 0] } } } },
  ]);
  const count = (id, status) => counts.find((c) => String(c._id.training) === String(id) && c._id.status === status) || { count: 0, certified: 0 };

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    feesKept: round2((fees[0]?.total || 0) - (refunds[0]?.total || 0)),
    trainings: items.map((t) => ({
      ...trainingPayload(t),
      seatsTaken: t.seatsTaken,
      registered: count(t._id, 'registered').count,
      attended: count(t._id, 'attended').count,
      absent: count(t._id, 'absent').count,
      certified: count(t._id, 'attended').certified,
    })),
  });
});

exports.adminCreate = asyncHandler(async (req, res) => {
  const data = z.object(trainingFields).parse(req.body);
  if (data.startsAt <= new Date()) throw new ApiError(422, 'The session must start in the future');
  const training = await Training.create({ ...data, createdBy: req.user._id });
  sendSuccess(res, { trainingId: training._id }, 'Session created', 201);
});

exports.adminUpdate = asyncHandler(async (req, res) => {
  const data = z.object(trainingFields).partial().parse(req.body);
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Training not found');
  const training = await Training.findById(req.params.id);
  if (!training) throw new ApiError(404, 'Training not found');
  if (training.status !== 'scheduled') throw new ApiError(409, 'Only scheduled sessions can be edited');
  training.set(data);
  await training.save();
  sendSuccess(res, { trainingId: training._id }, 'Session updated');
});

exports.adminCancel = asyncHandler(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Tell members why').max(300) }).parse(req.body);
  const { refunded } = await trainings.cancelTraining(req.params.id, reason, req.app.locals.io);
  sendSuccess(res, { refunded }, `Session cancelled; ${refunded} member${refunded === 1 ? '' : 's'} refunded`);
});

exports.adminRegistrations = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Training not found');
  const training = await Training.findById(req.params.id);
  if (!training) throw new ApiError(404, 'Training not found');
  const regs = await TrainingRegistration.find({ training: training._id, status: { $ne: 'cancelled' } }).sort('createdAt').populate('user', 'username phone');
  sendSuccess(res, {
    training: { ...trainingPayload(training), seatsTaken: training.seatsTaken },
    registrations: regs.map((r) => ({ ...registrationPayload(r), member: r.user ? { username: r.user.username, phone: r.user.phone } : null })),
  });
});

exports.adminCheckIn = asyncHandler(async (req, res) => {
  const body = z
    .object({ ticketCode: z.string().trim().min(4).max(20).optional(), registrationId: z.string().optional() })
    .refine((b) => b.ticketCode || b.registrationId, 'Enter a ticket code')
    .parse(req.body);
  const { reg, already } = await trainings.checkIn(req.params.id, body);
  sendSuccess(res, { ...registrationPayload(reg), member: { username: reg.user?.username } }, already ? 'Already checked in' : 'Checked in');
});

exports.adminUndoCheckIn = asyncHandler(async (req, res) => {
  const { registrationId } = z.object({ registrationId: z.string() }).parse(req.body);
  const reg = await trainings.undoCheckIn(req.params.id, registrationId);
  sendSuccess(res, registrationPayload(reg), 'Check-in removed');
});

exports.adminComplete = asyncHandler(async (req, res) => {
  const { absent } = await trainings.completeTraining(req.params.id);
  sendSuccess(res, { absent }, 'Session completed');
});

exports.adminCertify = asyncHandler(async (req, res) => {
  const { registrationId } = z.object({ registrationId: z.string() }).parse(req.body);
  const reg = await trainings.certify(req.params.id, registrationId, req.app.locals.io);
  sendSuccess(res, registrationPayload(reg), 'Certificate issued');
});
