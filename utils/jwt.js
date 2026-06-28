const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config');

function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    nickname: user.nickname,
    community: user.community,
  };
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken,
};
