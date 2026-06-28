const express = require('express');
const {
  createPickupPoint,
  getPickupPoints,
  getPickupPointDetail,
  updatePickupPoint,
  deletePickupPoint,
  getPublicPickupPoints,
} = require('../controllers/pickupController');
const { authMiddleware, leaderOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/public', authMiddleware, getPublicPickupPoints);

router.post('/', authMiddleware, leaderOnly, createPickupPoint);
router.get('/', authMiddleware, leaderOnly, getPickupPoints);
router.get('/:id', authMiddleware, leaderOnly, getPickupPointDetail);
router.put('/:id', authMiddleware, leaderOnly, updatePickupPoint);
router.delete('/:id', authMiddleware, leaderOnly, deletePickupPoint);

module.exports = router;
