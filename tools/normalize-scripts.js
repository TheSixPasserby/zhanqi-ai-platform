/*
 * 脚本文件编码规范化 / 自检。
 *
 * 【为什么必须有这个脚本 —— 两类都真实踩过的坑】
 *
 * 1) .bat / .cmd 必须「CRLF 换行 + 100% ASCII」
 *    cmd.exe 解析批处理是按字节推进的。文件里一旦出现中文（哪怕只是 rem 注释），
 *    执行过 chcp 65001 之后，文件偏移就可能落在多字节字符中间，cmd 会把这一行截断、
 *    把后半截当成命令执行，然后直接退出 —— 表现为「双击 bat 黑框一闪而过，什么都没发生」，
 *    不打印任何错误，极难排查。
 *
 * 2) .ps1 必须「UTF-8 带 BOM + CRLF」
 *    Windows PowerShell 5.1（也就是 powershell.exe，没有 BOM 时的默认行为）
 *    会按系统 ANSI 代码页（中文系统是 GBK）去读脚本文件。
 *    于是 .ps1 里的中文全部变成乱码，更糟的是：某些汉字的 GBK 字节序列里恰好包含
 *    0x27（单引号）之类的字符，会直接把字符串字面量截断，导致语法错误。
 *    实测现象：脚本报
 *      「无法绑定参数"ForegroundColor"。无法将值"Cyan...Set-Location $ServerDir...」
 *    —— 看起来像参数写错，实际是编码问题，非常容易被误判成逻辑 bug。
 *    加一个 UTF-8 BOM 就能让 PowerShell 5.1 正确识别编码，PowerShell 7 也兼容 BOM。
 *
 * 3) .sh 必须「LF 换行 + UTF-8 无 BOM + 首行 shebang」
 *    bash 把 CRLF 里的 \r 当成普通字符：报「$'\r': command not found」，
 *    或者更隐蔽 —— 变量末尾拖一个不可见的 \r，拼出来的 URL / 路径全错。
 *    这在 Windows 上编辑过 .sh（git 的 autocrlf 配错）时极易发生。
 *    BOM 同理：bash 不认 BOM，首行会变成「\xef\xbb\xbf#!/usr/bin/env bash」，
 *    shebang 直接失效。另外在类 Unix 系统上顺带检查可执行位（chmod +x）。
 *
 * 用法：
 *   node tools/normalize-scripts.js          # 检查并自动修复
 *   node tools/normalize-scripts.js --check  # 只检查，有问题退出码 1（可挂 CI / 提交前钩子）
 */
const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');
const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'logs', '.workbuddy']);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** 统计换行 / 非 ASCII / BOM 情况 */
function analyze(buf) {
  const latin = buf.toString('latin1');
  return {
    crlf: (latin.match(/\r\n/g) || []).length,
    bareLf: (latin.match(/(?<!\r)\n/g) || []).length,
    bareCr: (latin.match(/\r(?!\n)/g) || []).length,
    nonAscii: [...buf].filter((b) => b > 127).length,
    hasBom: buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
  };
}

/** 统一换行为 CRLF（先把 CRLF / 裸 CR 都归一成 LF，再整体替换） */
function toCrlf(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}

/* --------------------------------------------------------- .bat / .cmd --- */

function handleBatch(file, buf) {
  const rel = path.relative(ROOT, file);
  const info = analyze(buf);
  const problems = [];

  if (info.nonAscii > 0) problems.push('含 ' + info.nonAscii + ' 个非 ASCII 字节（中文 / 全角字符）');
  if (info.bareLf > 0) problems.push('含 ' + info.bareLf + ' 处裸 LF 换行（应为 CRLF）');
  if (info.bareCr > 0) problems.push('含 ' + info.bareCr + ' 处裸 CR');
  if (info.hasBom) problems.push('含 UTF-8 BOM');

  if (problems.length === 0) {
    console.log('  [OK]   ' + rel + '   CRLF=' + info.crlf + '  纯 ASCII');
    return { bad: 0, fixed: 0 };
  }

  console.log('  [问题] ' + rel);
  problems.forEach((p) => console.log('         - ' + p));

  if (CHECK_ONLY) return { bad: 1, fixed: 0 };

  // 换行和 BOM 可以自动修；中文无法自动搬走（不知道原意），只提示
  if (info.nonAscii === 0) {
    let text = buf.toString('latin1');
    if (info.hasBom) text = text.slice(3);
    fs.writeFileSync(file, Buffer.from(toCrlf(text), 'latin1'));
    console.log('         → 已自动修复换行 / BOM');
    return { bad: 1, fixed: 1 };
  }

  console.log('         → 含有中文：请把这些提示文案移到 .ps1 / Java 里打印，脚本不自动替换');
  return { bad: 1, fixed: 0 };
}

/* ----------------------------------------------------------------- .ps1 --- */

function handlePowerShell(file, buf) {
  const rel = path.relative(ROOT, file);
  const info = analyze(buf);
  const problems = [];

  if (!info.hasBom) problems.push('缺少 UTF-8 BOM（PowerShell 5.1 会按 GBK 读，中文变乱码并可能破坏语法）');
  if (info.bareLf > 0) problems.push('含 ' + info.bareLf + ' 处裸 LF 换行（应为 CRLF）');
  if (info.bareCr > 0) problems.push('含 ' + info.bareCr + ' 处裸 CR');

  if (problems.length === 0) {
    console.log('  [OK]   ' + rel + '   UTF-8 BOM + CRLF');
    return { bad: 0, fixed: 0 };
  }

  console.log('  [问题] ' + rel);
  problems.forEach((p) => console.log('         - ' + p));

  if (CHECK_ONLY) return { bad: 1, fixed: 0 };

  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // 注意：这里必须以「字节」为基准判断是否有 BOM，才不会被 BOM 本身影响
  const body = Buffer.from(toCrlf(text), 'utf8');
  fs.writeFileSync(file, Buffer.concat([UTF8_BOM, body]));
  console.log('         → 已自动修复为 UTF-8 BOM + CRLF');
  return { bad: 1, fixed: 1 };
}

/* ------------------------------------------------------------------ .sh --- */

function handleShell(file, buf) {
  const rel = path.relative(ROOT, file);
  const info = analyze(buf);
  const problems = [];

  if (info.hasBom) problems.push('含 UTF-8 BOM（bash 不认 BOM，shebang 会失效）');
  if (info.crlf > 0) problems.push('含 ' + info.crlf + ' 处 CRLF 换行（bash 会把 \\r 当普通字符，应为 LF）');
  if (info.bareCr > 0) problems.push('含 ' + info.bareCr + ' 处裸 CR');

  const text = buf.toString('utf8').replace(/^﻿/, '');
  if (!text.startsWith('#!')) problems.push('首行缺少 shebang（应为 #!/usr/bin/env bash）');

  // 可执行位只在类 Unix 系统上有意义；Windows 上 fs 的 mode 不可靠，跳过
  let execOk = true;
  if (process.platform !== 'win32') {
    try {
      execOk = (fs.statSync(file).mode & 0o111) !== 0;
    } catch (_) { }
    if (!execOk) problems.push('缺少可执行位（chmod +x）');
  }

  if (problems.length === 0) {
    console.log('  [OK]   ' + rel + '   LF + 无 BOM + shebang');
    return { bad: 0, fixed: 0 };
  }

  console.log('  [问题] ' + rel);
  problems.forEach((p) => console.log('         - ' + p));

  if (CHECK_ONLY) return { bad: 1, fixed: 0 };

  // 换行 / BOM / 可执行位可以自动修；缺 shebang 无法猜意图，只提示
  let fixed = 0;
  if (info.hasBom || info.crlf > 0 || info.bareCr > 0) {
    const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    fs.writeFileSync(file, Buffer.from(lf, 'utf8'));
    console.log('         → 已自动修复为 LF + 无 BOM');
    fixed = 1;
  }
  if (!execOk) {
    try {
      fs.chmodSync(file, fs.statSync(file).mode | 0o755);
      console.log('         → 已补上可执行位');
      fixed = 1;
    } catch (e) {
      console.log('         → 补可执行位失败：' + e.message);
    }
  }
  if (!text.startsWith('#!')) {
    console.log('         → 缺 shebang：请手工在首行加 #!/usr/bin/env bash');
  }
  return { bad: 1, fixed };
}

/* ------------------------------------------------------------------ main --- */

const all = walk(ROOT).filter((f) => /\.(bat|cmd|ps1|psm1|sh)$/i.test(f));
const bats = all.filter((f) => /\.(bat|cmd)$/i.test(f));
const pss = all.filter((f) => /\.(ps1|psm1)$/i.test(f));
const shs = all.filter((f) => /\.sh$/i.test(f));

console.log('[scripts] 批处理 ' + bats.length + ' 个，PowerShell ' + pss.length + ' 个，Shell ' + shs.length + ' 个');
console.log('');
console.log('--- .bat / .cmd （要求 CRLF + 纯 ASCII）---');

let bad = 0;
let fixed = 0;
for (const f of bats) {
  const r = handleBatch(f, fs.readFileSync(f));
  bad += r.bad;
  fixed += r.fixed;
}

console.log('');
console.log('--- .ps1 （要求 UTF-8 BOM + CRLF）---');
for (const f of pss) {
  const r = handlePowerShell(f, fs.readFileSync(f));
  bad += r.bad;
  fixed += r.fixed;
}

console.log('');
console.log('--- .sh （要求 LF + 无 BOM + shebang）---');
for (const f of shs) {
  const r = handleShell(f, fs.readFileSync(f));
  bad += r.bad;
  fixed += r.fixed;
}

console.log('');
if (CHECK_ONLY) {
  if (bad > 0) {
    console.log('[scripts] 检查未通过：' + bad + ' 个文件有问题');
    process.exit(1);
  }
  console.log('[scripts] 检查通过：所有脚本编码都符合要求');
} else {
  console.log('[scripts] 处理完成：' + bad + ' 个文件有问题，其中 ' + fixed + ' 个已自动修复');
}
