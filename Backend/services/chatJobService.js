const mongoose = require('mongoose');
const Business = require('../models/Business');
const JobApplication = require('../models/JobApplication');
const ChatMessage = require('../models/ChatMessage');
const Transaction = require('../models/Transaction');
const { debit, credit } = require('./wallet');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const NotificationEmitter = require('../utils/notificationEmitter');

const REPLY_HOURS = 48;
const DECISION_DAYS = 7;
const APPLICANTS_PER_OPENING = 3;

const REFUND_REASON = {
  not_selected: 'not selected',
  no_response: `no reply within ${REPLY_HOURS} hours`,
  expired: `no decision within ${DECISION_DAYS} days`,
};

async function notifySafely(io, userId, notification, balance) {
  try {
    const notifier = new NotificationEmitter(io);
    if (balance !== undefined) notifier.emitBalanceUpdate(userId, balance);
    await notifier.notifyUser(userId, { category: 'transaction', actionUrl: '/dashboard/jobs', actionLabel: 'Chat jobs', ...notification });
  } catch (err) {
    console.error('Chat job notification failed:', err.message);
  }
}

/**
 * Moves a pending application to a refunded outcome, frees its place in the business's queue,
 * and returns the fee to the member's main wallet. Returns null if it was no longer pending.
 */
async function closeWithRefund(filter, outcome, { decidedBy, note } = {}) {
  return runInTransaction(async (session) => {
    const now = new Date();
    const app = await JobApplication.findOneAndUpdate(
      { ...filter, status: 'pending' },
      {
        status: outcome,
        // A member who was not selected can't pay to apply to the same business again
        locked: outcome === 'not_selected',
        refunded: true,
        refundedAt: now,
        ...(decidedBy && { decidedBy, decidedAt: now }),
        ...(note && { note }),
      },
      { new: true, session }
    ).populate({ path: 'business', select: 'name', options: { session } });
    if (!app) return null;

    await Business.updateOne({ _id: app.business._id, pendingCount: { $gt: 0 } }, { $inc: { pendingCount: -1 } }, { session });
    let balance;
    if (app.fee > 0) {
      await Transaction.create(
        [
          {
            user: app.user,
            type: 'refund',
            wallet: 'main',
            amount: app.fee,
            status: 'completed',
            completedAt: now,
            description: `Refund: ${app.business.name} unlock fee (${REFUND_REASON[outcome]})`,
            relatedApplication: app._id,
          },
        ],
        { session }
      );
      balance = (await credit(app.user, 'main', app.fee, session)).mainWallet.balance;
    }
    return { app, balance };
  });
}

const refundMessage = (app, outcome) =>
  ({
    not_selected: `${app.business.name} did not select you this time${app.note ? `: ${app.note}` : ''}.`,
    no_response: `${app.business.name} did not reply within ${REPLY_HOURS} hours.`,
    expired: `${app.business.name} did not make a decision within ${DECISION_DAYS} days.`,
  })[outcome] + ` Your Ksh ${app.fee} unlock fee was refunded to your main wallet.`;

/** Refunds applications whose business never replied in 48 hours or never decided in 7 days. */
async function expireOverdue(io) {
  const now = new Date();
  const overdue = await JobApplication.find({
    status: 'pending',
    $or: [{ respondedAt: null, replyDeadline: { $lte: now } }, { decisionDeadline: { $lte: now } }],
  })
    .select('_id respondedAt')
    .limit(200);

  let closed = 0;
  for (const { _id, respondedAt } of overdue) {
    const outcome = respondedAt ? 'expired' : 'no_response';
    const deadline = outcome === 'expired' ? { decisionDeadline: { $lte: now } } : { respondedAt: null, replyDeadline: { $lte: now } };
    const done = await closeWithRefund({ _id, ...deadline }, outcome);
    if (!done) continue; // decided or replied to in the meantime
    closed += 1;
    await notifySafely(io, done.app.user, { title: 'Unlock fee refunded', message: refundMessage(done.app, outcome), type: 'info' }, done.balance);
  }
  return closed;
}

/** Charges the unlock fee and opens a chat with the business. */
async function unlock(user, businessId, io) {
  if (!mongoose.isValidObjectId(businessId)) throw new ApiError(404, 'Business not found');
  if (user.role !== 'user') throw new ApiError(403, 'Only member accounts can apply for chat jobs');
  await expireOverdue(io);
  if (await JobApplication.exists({ user: user._id, status: 'pending' })) {
    throw new ApiError(409, 'You already have an open application. Wait for its result; if there is no reply your fee is refunded automatically.');
  }
  if (await JobApplication.exists({ user: user._id, business: businessId, locked: true })) {
    throw new ApiError(409, 'You have already applied to this business');
  }

  let result;
  try {
    result = await runInTransaction(async (session) => {
      const business = await Business.findOneAndUpdate(
        {
          _id: businessId,
          status: 'active',
          $expr: {
            $and: [
              { $lt: ['$hiredCount', '$openings'] },
              { $lt: ['$pendingCount', { $multiply: [{ $subtract: ['$openings', '$hiredCount'] }, APPLICANTS_PER_OPENING] }] },
            ],
          },
        },
        { $inc: { pendingCount: 1 } },
        { new: true, session }
      );
      if (!business) {
        const open = await Business.exists({ _id: businessId, status: 'active' }).session(session);
        throw open ? new ApiError(409, 'This business is not taking more applicants right now') : new ApiError(404, 'Business not found');
      }

      const now = Date.now();
      const [app] = await JobApplication.create(
        [
          {
            user: user._id,
            business: business._id,
            fee: business.unlockFee,
            replyDeadline: new Date(now + REPLY_HOURS * 60 * 60 * 1000),
            decisionDeadline: new Date(now + DECISION_DAYS * 24 * 60 * 60 * 1000),
          },
        ],
        { session }
      );

      let balance = user.mainWallet.balance;
      if (business.unlockFee > 0) {
        balance = (await debit(user._id, 'main', business.unlockFee, session)).mainWallet.balance;
        await Transaction.create(
          [
            {
              user: user._id,
              type: 'unlock_fee',
              wallet: 'main',
              amount: business.unlockFee,
              status: 'completed',
              completedAt: new Date(),
              description: `Unlock fee: ${business.name}`,
              relatedApplication: app._id,
            },
          ],
          { session }
        );
      }
      return { business, app, balance };
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You already have an open application'); // concurrent double tap
    throw err;
  }

  const { business, app, balance } = result;
  await notifySafely(
    io,
    user._id,
    {
      title: `${business.name} unlocked`,
      message: `Say hello and introduce yourself. If ${business.name} doesn't reply within ${REPLY_HOURS} hours, or doesn't hire you, your Ksh ${app.fee} is refunded.`,
      type: 'info',
    },
    balance
  );
  await notifySafely(io, business.account, {
    title: 'New applicant',
    message: `${user.username} unlocked your chat. Reply within ${REPLY_HOURS} hours.`,
    type: 'info',
    actionUrl: `/business/chats/${app._id}`,
    actionLabel: 'Open chat',
  });
  return app;
}

/**
 * Loads an application and works out who is asking: the member, the business's own account, or the admin.
 * Anyone else gets a 404 so application ids can't be probed.
 */
async function loadForParticipant(applicationId, user) {
  if (!mongoose.isValidObjectId(applicationId)) throw new ApiError(404, 'Chat not found');
  const app = await JobApplication.findById(applicationId).populate('business').populate('user', 'username');
  if (!app) throw new ApiError(404, 'Chat not found');
  let role = null;
  if (user.role === 'super_admin') role = 'admin';
  else if (String(app.user._id) === String(user._id)) role = 'member';
  else if (user.role === 'business' && String(app.business.account) === String(user._id)) role = 'business';
  if (!role) throw new ApiError(404, 'Chat not found');
  return { app, role };
}

const OPEN_FOR_CHAT = ['pending', 'hired'];

async function sendMessage(applicationId, user, text, io) {
  await expireOverdue(io); // a reply after the 48 hours must not cancel a refund that is already due
  const { app, role } = await loadForParticipant(applicationId, user);
  if (!OPEN_FOR_CHAT.includes(app.status)) throw new ApiError(409, 'This chat is closed');

  const message = await ChatMessage.create({ application: app._id, sender: user._id, senderRole: role, text });
  await JobApplication.updateOne({ _id: app._id }, { lastMessageAt: message.createdAt });
  // The first business reply stops the 48-hour no-response refund
  if (role === 'business') await JobApplication.updateOne({ _id: app._id, respondedAt: null }, { respondedAt: message.createdAt });

  const payload = { applicationId: app._id, message: messagePayload(message, user.username) };
  try {
    io?.to(`user:${app.user._id}`).to(`user:${app.business.account}`).to('admins').emit('chat:message', payload);
  } catch (err) {
    console.error('Chat message push failed:', err.message);
  }
  return message;
}

const messagePayload = (m, senderName) => ({
  messageId: m._id,
  senderRole: m.senderRole,
  senderName,
  text: m.text,
  createdAt: m.createdAt,
});

/** The business (or the admin) records the outcome. Hired keeps the fee; not selected refunds it. */
async function decide(applicationId, user, { outcome, note }, io) {
  await expireOverdue(io);
  const { app, role } = await loadForParticipant(applicationId, user);
  if (role === 'member') throw new ApiError(403, 'Only the business or the admin can decide');
  if (app.status !== 'pending') throw new ApiError(409, 'This application has already been decided');

  if (outcome === 'not_selected') {
    const done = await closeWithRefund({ _id: app._id }, 'not_selected', { decidedBy: user._id, note });
    if (!done) throw new ApiError(409, 'This application has already been decided');
    await notifySafely(io, done.app.user, { title: 'Application result', message: refundMessage(done.app, 'not_selected'), type: 'info' }, done.balance);
    return done.app;
  }

  const hired = await runInTransaction(async (session) => {
    const business = await Business.findOneAndUpdate(
      { _id: app.business._id, $expr: { $lt: ['$hiredCount', '$openings'] } },
      { $inc: { hiredCount: 1, pendingCount: -1 } },
      { new: true, session }
    );
    if (!business) throw new ApiError(409, 'All openings are filled. Ask the admin to add openings first.');
    const a = await JobApplication.findOneAndUpdate(
      { _id: app._id, status: 'pending' },
      { status: 'hired', decidedBy: user._id, decidedAt: new Date(), ...(note && { note }) },
      { new: true, session }
    );
    if (!a) throw new ApiError(409, 'This application has already been decided');
    return a;
  });

  await notifySafely(io, app.user._id, {
    title: `You're hired by ${app.business.name}!`,
    message: `Congratulations! ${app.business.name} selected you as ${app.business.roleTitle}.${note ? ` ${note}` : ''} Keep chatting with them for next steps.`,
    type: 'success',
  });
  return hired;
}

module.exports = {
  REPLY_HOURS,
  DECISION_DAYS,
  APPLICANTS_PER_OPENING,
  expireOverdue,
  unlock,
  loadForParticipant,
  sendMessage,
  messagePayload,
  decide,
};
