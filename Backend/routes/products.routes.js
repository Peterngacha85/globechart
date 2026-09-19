const express = require('express');
const products = require('../controllers/productController');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(protect);

router.get('/', products.list);
// Declared before "/:id" so "my-library" is not treated as an id
router.get('/my-library', products.myLibrary);
router.get('/:id', products.getOne);
router.post('/:id/purchase', products.purchase);
router.get('/:id/access', products.access);

module.exports = router;
