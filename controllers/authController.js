const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');
const { success, error, notFound } = require('../utils/response');
const { generateToken } = require('../utils/jwt');

const registerValidators = [
  body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度3-50'),
  body('password').isLength({ min: 6, max: 50 }).withMessage('密码长度6-50'),
  body('nickname').isLength({ min: 1, max: 50 }).withMessage('昵称不能为空'),
  body('phone').matches(/^1[3-9]\d{9}$/).withMessage('手机号格式不正确'),
  body('role').isIn(['leader', 'resident']).withMessage('角色必须是leader或resident'),
  body('community').optional().isLength({ max: 100 }),
];

const loginValidators = [
  body('username').notEmpty().withMessage('用户名不能为空'),
  body('password').notEmpty().withMessage('密码不能为空'),
];

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg);
  }

  const { username, password, nickname, phone, role, community, address } = req.body;

  try {
    const exists = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (exists.length > 0) {
      return error(res, '用户名已存在');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (username, password, nickname, phone, role, community, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, hashedPassword, nickname, phone, role, community || null, address || null]
    );

    const user = {
      id: result.insertId,
      username,
      nickname,
      phone,
      role,
      community: community || null,
    };

    const token = generateToken(user);

    return success(res, { user, token }, '注册成功');
  } catch (err) {
    console.error('Register error:', err);
    return error(res, '注册失败，请稍后重试');
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, errors.array()[0].msg);
  }

  const { username, password } = req.body;

  try {
    const users = await db.query(
      'SELECT id, username, password, nickname, phone, role, community, address FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return error(res, '用户名或密码错误');
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return error(res, '用户名或密码错误');
    }

    const token = generateToken(user);

    const userInfo = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      phone: user.phone,
      role: user.role,
      community: user.community,
      address: user.address,
    };

    return success(res, { user: userInfo, token }, '登录成功');
  } catch (err) {
    console.error('Login error:', err);
    return error(res, '登录失败，请稍后重试');
  }
}

async function getProfile(req, res) {
  try {
    const users = await db.query(
      'SELECT id, username, nickname, phone, role, community, address, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return notFound(res, '用户不存在');
    }

    return success(res, users[0]);
  } catch (err) {
    console.error('Get profile error:', err);
    return error(res, '获取用户信息失败');
  }
}

async function updateProfile(req, res) {
  const { nickname, phone, community, address } = req.body;
  const fields = [];
  const values = [];

  if (nickname !== undefined) {
    fields.push('nickname = ?');
    values.push(nickname);
  }
  if (phone !== undefined) {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return error(res, '手机号格式不正确');
    }
    fields.push('phone = ?');
    values.push(phone);
  }
  if (community !== undefined) {
    fields.push('community = ?');
    values.push(community);
  }
  if (address !== undefined) {
    fields.push('address = ?');
    values.push(address);
  }

  if (fields.length === 0) {
    return error(res, '没有需要更新的字段');
  }

  values.push(req.user.id);

  try {
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const users = await db.query(
      'SELECT id, username, nickname, phone, role, community, address FROM users WHERE id = ?',
      [req.user.id]
    );

    return success(res, users[0], '更新成功');
  } catch (err) {
    console.error('Update profile error:', err);
    return error(res, '更新失败');
  }
}

module.exports = {
  registerValidators,
  loginValidators,
  register,
  login,
  getProfile,
  updateProfile,
};
