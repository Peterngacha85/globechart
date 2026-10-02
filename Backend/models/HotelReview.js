const mongoose = require('mongoose');

/**
 * reserved  -> member paid the fee and holds a slot until expiresAt
 * submitted -> review sent from within the hotel's radius, waiting for the admin
 * approved  -> bonus paid to the commission wallet
 * rejected  -> fee refunded unless marked fraud
 * expired   -> never submitted in time; fee refunded
 */
const hotelReviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
    status: { type: String, enum: ['reserved', 'submitted', 'approved', 'rejected', 'expired'], default: 'reserved' },
    // true while this review stops the member starting another one for the same hotel
    locked: { type: Boolean, default: true },

    fee: { type: Number, required: true, min: 0 },
    bonus: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },

    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },
    // Compressed JPEG data URL taken at the hotel. Only returned by the single-review admin endpoint.
    photo: { type: String, select: false },
    location: { lat: Number, lng: Number, accuracy: Number },
    distanceMeters: Number,
    submittedAt: Date,

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectionReason: String,
    fraud: { type: Boolean, default: false },
    feeRefunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

hotelReviewSchema.index({ user: 1, hotel: 1 }, { unique: true, partialFilterExpression: { locked: true } });
hotelReviewSchema.index({ status: 1, expiresAt: 1 });
hotelReviewSchema.index({ hotel: 1, status: 1, reviewedAt: -1 });

module.exports = mongoose.model('HotelReview', hotelReviewSchema);
