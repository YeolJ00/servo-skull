// Turns the Wahapedia export (as text per file) into a RulesPack for a set of factions.
// Pure: it can run in Node (scripts/build-pack.ts) or in the browser on raw CSVs.
import {
  PACK_SCHEMA_VERSION,
  type Ability,
  type CompositionLine,
  type CostTier,
  type Datasheet,
  type Detachment,
  type Faction,
  type ModelProfile,
  type RulesPack,
  type Stratagem,
  type Weapon,
} from '../pack.ts';
import { parseCsv, type Row } from './csv.ts';

export const PACK_FILES = [
  'Last_update',
  'Factions',
  'Datasheets',
  'Datasheets_models',
  'Datasheets_models_cost',
  'Datasheets_keywords',
  'Datasheets_wargear',
  'Datasheets_unit_composition',
  'Datasheets_abilities',
  'Datasheets_leader',
  'Detachments',
  'Stratagems',
  'Abilities',
] as const;

export type PackFileName = (typeof PACK_FILES)[number];
export type PackFiles = Partial<Record<PackFileName, string>>;

export interface BuildOptions {
  /** Faction ids (e.g. "SM", "ORK") or names (case-insensitive). */
  factions: string[];
  id?: string;
  name?: string;
  sourceUrl?: string;
  now?: Date;
}

export class PackBuildError extends Error {}

export function buildPack(files: PackFiles, options: BuildOptions): RulesPack {
  const table = (name: PackFileName): Row[] => (files[name] ? parseCsv(files[name] as string) : []);
  const must = (name: PackFileName): Row[] => {
    if (!files[name]) throw new PackBuildError(`Missing ${name}.csv`);
    return parseCsv(files[name] as string);
  };

  const allFactions = must('Factions').map(
    (r): Faction => ({ id: r.id ?? '', name: r.name ?? '', link: r.link ?? '' }),
  );
  // Keep the caller's order: the first faction is the main one and names the pack.
  const factions: Faction[] = [];
  for (const f of options.factions) {
    const hit = allFactions.find((x) => x.id === f || x.name.toLowerCase() === f.toLowerCase());
    if (!hit) throw new PackBuildError(`Unknown faction "${f}". Known: ${allFactions.map((x) => x.id).join(', ')}`);
    if (!factions.includes(hit)) factions.push(hit);
  }
  const wanted = new Set(factions.map((f) => f.id));

  const sheets = must('Datasheets').filter((r) => wanted.has(r.faction_id ?? ''));
  const sheetIds = new Set(sheets.map((r) => r.id ?? ''));
  const byId = <T extends Row>(rows: T[], key: string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = r[key] ?? '';
      if (!sheetIds.has(k)) continue;
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    return m;
  };
  const byLine = (rows: Row[]): Row[] => [...rows].sort((a, b) => Number(a.line ?? 0) - Number(b.line ?? 0));

  const models = byId(table('Datasheets_models'), 'datasheet_id');
  const costs = byId(table('Datasheets_models_cost'), 'datasheet_id');
  const keywords = byId(table('Datasheets_keywords'), 'datasheet_id');
  const wargear = byId(table('Datasheets_wargear'), 'datasheet_id');
  const composition = byId(table('Datasheets_unit_composition'), 'datasheet_id');
  const abilities = byId(table('Datasheets_abilities'), 'datasheet_id');
  const leaders = byId(table('Datasheets_leader'), 'leader_id');
  const abilityText = new Map(table('Abilities').map((r) => [r.id ?? '', r]));

  const datasheets: Datasheet[] = sheets.map((r) => {
    const id = r.id ?? '';
    const comp = byLine(composition.get(id) ?? []).map(parseComposition);
    const kw = keywords.get(id) ?? [];
    return {
      id,
      name: r.name ?? '',
      factionId: r.faction_id ?? '',
      role: r.role ?? '',
      link: r.link ?? '',
      virtual: r.virtual === 'true',
      keywords: kw.filter((k) => k.is_faction_keyword !== 'true').map((k) => k.keyword ?? ''),
      factionKeywords: kw.filter((k) => k.is_faction_keyword === 'true').map((k) => k.keyword ?? ''),
      models: byLine(models.get(id) ?? []).map(
        (m): ModelProfile => ({
          name: m.name ?? '',
          m: m.M ?? '',
          t: m.T ?? '',
          sv: m.Sv ?? '',
          invSv: m.inv_sv ?? '',
          w: m.W ?? '',
          ld: m.Ld ?? '',
          oc: m.OC ?? '',
        }),
      ),
      composition: comp,
      minModels: comp.reduce((n, c) => n + c.min, 0),
      maxModels: comp.reduce((n, c) => n + c.max, 0),
      costs: parseCosts(byLine(costs.get(id) ?? [])),
      weapons: [...(wargear.get(id) ?? [])]
        .sort((a, b) => Number(a.line ?? 0) - Number(b.line ?? 0) || Number(a.line_in_wargear ?? 0) - Number(b.line_in_wargear ?? 0))
        .map(
          (w): Weapon => ({
            name: w.name ?? '',
            description: w.description ?? '',
            range: w.range ?? '',
            type: w.type ?? '',
            a: w.A ?? '',
            bsWs: w.BS_WS ?? '',
            s: w.S ?? '',
            ap: w.AP ?? '',
            d: w.D ?? '',
          }),
        ),
      abilities: byLine(abilities.get(id) ?? []).map((a): Ability => {
        const shared = a.ability_id ? abilityText.get(a.ability_id) : undefined;
        return {
          name: shared?.name ?? a.name ?? '',
          description: shared?.description ?? a.description ?? '',
          type: a.type ?? '',
          parameter: a.parameter ?? '',
        };
      }),
      leads: (leaders.get(id) ?? []).map((l) => l.attached_id ?? ''),
    };
  });

  const detachments = table('Detachments')
    .filter((r) => wanted.has(r.faction_id ?? ''))
    .map(
      (r): Detachment => ({
        id: r.id ?? '',
        factionId: r.faction_id ?? '',
        name: r.name ?? '',
        type: r.type ?? '',
        dp: r.dp ?? '',
        forceDisposition: r.force_disposition ?? '',
      }),
    );

  // Faction stratagems plus the shared core ones (empty faction_id).
  const stratagems = table('Stratagems')
    .filter((r) => wanted.has(r.faction_id ?? '') || (r.faction_id ?? '') === '')
    .map(
      (r): Stratagem => ({
        id: r.id ?? '',
        factionId: r.faction_id ?? '',
        detachmentId: r.detachment_id ?? '',
        name: r.name ?? '',
        type: r.type ?? '',
        cpCost: r.cp_cost ?? '',
        turn: r.turn ?? '',
        phase: r.phase ?? '',
        description: r.description ?? '',
      }),
    );

  const lastUpdate = table('Last_update')[0]?.last_update ?? '';
  const slug = factions.map((f) => f.id.toLowerCase()).join('-');
  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    id: options.id ?? `wahapedia-${slug}`,
    name: options.name ?? factions.map((f) => f.name).join(' + '),
    source: {
      name: 'Wahapedia',
      url: options.sourceUrl ?? 'https://wahapedia.ru/wh40k11ed/the-rules/data-export',
      lastUpdate,
      builtAt: (options.now ?? new Date()).toISOString(),
    },
    factions,
    detachments,
    datasheets,
    stratagems,
  };
}

/** "1-2 Nob models" → min 1, max 2. "1 Intercessor Sergeant" → 1, 1. */
export function parseComposition(row: Row): CompositionLine {
  const description = (row.description ?? '').trim();
  const m = /^(\d+)(?:\s*-\s*(\d+))?/.exec(description);
  const min = m ? Number(m[1]) : 0;
  const max = m?.[2] !== undefined ? Number(m[2]) : min;
  return { description, min, max };
}

/** Cost rows mix headers ("YOUR UNIT COSTS") and tiers ("10 models|90"). Keep the first tier per model count. */
export function parseCosts(rows: Row[]): CostTier[] {
  const seen = new Map<number, number>();
  for (const r of rows) {
    const m = /^(\d+)\s+models?/i.exec((r.description ?? '').trim());
    const cost = Number(r.cost ?? '');
    if (!m || !Number.isFinite(cost) || r.cost === '') continue;
    const n = Number(m[1]);
    if (!seen.has(n)) seen.set(n, cost);
  }
  return [...seen.entries()].map(([models, cost]) => ({ models, cost })).sort((a, b) => a.models - b.models);
}
