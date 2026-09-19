const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1 },
    // pending -> approved (paid out by the admin) or rejected (amount refunded to the wallet)
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    method: { type: String, enum: ['mpesa'], default: 'mpesa' },
    mpesaPhone: { type: String, required: true },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionReference: String,
    rejectionReason: String,
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
  },
  { timestamps: true }
);

withdrawalSchema.index({ user: 1, status: 1 });
withdrawalSchema.index({ status: 1, requestedAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
