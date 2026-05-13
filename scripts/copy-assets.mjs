import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

// Copy manifest.json
import { cpSync } from 'fs';
cpSync(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));

// Create placeholder PNG icons
const iconDir = resolve(dist, 'icons');
if (!existsSync(iconDir)) mkdirSync(iconDir, { recursive: true });

// Base64 encoded 1x1 blue pixel PNG (valid minimal PNG)
const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const iconBuffer = Buffer.from(iconBase64, 'base64');

[16, 48, 128].forEach(size => {
  writeFileSync(resolve(iconDir, `icon-${size}.png`), iconBuffer);
});

console.log('[copy-assets] manifest.json and icons copied to dist/');
