# 评价功能使用说明

> 本文档给新同事看的，读完不用读代码也能搞清楚评价功能怎么用、怎么调。

---

## 一、整体设计思路

社区团购的评价功能，核心目标是：**居民拿到货后，可以对买过的商品打分写评价，供其他居民参考，团长也能看到自己商品的口碑。**

设计上有几条硬规则，是产品层面必须遵守的：

| 规则 | 原因 |
|---|---|
| **订单必须是「已完成」才能评价** | 没收到货就不能评，防止虚假评价 |
| **一个订单 + 一个商品只能评一次** | 防止刷好评/恶意差评 |
| **只能评价自己下的订单** | 不能帮别人评，也不能评别人的单 |
| **评价一旦提交就不能修改** | 简单可靠，避免改来改去扯皮 |

---

## 二、数据表设计

数据库只加了一张表 `reviews`，和 `orders`、`products`、`users` 三张表关联。

### 2.1 reviews 表结构

| 字段名 | 类型 | 说明 | 约束 |
|---|---|---|---|
| `id` | INT | 主键，自增 | PRIMARY KEY |
| `order_id` | INT | 订单ID（关联 orders.id） | NOT NULL, 外键 |
| `product_id` | INT | 商品ID（关联 products.id） | NOT NULL, 外键 |
| `user_id` | INT | 评价的用户ID（关联 users.id） | NOT NULL, 外键 |
| `rating` | TINYINT | 评分，1~5星 | NOT NULL |
| `content` | TEXT | 文字评价内容，可空 | 最多1000字 |
| `created_at` | DATETIME | 评价时间 | 默认当前时间 |

**索引：**

| 索引名 | 字段 | 用途 |
|---|---|---|
| `uk_order_product` | `(order_id, product_id)` | **唯一索引**，防止一单同一商品重复评价（并发最后防线） |
| `idx_product` | `product_id` | 按商品查评价时加速 |
| `idx_user` | `user_id` | 按用户查评价时加速 |
| `idx_rating` | `rating` | 按评分筛选时加速 |
| `idx_created` | `created_at` | 按时间排序时加速 |

> **注意**：如果你的数据库是之前初始化的（还没有唯一索引），请执行迁移脚本：
> ```bash
> mysql -u root -p < database/migrations/001_add_reviews_unique_index.sql
> ```

---

## 三、接口列表（4个）

所有评价接口都挂在 `/api/review` 前缀下。
所有接口都需要传 Token：`Authorization: Bearer <你的token>`。

统一响应格式：
```json
{
  "code": 0,       // 0=成功，非0=各种错误码
  "message": "xxx",
  "data": { ... }  // 具体数据
}
```

---

### 3.1 提交评价

> **适合场景**：居民自提拿到货，确认没问题，给商品打个分写两句话。

| 项目 | 内容 |
|---|---|
| **方法** | `POST` |
| **路径** | `/api/review` |
| **权限** | 登录用户（居民自己的订单） |

**请求体（Body）：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `order_id` | Number | ✅ 是 | 要评价的订单ID |
| `rating` | Number | ✅ 是 | 评分，**只能是 1、2、3、4、5 的整数** |
| `content` | String | ❌ 否 | 文字评价，最多1000字 |

**请求示例：**
```bash
curl -X POST http://localhost:3000/api/review \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 10,
    "rating": 5,
    "content": "番茄很新鲜，下次还买！"
  }'
```

**成功响应（code=0）：**
```json
{
  "code": 0,
  "message": "评价提交成功",
  "data": {
    "id": 3,
    "order_id": 10,
    "product_id": 1,
    "user_id": 4,
    "rating": 5,
    "content": "番茄很新鲜，下次还买！",
    "created_at": "2026-06-28T10:30:00.000Z",
    "user_nickname": "张阿姨"
  }
}
```

**常见错误码：**

| code | message | 说明 |
|---|---|---|
| 40001 | 订单ID和评分为必填项 | 少传了 order_id 或 rating |
| 42401 | 评分必须是1到5之间的整数 | rating 传了0、6或小数 |
| 42402 | 评价内容不能超过1000字 | content 太长了 |
| 40402 | 订单不存在 | order_id 错了 |
| 40302 | 无权限评价此订单 | 不是你自己的订单 |
| 42205 | 订单尚未完成，暂不能评价 | 订单还没到 completed 状态（见第五节） |
| 40902 | 该订单已评价过，不能重复评价 | 别刷了，一单只能评一次 |

---

### 3.2 查询某个商品下的所有评价

> **适合场景**：居民点进商品详情页，想看看买过的人怎么说。

| 项目 | 内容 |
|---|---|
| **方法** | `GET` |
| **路径** | `/api/review/product/:product_id` |
| **权限** | 登录用户（团长/居民都能看） |

**路径参数：**

| 字段 | 说明 |
|---|---|
| `product_id` | 商品ID（团品ID） |

**Query 参数（选填，用于分页/筛选）：**

| 字段 | 默认值 | 说明 |
|---|---|---|
| `page` | 1 | 页码，从1开始 |
| `page_size` | 10 | 每页多少条 |
| `min_rating` | 空 | 最低评分（比如传 4 表示只看 4 星 5 星的） |
| `max_rating` | 空 | 最高评分（比如传 2 表示只看 1 星 2 星的差评） |

**请求示例：**
```bash
# 查商品1的评价，第1页，每页5条，只看4星以上
curl "http://localhost:3000/api/review/product/1?page=1&page_size=5&min_rating=4" \
  -H "Authorization: Bearer <token>"
```

**成功响应（code=0）：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "order_id": 5,
        "product_id": 1,
        "user_id": 2,
        "rating": 5,
        "content": "超级新鲜，下次还买！",
        "created_at": "2026-06-27T12:00:00.000Z",
        "user_nickname": "李大爷",
        "order_id": 5,
        "quantity": 2,
        "order_created_at": "2026-06-26T08:30:00.000Z"
      },
      {
        "id": 2,
        "order_id": 8,
        "product_id": 1,
        "user_id": 3,
        "rating": 4,
        "content": "不错，就是量少了点",
        "created_at": "2026-06-27T14:20:00.000Z",
        "user_nickname": "王阿姨",
        "order_id": 8,
        "quantity": 1,
        "order_created_at": "2026-06-26T09:10:00.000Z"
      }
    ],
    "total": 23,          // 总共有多少条评价
    "page": 1,            // 当前页码
    "page_size": 5,       // 每页大小
    "stats": {            // 评价统计
      "total_count": 23,  // 总条数
      "avg_rating": 4.7,  // 平均分（保留1位小数）
      "rating_distribution": {
        "5": 18,          // 5星多少条
        "4": 3,           // 4星多少条
        "3": 1,           // 3星多少条
        "2": 0,           // 2星多少条
        "1": 1            // 1星多少条
      }
    }
  }
}
```

**常见错误码：**

| code | message | 说明 |
|---|---|---|
| 40403 | 商品不存在 | product_id 错了 |

---

### 3.3 查询某个订单的评价状态

> **适合场景**：订单详情页上显示"去评价"还是"查看评价"按钮，前端需要知道这个单有没有评过、能不能评。

| 项目 | 内容 |
|---|---|
| **方法** | `GET` |
| **路径** | `/api/review/order/:order_id` |
| **权限** | 登录用户（订单本人 / 团长都能看） |

**路径参数：**

| 字段 | 说明 |
|---|---|
| `order_id` | 订单ID |

**请求示例：**
```bash
curl "http://localhost:3000/api/review/order/10" \
  -H "Authorization: Bearer <token>"
```

**成功响应（code=0）：**

**情况一：订单已完成，还没评价（本人查）**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order_id": 10,
    "order_status": "completed",   // 订单当前状态
    "can_review": true,            // ✅ 可以点「去评价」按钮
    "has_reviewed": false,         // ❌ 还没评过
    "review": null                 // 没有评价内容
  }
}
```

**情况二：已经评价过了**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order_id": 5,
    "order_status": "completed",
    "can_review": false,           // ❌ 不能再评
    "has_reviewed": true,          // ✅ 已经评过
    "review": {                    // 显示评价内容
      "id": 1,
      "rating": 5,
      "content": "超级新鲜，下次还买！",
      "created_at": "2026-06-27T12:00:00.000Z",
      "user_nickname": "李大爷"
    }
  }
}
```

**情况三：订单还没完成（比如刚下单 or 拼团中）**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order_id": 20,
    "order_status": "pending",      // 订单还在待确认
    "can_review": false,            // ❌ 不能评价
    "has_reviewed": false,
    "review": null
  }
}
```

**前端按钮逻辑参考：**
- `can_review === true` → 显示「去评价」按钮（蓝底）
- `has_reviewed === true` → 显示「查看评价」按钮（灰底）
- 两个都是 false → 显示灰色的「订单完成后可评价」占位

**常见错误码：**

| code | message | 说明 |
|---|---|---|
| 40402 | 订单不存在 | order_id 错了 |
| 40302 | 无权限查看此订单的评价状态 | 不是你的单也不是团长 |

---

### 3.4 团长查看自己所有商品的评价

> **适合场景**：团长后台「商品评价」Tab，看看居民怎么说。

| 项目 | 内容 |
|---|---|
| **方法** | `GET` |
| **路径** | `/api/review/leader/all` |
| **权限** | **仅限团长**（token 里的 role 必须是 leader） |

**Query 参数（选填）：**

| 字段 | 默认值 | 说明 |
|---|---|---|
| `page` | 1 | 页码 |
| `page_size` | 10 | 每页大小 |
| `product_id` | 空 | 只看某个商品的评价（不传就看全部） |

**请求示例：**
```bash
# 团长看自己所有评价
curl "http://localhost:3000/api/review/leader/all?page=1&page_size=20" \
  -H "Authorization: Bearer <团长token>"

# 团长只看商品1的评价
curl "http://localhost:3000/api/review/leader/all?product_id=1" \
  -H "Authorization: Bearer <团长token>"
```

**成功响应（code=0）：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "order_id": 5,
        "product_id": 1,
        "product_name": "新鲜番茄 500g",
        "product_image": "https://xxx/tomato.jpg",
        "user_id": 2,
        "user_nickname": "李大爷",
        "rating": 5,
        "content": "超级新鲜，下次还买！",
        "created_at": "2026-06-27T12:00:00.000Z",
        "order_id": 5,
        "quantity": 2
      }
    ],
    "total": 46,
    "page": 1,
    "page_size": 20
  }
}
```

**常见错误码：**

| code | message | 说明 |
|---|---|---|
| 40100 | 未授权或token已过期 | token 没传或失效了 |
| 40301 | 角色无权限执行此操作 | 你不是团长，别看这个接口 |

---

## 四、权限校验逻辑

### 4.1 谁能调哪个接口？

| 接口 | 居民 | 团长 | 访客（没token） |
|---|---|---|---|
| POST /api/review（提交评价） | ✅ **自己的订单**且已完成 | ❌ 不行 | ❌ 不行 |
| GET /api/review/product/:id（查商品评价） | ✅ 所有商品 | ✅ 所有商品 | ❌ 不行 |
| GET /api/review/order/:id（查订单评价状态） | ✅ **自己的订单** | ✅ **所有订单**（团长要能看买家评没评） | ❌ 不行 |
| GET /api/review/leader/all（团长看评价） | ❌ 不行 | ✅ 自己商品下的所有评价 | ❌ 不行 |

### 4.2 提交评价的 3 层权限校验（防越权）

为了防止有人伪造请求去评价别人的订单，后端做了三层校验：

```
第1层：取到订单后立即比对 order.user_id === 当前用户ID
第2层：插入前再显式比对一次 order.user_id === 当前用户ID
第3层：INSERT ... SELECT WHERE o.user_id = ?
       ↳ 插入语句里直接在数据库层卡，如果不是本人 0 行受影响
```

---

## 五、评价与订单状态的联动

### 5.1 订单状态流转

一个订单从创建到能评价，要经过这些状态：

```
pending（待确认/拼团中）
  ↓ 团长确认
confirmed（已确认/备货中）
  ↓ 团长标记自提完成
completed（已完成）✅ ← 只有到这一步才能评价！
```

只要订单还没到 `completed`，调「提交评价」接口就会报错：
```json
{ "code": 42205, "message": "订单尚未完成，暂不能评价" }
```

### 5.2 评价后订单状态不变

评价只是写 `reviews` 表，**不会反过来改订单的状态**。订单一旦 `completed`，不管评没评，状态都停在 `completed`。

---

## 六、并发防护（手抖连点两下怎么办？）

这是重点！居民手快点两下「提交评价」，不能让数据库出现两条一样的评价。

我们做了 **5 层防护 + 数据库最后防线**，一层比一层硬核：

```
用户点两下按钮
  ↓
┌─ 第1层：前端建议做防抖（按钮点了就 disabled）
│
├─ 第2层：事务开始时 SELECT orders ... FOR UPDATE
│         ↳ 订单行加锁，两个请求排队处理
│
├─ 第3层：SELECT reviews ... FOR UPDATE
│         ↳ 查是否已有评价，同时加行锁防幻读
│
├─ 第4层：INSERT ... SELECT WHERE o.user_id = ?
│         ↳ 单条 SQL 原子插入，校验归属
│
├─ 第5层：后端代码捕获 ER_DUP_ENTRY 错误
│         ↳ 如果真走到这一步，转成"已评价过"提示返回
│
└─ 最终防线：数据库唯一索引 uk_order_product (order_id, product_id)
           ↳ 任何时候都插不进两条相同 order_id + product_id 的记录
```

**实际效果**：用户点 100 下也只会有第一条成功，后面的都收到：
```json
{ "code": 40902, "message": "该订单已评价过，不能重复评价" }
```

> 💡 **前端也建议加防抖**：按钮点击后立即 disabled，等接口返回再恢复，减少无意义请求，用户体验更好。

---

## 七、完整调用链路示例（从下单到评价）

给一个完整的业务流程参考，方便你联调测试：

```bash
# 1. 居民登录拿 token
curl -X POST /api/auth/login -d '{"username":"resident01","password":"123456"}'

# 2. 下单（拼团成功后，团长那边操作）
curl -X POST /api/order -H "Authorization: Bearer <token>" \
  -d '{"group_buy_id": 1, "quantity": 2}'
# 假设返回 order.id = 10

# 3. 团长确认订单 + 完成自提
curl -X POST /api/order/10/confirm  -H "Authorization: Bearer <团长token>"
curl -X POST /api/order/10/complete -H "Authorization: Bearer <团长token>"
# 现在 order.status = completed，可以评价了

# 4. 查一下订单能不能评价（可选，前端做按钮状态用）
curl /api/review/order/10 -H "Authorization: Bearer <token>"
# data.can_review 应该是 true

# 5. 提交评价 ✅
curl -X POST /api/review -H "Authorization: Bearer <token>" \
  -d '{"order_id": 10, "rating": 5, "content": "好！"}'

# 6. 再查一次订单评价状态
curl /api/review/order/10 -H "Authorization: Bearer <token>"
# data.has_reviewed 变成 true，review 里有内容

# 7. 再点一次提交（模拟连点）
curl -X POST /api/review -H "Authorization: Bearer <token>" \
  -d '{"order_id": 10, "rating": 5, "content": "再刷一遍！"}'
# 返回 40902：该订单已评价过，不能重复评价

# 8. 居民逛商品，看评价
curl /api/review/product/1?page=1&page_size=10 -H "Authorization: Bearer <token>"
# 能看到刚才那条评价 + 平均分 + 星级分布
```

---

## 八、代码结构（有兴趣读代码的话）

评价功能分成 4 层，每层做自己的事：

| 文件 | 做什么 | 不该做什么 |
|---|---|---|
| `routes/review.js` | 定义 URL、挂载中间件（鉴权） | 不写业务逻辑 |
| `controllers/reviewController.js` | 接收参数、调用 service、组装响应 | **不直接写 SQL** |
| `services/reviewService.js` | 所有业务校验 + SQL + 事务 | 不碰 req/res |
| `config/db.js` | 数据库连接池 | 不写业务 |

如果以后要加功能（比如评价点赞、团长回复评价、商家申诉删除评价等），业务逻辑往 `reviewService.js` 里加就好，路由和控制器很薄，基本不用动。

---

## 九、错误码速查表

评价功能可能遇到的所有错误，一次列全：

| code | message | 什么时候出 |
|---|---|---|
| 0 | success | 正常成功 |
| 40001 | 缺少必要参数 | 提交评价时 order_id 或 rating 没传 |
| 40100 | 未授权或token已过期 | 没传 Token 或过期了 |
| 40301 | 角色无权限执行此操作 | 居民调团长专属接口 |
| 40302 | 无权限操作该资源 | 评价/查看别人的订单 |
| 40402 | 订单不存在 | order_id 错了 |
| 40403 | 商品不存在 | product_id 错了 |
| 40902 | 该订单已评价过，不能重复评价 | 重复提交评价 |
| 42205 | 订单尚未完成，暂不能评价 | 订单还没 completed 就想评 |
| 42401 | 评分必须是1到5之间的整数 | rating 传了 0/6/小数 |
| 42402 | 评价内容不能超过1000字 | 评价写太长了 |
| 50001 | 数据库操作失败 | 数据库挂了或 SQL 异常 |

---

OK，到这应该就全了。如果有疑问或者要加功能，直接问后端同学就好 😄
