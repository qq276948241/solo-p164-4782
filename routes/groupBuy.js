const express = require('express');
const {
  getGroupBuyProgress,
  getMyCommunityGroupBuys,
  getMyJoinedGroupBuys,
  getLeaderGroupBuys,
} = require('../controllers/groupBuyController');
const { authMiddleware, leaderOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/progress/:id', authMiddleware, getGroupBuyProgress);
router.get('/my-community', authMiddleware, getMyCommunityGroupBuys);
router.get('/my-joined', authMiddleware, getMyJoinedGroupBuys);
router.get('/leader/all', authMiddleware, leaderOnly, getLeaderGroupBuys);

module.exports = router;
