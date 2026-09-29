/*
 * 部署脚本「配置解析」的常驻回归测试
 * ============================================================================
 *
 * 测什么：tools/deploy.ps1 的 `Get-ConfigValue` 与 tools/deploy.sh 的
 *         `get_config_value` —— 也就是从 config/application.yml 里取值的那个函数。
 *
 * 为什么必须有这个脚本（真实事故，别再靠人肉验证）：
 *   config/application.yml 里 `app.port`（服务端口 8080）与 `app.database.port`
 *   （MySQL 端口 3306）**键名都是 `port`**。一旦取值退化成「全文找第一个 port:」，
 *   读到的永远是 8080；它再被写回 database.port，配置就被永久毒化 ——
 *   首次部署不发作、第二次起才发作，且两侧报错都指向 MySQL，极难定位。
 *   这个坑在 Windows 与 macOS 两条线上被**各自独立踩到过**，
 *   所以它值得一条常驻断言守着，而不是每次靠「手动跑两遍部署看看端口」。
 *
 * 怎么测的（重点）：**不复制一份实现来测**，而是从交付版脚本里
 * 把函数源码抽出来原样执行 —— 否则改了脚本而测试还绿着，等于没测。
 *   · ps1：抽 `Get-ConfigValue` → 写进临时 .ps1（UTF-8 **带 BOM**，
 *     否则 PowerShell 5.1 按 GBK 读会把中文注释读坏）→ 用 powershell 跑；
 *   · sh ：抽 `get_config_value` → 写进临时 .sh → 用 bash 跑。
 *
 * 用法：
 *     node tools/deploy-config-test.js
 *
 * 零 npm 依赖、离线可跑（与 tools/ 下其它自检脚本同一硬约束）。
 * 没有 PowerShell / bash 的环境会跳过对应部分并如实说明，不算失败。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PS1_FILE = path.join(ROOT, 'tools', 'deploy.ps1');
const SH_FILE = path.join(ROOT, 'tools', 'deploy.sh');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zq-config-test-'));

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log('  [OK]   ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? '  →  ' + detail : ''));
    console.log('  [失败] ' + name + (detail ? '  →  ' + detail : ''));
  }
}

function section(title) {
  console.log('');
  console.log('— ' + title + ' ' + '-'.repeat(Math.max(0, 62 - title.length)));
}

// ----------------------------------------------------------------- 源码抽取

/*
 * 从源码里抽出 `名字(...) {` / `名字() {` 开始的那个函数，按花括号配对找到结尾。
 *
 * 必须跳过字符串与注释里的括号，否则会提前收尾：
 *   · ps1：单引号串用 '' 转义，双引号串用反引号转义，`#` 起行注释；
 *   · sh ：单引号串内不转义，双引号串内反斜杠转义，
 *          `#` 前面是空白或行首时才算注释（函数里就有一行中文 `#` 注释）。
 */
function extractFunction(source, signature, mode) {
  const start = source.indexOf(signature);
  if (start < 0) return null;

  const open = source.indexOf('{', start);
  if (open < 0) return null;

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let i = open;

  for (; i < source.length; i++) {
    const ch = source[i];

    if (inSingle) {
      if (ch === "'") {
        // ps1 用 '' 表示一个单引号；sh 里单引号串不可能再含单引号
        if (mode === 'ps' && source[i + 1] === "'") { i++; continue; }
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (mode === 'ps' && ch === '`') { i++; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }

    if (ch === '#') {
      const prev = i === 0 ? '\n' : source[i - 1];
      if (mode === 'ps' || prev === '\n' || prev === ' ' || prev === '\t') {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
    }

    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

// ----------------------------------------------------------------- 测试夹具

/*
 * 夹具的形状刻意与部署脚本自己写出来的 config/application.yml 一致
 * （app.port 在前、database 块在后、ai 块收尾），
 * 这样「全文找第一个 port:」的老写法才会真的读错 —— 否则测试形同虚设。
 * 最后一条断言会专门证明这一点。
 */
const FIXTURES = {
  standard: [
    'app:',
    '  port: 8080',
    '',
    '  database:',
    '    host: 127.0.0.1',
    '    port: 3306',
    '    name: zhanqi_cloud',
    '    user: root',
    '    password: "s3cr3t"',
    '',
    '  ai:',
    '    enabled: false',
    '    model: deepseek-chat',
    '    port: 9999',
    ''
  ].join('\n'),

  crlf: null, // 由 standard 转 CRLF 得到

  inlineComment: [
    'app:',
    '  port: 8080',
    '  database:',
    '    host: 127.0.0.1   # 本机',
    '    port: 3307   # 装在 3307',
    '    name: zhanqi_cloud',
    ''
  ].join('\n'),

  quoted: [
    'app:',
    '  port: 8080',
    '  database:',
    "    name: 'quoted_db'",
    '    password: "p@ss:word"',
    ''
  ].join('\n'),

  deepIndent: [
    'app:',
    '  port: 8080',
    '  database:',
    '      port: 3310',
    ''
  ].join('\n'),

  missingKey: [
    'app:',
    '  port: 8080',
    '  database:',
    '    host: 127.0.0.1',
    ''
  ].join('\n'),

  noSection: [
    'app:',
    '  port: 8080',
    ''
  ].join('\n'),

  emptyValue: [
    'app:',
    '  port: 8080',
    '  database:',
    '    host:',
    ''
  ].join('\n')
};

FIXTURES.crlf = FIXTURES.standard.replace(/\n/g, '\r\n');

const FILES = {};
for (const name of Object.keys(FIXTURES)) {
  const p = path.join(TMP, name + '.yml');
  fs.writeFileSync(p, FIXTURES[name], 'utf8'); // 统一 UTF-8 无 BOM，与部署脚本一致
  FILES[name] = p;
}

/*
 * 用例表。ps1 与 sh 共用一份，`section` 只有 ps1 用得上
 * （bash 版没有这个参数，它的签名是 2 参 —— 见下面的「已知差异」）。
 */
const CASES = [
  // 核心回归：database 块里的 port 必须是 3306，绝不能是 app.port 的 8080
  { name: 'database.port 取到 3306（不是 app.port 的 8080）', file: 'standard', key: 'port', fallback: '3306', section: 'database', expect: '3306' },
  { name: 'database.host', file: 'standard', key: 'host', fallback: '127.0.0.1', section: 'database', expect: '127.0.0.1' },
  { name: 'database.name', file: 'standard', key: 'name', fallback: 'zhanqi_cloud', section: 'database', expect: 'zhanqi_cloud' },
  { name: 'database.user', file: 'standard', key: 'user', fallback: 'root', section: 'database', expect: 'root' },
  { name: 'database.password（带引号，值里含冒号）', file: 'standard', key: 'password', fallback: '', section: 'database', expect: 's3cr3t' },
  { name: 'CRLF 换行的配置文件也能读对', file: 'crlf', key: 'port', fallback: '3306', section: 'database', expect: '3306' },
  { name: '值带单引号', file: 'quoted', key: 'name', fallback: '', section: 'database', expect: 'quoted_db' },
  { name: '值里含冒号 + 双引号', file: 'quoted', key: 'password', fallback: '', section: 'database', expect: 'p@ss:word' },
  { name: 'database 块后面同名键不越界读到（ai.port=9999）', file: 'standard', key: 'port', fallback: 'FALLBACK', section: 'database', expect: '3306' },
  { name: '缺 key 时回落默认值', file: 'missingKey', key: 'user', fallback: 'FALLBACK', section: 'database', expect: 'FALLBACK' },
  { name: '缺整个 section 时回落默认值', file: 'noSection', key: 'port', fallback: 'FALLBACK', section: 'database', expect: 'FALLBACK' },
  { name: '值为空时回落默认值', file: 'emptyValue', key: 'host', fallback: 'FALLBACK', section: 'database', expect: 'FALLBACK' },
  { name: '文件不存在时回落默认值', file: '__nonexistent__', key: 'port', fallback: 'FALLBACK', section: 'database', expect: 'FALLBACK' }
];

// ps1 独有：section 参数相关
const PS_ONLY_CASES = [
  { name: 'section 传空时按全文找（兼容旧调用）', file: 'standard', key: 'port', fallback: '', section: null, expect: '8080' },
  { name: '能读到 ai 块里的键（section=ai）', file: 'standard', key: 'port', fallback: '', section: 'ai', expect: '9999' },
  { name: '块边界按缩进算，不写死两格（database 缩进 6 格）', file: 'deepIndent', key: 'port', fallback: 'FALLBACK', section: 'database', expect: '3310' },
  { name: '行尾注释被剥离（bash 版做不到，见第 4 节）', file: 'inlineComment', key: 'port', fallback: '3306', section: 'database', expect: '3307' }
];

/*
 * 已知差异：bash 版比 ps1 版弱的两处。
 * 这两条**不参与断言**（同一条夹具在两个实现上结果不同），
 * 只把两侧实测值如实打印出来，等有人在 macOS/Linux 上把 deploy.sh 对齐 ——
 * 详见 HANDOVER 待办清单。
 */
const DIVERGENT_CASES = [
  { name: '行尾注释：ps1 剥掉，bash 原样带出', file: 'inlineComment', key: 'port', fallback: '3306', section: 'database', ps1CaseName: '行尾注释被剥离（bash 版做不到，见第 4 节）' },
  { name: 'database 缩进 6 格：ps1 按缩进算，bash 认不出', file: 'deepIndent', key: 'port', fallback: 'FALLBACK', section: 'database', ps1CaseName: '块边界按缩进算，不写死两格（database 缩进 6 格）' }
];

// ----------------------------------------------------------------- 执行器

function findProgram(candidates) {
  for (const c of candidates) {
    const probe = spawnSync(c, ['-Version'], { encoding: 'utf8' });
    if (!probe.error) return c;
  }
  return null;
}

/*
 * PowerShell 字符串字面量。路径里的反斜杠换成正斜杠：
 * JSON.stringify 会把 C:\Users\... 写成 "C:\\Users\\..."，Windows 虽然照样能认，
 * 但在 .ps1 里读起来容易被误当成转义序列。
 */
function psLiteral(s) {
  return JSON.stringify(s).replace(/\\\\/g, '/');
}

function runPs1Cases(functionSource, cases) {
  const lines = [];
  lines.push('$ErrorActionPreference = "Stop"');
  lines.push("$ConfigYml = ''");
  lines.push(functionSource);
  lines.push('');
  const caseLines = cases.map((c) => {
    const sectionLit = c.section === null ? '$null' : "'" + c.section + "'";
    const file = c.file === '__nonexistent__' ? path.join(TMP, 'nope.yml') : FILES[c.file];
    return '  @{ n = ' + psLiteral(c.name) + '; f = ' + psLiteral(file) +
      '; k = ' + psLiteral(c.key) +
      '; fb = ' + psLiteral(c.fallback) +
      '; s = ' + sectionLit + ' }';
  });
  lines.push('$cases = @(');
  lines.push(caseLines.join(',\r\n'));   // 用 join 而不是逐行补逗号：尾逗号在 PowerShell 里会报「, 后面缺少表达式」
  lines.push(')');
  lines.push('foreach ($c in $cases) {');
  lines.push('  $ConfigYml = $c.f');
  lines.push('  $r = Get-ConfigValue $c.k $c.fb $c.s');
  lines.push('  Write-Output ("CASE" + [char]9 + $r)');
  lines.push('}');

  const runner = path.join(TMP, 'run-ps1.ps1');
  // UTF-8 **带 BOM**：抽取出来的函数体里有中文注释，无 BOM 会被按 GBK 读坏
  fs.writeFileSync(runner, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');

  const ps = findProgram(['powershell', 'pwsh']);
  if (!ps) return { skipped: true };

  const r = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });

  const values = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('CASE\t')) values.push(line.slice(5));
  }
  return { skipped: false, values: values, stderr: (r.stderr || '').trim() };
}

function runShCases(functionSource, cases) {
  const sh = findProgram(['bash']);
  if (!sh) return { skipped: true };

  const lines = [];
  lines.push('#!/usr/bin/env bash');
  // 只挑 bash 版真正支持的两参调用（它的签名与 ps1 不同）
  lines.push('CONFIG_YML=""');
  lines.push(functionSource);
  lines.push('');
  lines.push('run_one() {');
  lines.push('  CONFIG_YML="$1"');
  lines.push('  printf "CASE\\t%s\\n" "$(get_config_value "$2" "$3")"');
  lines.push('}');
  for (const c of cases) {
    const file = c.file === '__nonexistent__' ? path.join(TMP, 'nope.yml') : FILES[c.file];
    lines.push('run_one ' + JSON.stringify(file) + ' ' + JSON.stringify(c.key) + ' ' + JSON.stringify(c.fallback));
  }

  const runner = path.join(TMP, 'run-sh.sh');
  fs.writeFileSync(runner, lines.join('\n') + '\n', 'utf8');

  const r = spawnSync(sh, [runner], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const values = [];
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('CASE\t')) values.push(line.slice(5));
  }
  return { skipped: false, values: values, stderr: (r.stderr || '').trim() };
}

// ----------------------------------------------------------------- 主流程

console.log('');
console.log('='.repeat(66));
console.log('  部署配置解析 · 常驻回归测试');
console.log('='.repeat(66));

const ps1Source = fs.readFileSync(PS1_FILE, 'utf8');
const shSource = fs.readFileSync(SH_FILE, 'utf8');

const ps1Fn = extractFunction(ps1Source, 'function Get-ConfigValue(', 'ps');
const shFn = extractFunction(shSource, 'get_config_value() {', 'sh');

section('0. 能否从交付版脚本里抽到被测函数');
check('tools/deploy.ps1 里抽到 Get-ConfigValue', !!ps1Fn, ps1Fn ? ps1Fn.split('\n').length + ' 行' : '抽取失败');
check('tools/deploy.sh 里抽到 get_config_value', !!shFn, shFn ? shFn.split('\n').length + ' 行' : '抽取失败');
check('抽出来的 ps1 函数签名带 $section 参数',
  !!ps1Fn && /function\s+Get-ConfigValue\s*\(\s*\$key\s*,\s*\$fallback\s*,\s*\$section\s*\)/.test(ps1Fn),
  '签名变了就说明有人动了取配置的接口，下面的用例需要同步');

if (!ps1Fn || !shFn) {
  console.log('');
  console.log('  抽不到函数就没法测，直接失败退出。');
  process.exit(1);
}

section('1. 夹具自检：这个夹具真的能触发「全文找第一个 port:」那个坑吗');
/*
 * 用一个「老写法」的参照实现跑同一份夹具。
 * 如果它读出来也是 3306，说明夹具根本没构成陷阱 —— 那后面的断言就是在自欺欺人。
 */
function naiveFullFileMatch(text, key) {
  const re = new RegExp('^\\s*' + key + '\\s*:', 'm');
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const line = rest.split(/\r?\n/)[0];
  return line.trim().replace(/^["']|["']$/g, '');
}
const naiveOnStandard = naiveFullFileMatch(FIXTURES.standard, 'port');
check('老写法在标准夹具上会读错（读到 8080 而不是 3306）',
  naiveOnStandard === '8080',
  '读到 ' + JSON.stringify(naiveOnStandard) + ' —— 若这里是 3306，说明夹具失去意义了，必须重新设计');

section('2. PowerShell 侧（tools/deploy.ps1）');
const ps1Run = runPs1Cases(ps1Fn, CASES.concat(PS_ONLY_CASES));
if (ps1Run.skipped) {
  skip++;
  console.log('  [跳过] 本机没有 powershell / pwsh，跳过 ps1 侧断言');
} else {
  if (ps1Run.stderr) console.log('  （stderr）' + ps1Run.stderr.split('\n')[0]);
  check('返回了全部 ' + CASES.concat(PS_ONLY_CASES).length + ' 个用例的结果',
    ps1Run.values.length === CASES.concat(PS_ONLY_CASES).length,
    '实到 ' + ps1Run.values.length + ' 个');
  const all = CASES.concat(PS_ONLY_CASES);
  all.forEach((c, i) => {
    if (i >= ps1Run.values.length) return;
    check(c.name, ps1Run.values[i] === c.expect,
      '期望 ' + JSON.stringify(c.expect) + '，实到 ' + JSON.stringify(ps1Run.values[i]));
  });
}

section('3. bash 侧（tools/deploy.sh）');
const shRun = runShCases(shFn, CASES);
if (shRun.skipped) {
  skip++;
  console.log('  [跳过] 本机没有 bash，跳过 sh 侧断言');
} else {
  if (shRun.stderr) console.log('  （stderr）' + shRun.stderr.split('\n')[0]);
  check('返回了全部 ' + CASES.length + ' 个用例的结果', shRun.values.length === CASES.length,
    '实到 ' + shRun.values.length + ' 个');
  CASES.forEach((c, i) => {
    if (i >= shRun.values.length) return;
    check('[bash] ' + c.name, shRun.values[i] === c.expect,
      '期望 ' + JSON.stringify(c.expect) + '，实到 ' + JSON.stringify(shRun.values[i]));
  });
}

section('4. 已知差异（只报告，不断言 —— 见 HANDOVER 待办）');
const ps1ByName = {};
if (!ps1Run.skipped) {
  CASES.concat(PS_ONLY_CASES).forEach((c, i) => { ps1ByName[c.name] = ps1Run.values[i]; });
}
const shDivergent = runShCases(shFn, DIVERGENT_CASES);
for (let i = 0; i < DIVERGENT_CASES.length; i++) {
  const d = DIVERGENT_CASES[i];
  const ps1Val = ps1ByName[d.ps1CaseName] === undefined ? '(未跑)' : ps1ByName[d.ps1CaseName];
  const shVal = shDivergent.skipped ? '(未跑)' : (shDivergent.values[i] === undefined ? '(未取到)' : shDivergent.values[i]);
  console.log('  · ' + d.name);
  console.log('      ps1 实测 ' + JSON.stringify(ps1Val) + '　bash 实测 ' + JSON.stringify(shVal));
}
console.log('');
console.log('  这两处是 tools/deploy.sh 相对 ps1 版**真实的健壮性差距**：');
console.log('  bash 版把 `database:` 的缩进写死成两格、也不剥行尾注释。');
console.log('  日常不会被触发（配置由脚本按固定模板生成），但用户手改过配置就会。');
console.log('  修它需要在 macOS/Linux 上验证 BSD awk/sed 的行为，本机（Windows）做不到，');
console.log('  所以登记为待办而不是在这里偷偷改掉。');

console.log('');
console.log('='.repeat(66));
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项' + (skip ? '，跳过 ' + skip + ' 组' : ''));
if (fail > 0) {
  console.log('');
  console.log('  失败清单：');
  failures.forEach(f => console.log('    · ' + f));
}
console.log('='.repeat(66));
console.log('');

// 失败时保留临时目录，方便直接看生成的 runner 脚本；全绿时清掉
if (fail > 0) {
  console.log('  临时构件保留在：' + TMP);
  console.log('');
} else {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* 清不掉不影响结论 */ }
}

process.exit(fail > 0 ? 1 : 0);
