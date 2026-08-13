// ============================================================
// Cogito 应用图标生成器 — 思绪地平线
// "Cogito, ergo sum" — 我思故我在
// 设计元素：
//   - 暖白渐变背景（柔和、温暖、如纸）
//   - 一条极细的炭灰色水平线（思绪地平线）
//   - 禅意、静默、大量留白
//   纯 Node 无依赖
// ============================================================
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 256;
const H = 256;

// RGBA 画布
const px = new Uint8Array(W * H * 4);

// ---- 辅助函数 ----
function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function blendPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const a1 = a / 255;
  const a0 = px[i + 3] / 255;
  const outA = a1 + a0 * (1 - a1);
  if (outA === 0) return;
  px[i] = Math.round((r * a1 + px[i] * a0 * (1 - a1)) / outA);
  px[i + 1] = Math.round((g * a1 + px[i + 1] * a0 * (1 - a1)) / outA);
  px[i + 2] = Math.round((b * a1 + px[i + 2] * a0 * (1 - a1)) / outA);
  px[i + 3] = Math.round(outA * 255);
}

// ---- 1. 背景：暖白渐变 #faf6ef -> #f0e6d4 ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / (H - 1);
    const r = Math.round(250 + (240 - 250) * t);
    const g = Math.round(246 + (230 - 246) * t);
    const b = Math.round(239 + (212 - 239) * t);
    setPx(x, y, r, g, b, 255);
  }
}

// ---- 2. 思绪地平线：一条极细的炭灰色横线 ----
// 横线位于中央偏下一点，营造"地平线"的宁静感
const lineY = 134;
const lineLen = 96;
const lineX0 = 128 - lineLen / 2;
const lineX1 = 128 + lineLen / 2;
const lineWidth = 1.8;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x >= lineX0 && x <= lineX1) {
      const distFromLine = Math.abs(y - lineY);
      if (distFromLine <= lineWidth + 0.5) {
        const alpha = Math.max(0, Math.min(255, Math.round((1 - distFromLine / (lineWidth + 0.5)) * 200 + 55)));
        blendPx(x, y, 60, 55, 50, alpha);
      }
    }
  }
}

// ---- 3. 横线两端极淡的渐隐 ----
const fadeLen = 8;
for (let y = 0; y < H; y++) {
  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? lineX0 : lineX1;
    const dir = side === 0 ? -1 : 1;
    for (let i = 0; i < fadeLen; i++) {
      const x = baseX + dir * (i + 1);
      if (x < 0 || x >= W) continue;
      const distFromLine = Math.abs(y - lineY);
      if (distFromLine <= lineWidth) {
        const alpha = Math.round((1 - (i + 1) / (fadeLen + 1)) * 100);
        if (alpha > 0) blendPx(x, y, 60, 55, 50, alpha);
      }
    }
  }
}

// ---- 编码 PNG ----
function crc32(buf) {
  let c;
  const table = crc32.table;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
crc32.table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0;
  px.subarray(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
    raw[rowStart + 1 + i] = v;
  });
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('../electron/assets/icon.png', import.meta.url);
writeFileSync(out, png);
console.log('icon written:', out.pathname, png.length, 'bytes');