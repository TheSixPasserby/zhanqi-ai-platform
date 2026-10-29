/*
 * 灌入图集与详情补充
 *
 * 用法：node tools/seed-gallery.js
 *
 * 为什么不挂启动链路：这是「内容补全」，不是建表也不是初始化演示数据；
 * 每次启动都跑一遍 UPDATE 没有意义，还会覆盖后台手工改过的文案。
 *
 * 幂等：SQL 全是按主键的 UPDATE 固定内容，重复执行结果一致。
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYSQL = process.env.MYSQL_BIN || 'C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysql.exe';
const DB = 'zhanqi_cloud';
const SQL = path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'seed-gallery.sql');

function readPassword() {
  const cfg = fs.readFileSync(path.join(ROOT, 'config', 'application.yml'), 'utf8');
  const m = /^\s*password:\s*"?([^"\r\n]+)"?\s*$/m.exec(cfg);
  return m ? m[1].trim() : '';
}

if (!fs.existsSync(SQL)) {
  console.log('[失败] 找不到 ' + SQL);
  process.exit(1);
}

const r = spawnSync(MYSQL, ['-h', '127.0.0.1', '-P', '3306', '-uroot', '--default-character-set=utf8mb4', DB], {
  env: Object.assign({}, process.env, { MYSQL_PWD: readPassword() }),
  input: fs.readFileSync(SQL),
  encoding: 'utf8',
  timeout: 90000,
});
if (r.error) { console.log('[失败] ' + r.error.message); process.exit(1); }
if (r.status !== 0) { console.log('[失败] ' + (r.stderr || '').slice(0, 800)); process.exit(1); }
console.log((r.stdout || '').trim());
console.log('图集与详情已更新。');
