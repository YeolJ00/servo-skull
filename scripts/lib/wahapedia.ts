// Downloads Wahapedia's 11th edition export CSVs into .cache/wahapedia/ (gitignored) and reuses
// them afterwards. Wahapedia does not run an API, so files are fetched once per cache, never in a loop.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_FILES, type PackFileName, type PackFiles } from '../../src/data/import/buildPack.ts';

export const EXPORT_BASE = 'https://wahapedia.ru/wh40k11ed/';
export const EXPORT_PAGE = `${EXPORT_BASE}the-rules/data-export`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cacheDir = join(repoRoot, '.cache', 'wahapedia');

export async function loadExport(refresh = false): Promise<PackFiles> {
  mkdirSync(cacheDir, { recursive: true });
  const files: PackFiles = {};
  for (const name of PACK_FILES) files[name] = await loadFile(name, refresh);
  return files;
}

async function loadFile(name: PackFileName, refresh: boolean): Promise<string> {
  const file = join(cacheDir, `${name}.csv`);
  if (!refresh && existsSync(file)) return readFileSync(file, 'utf8');
  const url = `${EXPORT_BASE}${name}.csv`;
  console.log(`downloading ${url}`);
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = 'true';
    else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}
