import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}/manifest.webmanifest`, 'utf8'));
const sw = readFileSync(`${root}/sw.js`, 'utf8');
for (const icon of manifest.icons) {
  assert.ok(existsSync(`${root}/${icon.src}`), `Missing icon ${icon.src}`);
  assert.ok(sw.includes(icon.src), `Icon not precached: ${icon.src}`);
  const png = readFileSync(`${root}/${icon.src}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
}
const worker = readdirSync(`${root}/assets`).find(file => /pdf\.worker.*\.mjs$/.test(file));
assert.ok(worker, 'Missing locally bundled PDF worker');
assert.ok(sw.includes(worker), 'PDF worker not precached');
assert.ok(existsSync(`${root}/apple-touch-icon.png`));
assert.ok(existsSync(`${root}/favicon.svg`));
assert.ok(readFileSync(`${root}/index.html`, 'utf8').includes('registerSW.js'));
console.log('PWA checks passed: icons, registration, service worker, and offline PDF worker.');
