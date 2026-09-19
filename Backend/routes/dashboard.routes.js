const express = require('express');
const dashboard = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/summary', dashboard.summary);
router.get('/earnings', dashboard.earnings);

module.exports = router;
