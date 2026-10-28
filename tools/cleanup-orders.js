/*
 * 清理旧订单 —— 订单结算改造（2026-10-28）配套脚本
 *
 * 用法：
 *   node tools/cleanup-orders.js            # 只预览（默认，安全）
 *   node tools/cleanup-orders.js --apply    # 备份后执行删除
 *
 * 为什么单独写脚本而不是让服务启动时自动跑：
 *   删数据是不可逆操作，绝不能藏在启动链路里。必须人工显式执行。
 *
 * 为什么用 mysql 客户端而不是 JDBC：
 *   项目零依赖约束，本机 mysql CLI 已验证可用；脚本不引入任何 npm 包。
 *
 * 幂等性：所有删除都按「判定条件」而不是固定 id 列表，重复执行第二次影响 0 行。
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const MYSQL = process.env.MYSQL_BIN || 'C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysql.exe';
const DB = 'zhanqi_cloud';

/** 待清理订单的判定条件 —— 与 cleanup-orders.sql 保持完全一致 */
const COND = `category IN ('study', 'homestay', 'experience')
  AND (
        status = 'used'
     OR (category IN ('study', 'experience') AND (bookingSlot IS NULL OR bookingSlot = ''))
     OR (category = 'homestay' AND (checkOutDate IS NULL OR checkOutDate = ''
                                    OR roomType IS NULL OR roomType = ''))
  )`;

function readPassword() {
  const cfgPath = path.join(ROOT, 'config', 'application.yml');
  if (!fs.existsSync(cfgPath)) { return ''; }
  const cfg = fs.readFileSync(cfgPath, 'utf8');
  const m = /^\s*password:\s*"?([^"\r\n]+)"?\s*$/m.exec(cfg);
  return m ? m[1].trim() : '';
}

function mysql(args, input) {
  const r = spawnSync(MYSQL, args.concat([DB]), {
    env: Object.assign({}, process.env, { MYSQL_PWD: readPassword() }),
    input: input,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (r.error) { throw r.error; }
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function q(sql) { return mysql(['-h', '127.0.0.1', '-P', '3306', '-uroot', '-N', '-B',
  '--default-character-set=utf8mb4', '-e', sql]); }

(function main() {
  console.log('');
  console.log('战旗云 · 旧订单清理   ' + (APPLY ? '【执行模式】' : '【仅预览，不删任何数据】'));
  console.log('数据库：' + DB + '    MySQL：' + MYSQL);
  console.log('');

  // ── 1. 预览清单 ──────────────────────────────────────────────
  const preview = q('SELECT id, category, status, buyerName, productName, amount, createdAt FROM orders WHERE ' + COND + ' ORDER BY seq;');
  if (preview.code !== 0) {
    console.log('[失败] 查询待清理订单出错：' + preview.err);
    process.exit(1);
  }
  const rows = preview.out ? preview.out.split('\n').map(function (l) { return l.split('\t'); }) : [];
  console.log('待清理订单：' + rows.length + ' 笔');
  if (rows.length) {
    console.log('  id\t分类\t状态\t买家\t商品\t金额');
    rows.slice(0, 50).forEach(function (r) {
      console.log('  ' + r[0] + '\t' + r[1] + '\t' + r[2] + '\t' + r[3] + '\t' + r[4] + '\t' + r[5]);
    });
    if (rows.length > 50) { console.log('  … 其余 ' + (rows.length - 50) + ' 笔省略'); }
  }

  // 保留预览：实物订单一律不动
  const keep = q("SELECT COUNT(*) FROM orders WHERE category = 'goods';");
  console.log('');
  console.log('保留（实物订单，不受影响）：' + (keep.out || '0') + ' 笔');
  console.log('保留（已符合新流程的预约订单）：' +
    ((q('SELECT COUNT(*) FROM orders WHERE ' + COND.replace(/^/, 'NOT (') + ') AND category <> \'goods\';').out) || '0') + ' 笔');

  if (!rows.length) {
    console.log('');
    console.log('没有需要清理的订单，脚本结束（幂等：重复执行结果一致）。');
    return;
  }

  // ── 2. 备份 ─────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupPath = path.join(ROOT, 'logs', 'orders-backup-' + stamp + '.json');
  const full = q('SELECT * FROM orders WHERE ' + COND + ';');
  // -N -B 输出是制表符分隔；这里按列名重建一份 JSON，便于人工核对
  const cols = q('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'orders\' ORDER BY ORDINAL_POSITION;')
    .out.split('\n').filter(Boolean);
  const objects = full.out ? full.out.split('\n').map(function (line) {
    const cells = line.split('\t');
    const obj = {};
    cols.forEach(function (c, i) { obj[c] = cells[i] === undefined ? null : cells[i]; });
    return obj;
  }) : [];
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(objects, null, 2), 'utf8');
  console.log('');
  console.log('已备份待删订单到：' + path.relative(ROOT, backupPath) + '（' + objects.length + ' 条，logs/ 已 gitignore）');

  // 同时把可复现的删除 SQL 落盘，便于人工复核
  const sqlPreview = path.join(ROOT, 'logs', 'cleanup-preview-' + stamp + '.sql');
  fs.writeFileSync(sqlPreview,
    '-- 由 tools/cleanup-orders.js 生成，待清理订单 id 清单\n' +
    '-- 判定条件：' + COND.replace(/\n/g, ' ') + '\n' +
    rows.map(function (r) { return "-- '" + r[0] + "' " + r[1] + ' ' + r[2] + ' ' + r[4]; }).join('\n') + '\n',
    'utf8');
  console.log('已生成待删清单：' + path.relative(ROOT, sqlPreview));

  if (!APPLY) {
    console.log('');
    console.log('当前是预览模式，未删除任何数据。确认无误后执行：');
    console.log('  node tools/cleanup-orders.js --apply');
    return;
  }

  // ── 3. 执行删除（与 cleanup-orders.sql 完全同一套语句） ─────
  const scriptPath = path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'cleanup-orders.sql');
  if (!fs.existsSync(scriptPath)) {
    console.log('[失败] 找不到 cleanup-orders.sql');
    process.exit(1);
  }
  const exec = mysql(['-h', '127.0.0.1', '-P', '3306', '-uroot', '--default-character-set=utf8mb4'],
    fs.readFileSync(scriptPath, 'utf8'));
  if (exec.code !== 0) {
    console.log('[失败] 执行清理 SQL 出错：' + exec.err);
    process.exit(1);
  }
  console.log('');
  console.log('清理完成。');

  // ── 4. 孤儿数据校验 ─────────────────────────────────────────
  const check = q([
    "SELECT '订单日志孤儿', COUNT(*) FROM orderLogs l LEFT JOIN orders o ON o.id = l.orderId WHERE o.id IS NULL",
    "SELECT '结算流水孤儿', COUNT(*) FROM settlements s LEFT JOIN orders o ON o.id = s.orderId WHERE o.id IS NULL",
    "SELECT '聊天订单卡孤儿', COUNT(*) FROM chatMessages c LEFT JOIN orders o ON o.id = c.orderId WHERE c.orderId IS NOT NULL AND o.id IS NULL",
    "SELECT '举报订单关联孤儿', COUNT(*) FROM reports r LEFT JOIN orders o ON o.id = r.orderId WHERE r.orderId IS NOT NULL AND o.id IS NULL",
    "SELECT '剩余订单数', COUNT(*) FROM orders",
  ].join(' UNION ALL ') + ';');
  console.log('');
  console.log('清理后校验：');
  (check.out || '').split('\n').filter(Boolean).forEach(function (l) {
    console.log('  ' + l.replace(/\t/g, ' = '));
  });
  console.log('');
  console.log('如需恢复：用 ' + path.relative(ROOT, backupPath) + ' 里的数据重新 INSERT（脚本未提供自动回滚）。');
})();
