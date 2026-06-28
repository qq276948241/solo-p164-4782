const express = require('express');
const { body } = require('express-validator');
const {
  registerValidators,
  loginValidators,
  register,
  login,
  getProfile,
  updateProfile,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerValidators, register);
router.post('/login', loginValidators, login);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);

module.exports = router;
