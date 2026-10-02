const mongoose = require('mongoose');

/**
 * pending      -> member paid the unlock fee; chatting with the business
 * hired        -> the business took them on; the fee is kept
 * not_selected -> the business said no; fee refunded
 * no_response  -> the business never replied within 48 hours; fee refunded
 * expired      -> the business replied but did not decide within 7 days; fee refunded
 */
const jobApplicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    status: { type: String, enum: ['pending', 'hired', 'not_selected', 'no_response', 'expired'], default: 'pending' },
    // true while this application stops the member unlocking the same business again
    locked: { type: Boolean, default: true },

    fee: { type: Number, required: true, min: 0 },
    feeFromBonus: { type: Number, default: 0, min: 0 }, // part paid with spin credit; refunds go back there
    replyDeadline: { type: Date, required: true },
    decisionDeadline: { type: Date, required: true },
    respondedAt: Date, // first message from the business

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    note: { type: String, maxlength: 300 }, // shown to the member with the decision
    refunded: { type: Boolean, default: false },
    refundedAt: Date,
    lastMessageAt: Date,
  },
  { timestamps: true }
);

// One open application per member at a time, and one application per member per business
jobApplicationSchema.index({ user: 1 }, { name: 'one_pending_per_user', unique: true, partialFilterExpression: { status: 'pending' } });
jobApplicationSchema.index({ user: 1, business: 1 }, { unique: true, partialFilterExpression: { locked: true } });
jobApplicationSchema.index({ status: 1, replyDeadline: 1 });
jobApplicationSchema.index({ status: 1, decisionDeadline: 1 });

module.exports = mongoose.model('JobApplication', jobApplicationSchema);
