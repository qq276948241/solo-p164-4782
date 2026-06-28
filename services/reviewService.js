const db = require('../config/db');
const { errorCodes, throwError } = require('../utils/response');

function validateRating(rating) {
  const ratingNum = parseInt(rating, 10);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    throw throwError(errorCodes.REVIEW.RATING_INVALID);
  }
  return ratingNum;
}

function validateContent(content) {
  if (content && content.length > 1000) {
    throw throwError(errorCodes.REVIEW.CONTENT_TOO_LONG);
  }
  return content || null;
}

async function getOrderByIdWithLock(orderId, conn) {
  const executor = conn || db;
  const sql = conn
    ? 'SELECT * FROM orders WHERE id = ? FOR UPDATE'
    : 'SELECT * FROM orders WHERE id = ?';
  const [orders] = conn
    ? await conn.execute(sql, [orderId])
    : await executor.query(sql, [orderId]);
  if (orders.length === 0) {
    throw throwError(errorCodes.ORDER_NOT_FOUND);
  }
  return orders[0];
}

async function getOrderById(orderId) {
  const orders = await db.query(
    'SELECT id, user_id, product_id, status FROM orders WHERE id = ?',
    [orderId]
  );
  if (orders.length === 0) {
    throw throwError(errorCodes.ORDER_NOT_FOUND);
  }
  return orders[0];
}

function assertOrderOwner(order, userId) {
  if (order.user_id !== userId) {
    throw throwError(errorCodes.OWNER_FORBIDDEN, '无权限评价此订单');
  }
}

function assertCanViewReviewOfOrder(order, userId, userRole) {
  if (userRole !== 'leader' && order.user_id !== userId) {
    throw throwError(errorCodes.OWNER_FORBIDDEN, '无权限查看此订单的评价状态');
  }
}

function assertOrderCompleted(order) {
  if (order.status !== 'completed') {
    throw throwError(errorCodes.ORDER.CANNOT_REVIEW);
  }
}

async function checkDuplicateReview(orderId, productId, conn) {
  const executor = conn || db;
  const sql = 'SELECT id FROM reviews WHERE order_id = ? AND product_id = ?';
  const [existing] = conn
    ? await conn.execute(sql, [orderId, productId])
    : await executor.query(sql, [orderId, productId]);
  if (existing.length > 0) {
    throw throwError(errorCodes.REVIEW_DUPLICATE);
  }
}

async function insertReview(order, userId, rating, content, conn) {
  const [result] = await conn.execute(
    `INSERT INTO reviews (order_id, product_id, user_id, rating, content)
     VALUES (?, ?, ?, ?, ?)`,
    [order.id, order.product_id, userId, rating, content]
  );
  return result.insertId;
}

async function getReviewById(reviewId) {
  const reviews = await db.query(
    `SELECT r.*, u.nickname as user_nickname
     FROM reviews r
     INNER JOIN users u ON r.user_id = u.id
     WHERE r.id = ?`,
    [reviewId]
  );
  return reviews[0] || null;
}

async function getReviewOfOrder(orderId, productId) {
  const reviews = await db.query(
    `SELECT r.*, u.nickname as user_nickname
     FROM reviews r
     INNER JOIN users u ON r.user_id = u.id
     WHERE r.order_id = ? AND r.product_id = ?`,
    [orderId, productId]
  );
  return reviews[0] || null;
}

async function assertProductExists(productId) {
  const products = await db.query('SELECT id FROM products WHERE id = ?', [productId]);
  if (products.length === 0) {
    throw throwError(errorCodes.PRODUCT_NOT_FOUND);
  }
}

function buildProductReviewWhere(query) {
  const { min_rating, max_rating } = query;
  let whereSql = 'WHERE r.product_id = ?';
  const params = [];

  if (min_rating) {
    whereSql += ' AND r.rating >= ?';
    params.push(parseInt(min_rating, 10));
  }
  if (max_rating) {
    whereSql += ' AND r.rating <= ?';
    params.push(parseInt(max_rating, 10));
  }

  return { whereSql, params };
}

async function countProductReviews(productId, extraParams) {
  const { whereSql, params } = buildProductReviewWhere({
    min_rating: extraParams.min_rating,
    max_rating: extraParams.max_rating,
  });
  const result = await db.query(
    `SELECT COUNT(*) as total FROM reviews r ${whereSql}`,
    [productId, ...params]
  );
  return result[0].total;
}

async function listProductReviews(productId, extraParams, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildProductReviewWhere(extraParams);

  const list = await db.query(
    `SELECT r.*, u.nickname as user_nickname,
            o.id as order_id, o.quantity, o.created_at as order_created_at
     FROM reviews r
     INNER JOIN users u ON r.user_id = u.id
     INNER JOIN orders o ON r.order_id = o.id
     ${whereSql}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [productId, ...params, parseInt(pageSize, 10), parseInt(offset, 10)]
  );
  return list;
}

async function getProductReviewStats(productId) {
  const stats = await db.query(
    `SELECT COUNT(*) as total_count,
            COALESCE(AVG(rating), 0) as avg_rating,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5_count,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4_count,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3_count,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2_count,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1_count
     FROM reviews WHERE product_id = ?`,
    [productId]
  );
  const s = stats[0];
  return {
    total_count: s.total_count,
    avg_rating: parseFloat(parseFloat(s.avg_rating).toFixed(1)),
    rating_distribution: {
      5: s.rating_5_count,
      4: s.rating_4_count,
      3: s.rating_3_count,
      2: s.rating_2_count,
      1: s.rating_1_count,
    },
  };
}

async function submitReview(userId, orderId, rating, content) {
  if (!orderId || rating === undefined || rating === null) {
    throw throwError(errorCodes.MISSING_PARAM, '订单ID和评分为必填项');
  }

  const validRating = validateRating(rating);
  const validContent = validateContent(content);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const order = await getOrderByIdWithLock(orderId, conn);
    assertOrderOwner(order, userId);
    assertOrderCompleted(order);
    await checkDuplicateReview(order.id, order.product_id, conn);

    const reviewId = await insertReview(order, userId, validRating, validContent, conn);

    await conn.commit();
    return await getReviewById(reviewId);
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      throw throwError(errorCodes.REVIEW_DUPLICATE);
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function getProductReviewsData(productId, query) {
  if (!productId) {
    throw throwError(errorCodes.MISSING_PARAM, '商品ID不能为空');
  }

  await assertProductExists(productId);

  const page = parseInt(query.page, 10) || 1;
  const pageSize = parseInt(query.page_size, 10) || 10;
  const extraParams = {
    min_rating: query.min_rating,
    max_rating: query.max_rating,
  };

  const [total, list, stats] = await Promise.all([
    countProductReviews(productId, extraParams),
    listProductReviews(productId, extraParams, page, pageSize),
    getProductReviewStats(productId),
  ]);

  return {
    list,
    total,
    page,
    page_size: pageSize,
    stats,
  };
}

async function getOrderReviewStatusData(orderId, userId, userRole) {
  if (!orderId) {
    throw throwError(errorCodes.MISSING_PARAM, '订单ID不能为空');
  }

  const order = await getOrderById(orderId);
  assertCanViewReviewOfOrder(order, userId, userRole);

  const review = await getReviewOfOrder(orderId, order.product_id);

  return {
    order_id: order.id,
    order_status: order.status,
    can_review:
      order.status === 'completed' &&
      !review &&
      order.user_id === userId,
    has_reviewed: !!review,
    review,
  };
}

function buildLeaderReviewWhere(leaderId, query) {
  let whereSql = 'WHERE p.leader_id = ?';
  const params = [leaderId];

  if (query.product_id) {
    whereSql += ' AND r.product_id = ?';
    params.push(query.product_id);
  }

  return { whereSql, params };
}

async function countLeaderReviews(leaderId, query) {
  const { whereSql, params } = buildLeaderReviewWhere(leaderId, query);
  const result = await db.query(
    `SELECT COUNT(*) as total FROM reviews r
     INNER JOIN products p ON r.product_id = p.id
     ${whereSql}`,
    params
  );
  return result[0].total;
}

async function listLeaderReviews(leaderId, query, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildLeaderReviewWhere(leaderId, query);

  return await db.query(
    `SELECT r.*, p.name as product_name, p.image_url as product_image,
            u.nickname as user_nickname,
            o.id as order_id, o.quantity
     FROM reviews r
     INNER JOIN products p ON r.product_id = p.id
     INNER JOIN users u ON r.user_id = u.id
     INNER JOIN orders o ON r.order_id = o.id
     ${whereSql}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(pageSize, 10), parseInt(offset, 10)]
  );
}

async function getLeaderReviewsData(leaderId, query) {
  const page = parseInt(query.page, 10) || 1;
  const pageSize = parseInt(query.page_size, 10) || 10;

  const [total, list] = await Promise.all([
    countLeaderReviews(leaderId, query),
    listLeaderReviews(leaderId, query, page, pageSize),
  ]);

  return {
    list,
    total,
    page,
    page_size: pageSize,
  };
}

module.exports = {
  submitReview,
  getProductReviewsData,
  getOrderReviewStatusData,
  getLeaderReviewsData,
};
