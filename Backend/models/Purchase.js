const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    purchasePrice: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' },
    commissionPaid: { type: Number, default: 0 },
    accessToken: String,
    accessCount: { type: Number, default: 0 },
    lastAccessedAt: Date,
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

// A digital product is bought once per user
purchaseSchema.index({ user: 1, product: 1 }, { unique: true });
purchaseSchema.index({ user: 1, createdAt: -1 });
purchaseSchema.index({ product: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
