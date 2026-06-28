function success(res, data = null, message = 'success') {
  res.json({
    code: 0,
    message,
    data,
  });
}

function error(res, message = 'error', code = 1, status = 400) {
  res.status(status).json({
    code,
    message,
    data: null,
  });
}

function unauthorized(res, message = '未授权或token已过期') {
  return error(res, message, 401, 401);
}

function forbidden(res, message = '无权限访问') {
  return error(res, message, 403, 403);
}

function notFound(res, message = '资源不存在') {
  return error(res, message, 404, 404);
}

module.exports = {
  success,
  error,
  unauthorized,
  forbidden,
  notFound,
};
