const mongoose = require('mongoose');

// A hotel the admin has signed an agreement with. Members review it on site for a bonus
// that the admin funds; `slots` caps how many reviews she has committed to pay for.
const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    address: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 60 },
    image: String,
    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },

    // New reservations use these; each review snapshots the values it started with
    reviewFee: { type: Number, default: 100, min: 0 },
    reviewBonus: { type: Number, default: 200, min: 0 },

    slots: { type: Number, required: true, min: 0 },
    // Reserved + submitted + approved reviews. Freed again on expiry or rejection.
    slotsUsed: { type: Number, default: 0, min: 0 },
    approvedCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },

    status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

hotelSchema.pre('validate', function slotsCoverUsage() {
  if (this.slots < this.slotsUsed) {
    this.invalidate('slots', `Slots cannot be lower than the ${this.slotsUsed} already in use`);
  }
});

hotelSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Hotel', hotelSchema);
