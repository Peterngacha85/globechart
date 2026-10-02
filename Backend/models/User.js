const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { KENYA_PHONE } = require('../utils/helpers');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-zA-Z0-9_]{3,30}$/,
    },
    // Optional: registration only asks for username, phone and password
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, match: KENYA_PHONE },
    password: { type: String, required: true, minlength: 6, select: false },
    country: { type: String, default: 'Kenya' },

    status: { type: String, enum: ['active', 'inactive', 'suspended', 'banned'], default: 'active' },
    suspensionReason: String,
    isVerified: { type: Boolean, default: false },

    // Referral system (children are found via referredBy, so no unbounded array on the parent)
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    referralCode: { type: String, unique: true, sparse: true },
    networkTree: {
      level1Count: { type: Number, default: 0 },
      level2Count: { type: Number, default: 0 },
      level3Count: { type: Number, default: 0 },
      level4Count: { type: Number, default: 0 },
      level5Count: { type: Number, default: 0 },
    },

    // Deposits (M-Pesa). Spent in the store; not withdrawable.
    mainWallet: {
      balance: { type: Number, default: 0, min: 0 },
      currency: { type: String, default: 'KES' },
    },
    // Referral commissions from real product sales. Withdrawable.
    commissionWallet: {
      balance: { type: Number, default: 0, min: 0 },
      totalEarned: { type: Number, default: 0 },
    },
    totalWithdrawn: { type: Number, default: 0 },

    mpesaPhone: String,

    // business: a partner company's login, created by the admin, that chats with job applicants
    role: { type: String, enum: ['user', 'business', 'super_admin'], default: 'user' },
    // true only for the account that is kept in sync with ADMIN_* in .env
    isSystemAdmin: { type: Boolean, default: false, index: true },

    // Bump to invalidate every token issued before now
    tokenVersion: { type: Number, default: 0 },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    lastLogin: Date,
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
