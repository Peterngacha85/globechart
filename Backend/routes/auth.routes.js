const express = require('express');
const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const auth = require('../controllers/authController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Brute-force protection on the credential endpoints
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { success: false, message: 'Too many attempts, please try again later', statusCode: 429 },
});

router.post('/register', credentialLimiter, auth.register);
router.post('/login', credentialLimiter, auth.login);
router.post('/refresh-token', auth.refreshToken);
router.post('/logout', protect, auth.logout);
router.post('/forgot-password', credentialLimiter, auth.forgotPassword);
router.post('/reset-password/:token', credentialLimiter, auth.resetPassword);

module.exports = router;
