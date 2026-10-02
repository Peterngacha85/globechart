const mongoose = require('mongoose');

// One free spin. `roll` (0-9999) is the server's random draw, kept so any result can be checked against the odds.
const spinSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // YYYY-MM-DD in Africa/Nairobi
    number: { type: Number, required: true, min: 1 }, // 1st, 2nd, 3rd spin of the day
    roll: { type: Number, required: true, min: 0 },
    prize: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// Makes "3 spins per day" hold even when a member taps Spin several times at once
spinSchema.index({ user: 1, day: 1, number: 1 }, { unique: true });
spinSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Spin', spinSchema);
