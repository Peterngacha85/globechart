const express = require('express');
const admin = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect, adminOnly);

router.get('/users', admin.listUsers);
router.get('/users/:id', admin.getUser);
router.put('/users/:id/suspend', admin.suspendUser);
router.put('/users/:id/reactivate', admin.reactivateUser);

router.get('/withdrawals', admin.listWithdrawals);
router.put('/withdrawals/:id/approve', admin.approveWithdrawal);
router.put('/withdrawals/:id/reject', admin.rejectWithdrawal);

router.get('/analytics/finance', admin.financeAnalytics);

router.get('/settings', admin.getSettings);
router.post('/settings', admin.upsertSetting);

router.get('/products', admin.listProducts);
router.post('/products', admin.createProduct);
router.put('/products/:id', admin.updateProduct);
router.delete('/products/:id', admin.archiveProduct);

module.exports = router;
