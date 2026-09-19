const mongoose = require('mongoose');

// Overrides only: defaults live in services/settings.js, so nothing has to be seeded
const settingsSchema = new mongoose.Schema(
  {
    setting: { type: String, unique: true, required: true },
    value: mongoose.Schema.Types.Mixed,
    category: { type: String, enum: ['withdrawal', 'deposit'], required: true },
    description: String,
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSettings', settingsSchema);
