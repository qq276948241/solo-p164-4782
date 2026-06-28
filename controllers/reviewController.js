const reviewService = require('../services/reviewService');
const { success, sendError, errorCodes } = require('../utils/response');

function handleServiceError(res, err, defaultErrorMessage) {
  console.error('Review API error:', err);
  if (err && err.code) {
    return sendError(res, { code: err.code, message: err.message || defaultErrorMessage });
  }
  return sendError(res, errorCodes.DB_ERROR, defaultErrorMessage);
}

async function submitReview(req, res) {
  try {
    const userId = req.user.id;
    const { order_id, rating, content } = req.body;
    const review = await reviewService.submitReview(userId, order_id, rating, content);
    return success(res, review, '评价提交成功');
  } catch (err) {
    return handleServiceError(res, err, '提交评价失败');
  }
}

async function getProductReviews(req, res) {
  try {
    const { product_id } = req.params;
    const data = await reviewService.getProductReviewsData(product_id, req.query);
    return success(res, data);
  } catch (err) {
    return handleServiceError(res, err, '获取评价列表失败');
  }
}

async function getOrderReviewStatus(req, res) {
  try {
    const { order_id } = req.params;
    const data = await reviewService.getOrderReviewStatusData(
      order_id,
      req.user.id,
      req.user.role
    );
    return success(res, data);
  } catch (err) {
    return handleServiceError(res, err, '获取评价状态失败');
  }
}

async function getLeaderProductReviews(req, res) {
  try {
    const leaderId = req.user.id;
    const data = await reviewService.getLeaderReviewsData(leaderId, req.query);
    return success(res, data);
  } catch (err) {
    return handleServiceError(res, err, '获取评价列表失败');
  }
}

module.exports = {
  submitReview,
  getProductReviews,
  getOrderReviewStatus,
  getLeaderProductReviews,
};
