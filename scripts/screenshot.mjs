// Dev tool: screenshot a page in headless Chrome at a phone or tablet size, in dark or light mode.
// No dependencies; drives Chrome over the DevTools Protocol with Node's built-in WebSocket.
//
//   node scripts/screenshot.mjs --url http://localhost:4173/servo-skull/#/game \
//     --out shot.png [--size 390x844] [--scheme dark|light] [--wait 1500] [--seed game.json] [--chrome path]
//
// --seed writes the given JSON into IndexedDB as the current game (key game:current) before loading the page.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null))
    .filter(Boolean),
);
if (!args.url || !args.out) {
  console.error('usage: --url <url> --out <file.png> [--size WxH] [--scheme dark|light] [--wait ms] [--seed file]');
  process.exit(2);
}
const [width, height] = (args.size ?? '390x844').split('x').map(Number);
const scheme = args.scheme ?? 'dark';
const wait = Number(args.wait ?? 1500);

const candidates = [
  args.chrome,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) throw new Error('No Chrome or Edge found; pass --chrome');

const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--hide-scrollbars',
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=0',
  'about:blank',
]);

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  proc.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  proc.on('exit', (code) => reject(new Error(`chrome exited early (${code})\n${buf}`)));
  setTimeout(() => reject(new Error('chrome did not start')), 15000);
});

const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
const listeners = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method && listeners.has(msg.method)) {
    listeners.get(msg.method)(msg.params);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const once = (method) => new Promise((r) => listeners.set(method, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });

  if (args.seed) {
    // Load the origin first so IndexedDB writes land in the app's storage.
    const origin = new URL(args.url);
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url: `${origin.origin}/favicon.ico` });
    await loaded;
    const seed = JSON.parse(readFileSync(args.seed, 'utf8'));
    const expr = `new Promise((resolve, reject) => {
      const req = indexedDB.open('keyval-store', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keyval');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(${JSON.stringify(seed)}, 'game:current');
        tx.oncomplete = () => resolve('ok');
        tx.onerror = () => reject(tx.error);
      };
    })`;
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true });
    if (r.result?.value !== 'ok') throw new Error(`seed failed: ${JSON.stringify(r)}`);
  }

  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: args.url });
  await loaded;
  await sleep(wait);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(args.out, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${args.out} (${width}x${height}, ${scheme})`);
} finally {
  ws.close();
  proc.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
