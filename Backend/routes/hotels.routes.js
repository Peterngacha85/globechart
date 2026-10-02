const express = require('express');
const hotels = require('../controllers/hotelController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/', hotels.list);
// Declared before "/:id" so "my-reviews" is not treated as an id
router.get('/my-reviews', hotels.myReviews);
router.get('/:id', hotels.getOne);
router.post('/:id/start', hotels.start);
router.post('/:id/submit', hotels.submit);

module.exports = router;
