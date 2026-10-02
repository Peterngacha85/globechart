const mongoose = require('mongoose');
const Hotel = require('../models/Hotel');
const HotelReview = require('../models/HotelReview');
const Transaction = require('../models/Transaction');
const { credit } = require('./wallet');
const fees = require('./fees');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const NotificationEmitter = require('../utils/notificationEmitter');

const REVIEW_RADIUS_METERS = 200;
const RESERVATION_HOURS = 48;

// Great-circle distance between two { lat, lng } points
function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const releaseSlot = (hotelId, session) =>
  Hotel.updateOne({ _id: hotelId, slotsUsed: { $gt: 0 } }, { $inc: { slotsUsed: -1 } }, { session });

async function refundFee(review, hotelName, session) {
  const user = await fees.refundFee(review.user, review, { description: `Review fee refund: ${hotelName}`, relatedReview: review._id }, session);
  return { balance: user.mainWallet.balance };
}

// Post-commit side effects: a failed notification must never undo a money movement
async function notifySafely(io, userId, notification, balance) {
  try {
    const notifier = new NotificationEmitter(io);
    if (balance !== undefined) notifier.emitBalanceUpdate(userId, balance);
    await notifier.notifyUser(userId, { category: 'transaction', actionUrl: '/dashboard/hotels', actionLabel: 'Hotel reviews', ...notification });
  } catch (err) {
    console.error('Hotel review notification failed:', err.message);
  }
}

/** Refunds and frees every reservation whose 48 hours ran out without a submission. */
async function expireOverdue(io) {
  const now = new Date();
  const overdue = await HotelReview.find({ status: 'reserved', expiresAt: { $lte: now } }).select('_id').limit(200);
  let expired = 0;
  for (const { _id } of overdue) {
    const done = await runInTransaction(async (session) => {
      const r = await HotelReview.findOneAndUpdate(
        { _id, status: 'reserved', expiresAt: { $lte: now } },
        { status: 'expired', locked: false, feeRefunded: true },
        { new: true, session }
      ).populate({ path: 'hotel', select: 'name', options: { session } });
      if (!r) return null; // a concurrent run or a last-second submit got there first
      await releaseSlot(r.hotel._id, session);
      const refund = r.fee > 0 ? await refundFee(r, r.hotel.name, session) : null;
      return { r, balance: refund?.balance };
    });
    if (!done) continue;
    expired += 1;
    await notifySafely(
      io,
      done.r.user,
      {
        title: 'Review reservation expired',
        message: `Your ${RESERVATION_HOURS}-hour window for ${done.r.hotel.name} ended without a submission. Ksh ${done.r.fee} was refunded to your main wallet.`,
        type: 'info',
      },
      done.balance
    );
  }
  return expired;
}

/** Charges the fee from the main wallet and holds one of the hotel's funded slots for the member. */
async function startReview(user, hotelId, io) {
  if (!mongoose.isValidObjectId(hotelId)) throw new ApiError(404, 'Hotel not found');
  await expireOverdue(io);
  if (await HotelReview.exists({ user: user._id, hotel: hotelId, locked: true })) {
    throw new ApiError(409, 'You already have a review for this hotel');
  }

  let result;
  try {
    result = await runInTransaction(async (session) => {
      const hotel = await Hotel.findOneAndUpdate(
        { _id: hotelId, status: 'active', $expr: { $lt: ['$slotsUsed', '$slots'] } },
        { $inc: { slotsUsed: 1 } },
        { new: true, session }
      );
      if (!hotel) {
        const open = await Hotel.exists({ _id: hotelId, status: 'active' }).session(session);
        throw open ? new ApiError(409, 'All review slots for this hotel are taken') : new ApiError(404, 'Hotel not found');
      }

      const expiresAt = new Date(Date.now() + RESERVATION_HOURS * 60 * 60 * 1000);
      const [review] = await HotelReview.create(
        [{ user: user._id, hotel: hotel._id, fee: hotel.reviewFee, bonus: hotel.reviewBonus, expiresAt }],
        { session }
      );

      const paid = await fees.chargeFee(
        user._id,
        hotel.reviewFee,
        { type: 'review_fee', description: `Review fee: ${hotel.name}`, relatedReview: review._id },
        session
      );
      if (paid.fromBonus > 0) {
        review.feeFromBonus = paid.fromBonus;
        await review.save({ session });
      }
      return { hotel, review, balance: paid.user.mainWallet.balance };
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You already have a review for this hotel'); // concurrent double tap
    throw err;
  }

  const { hotel, review, balance } = result;
  await notifySafely(
    io,
    user._id,
    {
      title: 'Review slot reserved',
      message: `You have ${RESERVATION_HOURS} hours to visit ${hotel.name} and submit your review. Ksh ${review.bonus} is paid once the admin approves it.`,
      type: 'info',
    },
    balance
  );
  return review;
}

/** Accepts the review only when the member's location is within the hotel's radius. */
async function submitReview(user, hotelId, { rating, comment, photo, lat, lng, accuracy }, io) {
  if (!mongoose.isValidObjectId(hotelId)) throw new ApiError(404, 'Hotel not found');
  const review = await HotelReview.findOne({ user: user._id, hotel: hotelId, status: 'reserved' }).populate('hotel', 'name location');
  if (!review) throw new ApiError(404, 'Start a review for this hotel first');
  if (review.expiresAt <= new Date()) {
    await expireOverdue(io);
    throw new ApiError(410, `Your reservation expired. The Ksh ${review.fee} fee was refunded to your main wallet.`);
  }

  const distance = Math.round(distanceMeters(review.hotel.location, { lat, lng }));
  if (distance > REVIEW_RADIUS_METERS) {
    throw new ApiError(422, `You must be at the hotel to submit. Your location is ${distance} m away (limit ${REVIEW_RADIUS_METERS} m).`);
  }

  const now = new Date();
  const submitted = await HotelReview.findOneAndUpdate(
    { _id: review._id, status: 'reserved', expiresAt: { $gt: now } },
    { status: 'submitted', rating, comment, photo, location: { lat, lng, accuracy }, distanceMeters: distance, submittedAt: now },
    { new: true }
  );
  if (!submitted) throw new ApiError(409, 'This review was already submitted or has expired');

  try {
    new NotificationEmitter(io).notifyAdmins({
      title: 'Hotel review submitted',
      message: `${user.username} reviewed ${review.hotel.name} (${rating}★, ${distance} m from the hotel)`,
      reviewId: submitted._id,
    });
  } catch (err) {
    console.error('Hotel review notification failed:', err.message);
  }
  await notifySafely(io, user._id, {
    title: 'Review submitted',
    message: `Your review of ${review.hotel.name} is waiting for admin approval.`,
    type: 'info',
  });
  return submitted;
}

async function loadSubmitted(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Review not found');
  if (!(await HotelReview.exists({ _id: id }))) throw new ApiError(404, 'Review not found');
}

/** Pays the bonus into the withdrawable commission wallet. The fee is kept. */
async function approveReview(id, admin, io) {
  await loadSubmitted(id);
  const { review, balance } = await runInTransaction(async (session) => {
    const r = await HotelReview.findOneAndUpdate(
      { _id: id, status: 'submitted' },
      { status: 'approved', reviewedBy: admin._id, reviewedAt: new Date() },
      { new: true, session }
    ).populate({ path: 'hotel', select: 'name', options: { session } });
    if (!r) throw new ApiError(409, 'This review has already been processed');

    await Hotel.updateOne({ _id: r.hotel._id }, { $inc: { approvedCount: 1, ratingSum: r.rating } }, { session });
    let newBalance;
    if (r.bonus > 0) {
      await Transaction.create(
        [
          {
            user: r.user,
            type: 'review_bonus',
            wallet: 'commission',
            amount: r.bonus,
            status: 'completed',
            completedAt: new Date(),
            description: `Review bonus: ${r.hotel.name}`,
            relatedReview: r._id,
          },
        ],
        { session }
      );
      newBalance = (await credit(r.user, 'commission', r.bonus, session, { earned: true })).commissionWallet.balance;
    }
    return { review: r, balance: newBalance };
  });

  try {
    io?.to(`user:${review.user}`).emit('commission:earned', { amount: review.bonus, source: 'hotel_review', timestamp: new Date() });
  } catch (err) {
    console.error('Hotel review notification failed:', err.message);
  }
  await notifySafely(
    io,
    review.user,
    {
      title: 'Review approved',
      message: `Your review of ${review.hotel.name} was approved. Ksh ${review.bonus} was added to your commission wallet.`,
      type: 'earnings',
      category: 'commission',
    },
    balance
  );
  return review;
}

/** Frees the slot. The fee is refunded unless the admin marks the review as fraud (wrong place, stolen photo). */
async function rejectReview(id, admin, { reason, fraud }, io) {
  await loadSubmitted(id);
  const { review, balance } = await runInTransaction(async (session) => {
    const r = await HotelReview.findOneAndUpdate(
      { _id: id, status: 'submitted' },
      {
        status: 'rejected',
        reviewedBy: admin._id,
        reviewedAt: new Date(),
        rejectionReason: reason,
        fraud,
        // A fraudulent review keeps the member locked out of this hotel; otherwise they may try again
        locked: fraud,
      },
      { new: true, session }
    ).populate({ path: 'hotel', select: 'name', options: { session } });
    if (!r) throw new ApiError(409, 'This review has already been processed');

    await releaseSlot(r.hotel._id, session);
    if (fraud || r.fee === 0) return { review: r };
    const refund = await refundFee(r, r.hotel.name, session);
    r.feeRefunded = true;
    await r.save({ session });
    return { review: r, balance: refund.balance };
  });

  await notifySafely(
    io,
    review.user,
    {
      title: 'Review rejected',
      message: fraud
        ? `Your review of ${review.hotel.name} was rejected as invalid: ${reason}. The fee is not refundable.`
        : `Your review of ${review.hotel.name} was rejected: ${reason}. Ksh ${review.fee} was refunded to your main wallet and you can try again.`,
      type: 'error',
    },
    balance
  );
  return review;
}

module.exports = {
  REVIEW_RADIUS_METERS,
  RESERVATION_HOURS,
  distanceMeters,
  expireOverdue,
  startReview,
  submitReview,
  approveReview,
  rejectReview,
};
