const express = require('express');
const {
  createProduct,
  getProducts,
  getProductDetail,
  updateProduct,
  deleteProduct,
  addGroupBuy,
  getPublicProducts,
  getPublicProductDetail,
} = require('../controllers/productController');
const { authMiddleware, leaderOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/public', authMiddleware, getPublicProducts);
router.get('/public/:id', authMiddleware, getPublicProductDetail);

router.post('/', authMiddleware, leaderOnly, createProduct);
router.get('/', authMiddleware, leaderOnly, getProducts);
router.get('/:id', authMiddleware, leaderOnly, getProductDetail);
router.put('/:id', authMiddleware, leaderOnly, updateProduct);
router.delete('/:id', authMiddleware, leaderOnly, deleteProduct);

router.post('/group-buy', authMiddleware, leaderOnly, addGroupBuy);

module.exports = router;
