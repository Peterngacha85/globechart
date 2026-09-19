const express = require('express');
const finance = require('../controllers/financeController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Public (called by Safaricom); authenticated by a secret in the callback URL
router.post('/mpesa/callback', finance.mpesaCallback);

router.use(protect);
router.get('/limits', finance.getLimits);
router.post('/recharge', finance.recharge);
router.get('/deposits/:id', finance.getDeposit);
router.post('/withdraw', finance.withdraw);
router.get('/withdrawal-history', finance.getWithdrawalHistory);
router.get('/transactions', finance.getTransactions);

module.exports = router;
