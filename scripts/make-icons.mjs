// Generates the PWA PNG icons in public/icons/ with no dependencies.
// Run: npm run icons
// Draws the same shape as public/icon.svg: a Void tile, a Brass disc, two eye sockets, and teeth.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOID = [0x1b, 0x22, 0x30];
const BRASS = [0xb8, 0x91, 0x3a];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape in a 64-unit coordinate space, mirroring icon.svg.
function inShape(u, v) {
  const inDisc = (u - 32) ** 2 + (v - 29) ** 2 <= 19 ** 2;
  const inEyeL = (u - 24) ** 2 + (v - 27) ** 2 <= 5.5 ** 2;
  const inEyeR = (u - 40) ** 2 + (v - 27) ** 2 <= 5.5 ** 2;
  const inJaw = u >= 27 && u <= 37 && v >= 40 && v <= 44;
  const inTooth = v > 44 && v <= 48 && ((u >= 27 && u < 29) || (u >= 31 && u < 33) || (u >= 35 && u < 37));
  if (inEyeL || inEyeR || inJaw || inTooth) return 'void';
  if (inDisc) return 'brass';
  return 'void';
}

function inRoundedTile(u, v, radius) {
  const cx = Math.min(Math.max(u, radius), 64 - radius);
  const cy = Math.min(Math.max(v, radius), 64 - radius);
  return (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2;
}

/** @param {number} size @param {boolean} maskable Fill the whole square; the OS applies its own mask. */
function render(size, maskable) {
  // Maskable icons keep content inside the central 80% safe zone.
  const scale = maskable ? 0.8 : 1;
  return png(size, (x, y) => {
    // 2x2 supersampling for smooth edges.
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const u = (((x + dx) / size - 0.5) / scale + 0.5) * 64;
      const v = (((y + dy) / size - 0.5) / scale + 0.5) * 64;
      const inside = maskable ? true : inRoundedTile(u, v, 14);
      if (!inside) continue;
      const onCanvas = u >= 0 && u < 64 && v >= 0 && v < 64;
      const c = onCanvas && inShape(u, v) === 'brass' ? BRASS : VOID;
      r += c[0];
      g += c[1];
      b += c[2];
      a += 255;
    }
    return [r / 4, g / 4, b / 4, a / 4].map(Math.round);
  });
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon-192.png'), render(192, false));
writeFileSync(join(outDir, 'icon-512.png'), render(512, false));
writeFileSync(join(outDir, 'icon-maskable-512.png'), render(512, true));
console.log('wrote icons to', outDir);
