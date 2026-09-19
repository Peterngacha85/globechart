const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who earned it
    earnedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the buyer
    level: { type: Number, min: 1, max: 3, required: true },
    amount: { type: Number, required: true, min: 0 },
    percentage: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

commissionSchema.index({ user: 1, createdAt: -1 });
commissionSchema.index({ earnedFrom: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
