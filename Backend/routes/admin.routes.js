const express = require('express');
const admin = require('../controllers/adminController');
const hotels = require('../controllers/hotelController');
const chatJobs = require('../controllers/chatJobController');
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

router.get('/deposits', admin.listDeposits);
router.put('/deposits/:id/approve', admin.approveDeposit);
router.put('/deposits/:id/reject', admin.rejectDeposit);

router.get('/analytics/finance', admin.financeAnalytics);

router.get('/settings', admin.getSettings);
router.post('/settings', admin.upsertSetting);

router.get('/products', admin.listProducts);
router.post('/products', admin.createProduct);
router.put('/products/:id', admin.updateProduct);
router.delete('/products/:id', admin.archiveProduct);

router.get('/hotels', hotels.adminListHotels);
router.get('/hotels/summary', hotels.adminSummary);
router.post('/hotels', hotels.adminCreateHotel);
router.put('/hotels/:id', hotels.adminUpdateHotel);
router.delete('/hotels/:id', hotels.adminArchiveHotel);

router.get('/hotel-reviews', hotels.adminListReviews);
router.get('/hotel-reviews/:id', hotels.adminGetReview);
router.put('/hotel-reviews/:id/approve', hotels.adminApproveReview);
router.put('/hotel-reviews/:id/reject', hotels.adminRejectReview);

router.get('/chat-businesses', chatJobs.adminListBusinesses);
router.get('/chat-businesses/summary', chatJobs.adminSummary);
router.post('/chat-businesses', chatJobs.adminCreateBusiness);
router.put('/chat-businesses/:id', chatJobs.adminUpdateBusiness);
router.delete('/chat-businesses/:id', chatJobs.adminArchiveBusiness);
router.get('/job-applications', chatJobs.adminListApplications);

module.exports = router;
