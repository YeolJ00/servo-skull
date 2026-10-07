// Minimal headless Chrome driver over the DevTools Protocol. No dependencies.
// Used by the dev scripts (screenshots, icon rasterizing). Needs Chrome or Edge installed.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome(explicit) {
  const found = [explicit, ...CANDIDATES].filter(Boolean).find((c) => existsSync(c));
  if (!found) throw new Error('No Chrome or Edge found; pass --chrome <path>');
  return found;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launches headless Chrome, opens one page, and runs `fn({ send, once, sleep })`.
 * `send(method, params)` issues a CDP command; `once(event)` resolves on the next such event.
 */
export async function withPage(fn, { chrome } = {}) {
  const exe = findChrome(chrome);
  const profile = mkdtempSync(join(tmpdir(), 'servo-skull-chrome-'));
  const proc = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
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

  try {
    return await fn({ send, once, sleep });
  } finally {
    ws.close();
    proc.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold the profile for a moment on Windows; a leftover temp dir is harmless.
    }
  }
}
