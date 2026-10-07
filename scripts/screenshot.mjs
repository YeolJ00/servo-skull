// Dev tool: screenshot a page in headless Chrome at a phone or tablet size, in dark or light mode.
//
//   node scripts/screenshot.mjs --url http://localhost:4173/servo-skull/#/game \
//     --out shot.png [--size 390x844] [--scheme dark|light] [--wait 1500] [--seed game.json] [--chrome path]
//
// --seed writes the given JSON into IndexedDB as the current game (key game:current) before loading the page.
import { readFileSync, writeFileSync } from 'node:fs';
import { withPage } from './lib/chrome.mjs';

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

await withPage(
  async ({ send, once, sleep }) => {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });

    if (args.seed) {
      // Load the origin first so IndexedDB writes land in the app's storage.
      const origin = new URL(args.url);
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url: `${origin.origin}/favicon.ico` });
      await loaded;
      // A seed file is either a saved game (stored under game:current) or, when it has a top-level
      // "__keys" object, a map of IndexedDB key → value to store as-is (packs, armies, game).
      const seed = JSON.parse(readFileSync(args.seed, 'utf8'));
      const entries = seed && typeof seed === 'object' && seed.__keys ? seed.__keys : { 'game:current': seed };
      const expr = `new Promise((resolve, reject) => {
        const req = indexedDB.open('keyval-store', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('keyval');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          const entries = ${JSON.stringify(entries)};
          for (const [k, v] of Object.entries(entries)) tx.objectStore('keyval').put(v, k);
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
  },
  { chrome: args.chrome },
);
