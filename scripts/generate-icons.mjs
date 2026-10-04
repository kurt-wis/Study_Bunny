// The install icons are committed files made from the Study Bunny logo
// (public/logo.png). This script no longer draws them; it only checks they are
// present and the right size before a build, so a missing icon fails early.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const folder = fileURLToPath(new URL('../public/', import.meta.url));
const icons = [['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['pwa-maskable-512x512.png', 512], ['apple-touch-icon.png', 180], ['logo.png', 256]];
for (const [name, size] of icons) {
  const path = `${folder}/${name}`;
  if (!existsSync(path)) throw new Error(`Missing icon: public/${name}`);
  const png = readFileSync(path);
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`public/${name} must be ${size}x${size}`);
}
console.log('Install icons present: made from the Study Bunny logo.');
