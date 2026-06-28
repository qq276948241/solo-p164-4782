const db = require('../config/db');
const { success, error, notFound, forbidden } = require('../utils/response');

function generateOrderNo() {
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return timestamp + random;
}

async function createOrder(req, res) {
  const userId = req.user.id;
  const {
    group_buy_id,
    quantity,
    contact_name,
    contact_phone,
    community,
    remark,
  } = req.body;

  if (!group_buy_id || !quantity || !contact_name || !contact_phone) {
    return error(res, '拼团ID、数量、联系人姓名、联系电话为必填项');
  }

  const qty = parseInt(quantity, 10);
  if (!qty || qty <= 0) {
    return error(res, '数量必须大于0');
  }

  if (!/^1[3-9]\d{9}$/.test(contact_phone)) {
    return error(res, '手机号格式不正确');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [groupBuys] = await conn.execute(
      `SELECT gb.*, p.name as product_name, p.price, p.unit, p.max_quantity_per_person,
              p.total_stock, pp.name as pickup_name, pp.community as pickup_community
       FROM group_buys gb
       INNER JOIN products p ON gb.product_id = p.id
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       WHERE gb.id = ? FOR UPDATE`,
      [group_buy_id]
    );

    if (groupBuys.length === 0) {
      await conn.rollback();
      conn.release();
      return notFound(res, '拼团不存在');
    }

    const gb = groupBuys[0];

    if (gb.status !== 'ongoing') {
      await conn.rollback();
      conn.release();
      return error(res, '该拼团已结束，无法下单');
    }

    if (new Date(gb.cutoff_time) <= new Date()) {
      await conn.rollback();
      conn.release();
      return error(res, '该拼团已到截单时间，无法下单');
    }

    if (community && community !== gb.pickup_community) {
      await conn.rollback();
      conn.release();
      return error(res, '该拼团对应自提点不属于您选择的小区');
    }

    const [existingOrders] = await conn.execute(
      `SELECT SUM(quantity) as total_qty FROM orders
       WHERE group_buy_id = ? AND user_id = ? AND status IN ('pending', 'confirmed')`,
      [group_buy_id, userId]
    );
    const existingQty = existingOrders[0].total_qty || 0;
    const newTotalQty = existingQty + qty;

    if (gb.max_quantity_per_person && newTotalQty > gb.max_quantity_per_person) {
      await conn.rollback();
      conn.release();
      return error(res, `每人限购${gb.max_quantity_per_person}${gb.unit}，您已订购${existingQty}${gb.unit}`);
    }

    if (gb.total_stock) {
      const [orderedQtyResult] = await conn.execute(
        `SELECT COALESCE(SUM(quantity), 0) as total_ordered
         FROM orders WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
        [group_buy_id]
      );
      const totalOrdered = orderedQtyResult[0].total_ordered || 0;
      if (totalOrdered + qty > gb.total_stock) {
        await conn.rollback();
        conn.release();
        return error(res, `库存不足，剩余${gb.total_stock - totalOrdered}${gb.unit}`);
      }
    }

    const unitPrice = parseFloat(gb.price);
    const totalPrice = (unitPrice * qty).toFixed(2);
    const orderNo = generateOrderNo();
    const orderCommunity = community || req.user.community || gb.pickup_community;

    const [orderResult] = await conn.execute(
      `INSERT INTO orders (order_no, user_id, group_buy_id, product_id, pickup_point_id,
                           quantity, unit_price, total_price, status, contact_name,
                           contact_phone, community, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        orderNo,
        userId,
        group_buy_id,
        gb.product_id,
        gb.pickup_point_id,
        qty,
        unitPrice,
        parseFloat(totalPrice),
        contact_name,
        contact_phone,
        orderCommunity,
        remark || null,
      ]
    );

    const [userOrders] = await conn.execute(
      `SELECT COUNT(DISTINCT user_id) as user_count
       FROM orders
       WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
      [group_buy_id]
    );
    const currentPeople = userOrders[0].user_count;

    await conn.execute(
      'UPDATE group_buys SET current_people = ? WHERE id = ?',
      [currentPeople, group_buy_id]
    );

    await conn.commit();

    const [orders] = await conn.execute(
      `SELECT o.*, p.name as product_name, p.unit, p.image_url,
              pp.name as pickup_name, pp.address as pickup_address,
              gb.cutoff_time, gb.min_people, gb.current_people
       FROM orders o
       INNER JOIN products p ON o.product_id = p.id
       INNER JOIN pickup_points pp ON o.pickup_point_id = pp.id
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       WHERE o.id = ?`,
      [orderResult.insertId]
    );

    conn.release();

    return success(res, orders[0], '下单成功');
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Create order error:', err);
    return error(res, '下单失败，请稍后重试');
  }
}

async function getMyOrders(req, res) {
  const userId = req.user.id;
  const { status, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = 'WHERE o.user_id = ?';
    let countSql = 'SELECT COUNT(*) as total FROM orders o WHERE o.user_id = ?';
    const params = [userId];
    const countParams = [userId];

    if (status) {
      whereSql += ' AND o.status = ?';
      countSql += ' AND o.status = ?';
      params.push(status);
      countParams.push(status);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT o.*, p.name as product_name, p.unit, p.image_url,
              pp.name as pickup_name, pp.address as pickup_address,
              gb.cutoff_time, gb.min_people, gb.current_people, gb.status as group_status
       FROM orders o
       INNER JOIN products p ON o.product_id = p.id
       INNER JOIN pickup_points pp ON o.pickup_point_id = pp.id
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       ${whereSql}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get my orders error:', err);
    return error(res, '获取订单列表失败');
  }
}

async function getOrderDetail(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const orders = await db.query(
      `SELECT o.*, p.name as product_name, p.unit, p.image_url, p.description,
              pp.name as pickup_name, pp.address as pickup_address,
              pp.contact_person, pp.contact_phone,
              gb.cutoff_time, gb.min_people, gb.current_people, gb.status as group_status,
              u.nickname as leader_name, u.phone as leader_phone
       FROM orders o
       INNER JOIN products p ON o.product_id = p.id
       INNER JOIN pickup_points pp ON o.pickup_point_id = pp.id
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       INNER JOIN users u ON gb.leader_id = u.id
       WHERE o.id = ? OR o.order_no = ?`,
      [id, id]
    );

    if (orders.length === 0) {
      return notFound(res, '订单不存在');
    }

    const order = orders[0];
    if (order.user_id !== userId && userRole !== 'leader') {
      return forbidden(res, '无权限查看此订单');
    }
    if (userRole === 'leader' && order.leader_id !== userId) {
      return forbidden(res, '无权限查看此订单');
    }

    return success(res, order);
  } catch (err) {
    console.error('Get order detail error:', err);
    return error(res, '获取订单详情失败');
  }
}

async function cancelOrder(req, res) {
  const { id } = req.params;
  const { cancel_reason } = req.body;
  const userId = req.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      'SELECT * FROM orders WHERE id = ? FOR UPDATE',
      [id]
    );

    if (orders.length === 0) {
      await conn.rollback();
      conn.release();
      return notFound(res, '订单不存在');
    }

    const order = orders[0];
    if (order.user_id !== userId) {
      await conn.rollback();
      conn.release();
      return forbidden(res, '无权限取消此订单');
    }

    if (order.status !== 'pending') {
      await conn.rollback();
      conn.release();
      return error(res, '订单当前状态无法取消');
    }

    const [groupBuys] = await conn.execute(
      'SELECT status, cutoff_time FROM group_buys WHERE id = ?',
      [order.group_buy_id]
    );
    if (groupBuys.length > 0) {
      const gb = groupBuys[0];
      if (gb.status !== 'ongoing') {
        await conn.rollback();
        conn.release();
        return error(res, '拼团已结束，无法取消订单');
      }
      if (new Date(gb.cutoff_time) <= new Date()) {
        await conn.rollback();
        conn.release();
        return error(res, '拼团已到截单时间，无法取消订单');
      }
    }

    await conn.execute(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = ? WHERE id = ?`,
      [cancel_reason || '用户主动取消', id]
    );

    const [userOrders] = await conn.execute(
      `SELECT COUNT(DISTINCT user_id) as user_count
       FROM orders
       WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
      [order.group_buy_id]
    );
    const currentPeople = userOrders[0].user_count;

    await conn.execute(
      'UPDATE group_buys SET current_people = ? WHERE id = ?',
      [currentPeople, order.group_buy_id]
    );

    await conn.commit();
    conn.release();

    return success(res, null, '订单取消成功');
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Cancel order error:', err);
    return error(res, '取消订单失败');
  }
}

async function getLeaderOrders(req, res) {
  const leaderId = req.user.id;
  const { status, group_buy_id, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = 'WHERE gb.leader_id = ?';
    let countSql = `SELECT COUNT(*) as total FROM orders o
                    INNER JOIN group_buys gb ON o.group_buy_id = gb.id
                    WHERE gb.leader_id = ?`;
    const params = [leaderId];
    const countParams = [leaderId];

    if (status) {
      whereSql += ' AND o.status = ?';
      countSql += ' AND o.status = ?';
      params.push(status);
      countParams.push(status);
    }
    if (group_buy_id) {
      whereSql += ' AND o.group_buy_id = ?';
      countSql += ' AND o.group_buy_id = ?';
      params.push(group_buy_id);
      countParams.push(group_buy_id);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT o.*, p.name as product_name, p.unit, p.image_url,
              pp.name as pickup_name, pp.address as pickup_address,
              gb.cutoff_time, gb.min_people, gb.current_people, gb.status as group_status,
              u.nickname as user_nickname, u.username as user_username
       FROM orders o
       INNER JOIN products p ON o.product_id = p.id
       INNER JOIN pickup_points pp ON o.pickup_point_id = pp.id
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       INNER JOIN users u ON o.user_id = u.id
       ${whereSql}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get leader orders error:', err);
    return error(res, '获取订单列表失败');
  }
}

async function confirmOrder(req, res) {
  const { id } = req.params;
  const leaderId = req.user.id;

  try {
    const orders = await db.query(
      `SELECT o.*, gb.leader_id FROM orders o
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       WHERE o.id = ?`,
      [id]
    );

    if (orders.length === 0) {
      return notFound(res, '订单不存在');
    }

    if (orders[0].leader_id !== leaderId) {
      return forbidden(res, '无权限操作此订单');
    }

    if (orders[0].status !== 'pending') {
      return error(res, '订单当前状态无法确认');
    }

    await db.query(`UPDATE orders SET status = 'confirmed' WHERE id = ?`, [id]);

    const updated = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    return success(res, updated[0], '订单确认成功');
  } catch (err) {
    console.error('Confirm order error:', err);
    return error(res, '确认订单失败');
  }
}

async function completeOrder(req, res) {
  const { id } = req.params;
  const leaderId = req.user.id;

  try {
    const orders = await db.query(
      `SELECT o.*, gb.leader_id, gb.status as group_status FROM orders o
       INNER JOIN group_buys gb ON o.group_buy_id = gb.id
       WHERE o.id = ?`,
      [id]
    );

    if (orders.length === 0) {
      return notFound(res, '订单不存在');
    }

    if (orders[0].leader_id !== leaderId) {
      return forbidden(res, '无权限操作此订单');
    }

    if (orders[0].group_status !== 'success') {
      return error(res, '拼团未成功，订单无法完成');
    }

    if (!['pending', 'confirmed'].includes(orders[0].status)) {
      return error(res, '订单当前状态无法完成');
    }

    await db.query(`UPDATE orders SET status = 'completed' WHERE id = ?`, [id]);

    const updated = await db.query('SELECT * FROM orders WHERE id = ?', [id]);
    return success(res, updated[0], '订单已完成');
  } catch (err) {
    console.error('Complete order error:', err);
    return error(res, '完成订单失败');
  }
}

module.exports = {
  createOrder,
  getMyOrders,
  getOrderDetail,
  cancelOrder,
  getLeaderOrders,
  confirmOrder,
  completeOrder,
};
