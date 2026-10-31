/*
 * 执行 db/ 下的补充种子 SQL（虚拟地图坐标 / 补充商品）。
 *
 * 用法：
 *   node tools/seed-extra.js map       # 灌入地图坐标
 *   node tools/seed-extra.js products  # 灌入 12 件补充商品
 *   node tools/seed-extra.js all       # 两个都灌（默认）
 *
 * 为什么不挂启动链路：这两份是「内容补全」，不是建表也不是初始化演示数据；
 * 每次启动都跑一遍 UPDATE/INSERT 没有意义，还会覆盖后台手工改过的坐标。
 *
 * 幂等：map 是按主键 UPDATE 固定值；products 是 INSERT IGNORE + 固定主键。
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYSQL = process.env.MYSQL_BIN || 'C:\\Program Files\\MySQL\\MySQL Server 9.6\\bin\\mysql.exe';
const DB = 'zhanqi_cloud';

const FILES = {
  map: path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'seed-map.sql'),
  products: path.join(ROOT, 'server', 'src', 'main', 'resources', 'db', 'seed-extra-products.sql'),
};

function readPassword() {
  const cfg = fs.readFileSync(path.join(ROOT, 'config', 'application.yml'), 'utf8');
  const m = /^\s*password:\s*"?([^"\r\n]+)"?\s*$/m.exec(cfg);
  return m ? m[1].trim() : '';
}

function run(file) {
  if (!fs.existsSync(file)) {
    console.log('[失败] 找不到 ' + file);
    return false;
  }
  const r = spawnSync(MYSQL, ['-h', '127.0.0.1', '-P', '3306', '-uroot', '--default-character-set=utf8mb4', DB], {
    env: Object.assign({}, process.env, { MYSQL_PWD: readPassword() }),
    input: fs.readFileSync(file),
    encoding: 'utf8',
    timeout: 90000,
  });
  if (r.error) { console.log('[失败] ' + r.error.message); return false; }
  if (r.status !== 0) { console.log('[失败] ' + (r.stderr || '').slice(0, 700)); return false; }
  console.log((r.stdout || '').trim());
  return true;
}

const which = process.argv[2] || 'all';
const targets = which === 'all' ? ['map', 'products'] : [which];
let ok = true;
for (const t of targets) {
  if (!FILES[t]) { console.log('[失败] 未知目标：' + t + '（可选 map / products / all）'); ok = false; continue; }
  console.log('--- ' + t + ' ---');
  if (!run(FILES[t])) { ok = false; }
}
console.log('');
console.log(ok ? '完成。' : '有失败项，请检查上面的报错。');
process.exit(ok ? 0 : 1);
