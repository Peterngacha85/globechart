const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error', 'earnings', 'withdrawal', 'system'],
      default: 'info',
    },
    category: {
      type: String,
      enum: ['transaction', 'commission', 'withdrawal', 'account', 'game', 'promotion', 'system'],
      default: 'system',
    },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    relatedData: {
      transactionId: mongoose.Schema.Types.ObjectId,
      withdrawalId: mongoose.Schema.Types.ObjectId,
      productId: mongoose.Schema.Types.ObjectId,
    },
    actionUrl: String,
    actionLabel: String,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });
// Auto-delete after 30 days (TTL indexes are declared on the collection, not with a field option)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
