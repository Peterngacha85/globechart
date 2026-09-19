const express = require('express');
const notifications = require('../controllers/notificationController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/', notifications.list);
// Declared before "/:id/read" so "mark-all-read" is not treated as an id
router.put('/mark-all-read', notifications.markAllRead);
router.put('/:id/read', notifications.markRead);

module.exports = router;
