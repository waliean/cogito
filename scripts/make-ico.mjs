// 把 256x256 PNG 包装为 PNG-in-ICO（Windows Vista+ 支持）
import { readFileSync, writeFileSync } from 'node:fs';

const pngPath = new URL('../electron/assets/icon.png', import.meta.url);
const icoPath = new URL('../electron/assets/icon.ico', import.meta.url);

const png = readFileSync(pngPath);

// ICONDIR
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count

// ICONDIRENTRY
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // width 256 -> 0
entry.writeUInt8(0, 1); // height 256 -> 0
entry.writeUInt8(0, 2); // color count
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(png.length, 8); // bytes in resource
entry.writeUInt32LE(6 + 16, 12); // image offset

const ico = Buffer.concat([header, entry, png]);
writeFileSync(icoPath, ico);
console.log('icon.ico written:', icoPath.pathname, ico.length, 'bytes');
