const express = require('express');
const {
  submitReview,
  getProductReviews,
  getOrderReviewStatus,
  getLeaderProductReviews,
} = require('../controllers/reviewController');
const { authMiddleware, leaderOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, submitReview);
router.get('/product/:product_id', authMiddleware, getProductReviews);
router.get('/order/:order_id', authMiddleware, getOrderReviewStatus);
router.get('/leader/all', authMiddleware, leaderOnly, getLeaderProductReviews);

module.exports = router;
