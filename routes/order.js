const express = require('express');
const {
  createOrder,
  getMyOrders,
  getOrderDetail,
  cancelOrder,
  getLeaderOrders,
  confirmOrder,
  completeOrder,
} = require('../controllers/orderController');
const { authMiddleware, leaderOnly, residentOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, createOrder);
router.get('/my', authMiddleware, getMyOrders);
router.get('/:id', authMiddleware, getOrderDetail);
router.post('/:id/cancel', authMiddleware, cancelOrder);

router.get('/leader/all', authMiddleware, leaderOnly, getLeaderOrders);
router.post('/:id/confirm', authMiddleware, leaderOnly, confirmOrder);
router.post('/:id/complete', authMiddleware, leaderOnly, completeOrder);

module.exports = router;
