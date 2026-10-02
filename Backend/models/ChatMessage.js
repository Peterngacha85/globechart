const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'JobApplication', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['member', 'business', 'admin'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

chatMessageSchema.index({ application: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
