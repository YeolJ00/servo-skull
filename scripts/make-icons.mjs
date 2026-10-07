// Rasterizes public/icon.svg into the PWA PNG icons in public/icons/ using headless Chrome.
// Run: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from './lib/chrome.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'), 'utf8');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// The maskable variant fills the whole square (the OS applies its own mask) and keeps the
// skull inside the central 80% safe zone.
const tileColor = svg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1] ?? '#12171F';
const maskableSvg = svg.replace(/<rect width="64" height="64"[^>]*\/>/, '<rect width="64" height="64" fill="' + tileColor + '"/>');

const jobs = [
  { file: 'icon-192.png', size: 192, svg, scale: 1 },
  { file: 'icon-512.png', size: 512, svg, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, svg: maskableSvg, scale: 0.8 },
];

await withPage(async ({ send, once, sleep }) => {
  await send('Page.enable');
  // Transparent page background so the tile's rounded corners stay transparent.
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const job of jobs) {
    await send('Emulation.setDeviceMetricsOverride', { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
    const inner = Math.round(job.size * job.scale);
    const offset = Math.round((job.size - inner) / 2);
    const bg = job.scale < 1 ? `background:${tileColor};` : '';
    const html = `<!doctype html><html><body style="margin:0;${bg}width:${job.size}px;height:${job.size}px;overflow:hidden">
      <img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.svg)}" style="position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px"></body></html>`;
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await loaded;
    await sleep(150);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, job.file), Buffer.from(shot.data, 'base64'));
    console.log(`wrote ${job.file}`);
  }
});
