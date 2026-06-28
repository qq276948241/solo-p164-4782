const errorCodes = {
  SUCCESS: { code: 0, message: 'success' },

  BAD_REQUEST: { code: 40000, message: '请求参数错误' },
  MISSING_PARAM: { code: 40001, message: '缺少必要参数' },
  INVALID_PARAM: { code: 40002, message: '参数格式不正确' },

  UNAUTHORIZED: { code: 40100, message: '未授权或token已过期' },
  TOKEN_INVALID: { code: 40101, message: 'token无效' },
  TOKEN_EXPIRED: { code: 40102, message: 'token已过期' },

  FORBIDDEN: { code: 40300, message: '无权限访问' },
  ROLE_FORBIDDEN: { code: 40301, message: '角色无权限执行此操作' },
  OWNER_FORBIDDEN: { code: 40302, message: '无权限操作该资源' },

  NOT_FOUND: { code: 40400, message: '资源不存在' },
  USER_NOT_FOUND: { code: 40401, message: '用户不存在' },
  ORDER_NOT_FOUND: { code: 40402, message: '订单不存在' },
  PRODUCT_NOT_FOUND: { code: 40403, message: '商品不存在' },
  GROUP_BUY_NOT_FOUND: { code: 40404, message: '拼团不存在' },
  PICKUP_NOT_FOUND: { code: 40405, message: '自提点不存在' },
  REVIEW_NOT_FOUND: { code: 40406, message: '评价不存在' },

  CONFLICT: { code: 40900, message: '资源冲突' },
  USERNAME_EXISTS: { code: 40901, message: '用户名已存在' },
  REVIEW_DUPLICATE: { code: 40902, message: '该订单已评价过，不能重复评价' },
  PICKUP_IN_USE: { code: 40903, message: '该自提点有进行中或已成功的拼团，无法删除' },
  PRODUCT_IN_USE: { code: 40904, message: '该团品有进行中或已成功的拼团，无法删除' },
  GROUP_BUY_PICKUP_DUPLICATE: { code: 40905, message: '该自提点已有进行中的拼团' },

  ORDER: {
    STATUS_ERROR: { code: 42201, message: '订单当前状态不允许此操作' },
    CANNOT_CANCEL: { code: 42202, message: '订单当前状态无法取消' },
    CANNOT_CONFIRM: { code: 42203, message: '订单当前状态无法确认' },
    CANNOT_COMPLETE: { code: 42204, message: '订单当前状态无法完成' },
    CANNOT_REVIEW: { code: 42205, message: '订单尚未完成，暂不能评价' },
    INVALID_QUANTITY: { code: 42211, message: '数量必须大于0' },
    PURCHASE_LIMIT: { code: 42212, message: '超出每人限购数量' },
    STOCK_INSUFFICIENT: { code: 42213, message: '库存不足' },
  },

  GROUP_BUY: {
    ENDED: { code: 42301, message: '该拼团已结束，无法下单' },
    CUTOFF_REACHED: { code: 42302, message: '该拼团已到截单时间，无法下单' },
    CANNOT_CANCEL_ORDER: { code: 42303, message: '拼团已结束，无法取消订单' },
    CANNOT_CANCEL_CUTOFF: { code: 42304, message: '拼团已到截单时间，无法取消订单' },
    NOT_SUCCESS: { code: 42305, message: '拼团未成功，订单无法完成' },
    CUTOFF_INVALID: { code: 42306, message: '截单时间必须晚于当前时间' },
    CUTOFF_FORMAT: { code: 42307, message: '截单时间格式错误' },
  },

  REVIEW: {
    RATING_INVALID: { code: 42401, message: '评分必须是1到5之间的整数' },
    CONTENT_TOO_LONG: { code: 42402, message: '评价内容不能超过1000字' },
  },

  INTERNAL_ERROR: { code: 50000, message: '服务器内部错误' },
  DB_ERROR: { code: 50001, message: '数据库操作失败' },
};

module.exports = errorCodes;
