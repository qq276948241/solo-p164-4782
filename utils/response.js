const errorCodes = require('./errorCodes');

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

function throwError(errorInfo, customMessage = null) {
  const err = new Error(customMessage || errorInfo.message);
  err.code = errorInfo.code;
  err.httpStatus = 400;
  return err;
}

function sendError(res, errorInfo, customMessage = null) {
  const msg = customMessage || errorInfo.message;
  let httpStatus = 400;
  if (errorInfo.code >= 40100 && errorInfo.code < 40200) httpStatus = 401;
  else if (errorInfo.code >= 40300 && errorInfo.code < 40400) httpStatus = 403;
  else if (errorInfo.code >= 40400 && errorInfo.code < 40500) httpStatus = 404;
  else if (errorInfo.code >= 40900 && errorInfo.code < 41000) httpStatus = 409;
  else if (errorInfo.code >= 50000) httpStatus = 500;
  return error(res, msg, errorInfo.code, httpStatus);
}

function unauthorized(res, message = '未授权或token已过期') {
  return error(res, message, errorCodes.UNAUTHORIZED.code, 401);
}

function forbidden(res, message = '无权限访问') {
  return error(res, message, errorCodes.FORBIDDEN.code, 403);
}

function notFound(res, message = '资源不存在') {
  return error(res, message, errorCodes.NOT_FOUND.code, 404);
}

module.exports = {
  success,
  error,
  unauthorized,
  forbidden,
  notFound,
  throwError,
  sendError,
  errorCodes,
};
