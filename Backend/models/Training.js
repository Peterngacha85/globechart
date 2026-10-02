const mongoose = require('mongoose');

// A physical prompt-writing class run by the admin. Members pay `fee` to register for a seat.
const trainingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    venue: { type: String, required: true, trim: true, maxlength: 200 },
    mapUrl: String,
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 120, min: 15, max: 1440 },

    fee: { type: Number, default: 100, min: 0 },
    seats: { type: Number, required: true, min: 0 },
    seatsTaken: { type: Number, default: 0, min: 0 },

    // scheduled -> completed (attendance final) or cancelled (everyone refunded)
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    cancelReason: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

trainingSchema.pre('validate', function seatsCoverRegistrations() {
  if (this.seats < this.seatsTaken) {
    this.invalidate('seats', `Seats cannot be lower than the ${this.seatsTaken} already registered`);
  }
});

trainingSchema.index({ status: 1, startsAt: 1 });

module.exports = mongoose.model('Training', trainingSchema);
