const express = require('express');
const spin = require('../controllers/spinController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/', spin.status);
router.post('/', spin.spin);

module.exports = router;
