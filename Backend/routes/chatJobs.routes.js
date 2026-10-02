const express = require('express');
const jobs = require('../controllers/chatJobController');
const { protect, businessOnly } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

// Members
router.get('/', jobs.list);
// Declared before "/:id" routes so these words are not treated as ids
router.get('/my-applications', jobs.myApplications);
router.post('/:id/unlock', jobs.unlock);

// Business accounts
router.get('/inbox', businessOnly, jobs.inbox);

// Any participant in the chat: the member, the business, or the admin
router.get('/applications/:id', jobs.getApplication);
router.get('/applications/:id/messages', jobs.listMessages);
router.post('/applications/:id/messages', jobs.sendMessage);
router.put('/applications/:id/decide', jobs.decide);

module.exports = router;
