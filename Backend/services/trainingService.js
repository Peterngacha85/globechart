const mongoose = require('mongoose');
const Training = require('../models/Training');
const TrainingRegistration = require('../models/TrainingRegistration');
const fees = require('./fees');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const { randomCode } = require('../utils/helpers');
const NotificationEmitter = require('../utils/notificationEmitter');

const CANCEL_HOURS = 24;

async function notifySafely(io, userId, notification, balance) {
  try {
    const notifier = new NotificationEmitter(io);
    if (balance !== undefined) notifier.emitBalanceUpdate(userId, balance);
    await notifier.notifyUser(userId, { category: 'transaction', actionUrl: '/dashboard/training', actionLabel: 'My training', ...notification });
  } catch (err) {
    console.error('Training notification failed:', err.message);
  }
}

const validId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, `${label} not found`);
  return id;
};

/** Takes a seat and charges the registration fee (bonus credit first). */
async function register(user, trainingId, io) {
  validId(trainingId, 'Training');
  if (user.role !== 'user') throw new ApiError(403, 'Only member accounts can register for training');
  if (await TrainingRegistration.exists({ user: user._id, training: trainingId, locked: true })) {
    throw new ApiError(409, 'You are already registered for this session');
  }

  let result;
  try {
    result = await runInTransaction(async (session) => {
      const training = await Training.findOneAndUpdate(
        { _id: trainingId, status: 'scheduled', startsAt: { $gt: new Date() }, $expr: { $lt: ['$seatsTaken', '$seats'] } },
        { $inc: { seatsTaken: 1 } },
        { new: true, session }
      );
      if (!training) {
        const open = await Training.exists({ _id: trainingId, status: 'scheduled', startsAt: { $gt: new Date() } }).session(session);
        throw open ? new ApiError(409, 'This session is full') : new ApiError(404, 'Session not found or registration has closed');
      }
      const [reg] = await TrainingRegistration.create([{ user: user._id, training: training._id, fee: training.fee, ticketCode: randomCode(8) }], { session });
      const paid = await fees.chargeFee(
        user._id,
        training.fee,
        { type: 'training_fee', description: `Training registration: ${training.title}`, relatedRegistration: reg._id },
        session
      );
      if (paid.fromBonus > 0) {
        reg.feeFromBonus = paid.fromBonus;
        await reg.save({ session });
      }
      return { training, reg, balance: paid.user.mainWallet.balance };
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You are already registered for this session');
    throw err;
  }

  const { training, reg, balance } = result;
  await notifySafely(
    io,
    user._id,
    {
      title: 'Training seat booked',
      message: `${training.title}, ${training.venue}. Your ticket code is ${reg.ticketCode}. Show it at the door.`,
      type: 'success',
    },
    balance
  );
  return reg;
}

// Marks one registration cancelled, frees its seat and refunds the fee. Null if it wasn't "registered".
async function cancelOne(filter, cancelledBy, session) {
  const reg = await TrainingRegistration.findOneAndUpdate(
    { ...filter, status: 'registered' },
    { status: 'cancelled', locked: false, cancelledBy, refunded: true, refundedAt: new Date() },
    { new: true, session }
  ).populate({ path: 'training', select: 'title', options: { session } });
  if (!reg) return null;
  await Training.updateOne({ _id: reg.training._id, seatsTaken: { $gt: 0 } }, { $inc: { seatsTaken: -1 } }, { session });
  let balance;
  if (reg.fee > 0) {
    const why = cancelledBy === 'admin' ? 'session cancelled' : 'you cancelled';
    const tx = { description: `Refund: ${reg.training.title} registration (${why})`, relatedRegistration: reg._id };
    balance = (await fees.refundFee(reg.user, reg, tx, session)).mainWallet.balance;
  }
  return { reg, balance };
}

/** The member cancels; refunded only if the class is at least 24 hours away. */
async function cancelByMember(user, registrationId, io) {
  validId(registrationId, 'Registration');
  const reg = await TrainingRegistration.findOne({ _id: registrationId, user: user._id }).populate('training', 'startsAt title');
  if (!reg) throw new ApiError(404, 'Registration not found');
  if (reg.status !== 'registered') throw new ApiError(409, 'This registration can no longer be cancelled');
  if (reg.training.startsAt.getTime() - Date.now() < CANCEL_HOURS * 60 * 60 * 1000) {
    throw new ApiError(409, `Cancellations close ${CANCEL_HOURS} hours before the class starts`);
  }

  const done = await runInTransaction((session) => cancelOne({ _id: reg._id }, 'member', session));
  if (!done) throw new ApiError(409, 'This registration can no longer be cancelled');
  await notifySafely(io, user._id, { title: 'Registration cancelled', message: `Your Ksh ${done.reg.fee} for ${reg.training.title} was refunded.`, type: 'info' }, done.balance);
  return done.reg;
}

/** The admin cancels a session: every registered member is refunded. */
async function cancelTraining(trainingId, reason, io) {
  validId(trainingId, 'Training');
  const training = await Training.findOneAndUpdate({ _id: trainingId, status: 'scheduled' }, { status: 'cancelled', cancelReason: reason }, { new: true });
  if (!training) throw new ApiError(409, 'Only scheduled sessions can be cancelled');

  const regs = await TrainingRegistration.find({ training: training._id, status: 'registered' }).select('_id');
  let refunded = 0;
  for (const { _id } of regs) {
    const done = await runInTransaction((session) => cancelOne({ _id }, 'admin', session));
    if (!done) continue;
    refunded += 1;
    await notifySafely(
      io,
      done.reg.user,
      { title: 'Training cancelled', message: `${training.title} was cancelled: ${reason}. Your Ksh ${done.reg.fee} was refunded.`, type: 'warning' },
      done.balance
    );
  }
  return { training, refunded };
}

async function loadTraining(trainingId) {
  const training = await Training.findById(validId(trainingId, 'Training'));
  if (!training) throw new ApiError(404, 'Training not found');
  return training;
}

/** Door check-in by ticket code (or by registration id from the list). */
async function checkIn(trainingId, { ticketCode, registrationId }) {
  const training = await loadTraining(trainingId);
  if (training.status === 'cancelled') throw new ApiError(409, 'This session was cancelled');
  const filter = { training: training._id };
  if (registrationId) filter._id = validId(registrationId, 'Registration');
  else filter.ticketCode = String(ticketCode || '').trim().toUpperCase();

  const reg = await TrainingRegistration.findOne(filter).populate('user', 'username');
  if (!reg) throw new ApiError(404, 'No ticket with that code for this session');
  if (reg.status === 'attended') return { reg, already: true };
  if (!['registered', 'absent'].includes(reg.status)) throw new ApiError(409, 'This registration was cancelled');
  reg.status = 'attended';
  reg.attendedAt = new Date();
  await reg.save();
  return { reg, already: false };
}

/** Undo a mistaken check-in. */
async function undoCheckIn(trainingId, registrationId) {
  const training = await loadTraining(trainingId);
  const reg = await TrainingRegistration.findOneAndUpdate(
    { _id: validId(registrationId, 'Registration'), training: training._id, status: 'attended', certificateCode: { $exists: false } },
    { status: training.status === 'completed' ? 'absent' : 'registered', $unset: { attendedAt: 1 } },
    { new: true }
  );
  if (!reg) throw new ApiError(409, 'Only attendees without a certificate can be unmarked');
  return reg;
}

/** Ends a session: anyone who never checked in becomes absent (fee kept). */
async function completeTraining(trainingId) {
  const training = await loadTraining(trainingId);
  if (training.status !== 'scheduled') throw new ApiError(409, 'Only scheduled sessions can be completed');
  if (training.startsAt > new Date()) throw new ApiError(409, 'This session has not started yet');
  training.status = 'completed';
  await training.save();
  const { modifiedCount } = await TrainingRegistration.updateMany({ training: training._id, status: 'registered' }, { status: 'absent' });
  return { training, absent: modifiedCount };
}

/** Issues a certificate with a code anyone can verify. Only attendees qualify. */
async function certify(trainingId, registrationId, io) {
  const training = await loadTraining(trainingId);
  const code = `GC-${randomCode(10)}`;
  const reg = await TrainingRegistration.findOneAndUpdate(
    { _id: validId(registrationId, 'Registration'), training: training._id, status: 'attended', certificateCode: { $exists: false } },
    { certificateCode: code, certifiedAt: new Date() },
    { new: true }
  );
  if (!reg) throw new ApiError(409, 'Only attendees without a certificate can be certified');
  await notifySafely(io, reg.user, {
    title: 'Certificate issued',
    message: `Congratulations! Your certificate for ${training.title} is ready. Verification code: ${code}.`,
    type: 'success',
  });
  return reg;
}

module.exports = { CANCEL_HOURS, register, cancelByMember, cancelTraining, checkIn, undoCheckIn, completeTraining, certify };
