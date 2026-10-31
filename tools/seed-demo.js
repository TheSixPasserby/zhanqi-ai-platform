/*
 * 灌入「小帅」演示数据
 *
 * 用法：node tools/seed-demo.js
 *
 * 为什么单独写：项目没有通用 SQL 执行接口，DatabaseBootstrap 只在启动时跑
 * schema.sql / seed.sql。演示数据不该进启动链路（会影响正常 reset 的语义），
 * 所以用这个脚本显式执行 seed-demo-xiaoshuai.sql。
 *
 * 幂等：SQL 里全部 INSERT IGNORE + 固定 id，重复执行不会重复写入。
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYSQL = process.env.MYSQL_BIN || 'C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysql.exe';
const DB = 'zhanqi_cloud';
const SQL = path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'seed-demo-xiaoshuai.sql');

function readPassword() {
  const cfg = fs.readFileSync(path.join(ROOT, 'config', 'application.yml'), 'utf8');
  const m = /^\s*password:\s*"?([^"\r\n]+)"?\s*$/m.exec(cfg);
  return m ? m[1].trim() : '';
}

if (!fs.existsSync(SQL)) {
  console.log('[失败] 找不到 ' + SQL + '，请先运行 node tools/gen-demo-xiaoshuai.js');
  process.exit(1);
}

const r = spawnSync(MYSQL, ['-h', '127.0.0.1', '-P', '3306', '-uroot', '--default-character-set=utf8mb4', DB], {
  env: Object.assign({}, process.env, { MYSQL_PWD: readPassword() }),
  input: fs.readFileSync(SQL),
  encoding: 'utf8',
  timeout: 60000,
});
if (r.error) {
  console.log('[失败] ' + r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.log('[失败] 执行 SQL 出错：' + (r.stderr || '').slice(0, 800));
  process.exit(1);
}
console.log((r.stdout || '').trim());
console.log('');

// 回读校验：数量与关键状态
const check = spawnSync(MYSQL, ['-h', '127.0.0.1', '-P', '3306', '-uroot', '-N', '-B',
  '--default-character-set=utf8mb4', DB, '-e', [
    "SELECT '订单', COUNT(*) FROM orders WHERE buyerId = (SELECT id FROM users WHERE account = 'xiaoshuai')",
    "SELECT '结算流水', COUNT(*) FROM settlements",
    "SELECT '订单日志', COUNT(*) FROM orderLogs WHERE orderId LIKE 'ox%'",
    "SELECT '聊天', COUNT(*) FROM chatMessages WHERE buyerId = (SELECT id FROM users WHERE account = 'xiaoshuai')",
    "SELECT '举报', COUNT(*) FROM reports WHERE buyerId = (SELECT id FROM users WHERE account = 'xiaoshuai')",
    "SELECT '已结算商家', COUNT(*) FROM merchants WHERE settledAmount > 0",
  ].join(' UNION ALL ') + ';'], {
  env: Object.assign({}, process.env, { MYSQL_PWD: readPassword() }),
  encoding: 'utf8', timeout: 30000,
});
console.log('回读校验：');
(check.stdout || '').split('\n').filter(Boolean).forEach(function (l) { console.log('  ' + l.replace(/\t/g, ' = ')); });
console.log('');
console.log('演示账号：xiaoshuai / 123456（小帅）');
console.log('入口：http://localhost:8080/visitor/  → 我的订单');
