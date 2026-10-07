import { del, get, set } from 'idb-keyval';
import { PACK_SCHEMA_VERSION, type RulesPack } from './pack.ts';

// Rules packs live in IndexedDB on each device. Never in the repo, never on the site.
export interface PackMeta {
  id: string;
  name: string;
  factionIds: string[];
  factionNames: string[];
  lastUpdate: string;
  importedAt: number;
  datasheets: number;
}

const INDEX_KEY = 'packs:index';
const packKey = (id: string) => `pack:${id}`;

export class PackFormatError extends Error {}

/** Checks the shape of an imported JSON value. Throws PackFormatError with a reason key. */
export function validatePack(value: unknown): RulesPack {
  if (!value || typeof value !== 'object') throw new PackFormatError('notObject');
  const p = value as Partial<RulesPack>;
  if (p.schemaVersion !== PACK_SCHEMA_VERSION) throw new PackFormatError('schema');
  if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new PackFormatError('shape');
  for (const key of ['factions', 'detachments', 'datasheets', 'stratagems'] as const) {
    if (!Array.isArray(p[key])) throw new PackFormatError('shape');
  }
  if (!p.source || typeof p.source !== 'object') throw new PackFormatError('shape');
  return p as RulesPack;
}

export async function listPacks(): Promise<PackMeta[]> {
  try {
    return (await get<PackMeta[]>(INDEX_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function getPack(id: string): Promise<RulesPack | undefined> {
  return get<RulesPack>(packKey(id));
}

export async function savePack(pack: RulesPack): Promise<PackMeta> {
  const meta: PackMeta = {
    id: pack.id,
    name: pack.name,
    factionIds: pack.factions.map((f) => f.id),
    factionNames: pack.factions.map((f) => f.name),
    lastUpdate: pack.source.lastUpdate,
    importedAt: Date.now(),
    datasheets: pack.datasheets.length,
  };
  await set(packKey(pack.id), pack);
  const index = (await listPacks()).filter((m) => m.id !== pack.id);
  index.push(meta);
  await set(INDEX_KEY, index);
  return meta;
}

export async function removePack(id: string): Promise<void> {
  await del(packKey(id));
  const index = (await listPacks()).filter((m) => m.id !== id);
  await set(INDEX_KEY, index);
}

export async function loadAllPacks(): Promise<RulesPack[]> {
  const metas = await listPacks();
  const packs = await Promise.all(metas.map((m) => getPack(m.id)));
  return packs.filter((p): p is RulesPack => !!p);
}
