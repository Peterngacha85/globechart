const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'purchase', 'commission', 'refund'],
      required: true,
    },
    // Which wallet the money moved in: deposits/purchases hit "main", commissions/withdrawals hit "commission"
    wallet: { type: String, enum: ['main', 'commission'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
    description: String,
    reference: String,

    // M-Pesa (deposits)
    mpesaPhone: String,
    checkoutRequestId: { type: String, index: true, sparse: true },
    mpesaReceiptNumber: String,
    failureReason: String,

    relatedProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
