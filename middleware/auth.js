const { verifyToken } = require('../utils/jwt');
const { unauthorized, forbidden } = require('../utils/response');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res);
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return unauthorized(res);
  }

  req.user = decoded;
  next();
}

function roleMiddleware(...roles) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return forbidden(res, `需要以下角色之一: ${roles.join(', ')}`);
    }
    next();
  };
}

const leaderOnly = roleMiddleware('leader');
const residentOnly = roleMiddleware('resident');

module.exports = {
  authMiddleware,
  roleMiddleware,
  leaderOnly,
  residentOnly,
};
