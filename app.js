require('dotenv').config();

const express = require('express');
const cors = require('cors');
const config = require('./config');
const { error } = require('./utils/response');
const { startCronJobs } = require('./services/cronService');

const authRoutes = require('./routes/auth');
const pickupRoutes = require('./routes/pickup');
const productRoutes = require('./routes/product');
const orderRoutes = require('./routes/order');
const groupBuyRoutes = require('./routes/groupBuy');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: '社区团购后端 API 服务',
    data: {
      version: '1.0.0',
      endpoints: {
        auth: {
          register: 'POST /api/auth/register',
          login: 'POST /api/auth/login',
          profile: 'GET /api/auth/profile',
          update_profile: 'PUT /api/auth/profile',
        },
        pickup_points: {
          public_list: 'GET /api/pickup/public',
          create: 'POST /api/pickup (leader)',
          list: 'GET /api/pickup (leader)',
          detail: 'GET /api/pickup/:id (leader)',
          update: 'PUT /api/pickup/:id (leader)',
          delete: 'DELETE /api/pickup/:id (leader)',
        },
        products: {
          public_list: 'GET /api/product/public',
          public_detail: 'GET /api/product/public/:id',
          create: 'POST /api/product (leader)',
          list: 'GET /api/product (leader)',
          detail: 'GET /api/product/:id (leader)',
          update: 'PUT /api/product/:id (leader)',
          delete: 'DELETE /api/product/:id (leader)',
          add_group_buy: 'POST /api/product/group-buy (leader)',
        },
        orders: {
          create: 'POST /api/order',
          my_orders: 'GET /api/order/my',
          detail: 'GET /api/order/:id',
          cancel: 'POST /api/order/:id/cancel',
          leader_list: 'GET /api/order/leader/all (leader)',
          confirm: 'POST /api/order/:id/confirm (leader)',
          complete: 'POST /api/order/:id/complete (leader)',
        },
        group_buys: {
          progress: 'GET /api/group-buy/progress/:id',
          my_community: 'GET /api/group-buy/my-community',
          my_joined: 'GET /api/group-buy/my-joined',
          leader_list: 'GET /api/group-buy/leader/all (leader)',
        },
      },
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/pickup', pickupRoutes);
app.use('/api/product', productRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/group-buy', groupBuyRoutes);

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null,
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return error(res, '服务器内部错误', 500, 500);
});

const PORT = config.port;

app.listen(PORT, async () => {
  console.log(`\n========================================`);
  console.log(`  社区团购后端 API 服务已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  访问: http://localhost:${PORT}`);
  console.log(`========================================\n`);

  try {
    const { query } = require('./config/db');
    await query('SELECT 1');
    console.log('[DB] 数据库连接成功');
  } catch (err) {
    console.error('[DB] 数据库连接失败:', err.message);
    console.error('[DB] 请检查 .env 中的数据库配置并确认 MySQL 服务已启动');
    console.error('[DB] 可使用 database/init.sql 初始化数据库');
  }

  try {
    startCronJobs();
  } catch (err) {
    console.error('[Cron] 定时任务启动失败:', err.message);
  }
});

module.exports = app;
