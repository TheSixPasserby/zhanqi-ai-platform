/*
 * 生成游客端底部 TabBar 的 PNG 图标。
 *
 * 为什么不直接用 SVG：uni-app 的 tabBar 在安卓 App 端只吃 PNG/JPG，
 * 引用外链图标又会把部署搞复杂。所以这里用纯 Node（zlib + 手写 PNG 分块）
 * 现场画 8 张小图，项目里不引入任何图形库，换台电脑跑一遍脚本即可重新生成。
 *
 * 用法：node tools/make-tabbar.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;        // uni-app 官方建议的 tabBar 图标尺寸
const SS = 3;           // 超采样倍数，用来做抗锯齿

const GRAY = [147, 160, 154];   // #93A09A 未选中
const GREEN = [20, 107, 87];    // #146B57 选中

/* ------------------------------ PNG 编码 ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** rgba: Uint8Array，长度 w*h*4 */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // 每行前面加一个 filter 字节（0 = None）
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy
      ? rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ 形状定义 ------------------------------ */
/* 所有坐标都归一化到 0..1，方便按 SIZE 缩放 */

/** 圆角矩形 */
function roundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
}

/** 圆环（外半径 ro，内半径 ri） */
function ring(cx, cy, ro, ri) {
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= ro && d >= ri;
  };
}

/** 实心圆 */
function disc(cx, cy, r) {
  return (x, y) => Math.hypot(x - cx, y - cy) <= r;
}

/** 多边形（射线法） */
function poly(points) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
}

const union = (...fns) => (x, y) => fns.some((f) => f(x, y));
const subtract = (a, b) => (x, y) => a(x, y) && !b(x, y);

/* --------------------------------- 图标 --------------------------------- */

const ICONS = {
  // 首页：屋顶三角 + 屋身 + 门
  home() {
    const roof = poly([[0.5, 0.14], [0.9, 0.46], [0.1, 0.46]]);
    const body = roundRect(0.2, 0.44, 0.8, 0.86, 0.06);
    const door = roundRect(0.42, 0.62, 0.58, 0.86, 0.03);
    return subtract(union(roof, body), door);
  },
  // 打卡：外圆环 + 内部方框（印章意象）
  seal() {
    const outer = ring(0.5, 0.5, 0.37, 0.29);
    const inner = roundRect(0.34, 0.34, 0.66, 0.66, 0.07);
    return union(outer, inner);
  },
  // 商城：拎袋（梯形袋身 + 提手）
  shop() {
    const bag = poly([[0.22, 0.36], [0.78, 0.36], [0.72, 0.88], [0.28, 0.88]]);
    const handle = ring(0.5, 0.36, 0.18, 0.11);
    return union(bag, subtract(handle, roundRect(0.0, 0.37, 1.0, 1.0, 0.0)));
  },
  // 我的：头 + 肩
  mine() {
    const head = disc(0.5, 0.32, 0.16);
    const shoulder = subtract(
      ring(0.5, 0.86, 0.32, 0.0),
      roundRect(0.0, 0.87, 1.0, 1.0, 0.0)
    );
    return union(head, shoulder);
  },
};

/* -------------------------------- 渲染 -------------------------------- */

function render(shapeFn, color) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const step = 1 / (SIZE * SS);

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let hit = 0;
      // 每个像素再切成 SS×SS 个子采样点，边缘得到平滑过渡
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px * SS + sx + 0.5) * step;
          const y = (py * SS + sy + 0.5) * step;
          if (shapeFn(x, y)) hit++;
        }
      }
      const alpha = Math.round((hit / (SS * SS)) * 255);
      const i = (py * SIZE + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(SIZE, SIZE, rgba);
}

/* --------------------------------- 输出 --------------------------------- */

const outDir = path.join(__dirname, '..', 'src', 'static', 'tabbar');
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [name, shape] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(outDir, `${name}.png`), render(shape(), GRAY));
  fs.writeFileSync(path.join(outDir, `${name}-on.png`), render(shape(), GREEN));
  count += 2;
}

console.log('[tabbar] 已生成 ' + count + ' 个图标 → ' + outDir);
