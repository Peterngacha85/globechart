const express = require('express');
const trainings = require('../controllers/trainingController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Public, so employers can check a certificate without an account
router.get('/certificates/:code', trainings.verifyCertificate);

router.use(protect);
router.get('/', trainings.list);
router.get('/my', trainings.mine);
router.post('/:id/register', trainings.register);
router.post('/registrations/:id/cancel', trainings.cancel);

module.exports = router;
