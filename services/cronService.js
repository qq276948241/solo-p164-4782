const cron = require('node-cron');
const db = require('../config/db');

async function processExpiredGroupBuys() {
  console.log(`[${new Date().toISOString()}] 开始执行截单检查...`);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [expiredGroupBuys] = await conn.execute(
      `SELECT gb.* FROM group_buys gb
       WHERE gb.status = 'ongoing' AND gb.cutoff_time <= NOW()
       FOR UPDATE`,
      []
    );

    if (expiredGroupBuys.length === 0) {
      await conn.commit();
      console.log(`[${new Date().toISOString()}] 无需要处理的拼团`);
      return;
    }

    console.log(`[${new Date().toISOString()}] 发现 ${expiredGroupBuys.length} 个待处理拼团`);

    for (const gb of expiredGroupBuys) {
      const [userCountResult] = await conn.execute(
        `SELECT COUNT(DISTINCT user_id) as cnt
         FROM orders
         WHERE group_buy_id = ? AND status IN ('pending', 'confirmed')`,
        [gb.id]
      );
      const actualPeople = userCountResult[0].cnt;

      if (actualPeople >= gb.min_people) {
        await conn.execute(
          `UPDATE group_buys SET status = 'success', current_people = ? WHERE id = ?`,
          [actualPeople, gb.id]
        );

        await conn.execute(
          `UPDATE orders SET status = 'confirmed'
           WHERE group_buy_id = ? AND status = 'pending'`,
          [gb.id]
        );

        console.log(`拼团 ${gb.id} 凑够人数(${actualPeople}/${gb.min_people})，拼团成功`);
      } else {
        await conn.execute(
          `UPDATE group_buys SET status = 'failed', current_people = ? WHERE id = ?`,
          [actualPeople, gb.id]
        );

        await conn.execute(
          `UPDATE orders SET status = 'cancelled',
                  cancelled_at = NOW(),
                  cancel_reason = '拼团人数不足，拼团失败自动取消'
           WHERE group_buy_id = ? AND status IN ('pending', 'confirmed')`,
          [gb.id]
        );

        console.log(`拼团 ${gb.id} 人数不足(${actualPeople}/${gb.min_people})，拼团失败，订单自动取消`);
      }
    }

    const allProductIds = [...new Set(expiredGroupBuys.map((g) => g.product_id))];
    for (const pid of allProductIds) {
      const [activeCount] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM group_buys WHERE product_id = ? AND status = 'ongoing'`,
        [pid]
      );
      if (activeCount[0].cnt === 0) {
        await conn.execute(
          `UPDATE products SET status = 'ended' WHERE id = ? AND status = 'active'`,
          [pid]
        );
        console.log(`团品 ${pid} 所有拼团已处理，团品状态更新为已结束`);
      }
    }

    await conn.commit();
    console.log(`[${new Date().toISOString()}] 截单处理完成`);
  } catch (err) {
    await conn.rollback();
    console.error(`[${new Date().toISOString()}] 处理截单拼团出错:`, err);
  } finally {
    conn.release();
  }
}

async function refreshGroupBuyCurrentPeople() {
  try {
    const [ongoingGroupBuys] = await db.query(
      `SELECT id FROM group_buys WHERE status = 'ongoing'`
    );

    for (const gb of ongoingGroupBuys) {
      const [stats] = await db.query(
        `SELECT COUNT(DISTINCT user_id) as people_count FROM orders
         WHERE group_buy_id = ? AND status IN ('pending', 'confirmed', 'completed')`,
        [gb.id]
      );
      await db.query(
        `UPDATE group_buys SET current_people = ? WHERE id = ?`,
        [stats[0].people_count, gb.id]
      );
    }

    if (ongoingGroupBuys.length > 0) {
      console.log(`[${new Date().toISOString()}] 刷新了 ${ongoingGroupBuys.length} 个拼团的人数`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] 刷新拼团人数出错:`, err);
  }
}

function startCronJobs() {
  cron.schedule('* * * * *', () => {
    processExpiredGroupBuys().catch((e) => console.error(e));
  });

  cron.schedule('*/5 * * * *', () => {
    refreshGroupBuyCurrentPeople().catch((e) => console.error(e));
  });

  console.log('[Cron] 定时任务已启动：');
  console.log('[Cron]   - 每分钟检查过期拼团并处理');
  console.log('[Cron]   - 每5分钟刷新拼团人数统计');

  setTimeout(() => {
    processExpiredGroupBuys().catch((e) => console.error(e));
  }, 3000);
}

module.exports = {
  startCronJobs,
  processExpiredGroupBuys,
  refreshGroupBuyCurrentPeople,
};
