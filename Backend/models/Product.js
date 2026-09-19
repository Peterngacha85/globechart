const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 4000 },
    category: {
      type: String,
      enum: ['ebook', 'source_code', 'template', 'software', 'course', 'other'],
      required: true,
    },
    price: { type: Number, required: true, min: 0 },
    originalPrice: Number,
    discount: { type: Number, default: 0, min: 0, max: 100 }, // derived from originalPrice
    image: String,
    // Delivered only to buyers via GET /products/:id/access
    content: String,

    // Percent of the sale price paid to the buyer's referrers (L1 = who invited the buyer, ...)
    commission: {
      referralLevel1: { type: Number, default: 10, min: 0, max: 50 },
      referralLevel2: { type: Number, default: 5, min: 0, max: 50 },
      referralLevel3: { type: Number, default: 2, min: 0, max: 50 },
    },

    stockQuantity: { type: Number, default: -1 }, // -1 = unlimited
    sold: { type: Number, default: 0 },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

productSchema.pre('validate', function deriveDiscount() {
  if (this.originalPrice && this.originalPrice > this.price) {
    this.discount = Math.round((1 - this.price / this.originalPrice) * 100);
  } else {
    this.discount = 0;
  }
  const c = this.commission || {};
  if ((c.referralLevel1 || 0) + (c.referralLevel2 || 0) + (c.referralLevel3 || 0) > 50) {
    this.invalidate('commission', 'Total referral commission cannot exceed 50% of the price');
  }
});

productSchema.index({ status: 1, category: 1, createdAt: -1 });
productSchema.index({ name: 'text' });

module.exports = mongoose.model('Product', productSchema);
