// Deterministic PNGs from a code-native bunny design; no image service or extra library.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const folder = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(folder, { recursive: true });
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length); tail.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([head, name, data, tail]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const ellipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // All artwork stays within a 40% radius for maskable icons.
    const sx = x * 512 / size, sy = y * 512 / size;
    let color = [79, 70, 229, 255];
    if (ellipse(sx, sy, 208, 177, 32, 90) || ellipse(sx, sy, 304, 177, 32, 90) || ellipse(sx, sy, 256, 302, 125, 100)) color = [255, 255, 255, 255];
    if (ellipse(sx, sy, 208, 170, 14, 58) || ellipse(sx, sy, 304, 170, 14, 58) || ellipse(sx, sy, 192, 326, 22, 14) || ellipse(sx, sy, 320, 326, 22, 14) || ellipse(sx, sy, 256, 326, 12, 9)) color = [249, 168, 212, 255];
    if (ellipse(sx, sy, 213, 290, 9, 13) || ellipse(sx, sy, 299, 290, 9, 13)) color = [49, 46, 129, 255];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    raw.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, size] of [['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['pwa-maskable-512x512.png', 512], ['apple-touch-icon.png', 180]]) writeFileSync(`${folder}/${name}`, png(size));
console.log('Generated install icons and Apple touch icon.');
