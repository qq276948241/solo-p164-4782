const db = require('../config/db');
const { success, error, notFound, forbidden } = require('../utils/response');

async function getGroupBuyProgress(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  const userCommunity = req.user.community;

  try {
    const groupBuys = await db.query(
      `SELECT gb.*, p.name as product_name, p.description, p.unit, p.price, p.image_url,
              p.category, p.min_group_size as product_min_size,
              pp.name as pickup_name, pp.address as pickup_address,
              pp.community as pickup_community, pp.contact_person, pp.contact_phone,
              u.nickname as leader_name, u.phone as leader_phone
       FROM group_buys gb
       INNER JOIN products p ON gb.product_id = p.id
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       INNER JOIN users u ON gb.leader_id = u.id
       WHERE gb.id = ?`,
      [id]
    );

    if (groupBuys.length === 0) {
      return notFound(res, '拼团不存在');
    }

    const gb = groupBuys[0];

    if (userRole !== 'leader' && userCommunity && gb.pickup_community !== userCommunity) {
    }

    const orderStats = await db.query(
      `SELECT COUNT(DISTINCT user_id) as people_count,
              COALESCE(SUM(quantity), 0) as total_quantity,
              COUNT(*) as order_count,
              COALESCE(SUM(total_price), 0) as total_amount
       FROM orders
       WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
      [id]
    );
    const stats = orderStats[0];

    let myOrder = null;
    const myOrders = await db.query(
      `SELECT id, order_no, quantity, unit_price, total_price, status, created_at
       FROM orders
       WHERE group_buy_id = ? AND user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [id, userId]
    );
    if (myOrders.length > 0) {
      myOrder = myOrders[0];
    }

    let recentParticipants = [];
    if (gb.status === 'ongoing' || gb.status === 'success') {
      const participants = await db.query(
        `SELECT o.id, o.quantity, o.created_at,
                u.nickname as participant_name
         FROM orders o
         INNER JOIN users u ON o.user_id = u.id
         WHERE o.group_buy_id = ? AND o.status IN ('pending', 'confirmed', 'completed')
         ORDER BY o.created_at DESC LIMIT 20`,
        [id]
      );
      recentParticipants = participants.map((p) => ({
        ...p,
        participant_name:
          p.participant_name.length > 1
            ? p.participant_name[0] + '*'.repeat(p.participant_name.length - 1)
            : p.participant_name,
      }));
    }

    const progressPercent = gb.min_people > 0
      ? Math.min(Math.round((gb.current_people / gb.min_people) * 100), 100)
      : 0;

    const remainTimeMs = new Date(gb.cutoff_time).getTime() - Date.now();
    let remain_time = null;
    if (remainTimeMs > 0) {
      const seconds = Math.floor(remainTimeMs / 1000);
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      remain_time = {
        total_seconds: seconds,
        days,
        hours,
        minutes,
        seconds: secs,
        text: `${days > 0 ? days + '天' : ''}${hours}小时${minutes}分${secs}秒`,
      };
    }

    return success(res, {
      ...gb,
      stats: {
        people_count: stats.people_count,
        total_quantity: parseFloat(stats.total_quantity),
        order_count: stats.order_count,
        total_amount: parseFloat(stats.total_amount),
      },
      progress: {
        current_people: gb.current_people,
        min_people: gb.min_people,
        need_people: Math.max(gb.min_people - gb.current_people, 0),
        percent: progressPercent,
        is_success: gb.status === 'success' || gb.current_people >= gb.min_people,
      },
      remain_time,
      my_order: myOrder,
      recent_participants: recentParticipants,
    });
  } catch (err) {
    console.error('Get group buy progress error:', err);
    return error(res, '获取拼团进度失败');
  }
}

async function getMyCommunityGroupBuys(req, res) {
  const userId = req.user.id;
  const userCommunity = req.user.community;
  const { status, product_id, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = '';
    let countSql = `SELECT COUNT(*) as total FROM group_buys gb
                    INNER JOIN products p ON gb.product_id = p.id
                    INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id`;
    const conditions = [];
    const params = [];
    const countParams = [];

    if (userCommunity) {
      conditions.push('pp.community = ?');
      params.push(userCommunity);
      countParams.push(userCommunity);
    }
    if (status) {
      conditions.push('gb.status = ?');
      params.push(status);
      countParams.push(status);
    }
    if (product_id) {
      conditions.push('gb.product_id = ?');
      params.push(product_id);
      countParams.push(product_id);
    }
    if (conditions.length > 0) {
      whereSql = ' WHERE ' + conditions.join(' AND ');
    }

    const countResult = await db.query(countSql + whereSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT gb.*, p.name as product_name, p.unit, p.price, p.image_url, p.category,
              pp.name as pickup_name, pp.address as pickup_address, pp.community as pickup_community,
              u.nickname as leader_name
       FROM group_buys gb
       INNER JOIN products p ON gb.product_id = p.id
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       INNER JOIN users u ON gb.leader_id = u.id
       ${whereSql}
       ORDER BY CASE gb.status
                  WHEN 'ongoing' THEN 1
                  WHEN 'success' THEN 2
                  WHEN 'failed' THEN 3
                  WHEN 'cancelled' THEN 4
                  ELSE 5
                END, gb.cutoff_time ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    for (const item of list) {
      const progressPercent = item.min_people > 0
        ? Math.min(Math.round((item.current_people / item.min_people) * 100), 100)
        : 0;

      const myOrderCounts = await db.query(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(quantity), 0) as total_qty
         FROM orders WHERE group_buy_id = ? AND user_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
        [item.id, userId]
      );

      item.progress = {
        percent: progressPercent,
        need_people: Math.max(item.min_people - item.current_people, 0),
        is_success: item.status === 'success' || item.current_people >= item.min_people,
      };
      item.my_join = {
        has_joined: myOrderCounts[0].cnt > 0,
        order_count: myOrderCounts[0].cnt,
        total_quantity: parseFloat(myOrderCounts[0].total_qty),
      };

      const remainMs = new Date(item.cutoff_time).getTime() - Date.now();
      item.is_expired = remainMs <= 0;
      item.remain_seconds = remainMs > 0 ? Math.floor(remainMs / 1000) : 0;
    }

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get my community group buys error:', err);
    return error(res, '获取拼团列表失败');
  }
}

async function getMyJoinedGroupBuys(req, res) {
  const userId = req.user.id;
  const { status, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let baseSql = `FROM (
                    SELECT DISTINCT gb.*, p.name as product_name, p.unit, p.price, p.image_url,
                           pp.name as pickup_name, pp.address as pickup_address, pp.community,
                           u.nickname as leader_name
                    FROM group_buys gb
                    INNER JOIN orders o ON o.group_buy_id = gb.id
                    INNER JOIN products p ON gb.product_id = p.id
                    INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
                    INNER JOIN users u ON gb.leader_id = u.id
                    WHERE o.user_id = ?
                  ) t`;
    const countParams = [userId];
    const params = [userId];
    let whereSql = '';

    if (status) {
      whereSql = ' WHERE t.status = ?';
      countParams.push(status);
      params.push(status);
    }

    const countResult = await db.query(
      'SELECT COUNT(*) as total ' + baseSql + whereSql,
      countParams
    );
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT t.* ` + baseSql + whereSql + `
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    for (const item of list) {
      const myOrderInfo = await db.query(
        `SELECT COUNT(*) as order_count, COALESCE(SUM(quantity), 0) as total_qty,
                COALESCE(SUM(total_price), 0) as total_amount
         FROM orders WHERE group_buy_id = ? AND user_id = ?`,
        [item.id, userId]
      );
      item.my_orders = {
        order_count: myOrderInfo[0].order_count,
        total_quantity: parseFloat(myOrderInfo[0].total_qty),
        total_amount: parseFloat(myOrderInfo[0].total_amount),
      };

      const progressPercent = item.min_people > 0
        ? Math.min(Math.round((item.current_people / item.min_people) * 100), 100)
        : 0;
      item.progress_percent = progressPercent;
    }

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get my joined group buys error:', err);
    return error(res, '获取我参与的拼团失败');
  }
}

async function getLeaderGroupBuys(req, res) {
  const leaderId = req.user.id;
  const { status, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = 'WHERE gb.leader_id = ?';
    let countSql = `SELECT COUNT(*) as total FROM group_buys gb
                    INNER JOIN products p ON gb.product_id = p.id
                    WHERE gb.leader_id = ?`;
    const params = [leaderId];
    const countParams = [leaderId];

    if (status) {
      whereSql += ' AND gb.status = ?';
      countSql += ' AND gb.status = ?';
      params.push(status);
      countParams.push(status);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT gb.*, p.name as product_name, p.unit, p.price, p.image_url,
              pp.name as pickup_name, pp.address as pickup_address, pp.community
       FROM group_buys gb
       INNER JOIN products p ON gb.product_id = p.id
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       ${whereSql}
       ORDER BY gb.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    for (const item of list) {
      const stats = await db.query(
        `SELECT COUNT(DISTINCT user_id) as people_count,
                COUNT(*) as order_count,
                COALESCE(SUM(quantity), 0) as total_quantity,
                COALESCE(SUM(total_price), 0) as total_amount
         FROM orders WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
        [item.id]
      );
      item.order_stats = {
        people_count: stats[0].people_count,
        order_count: stats[0].order_count,
        total_quantity: parseFloat(stats[0].total_quantity),
        total_amount: parseFloat(stats[0].total_amount),
      };

      const progressPercent = item.min_people > 0
        ? Math.min(Math.round((item.current_people / item.min_people) * 100), 100)
        : 0;
      item.progress_percent = progressPercent;
    }

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get leader group buys error:', err);
    return error(res, '获取拼团列表失败');
  }
}

module.exports = {
  getGroupBuyProgress,
  getMyCommunityGroupBuys,
  getMyJoinedGroupBuys,
  getLeaderGroupBuys,
};
