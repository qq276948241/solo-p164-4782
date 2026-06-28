USE community_group_buy;

-- 迁移脚本 001：为 reviews 表添加唯一索引，防止重复评价
-- 执行方式：mysql -u root -p < database/migrations/001_add_reviews_unique_index.sql

-- 尝试添加唯一索引，如果已存在则会报 1061 错误，可忽略
-- 注意：如果表中已存在重复数据，请先手动清理后再执行

ALTER IGNORE TABLE reviews ADD UNIQUE KEY IF NOT EXISTS uk_order_product (order_id, product_id);

-- 验证索引是否存在
SELECT
    CASE
        WHEN COUNT(*) > 0 THEN '索引 uk_order_product 已存在'
        ELSE '警告：索引 uk_order_product 未创建成功，请手动检查'
    END AS status
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name = 'reviews'
  AND index_name = 'uk_order_product';

-- 显示完整索引信息
SHOW INDEX FROM reviews WHERE Key_name = 'uk_order_product';
