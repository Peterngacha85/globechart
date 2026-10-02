const mongoose = require('mongoose');

// A company the admin signed up that needs chat support agents. It signs in with its own
// `account` (role "business") to chat with applicants and decide who is hired.
const businessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    roleTitle: { type: String, trim: true, maxlength: 120, default: 'Chat support agent' },
    // What the job pays and who pays it, shown to members before they unlock
    payInfo: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 60 },
    image: String,

    unlockFee: { type: Number, default: 100, min: 0 },
    openings: { type: Number, required: true, min: 0 },
    hiredCount: { type: Number, default: 0, min: 0 },
    // Applications waiting for a decision. Capped at 3 per unfilled opening.
    pendingCount: { type: Number, default: 0, min: 0 },

    account: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

businessSchema.pre('validate', function openingsCoverHires() {
  if (this.openings < this.hiredCount) {
    this.invalidate('openings', `Openings cannot be lower than the ${this.hiredCount} already hired`);
  }
});

businessSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Business', businessSchema);
