// Builds a rules pack from Wahapedia's 11th edition data export.
//
//   npm run pack -- --factions SM,ORK [--name "Marines + Orks"] [--out packs/sm-ork.pack.json] [--refresh]
//
// Downloads each CSV once into .cache/wahapedia/ (gitignored) and reuses it afterwards.
// Wahapedia does not run an API, so never download in a loop. Pass --refresh to fetch again.
// Runs on Node 24 directly (type stripping); it imports the pure importer from src/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPack, PACK_FILES, type PackFileName, type PackFiles } from '../src/data/import/buildPack.ts';

const EXPORT_BASE = 'https://wahapedia.ru/wh40k11ed/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.cache', 'wahapedia');
const args = parseArgs(process.argv.slice(2));

if (!args.factions) {
  console.error('usage: npm run pack -- --factions SM,ORK [--name NAME] [--out FILE] [--refresh]');
  process.exit(2);
}
const factions = args.factions.split(',').map((s) => s.trim()).filter(Boolean);

mkdirSync(cacheDir, { recursive: true });
const files: PackFiles = {};
for (const name of PACK_FILES) files[name] = await load(name, args.refresh === 'true');

const pack = buildPack(files, { factions, ...(args.name ? { name: args.name } : {}), sourceUrl: `${EXPORT_BASE}the-rules/data-export` });
const out = args.out ?? join(root, 'packs', `${pack.id.replace(/^wahapedia-/, '')}.pack.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(pack));
console.log(
  `wrote ${out}: ${pack.datasheets.length} datasheets, ${pack.detachments.length} detachments, ${pack.stratagems.length} stratagems (Wahapedia update ${pack.source.lastUpdate})`,
);

async function load(name: PackFileName, refresh: boolean): Promise<string> {
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

function parseArgs(argv: string[]): Record<string, string> {
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
