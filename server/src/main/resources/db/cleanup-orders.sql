-- ============================================================================
--  清理旧订单（2026-10-28 订单结算改造配套）
--
--  【背景】本改造把订单状态机改成「商家接单/发货 → 买家确认收货 → 已完成并结算」，
--          旧流程里由商家「核销」推进的体验/住宿/农事订单不再符合新逻辑，
--          演示时会与新流程混在一起，造成「同一张表两种状态语义」的误解。
--
--  【清理范围】只删 **不符合新购买逻辑的预约类订单**：
--            category ∈ (study, homestay, experience) 且满足以下任一：
--              · status = 'used'                                            旧核销态
--              · category ∈ (study, experience) 且 bookingSlot IS NULL       缺场次
--              · category = 'homestay' 且 (checkOutDate IS NULL OR roomType IS NULL)  缺离店/房型
--
--  【保留】全部实物订单（category = 'goods'），无论状态 —— 实物流程与新的履约模型一致。
--
--  【级联处理】按依赖倒序：
--            1. settlements      结算流水
--            2. notifications    处理结果通知
--            3. chatMessages     只把 orderId 置 NULL（保留聊天记录，不删消息）
--            4. reports          只把 orderId 置 NULL（保留举报，不删记录）
--            5. orderLogs        订单操作日志
--            6. orders           主表
--
--  【幂等】全部按「判定条件」删除/更新，不依赖固定 id 列表；重复执行第二次影响 0 行。
--  【备份】执行前请先跑 tools/cleanup-orders.js —— 它会把待删数据导出到 logs/orders-backup-*.json。
--
--  ⚠ 本脚本【不会】被 DatabaseBootstrap 自动执行，必须显式运行：
--       node tools/cleanup-orders.js --apply
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 预览：待清理订单清单（先看再删）
-- ---------------------------------------------------------------------------
SELECT id, category, status, buyerName, productName, amount, createdAt
FROM orders
WHERE category IN ('study', 'homestay', 'experience')
  AND (
        status = 'used'
     OR (category IN ('study', 'experience') AND (bookingSlot IS NULL OR bookingSlot = ''))
     OR (category = 'homestay' AND (checkOutDate IS NULL OR checkOutDate = ''
                                    OR roomType IS NULL OR roomType = ''))
  )
ORDER BY seq;

-- ---------------------------------------------------------------------------
-- 1. settlements：删掉待清理订单的结算流水
-- ---------------------------------------------------------------------------
DELETE s FROM settlements s
JOIN orders o ON o.id = s.orderId
WHERE o.category IN ('study', 'homestay', 'experience')
  AND (
        o.status = 'used'
     OR (o.category IN ('study', 'experience') AND (o.bookingSlot IS NULL OR o.bookingSlot = ''))
     OR (o.category = 'homestay' AND (o.checkOutDate IS NULL OR o.checkOutDate = ''
                                      OR o.roomType IS NULL OR o.roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 2. notifications：删掉指向这些订单的处理结果通知
-- ---------------------------------------------------------------------------
DELETE n FROM notifications n
JOIN orders o ON o.id = n.refId
WHERE n.type = 'order'
  AND o.category IN ('study', 'homestay', 'experience')
  AND (
        o.status = 'used'
     OR (o.category IN ('study', 'experience') AND (o.bookingSlot IS NULL OR o.bookingSlot = ''))
     OR (o.category = 'homestay' AND (o.checkOutDate IS NULL OR o.checkOutDate = ''
                                      OR o.roomType IS NULL OR o.roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 3. chatMessages：只解除订单卡引用，保留消息本身
--    （删消息会让「聊天记录」凭空消失，用户会以为丢数据）
-- ---------------------------------------------------------------------------
UPDATE chatMessages c
JOIN orders o ON o.id = c.orderId
SET c.orderId = NULL,
    c.text = CONCAT(COALESCE(c.text, ''), '（原关联订单已按新订单流程清理）')
WHERE o.category IN ('study', 'homestay', 'experience')
  AND (
        o.status = 'used'
     OR (o.category IN ('study', 'experience') AND (o.bookingSlot IS NULL OR o.bookingSlot = ''))
     OR (o.category = 'homestay' AND (o.checkOutDate IS NULL OR o.checkOutDate = ''
                                      OR o.roomType IS NULL OR o.roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 4. reports：只解除举报的关联订单，保留举报与处理结果
-- ---------------------------------------------------------------------------
UPDATE reports r
JOIN orders o ON o.id = r.orderId
SET r.orderId = NULL,
    r.updatedAt = DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s'),
    r.notice = CONCAT(COALESCE(r.notice, ''), '（原关联订单已按新订单流程清理）')
WHERE o.category IN ('study', 'homestay', 'experience')
  AND (
        o.status = 'used'
     OR (o.category IN ('study', 'experience') AND (o.bookingSlot IS NULL OR o.bookingSlot = ''))
     OR (o.category = 'homestay' AND (o.checkOutDate IS NULL OR o.checkOutDate = ''
                                      OR o.roomType IS NULL OR o.roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 5. orderLogs：删掉这些订单的操作日志
-- ---------------------------------------------------------------------------
DELETE l FROM orderLogs l
JOIN orders o ON o.id = l.orderId
WHERE o.category IN ('study', 'homestay', 'experience')
  AND (
        o.status = 'used'
     OR (o.category IN ('study', 'experience') AND (o.bookingSlot IS NULL OR o.bookingSlot = ''))
     OR (o.category = 'homestay' AND (o.checkOutDate IS NULL OR o.checkOutDate = ''
                                      OR o.roomType IS NULL OR o.roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 6. orders：删主表
-- ---------------------------------------------------------------------------
DELETE FROM orders
WHERE category IN ('study', 'homestay', 'experience')
  AND (
        status = 'used'
     OR (category IN ('study', 'experience') AND (bookingSlot IS NULL OR bookingSlot = ''))
     OR (category = 'homestay' AND (checkOutDate IS NULL OR checkOutDate = ''
                                    OR roomType IS NULL OR roomType = ''))
  );

-- ---------------------------------------------------------------------------
-- 7. 校验：不应存在孤儿数据
-- ---------------------------------------------------------------------------
SELECT 'orphan_orderLogs' AS chk, COUNT(*) AS n FROM orderLogs l
  LEFT JOIN orders o ON o.id = l.orderId WHERE o.id IS NULL
UNION ALL
SELECT 'orphan_settlements', COUNT(*) FROM settlements s
  LEFT JOIN orders o ON o.id = s.orderId WHERE o.id IS NULL
UNION ALL
SELECT 'orphan_chatOrder', COUNT(*) FROM chatMessages c
  LEFT JOIN orders o ON o.id = c.orderId WHERE c.orderId IS NOT NULL AND o.id IS NULL
UNION ALL
SELECT 'orphan_reportOrder', COUNT(*) FROM reports r
  LEFT JOIN orders o ON o.id = r.orderId WHERE r.orderId IS NOT NULL AND o.id IS NULL;
