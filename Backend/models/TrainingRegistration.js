const mongoose = require('mongoose');

/**
 * registered -> has a seat and a ticket
 * cancelled  -> member cancelled 24h+ before, or the admin cancelled the session; fee refunded
 * attended   -> checked in at the class
 * absent     -> session completed without them checking in; fee kept
 */
const trainingRegistrationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    training: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', required: true, index: true },
    status: { type: String, enum: ['registered', 'cancelled', 'attended', 'absent'], default: 'registered' },
    locked: { type: Boolean, default: true }, // false once cancelled, so the member may register again
    ticketCode: { type: String, required: true, unique: true },

    fee: { type: Number, required: true, min: 0 },
    feeFromBonus: { type: Number, default: 0, min: 0 },
    refunded: { type: Boolean, default: false },
    refundedAt: Date,
    cancelledBy: { type: String, enum: ['member', 'admin'] },

    attendedAt: Date,
    certificateCode: { type: String, unique: true, sparse: true },
    certifiedAt: Date,
  },
  { timestamps: true }
);

trainingRegistrationSchema.index({ user: 1, training: 1 }, { unique: true, partialFilterExpression: { locked: true } });

module.exports = mongoose.model('TrainingRegistration', trainingRegistrationSchema);
