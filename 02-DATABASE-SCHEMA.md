# GLOBECHART - Database Schema (MongoDB + Mongoose)

## Overview
Complete MongoDB data models for Globechart. Each section includes schema definition and usage examples.

---

## 1. USER MODEL

### Schema Definition
```javascript
// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Info
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[a-zA-Z0-9_]+$/
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    match: /^(\+254|0)[1-9]\d{8}$/  // Kenya format
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },
  country: {
    type: String,
    default: 'Kenya'
  },
  
  // Account Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'banned'],
    default: 'active'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  
  // Referral System
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  directReferrals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  networkTree: {
    level1Count: { type: Number, default: 0 },
    level2Count: { type: Number, default: 0 },
    level3Count: { type: Number, default: 0 }
  },
  
  // Financial Info
  mainWallet: {
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'KES' }
  },
  earnings: {
    affiliate: { type: Number, default: 0 },
    digitalProducts: { type: Number, default: 0 },
    hotelCommission: { type: Number, default: 0 },
    aiTraining: { type: Number, default: 0 },
    chatCommission: { type: Number, default: 0 },
    y99Commission: { type: Number, default: 0 },
    bonusRewards: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 }
  },
  withdrawals: {
    totalWithdrawn: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    minWithdrawal: { type: Number, default: 220 }
  },
  
  // M-Pesa Integration
  mpesaPhone: String,
  mpesaVerified: { type: Boolean, default: false },
  
  // Role & Permissions
  role: {
    type: String,
    enum: ['user', 'super_admin'],
    default: 'user'
  },
  permissions: [String],
  
  // Activity Tracking
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method: Compare passwords
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method: Generate referral code
userSchema.methods.generateReferralCode = function() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

module.exports = mongoose.model('User', userSchema);
```

---

## 2. PRODUCT MODEL

### Schema Definition
```javascript
// backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  category: {
    type: String,
    enum: ['ebook', 'source_code', 'template', 'software', 'course', 'other'],
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: Number,
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  image: String,  // URL to product image
  content: String,  // URL or file reference
  
  // Commission Structure
  commission: {
    affiliate: { type: Number, default: 0 },  // Percentage
    referralLevel1: { type: Number, default: 0 },
    referralLevel2: { type: Number, default: 0 },
    referralLevel3: { type: Number, default: 0 }
  },
  
  // Stock Management
  stockQuantity: {
    type: Number,
    default: -1  // -1 for unlimited
  },
  sold: {
    type: Number,
    default: 0
  },
  
  // Seller Info
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
```

---

## 3. TRANSACTION MODEL

### Schema Definition
```javascript
// backend/models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'purchase', 'commission', 'bonus', 'transfer'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'KES'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Transaction Details
  description: String,
  reference: String,  // Invoice/Order/Reference number
  
  // M-Pesa Integration
  mpesaTransactionId: String,
  mpesaReceiptNumber: String,
  mpesaPhone: String,
  
  // Related Entities
  relatedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'  // For transfers
  },
  
  // Admin Notes
  adminNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
```

---

## 4. WITHDRAWAL MODEL

### Schema Definition
```javascript
// backend/models/Withdrawal.js
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 220
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'processing', 'completed', 'rejected'],
    default: 'pending'
  },
  
  // Withdrawal Method
  method: {
    type: String,
    enum: ['mpesa', 'bank_transfer'],
    default: 'mpesa'
  },
  mpesaPhone: String,
  
  // Commission Breakdown
  commissions: {
    affiliate: { type: Number, default: 0 },
    digitalProducts: { type: Number, default: 0 },
    hotelCommission: { type: Number, default: 0 },
    aiTraining: { type: Number, default: 0 },
    chatCommission: { type: Number, default: 0 },
    y99Commission: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 }
  },
  
  // Processing
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'  // Admin who processed
  },
  transactionReference: String,
  rejectionReason: String,
  
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: Date,
  completedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

withdrawalSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
```

---

## 5. COMMISSION MODEL

### Schema Definition
```javascript
// backend/models/Commission.js
const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  earnedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'  // Who generated the commission
  },
  commissionType: {
    type: String,
    enum: ['affiliate', 'direct_referral', 'indirect_referral', 'product_sale', 'bonus'],
    required: true
  },
  level: {
    type: Number,  // 1, 2, or 3 for referral levels
    default: 0
  },
  amount: {
    type: Number,
    required: true
  },
  percentage: Number,  // Commission percentage
  
  // Related Transaction
  relatedTransaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  relatedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'credited'],
    default: 'pending'
  },
  isWithdrawn: {
    type: Boolean,
    default: false
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

commissionSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
```

---

## 6. BONUS MODEL

### Schema Definition
```javascript
// backend/models/Bonus.js
const mongoose = require('mongoose');

const bonusSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  week: {
    year: Number,
    week: Number
  },
  bonusType: {
    type: String,
    enum: ['weekly', 'milestone', 'referral_achievement', 'special'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  condition: String,  // Description of how bonus was earned
  
  // Milestone Requirements (if applicable)
  milestones: {
    targetSales: Number,
    activateReferrals: Number,
    tiers: Number
  },
  progress: {
    currentSales: { type: Number, default: 0 },
    currentReferrals: { type: Number, default: 0 },
    currentTiers: { type: Number, default: 0 }
  },
  
  status: {
    type: String,
    enum: ['pending', 'achieved', 'claimed', 'expired'],
    default: 'pending'
  },
  
  expiresAt: Date,
  claimedAt: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Bonus', bonusSchema);
```

---

## 7. NOTIFICATION MODEL

### Schema Definition
```javascript
// backend/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'earnings', 'withdrawal', 'system'],
    default: 'info'
  },
  category: {
    type: String,
    enum: ['transaction', 'commission', 'withdrawal', 'account', 'game', 'promotion'],
    default: 'system'
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  
  // Related Data
  relatedData: {
    transactionId: mongoose.Schema.Types.ObjectId,
    withdrawalId: mongoose.Schema.Types.ObjectId,
    productId: mongoose.Schema.Types.ObjectId
  },
  
  // Action Link
  actionUrl: String,
  actionLabel: String,
  
  createdAt: {
    type: Date,
    default: Date.now,
    expire: 30 * 24 * 60 * 60  // Auto-delete after 30 days
  }
}, { timestamps: true });

notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
```

---

## 8. PURCHASE MODEL

### Schema Definition
```javascript
// backend/models/Purchase.js
const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  
  // Purchase Details
  purchasePrice: Number,
  quantity: {
    type: Number,
    default: 1
  },
  totalAmount: Number,
  
  // Commission Distribution
  commissionDistribution: {
    sellerCommission: Number,
    affiliateCommission: Number,
    referralCommission: Number
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed'
  },
  
  // Download/Access
  accessToken: String,
  accessCount: { type: Number, default: 0 },
  lastAccessedAt: Date,
  
  transactionReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

purchaseSchema.index({ user: 1, product: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
```

---

## 9. SYSTEM SETTINGS MODEL

### Schema Definition
```javascript
// backend/models/SystemSettings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  setting: {
    type: String,
    unique: true,
    required: true
  },
  value: mongoose.Schema.Types.Mixed,
  category: {
    type: String,
    enum: ['commission', 'withdrawal', 'game', 'tournament', 'security'],
    required: true
  },
  description: String,
  
  // Modification Tracking
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  modifiedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', settingsSchema);
```

---

## 10. SAMPLE SETTINGS

```javascript
// Initialize system settings
const defaultSettings = [
  { setting: 'min_withdrawal', value: 220, category: 'withdrawal' },
  { setting: 'max_withdrawal_daily', value: 100000, category: 'withdrawal' },
  { setting: 'affiliate_commission', value: 15, category: 'commission' },  // %
  { setting: 'l1_referral_commission', value: 10, category: 'commission' },
  { setting: 'l2_referral_commission', value: 5, category: 'commission' },
  { setting: 'l3_referral_commission', value: 2, category: 'commission' },
  { setting: 'spin_multiplier_min', value: 1.1, category: 'game' },
  { setting: 'spin_multiplier_max', value: 10, category: 'game' },
  { setting: 'tournament_grand_prize', value: 10000, category: 'tournament' },
  { setting: 'tournament_weekly_prize', value: 6000, category: 'tournament' },
  { setting: 'enable_password_reset', value: true, category: 'security' },
  { setting: 'session_timeout_minutes', value: 30, category: 'security' }
];
```

---

## 11. DATABASE INDEXES

### Performance Optimization
```javascript
// Critical indexes for queries
db.users.createIndex({ username: 1 });
db.users.createIndex({ email: 1 });
db.users.createIndex({ phone: 1 });
db.users.createIndex({ referralCode: 1 });
db.users.createIndex({ createdAt: -1 });

db.transactions.createIndex({ user: 1, createdAt: -1 });
db.transactions.createIndex({ status: 1 });
db.transactions.createIndex({ type: 1 });

db.withdrawals.createIndex({ user: 1, status: 1 });
db.withdrawals.createIndex({ status: 1, requestedAt: -1 });

db.commissions.createIndex({ user: 1, status: 1 });
db.commissions.createIndex({ earnedFrom: 1 });

db.notifications.createIndex({ user: 1, isRead: 1 });
db.notifications.createIndex({ user: 1, createdAt: -1 });

db.purchases.createIndex({ user: 1, createdAt: -1 });
db.purchases.createIndex({ product: 1 });
```

---

## 12. RELATIONSHIPS DIAGRAM

```
USER
├── hasMany → TRANSACTIONS
├── hasMany → WITHDRAWALS
├── hasMany → COMMISSIONS (as user & earnedFrom)
├── hasMany → BONUSES
├── hasMany → NOTIFICATIONS
├── hasMany → PURCHASES
├── hasMany → PRODUCTS (seller)
├── hasOne → REFERRER (referredBy)
└── hasMany → DIRECT_REFERRALS (referralCode)

PRODUCT
├── hasMany → PURCHASES
├── belongsTo → USER (seller)
└── hasMany → COMMISSIONS (relatedProduct)

TRANSACTION
├── belongsTo → USER
├── belongsTo → PRODUCT (optional)
└── belongsTo → USER (relatedUser - for transfers)

WITHDRAWAL
├── belongsTo → USER
└── belongsTo → USER (processedBy - admin)

COMMISSION
├── belongsTo → USER
├── belongsTo → USER (earnedFrom)
├── belongsTo → TRANSACTION
└── belongsTo → PRODUCT
```

---

## 13. MIGRATION CHECKLIST

- [ ] Create all model files in backend/models/
- [ ] Create database.js connection in backend/config/
- [ ] Initialize MongoDB indexes
- [ ] Seed default system settings
- [ ] Create admin user account
- [ ] Test all model validations
- [ ] Set up MongoDB Atlas backup

---

**Next**: See API-ENDPOINTS.md for backend route definitions

**Created by**: Peter Ngacha / Fastweb Technologies  
**Last Updated**: September 2026
