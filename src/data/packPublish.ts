// Packs published with the site at <base>/packs/. Same origin only: the app never calls Wahapedia.
import { savePack, validatePack, type PackMeta } from './packStorage.ts';

export interface PublishedPack {
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

const base = import.meta.env.BASE_URL;

export async function loadPublishedIndex(): Promise<PublishedPack[]> {
  const res = await fetch(`${base}packs/index.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`index: HTTP ${res.status}`);
  const data = (await res.json()) as { schemaVersion?: number; packs?: PublishedPack[] };
  if (data.schemaVersion !== 1 || !Array.isArray(data.packs)) throw new Error('index: bad shape');
  return data.packs;
}

export async function installPublished(entry: PublishedPack): Promise<PackMeta> {
  const res = await fetch(`${base}packs/${entry.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`pack: HTTP ${res.status}`);
  const pack = validatePack(await res.json());
  return savePack(pack);
}
