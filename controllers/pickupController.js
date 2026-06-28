const db = require('../config/db');
const { success, error, notFound, forbidden } = require('../utils/response');

async function createPickupPoint(req, res) {
  const { name, community, address, contact_person, contact_phone } = req.body;
  const leaderId = req.user.id;

  if (!name || !community || !address || !contact_person || !contact_phone) {
    return error(res, '所有字段都是必填项');
  }

  if (!/^1[3-9]\d{9}$/.test(contact_phone)) {
    return error(res, '手机号格式不正确');
  }

  try {
    const result = await db.query(
      `INSERT INTO pickup_points (leader_id, name, community, address, contact_person, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [leaderId, name, community, address, contact_person, contact_phone]
    );

    const pickupPoints = await db.query(
      'SELECT * FROM pickup_points WHERE id = ?',
      [result.insertId]
    );

    return success(res, pickupPoints[0], '创建自提点成功');
  } catch (err) {
    console.error('Create pickup point error:', err);
    return error(res, '创建自提点失败');
  }
}

async function getPickupPoints(req, res) {
  const { community, page = 1, page_size = 10 } = req.query;
  const leaderId = req.user.id;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = 'WHERE leader_id = ?';
    let countSql = 'SELECT COUNT(*) as total FROM pickup_points WHERE leader_id = ?';
    const params = [leaderId];
    const countParams = [leaderId];

    if (community) {
      whereSql += ' AND community LIKE ?';
      countSql += ' AND community LIKE ?';
      params.push(`%${community}%`);
      countParams.push(`%${community}%`);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT * FROM pickup_points ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get pickup points error:', err);
    return error(res, '获取自提点列表失败');
  }
}

async function getPickupPointDetail(req, res) {
  const { id } = req.params;

  try {
    const pickupPoints = await db.query(
      'SELECT * FROM pickup_points WHERE id = ?',
      [id]
    );

    if (pickupPoints.length === 0) {
      return notFound(res, '自提点不存在');
    }

    const pickup = pickupPoints[0];
    if (pickup.leader_id !== req.user.id) {
      return forbidden(res, '无权限查看此自提点');
    }

    return success(res, pickup);
  } catch (err) {
    console.error('Get pickup point detail error:', err);
    return error(res, '获取自提点详情失败');
  }
}

async function updatePickupPoint(req, res) {
  const { id } = req.params;
  const { name, community, address, contact_person, contact_phone } = req.body;

  try {
    const pickupPoints = await db.query(
      'SELECT * FROM pickup_points WHERE id = ?',
      [id]
    );

    if (pickupPoints.length === 0) {
      return notFound(res, '自提点不存在');
    }

    if (pickupPoints[0].leader_id !== req.user.id) {
      return forbidden(res, '无权限修改此自提点');
    }

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (community !== undefined) {
      fields.push('community = ?');
      values.push(community);
    }
    if (address !== undefined) {
      fields.push('address = ?');
      values.push(address);
    }
    if (contact_person !== undefined) {
      fields.push('contact_person = ?');
      values.push(contact_person);
    }
    if (contact_phone !== undefined) {
      if (!/^1[3-9]\d{9}$/.test(contact_phone)) {
        return error(res, '手机号格式不正确');
      }
      fields.push('contact_phone = ?');
      values.push(contact_phone);
    }

    if (fields.length === 0) {
      return error(res, '没有需要更新的字段');
    }

    values.push(id);

    await db.query(`UPDATE pickup_points SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.query('SELECT * FROM pickup_points WHERE id = ?', [id]);
    return success(res, updated[0], '更新成功');
  } catch (err) {
    console.error('Update pickup point error:', err);
    return error(res, '更新自提点失败');
  }
}

async function deletePickupPoint(req, res) {
  const { id } = req.params;

  try {
    const pickupPoints = await db.query(
      'SELECT * FROM pickup_points WHERE id = ?',
      [id]
    );

    if (pickupPoints.length === 0) {
      return notFound(res, '自提点不存在');
    }

    if (pickupPoints[0].leader_id !== req.user.id) {
      return forbidden(res, '无权限删除此自提点');
    }

    const inUse = await db.query(
      'SELECT id FROM group_buys WHERE pickup_point_id = ? AND status IN ("ongoing", "success") LIMIT 1',
      [id]
    );
    if (inUse.length > 0) {
      return error(res, '该自提点有进行中或已成功的拼团，无法删除');
    }

    await db.query('DELETE FROM pickup_points WHERE id = ?', [id]);

    return success(res, null, '删除成功');
  } catch (err) {
    console.error('Delete pickup point error:', err);
    return error(res, '删除自提点失败');
  }
}

async function getPublicPickupPoints(req, res) {
  const { community } = req.query;

  try {
    let sql = `SELECT DISTINCT pp.*, u.nickname as leader_name
               FROM pickup_points pp
               INNER JOIN users u ON pp.leader_id = u.id`;
    let whereSql = [];
    let params = [];

    if (community) {
      whereSql.push('pp.community = ?');
      params.push(community);
    } else if (req.user && req.user.community) {
      whereSql.push('pp.community = ?');
      params.push(req.user.community);
    }

    if (whereSql.length > 0) {
      sql += ' WHERE ' + whereSql.join(' AND ');
    }

    sql += ' ORDER BY pp.community, pp.name';

    const list = await db.query(sql, params);
    return success(res, list);
  } catch (err) {
    console.error('Get public pickup points error:', err);
    return error(res, '获取自提点列表失败');
  }
}

module.exports = {
  createPickupPoint,
  getPickupPoints,
  getPickupPointDetail,
  updatePickupPoint,
  deletePickupPoint,
  getPublicPickupPoints,
};
