const mongoose = require('mongoose');

// Running total of prizes given out on one day, checked against the admin's daily budget
const spinDaySchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD in Africa/Nairobi
    paid: { type: Number, default: 0 },
    spins: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SpinDay', spinDaySchema);
