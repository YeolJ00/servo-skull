// Builds every pack listed in packs.config.json into public/packs/ (gitignored) plus an index.json,
// so the deployed site can offer one-tap installs. The deploy workflow runs this before `vite build`.
//
//   npm run packs [-- --refresh]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPack } from '../src/data/import/buildPack.ts';
import { EXPORT_PAGE, loadExport, parseArgs, repoRoot } from './lib/wahapedia.ts';

interface PackConfig {
  factions: string[];
  name?: string;
}

export interface PublishedPackEntry {
  id: string;
  name: string;
  file: string;
  factionIds: string[];
  factionNames: string[];
  lastUpdate: string;
  builtAt: string;
  datasheets: number;
  bytes: number;
}

const args = parseArgs(process.argv.slice(2));
const config = JSON.parse(readFileSync(join(repoRoot, 'packs.config.json'), 'utf8')) as PackConfig[];
const outDir = join(repoRoot, 'public', 'packs');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = await loadExport(args.refresh === 'true');
const index: PublishedPackEntry[] = [];
for (const c of config) {
  const pack = buildPack(files, { factions: c.factions, ...(c.name ? { name: c.name } : {}), sourceUrl: EXPORT_PAGE });
  const file = `${pack.id.replace(/^wahapedia-/, '')}.pack.json`;
  const json = JSON.stringify(pack);
  writeFileSync(join(outDir, file), json);
  index.push({
    id: pack.id,
    name: pack.name,
    file,
    factionIds: pack.factions.map((f) => f.id),
    factionNames: pack.factions.map((f) => f.name),
    lastUpdate: pack.source.lastUpdate,
    builtAt: pack.source.builtAt,
    datasheets: pack.datasheets.length,
    bytes: Buffer.byteLength(json),
  });
  console.log(`wrote public/packs/${file}: ${pack.datasheets.length} datasheets`);
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ schemaVersion: 1, packs: index }, null, 2));
console.log(`wrote public/packs/index.json (${index.length} packs, Wahapedia update ${index[0]?.lastUpdate ?? '?'})`);
