const mongoose = require('mongoose');
const { z } = require('zod');
const Hotel = require('../models/Hotel');
const HotelReview = require('../models/HotelReview');
const Transaction = require('../models/Transaction');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { escapeRegex, paginate } = require('../utils/helpers');
const { round2 } = require('../utils/money');
const reviews = require('../services/hotelReviewService');

const MAX_PHOTO_CHARS = 1_500_000; // ~1.1 MB image once base64-decoded

const averageRating = (h) => (h.approvedCount ? round2(h.ratingSum / h.approvedCount) : null);

const myReviewPayload = (r) =>
  r && {
    reviewId: r._id,
    status: r.status,
    fee: r.fee,
    bonus: r.bonus,
    expiresAt: r.expiresAt,
    rating: r.rating,
    comment: r.comment,
    distanceMeters: r.distanceMeters,
    submittedAt: r.submittedAt,
    reviewedAt: r.reviewedAt,
    rejectionReason: r.rejectionReason,
    fraud: r.fraud,
    feeRefunded: r.feeRefunded,
  };

const hotelPayload = (h, myReview) => ({
  hotelId: h._id,
  name: h.name,
  description: h.description,
  address: h.address,
  city: h.city,
  image: h.image,
  location: { lat: h.location.lat, lng: h.location.lng },
  reviewFee: h.reviewFee,
  reviewBonus: h.reviewBonus,
  slotsLeft: Math.max(h.slots - h.slotsUsed, 0),
  reviewCount: h.approvedCount,
  averageRating: averageRating(h),
  myReview: myReviewPayload(myReview),
});

// The member's current review per hotel: the locked one if any, otherwise their latest attempt
async function myReviewsByHotel(userId, hotelIds) {
  const rows = await HotelReview.find({ user: userId, hotel: { $in: hotelIds } }).sort('-locked -createdAt');
  const map = new Map();
  for (const r of rows) if (!map.has(String(r.hotel))) map.set(String(r.hotel), r);
  return map;
}

// ---------- Members ----------
exports.list = asyncHandler(async (req, res) => {
  await reviews.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query, 12);
  const filter = { status: 'active' };
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(String(req.query.search)), 'i');
    filter.$or = [{ name: rx }, { city: rx }, { address: rx }];
  }
  const [total, hotels] = await Promise.all([Hotel.countDocuments(filter), Hotel.find(filter).sort('-createdAt').skip(skip).limit(limit)]);
  const mine = await myReviewsByHotel(req.user._id, hotels.map((h) => h._id));
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    radiusMeters: reviews.REVIEW_RADIUS_METERS,
    reservationHours: reviews.RESERVATION_HOURS,
    hotels: hotels.map((h) => hotelPayload(h, mine.get(String(h._id)))),
  });
});

exports.getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Hotel not found');
  const hotel = await Hotel.findOne({ _id: req.params.id, status: { $in: ['active', 'paused'] } });
  if (!hotel) throw new ApiError(404, 'Hotel not found');
  const [mine, approved] = await Promise.all([
    myReviewsByHotel(req.user._id, [hotel._id]),
    HotelReview.find({ hotel: hotel._id, status: 'approved' }).sort('-reviewedAt').limit(30).populate('user', 'username'),
  ]);
  sendSuccess(res, {
    ...hotelPayload(hotel, mine.get(String(hotel._id))),
    status: hotel.status,
    radiusMeters: reviews.REVIEW_RADIUS_METERS,
    reservationHours: reviews.RESERVATION_HOURS,
    // Every published review was paid for, so it is always labelled as sponsored
    reviews: approved.map((r) => ({
      reviewId: r._id,
      username: r.user?.username,
      rating: r.rating,
      comment: r.comment,
      reviewedAt: r.reviewedAt,
      sponsored: true,
    })),
  });
});

exports.start = asyncHandler(async (req, res) => {
  const review = await reviews.startReview(req.user, req.params.id, req.app.locals.io);
  sendSuccess(res, myReviewPayload(review), 'Review slot reserved', 201);
});

const submitSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating from 1 to 5').max(5),
  comment: z.string().trim().min(20, 'Write at least 20 characters about your visit').max(2000),
  photo: z
    .string()
    .max(MAX_PHOTO_CHARS, 'Photo is too large')
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, 'Attach a photo taken at the hotel'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
});

exports.submit = asyncHandler(async (req, res) => {
  const body = submitSchema.parse(req.body);
  const review = await reviews.submitReview(req.user, req.params.id, body, req.app.locals.io);
  sendSuccess(res, myReviewPayload(review), 'Review submitted for approval');
});

exports.myReviews = asyncHandler(async (req, res) => {
  await reviews.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query, 10);
  const filter = { user: req.user._id };
  const [total, items, [earned = { total: 0 }]] = await Promise.all([
    HotelReview.countDocuments(filter),
    HotelReview.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('hotel', 'name city image'),
    HotelReview.aggregate([{ $match: { user: req.user._id, status: 'approved' } }, { $group: { _id: null, total: { $sum: '$bonus' } } }]),
  ]);
  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalEarned: earned.total,
    reviews: items.map((r) => ({
      ...myReviewPayload(r),
      hotel: r.hotel ? { hotelId: r.hotel._id, name: r.hotel.name, city: r.hotel.city, image: r.hotel.image } : null,
    })),
  });
});

// ---------- Admin ----------
const hotelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().max(60).optional(),
  image: z.string().trim().url().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  reviewFee: z.number().int().min(0).max(100000),
  reviewBonus: z.number().int().min(0).max(100000),
  slots: z.number().int().min(0).max(100000),
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

const toHotelDoc = ({ lat, lng, ...rest }) => ({ ...rest, ...(lat !== undefined && lng !== undefined && { location: { lat, lng } }) });

const sumOf = async (Model, match, field) => {
  const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } } }]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

exports.adminListHotels = asyncHandler(async (req, res) => {
  await reviews.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['active', 'paused', 'archived'].includes(req.query.status)) filter.status = req.query.status;
  const [total, hotels] = await Promise.all([Hotel.countDocuments(filter), Hotel.find(filter).sort('-createdAt').skip(skip).limit(limit)]);
  const pending = await HotelReview.aggregate([
    { $match: { hotel: { $in: hotels.map((h) => h._id) }, status: { $in: ['reserved', 'submitted'] } } },
    { $group: { _id: { hotel: '$hotel', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const count = (hotelId, status) => pending.find((p) => String(p._id.hotel) === String(hotelId) && p._id.status === status)?.count || 0;

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hotels: hotels.map((h) => ({
      ...hotelPayload(h),
      status: h.status,
      slots: h.slots,
      slotsUsed: h.slotsUsed,
      reserved: count(h._id, 'reserved'),
      awaitingApproval: count(h._id, 'submitted'),
      // What the admin has promised to pay if every slot ends in an approved review
      fundingCommitted: h.slots * h.reviewBonus,
    })),
  });
});

// The admin's own funding position: what she has paid, what she still owes, and what fees came in
exports.adminSummary = asyncHandler(async (req, res) => {
  await reviews.expireOverdue(req.app.locals.io);
  const reviewRefunds = { type: 'refund', status: 'completed', relatedReview: { $exists: true } };
  const [paid, fees, refunds, awaiting, reserved, openSlots] = await Promise.all([
    sumOf(Transaction, { type: 'review_bonus', status: 'completed' }, 'amount'),
    sumOf(Transaction, { type: 'review_fee', status: 'completed' }, 'amount'),
    sumOf(Transaction, reviewRefunds, 'amount'),
    sumOf(HotelReview, { status: 'submitted' }, 'bonus'),
    sumOf(HotelReview, { status: 'reserved' }, 'bonus'),
    Hotel.aggregate([
      { $match: { status: { $in: ['active', 'paused'] } } },
      { $group: { _id: null, total: { $sum: { $multiply: [{ $max: [{ $subtract: ['$slots', '$slotsUsed'] }, 0] }, '$reviewBonus'] } } } },
    ]),
  ]);
  sendSuccess(res, {
    bonusesPaid: paid.total,
    approvedReviews: paid.count,
    feesCollected: round2(fees.total - refunds.total),
    awaitingApproval: { count: awaiting.count, bonuses: awaiting.total },
    reserved: { count: reserved.count, bonuses: reserved.total },
    openSlotBonuses: openSlots[0]?.total || 0,
    // Paid out of her funds if every pending, reserved and open slot is approved
    outstandingCommitment: awaiting.total + reserved.total + (openSlots[0]?.total || 0),
  });
});

exports.adminCreateHotel = asyncHandler(async (req, res) => {
  const data = hotelSchema.parse(req.body);
  const hotel = await Hotel.create({ ...toHotelDoc(data), createdBy: req.user._id });
  sendSuccess(res, { hotelId: hotel._id }, 'Hotel added', 201);
});

exports.adminUpdateHotel = asyncHandler(async (req, res) => {
  const data = hotelSchema.partial().parse(req.body);
  if ((data.lat === undefined) !== (data.lng === undefined)) throw new ApiError(422, 'Send both lat and lng');
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Hotel not found');
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw new ApiError(404, 'Hotel not found');
  hotel.set(toHotelDoc(data));
  await hotel.save();
  sendSuccess(res, { hotelId: hotel._id }, 'Hotel updated');
});

// Hotels with reviews are archived, never deleted, so the review and payment history stays intact
exports.adminArchiveHotel = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Hotel not found');
  const hotel = await Hotel.findByIdAndUpdate(req.params.id, { status: 'archived' });
  if (!hotel) throw new ApiError(404, 'Hotel not found');
  sendSuccess(res, null, 'Hotel archived');
});

const adminReviewRow = (r) => ({
  ...myReviewPayload(r),
  location: r.location,
  user: r.user ? { userId: r.user._id, username: r.user.username, phone: r.user.phone } : null,
  hotel: r.hotel ? { hotelId: r.hotel._id, name: r.hotel.name, location: r.hotel.location } : null,
  createdAt: r.createdAt,
});

exports.adminListReviews = asyncHandler(async (req, res) => {
  await reviews.expireOverdue(req.app.locals.io);
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (['reserved', 'submitted', 'approved', 'rejected', 'expired'].includes(req.query.status)) filter.status = req.query.status;
  if (mongoose.isValidObjectId(req.query.hotel)) filter.hotel = req.query.hotel;
  const [total, items] = await Promise.all([
    HotelReview.countDocuments(filter),
    HotelReview.find(filter)
      .sort(filter.status === 'submitted' ? 'submittedAt' : '-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('user', 'username phone')
      .populate('hotel', 'name location'),
  ]);
  sendSuccess(res, { total, page, limit, totalPages: Math.ceil(total / limit), reviews: items.map(adminReviewRow) });
});

exports.adminGetReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Review not found');
  const r = await HotelReview.findById(req.params.id).select('+photo').populate('user', 'username phone').populate('hotel', 'name location');
  if (!r) throw new ApiError(404, 'Review not found');
  sendSuccess(res, { ...adminReviewRow(r), photo: r.photo });
});

exports.adminApproveReview = asyncHandler(async (req, res) => {
  const r = await reviews.approveReview(req.params.id, req.user, req.app.locals.io);
  sendSuccess(res, { reviewId: r._id, status: r.status }, 'Review approved and bonus paid');
});

exports.adminRejectReview = asyncHandler(async (req, res) => {
  const body = z
    .object({ reason: z.string().trim().min(3, 'A reason is required').max(300), fraud: z.boolean().default(false) })
    .parse(req.body);
  const r = await reviews.rejectReview(req.params.id, req.user, body, req.app.locals.io);
  sendSuccess(res, { reviewId: r._id, status: r.status, feeRefunded: r.feeRefunded }, 'Review rejected');
});
