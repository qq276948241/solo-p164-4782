const db = require('../config/db');
const { success, error, notFound, forbidden } = require('../utils/response');

async function createProduct(req, res) {
  const {
    name,
    description,
    category,
    unit,
    price,
    image_url,
    min_group_size,
    max_quantity_per_person,
    total_stock,
    status,
    pickup_configs,
  } = req.body;
  const leaderId = req.user.id;

  if (!name || !unit || !price) {
    return error(res, '团品名、单位、价格为必填项');
  }

  if (!pickup_configs || !Array.isArray(pickup_configs) || pickup_configs.length === 0) {
    return error(res, '至少配置一个自提点和截单时间');
  }

  for (const cfg of pickup_configs) {
    if (!cfg.pickup_point_id || !cfg.cutoff_time) {
      return error(res, '自提点ID和截单时间不能为空');
    }
    const pickupPoints = await db.query(
      'SELECT id, community, leader_id FROM pickup_points WHERE id = ?',
      [cfg.pickup_point_id]
    );
    if (pickupPoints.length === 0) {
      return error(res, `自提点ID ${cfg.pickup_point_id} 不存在`);
    }
    if (pickupPoints[0].leader_id !== leaderId) {
      return error(res, `自提点ID ${cfg.pickup_point_id} 不属于您`);
    }
    const cutoff = new Date(cfg.cutoff_time);
    if (isNaN(cutoff.getTime())) {
      return error(res, `截单时间格式错误`);
    }
    if (cutoff <= new Date()) {
      return error(res, '截单时间必须晚于当前时间');
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [productResult] = await conn.execute(
      `INSERT INTO products (leader_id, name, description, category, unit, price, image_url,
                              min_group_size, max_quantity_per_person, total_stock, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leaderId,
        name,
        description || null,
        category || 'other',
        unit,
        parseFloat(price),
        image_url || null,
        min_group_size ? parseInt(min_group_size, 10) : 5,
        max_quantity_per_person ? parseInt(max_quantity_per_person, 10) : null,
        total_stock ? parseInt(total_stock, 10) : null,
        status === 'active' ? 'active' : 'draft',
      ]
    );

    const productId = productResult.insertId;
    const minSize = min_group_size ? parseInt(min_group_size, 10) : 5;

    for (const cfg of pickup_configs) {
      const pickupPoints = await conn.execute(
        'SELECT id, community, leader_id FROM pickup_points WHERE id = ?',
        [cfg.pickup_point_id]
      );
      const community = pickupPoints[0][0].community;

      await conn.execute(
        `INSERT INTO group_buys (product_id, pickup_point_id, leader_id, community,
                                  cutoff_time, min_people, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ongoing')`,
        [
          productId,
          cfg.pickup_point_id,
          leaderId,
          community,
          cfg.cutoff_time,
          minSize,
        ]
      );
    }

    await conn.commit();

    const products = await conn.execute(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );
    const groupBuys = await conn.execute(
      'SELECT * FROM group_buys WHERE product_id = ?',
      [productId]
    );

    conn.release();

    return success(
      res,
      {
        product: products[0][0],
        group_buys: groupBuys[0],
      },
      '团品创建成功'
    );
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('Create product error:', err);
    return error(res, '团品创建失败');
  }
}

async function getProducts(req, res) {
  const { status, category, keyword, page = 1, page_size = 10 } = req.query;
  const leaderId = req.user.id;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = 'WHERE p.leader_id = ?';
    let countSql = 'SELECT COUNT(*) as total FROM products p WHERE p.leader_id = ?';
    const params = [leaderId];
    const countParams = [leaderId];

    if (status) {
      whereSql += ' AND p.status = ?';
      countSql += ' AND p.status = ?';
      params.push(status);
      countParams.push(status);
    }
    if (category) {
      whereSql += ' AND p.category = ?';
      countSql += ' AND p.category = ?';
      params.push(category);
      countParams.push(category);
    }
    if (keyword) {
      whereSql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      countSql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw);
      countParams.push(kw, kw);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM group_buys gb WHERE gb.product_id = p.id) as group_count
       FROM products p ${whereSql}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get products error:', err);
    return error(res, '获取团品列表失败');
  }
}

async function getProductDetail(req, res) {
  const { id } = req.params;

  try {
    const products = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return notFound(res, '团品不存在');
    }

    const product = products[0];
    if (product.leader_id !== req.user.id) {
      return forbidden(res, '无权限查看此团品');
    }

    const groupBuys = await db.query(
      `SELECT gb.*, pp.name as pickup_name, pp.address as pickup_address, pp.community
       FROM group_buys gb
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       WHERE gb.product_id = ?
       ORDER BY gb.cutoff_time`,
      [id]
    );

    return success(res, {
      product,
      group_buys: groupBuys,
    });
  } catch (err) {
    console.error('Get product detail error:', err);
    return error(res, '获取团品详情失败');
  }
}

async function updateProduct(req, res) {
  const { id } = req.params;
  const {
    name,
    description,
    category,
    unit,
    price,
    image_url,
    min_group_size,
    max_quantity_per_person,
    total_stock,
    status,
  } = req.body;

  try {
    const products = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return notFound(res, '团品不存在');
    }

    if (products[0].leader_id !== req.user.id) {
      return forbidden(res, '无权限修改此团品');
    }

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category);
    }
    if (unit !== undefined) {
      fields.push('unit = ?');
      values.push(unit);
    }
    if (price !== undefined) {
      fields.push('price = ?');
      values.push(parseFloat(price));
    }
    if (image_url !== undefined) {
      fields.push('image_url = ?');
      values.push(image_url);
    }
    if (min_group_size !== undefined) {
      fields.push('min_group_size = ?');
      values.push(parseInt(min_group_size, 10));
    }
    if (max_quantity_per_person !== undefined) {
      fields.push('max_quantity_per_person = ?');
      values.push(max_quantity_per_person ? parseInt(max_quantity_per_person, 10) : null);
    }
    if (total_stock !== undefined) {
      fields.push('total_stock = ?');
      values.push(total_stock ? parseInt(total_stock, 10) : null);
    }
    if (status !== undefined) {
      if (!['draft', 'active', 'ended'].includes(status)) {
        return error(res, '状态值不正确');
      }
      fields.push('status = ?');
      values.push(status);
    }

    if (fields.length === 0) {
      return error(res, '没有需要更新的字段');
    }

    values.push(id);

    await db.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    return success(res, updated[0], '更新成功');
  } catch (err) {
    console.error('Update product error:', err);
    return error(res, '更新团品失败');
  }
}

async function deleteProduct(req, res) {
  const { id } = req.params;

  try {
    const products = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return notFound(res, '团品不存在');
    }

    if (products[0].leader_id !== req.user.id) {
      return forbidden(res, '无权限删除此团品');
    }

    const activeGroupBuys = await db.query(
      `SELECT id FROM group_buys
       WHERE product_id = ? AND status IN ('ongoing', 'success')
       LIMIT 1`,
      [id]
    );
    if (activeGroupBuys.length > 0) {
      return error(res, '该团品有进行中或已成功的拼团，无法删除');
    }

    await db.query('DELETE FROM products WHERE id = ?', [id]);

    return success(res, null, '删除成功');
  } catch (err) {
    console.error('Delete product error:', err);
    return error(res, '删除团品失败');
  }
}

async function addGroupBuy(req, res) {
  const { product_id, pickup_point_id, cutoff_time } = req.body;
  const leaderId = req.user.id;

  if (!product_id || !pickup_point_id || !cutoff_time) {
    return error(res, '团品ID、自提点ID、截单时间为必填项');
  }

  try {
    const products = await db.query(
      'SELECT * FROM products WHERE id = ? AND leader_id = ?',
      [product_id, leaderId]
    );
    if (products.length === 0) {
      return error(res, '团品不存在或不属于您');
    }

    const pickupPoints = await db.query(
      'SELECT * FROM pickup_points WHERE id = ? AND leader_id = ?',
      [pickup_point_id, leaderId]
    );
    if (pickupPoints.length === 0) {
      return error(res, '自提点不存在或不属于您');
    }

    const cutoff = new Date(cutoff_time);
    if (isNaN(cutoff.getTime())) {
      return error(res, '截单时间格式错误');
    }
    if (cutoff <= new Date()) {
      return error(res, '截单时间必须晚于当前时间');
    }

    const exists = await db.query(
      `SELECT id FROM group_buys
       WHERE product_id = ? AND pickup_point_id = ? AND status = 'ongoing'`,
      [product_id, pickup_point_id]
    );
    if (exists.length > 0) {
      return error(res, '该自提点已有进行中的拼团');
    }

    const result = await db.query(
      `INSERT INTO group_buys (product_id, pickup_point_id, leader_id, community,
                                cutoff_time, min_people, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ongoing')`,
      [
        product_id,
        pickup_point_id,
        leaderId,
        pickupPoints[0].community,
        cutoff_time,
        products[0].min_group_size,
      ]
    );

    const groupBuys = await db.query('SELECT * FROM group_buys WHERE id = ?', [result.insertId]);
    return success(res, groupBuys[0], '拼团添加成功');
  } catch (err) {
    console.error('Add group buy error:', err);
    return error(res, '添加拼团失败');
  }
}

async function getPublicProducts(req, res) {
  const { category, community, page = 1, page_size = 10 } = req.query;
  const offset = (page - 1) * page_size;

  try {
    let whereSql = `WHERE p.status = 'active' AND gb.status = 'ongoing' AND gb.cutoff_time > NOW()`;
    let countSql = `SELECT COUNT(DISTINCT p.id) as total
                    FROM products p
                    INNER JOIN group_buys gb ON p.id = gb.product_id
                    INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
                    ${whereSql}`;
    const params = [];
    const countParams = [];

    if (category) {
      whereSql += ' AND p.category = ?';
      countSql += ' AND p.category = ?';
      params.push(category);
      countParams.push(category);
    }
    if (community) {
      whereSql += ' AND pp.community = ?';
      countSql += ' AND pp.community = ?';
      params.push(community);
      countParams.push(community);
    } else if (req.user && req.user.community) {
      whereSql += ' AND pp.community = ?';
      countSql += ' AND pp.community = ?';
      params.push(req.user.community);
      countParams.push(req.user.community);
    }

    const countResult = await db.query(countSql, countParams);
    const total = countResult[0].total;

    const list = await db.query(
      `SELECT DISTINCT p.*, u.nickname as leader_name
       FROM products p
       INNER JOIN group_buys gb ON p.id = gb.product_id
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       INNER JOIN users u ON p.leader_id = u.id
       ${whereSql}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(page_size, 10), parseInt(offset, 10)]
    );

    for (const product of list) {
      product.group_buys = await db.query(
        `SELECT gb.id, gb.cutoff_time, gb.current_people, gb.min_people, gb.status,
                pp.id as pickup_point_id, pp.name as pickup_name,
                pp.address as pickup_address, pp.community
         FROM group_buys gb
         INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
         WHERE gb.product_id = ? AND gb.status = 'ongoing' AND gb.cutoff_time > NOW()
         ORDER BY gb.cutoff_time`,
        [product.id]
      );
    }

    return success(res, {
      list,
      total,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
    });
  } catch (err) {
    console.error('Get public products error:', err);
    return error(res, '获取团品列表失败');
  }
}

async function getPublicProductDetail(req, res) {
  const { id } = req.params;

  try {
    const products = await db.query(
      `SELECT p.*, u.nickname as leader_name, u.phone as leader_phone
       FROM products p
       INNER JOIN users u ON p.leader_id = u.id
       WHERE p.id = ? AND p.status IN ('active', 'ended')`,
      [id]
    );

    if (products.length === 0) {
      return notFound(res, '团品不存在');
    }

    const groupBuys = await db.query(
      `SELECT gb.id, gb.cutoff_time, gb.current_people, gb.min_people, gb.status, gb.community,
              pp.id as pickup_point_id, pp.name as pickup_name,
              pp.address as pickup_address, pp.contact_person, pp.contact_phone
       FROM group_buys gb
       INNER JOIN pickup_points pp ON gb.pickup_point_id = pp.id
       WHERE gb.product_id = ?
       ORDER BY gb.cutoff_time`,
      [id]
    );

    return success(res, {
      product: products[0],
      group_buys: groupBuys,
    });
  } catch (err) {
    console.error('Get public product detail error:', err);
    return error(res, '获取团品详情失败');
  }
}

module.exports = {
  createProduct,
  getProducts,
  getProductDetail,
  updateProduct,
  deleteProduct,
  addGroupBuy,
  getPublicProducts,
  getPublicProductDetail,
};
