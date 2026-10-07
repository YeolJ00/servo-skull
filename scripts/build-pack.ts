// Builds one rules pack from Wahapedia's 11th edition data export.
//
//   npm run pack -- --factions SM,ORK [--name "Marines + Orks"] [--out packs/sm-ork.pack.json] [--refresh]
//
// Runs on Node 24 directly (type stripping); it imports the pure importer from src/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildPack } from '../src/data/import/buildPack.ts';
import { EXPORT_PAGE, loadExport, parseArgs, repoRoot } from './lib/wahapedia.ts';

const args = parseArgs(process.argv.slice(2));
if (!args.factions) {
  console.error('usage: npm run pack -- --factions SM,ORK [--name NAME] [--out FILE] [--refresh]');
  process.exit(2);
}
const factions = args.factions.split(',').map((s) => s.trim()).filter(Boolean);
const files = await loadExport(args.refresh === 'true');
const pack = buildPack(files, { factions, ...(args.name ? { name: args.name } : {}), sourceUrl: EXPORT_PAGE });
const out = args.out ?? join(repoRoot, 'packs', `${pack.id.replace(/^wahapedia-/, '')}.pack.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(pack));
console.log(
  `wrote ${out}: ${pack.datasheets.length} datasheets, ${pack.detachments.length} detachments, ${pack.stratagems.length} stratagems (Wahapedia update ${pack.source.lastUpdate})`,
);
