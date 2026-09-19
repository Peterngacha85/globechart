const express = require('express');
const users = require('../controllers/userController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/profile', users.getProfile);
router.put('/profile', users.updateProfile);
router.post('/change-password', users.changePassword);
router.get('/referral-stats', users.getReferralStats);
router.get('/team', users.getTeamMembers);

module.exports = router;
