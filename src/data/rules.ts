// The merged view over every imported pack. Pure.
import type { Datasheet, Detachment, Faction, RulesPack, Stratagem } from './pack.ts';

export interface Rules {
  packs: RulesPack[];
  factions: Faction[];
  detachments: Detachment[];
  datasheets: Datasheet[];
  stratagems: Stratagem[];
  sheetById: Map<string, Datasheet>;
  sheetsByName: Map<string, Datasheet[]>;
}

export const EMPTY_RULES: Rules = mergePacks([]);

/** Later packs override earlier ones for the same id. */
export function mergePacks(packs: RulesPack[]): Rules {
  const factions = new Map<string, Faction>();
  const detachments = new Map<string, Detachment>();
  const datasheets = new Map<string, Datasheet>();
  const stratagems = new Map<string, Stratagem>();
  for (const p of packs) {
    for (const f of p.factions) factions.set(f.id, f);
    for (const d of p.detachments) detachments.set(d.id, d);
    for (const d of p.datasheets) datasheets.set(d.id, d);
    for (const s of p.stratagems) stratagems.set(s.id, s);
  }
  const sheetsByName = new Map<string, Datasheet[]>();
  for (const d of datasheets.values()) {
    const key = normalizeName(d.name);
    const list = sheetsByName.get(key) ?? [];
    list.push(d);
    sheetsByName.set(key, list);
  }
  return {
    packs,
    factions: [...factions.values()].sort((a, b) => a.name.localeCompare(b.name)),
    detachments: [...detachments.values()],
    datasheets: [...datasheets.values()].sort((a, b) => a.name.localeCompare(b.name)),
    stratagems: [...stratagems.values()],
    sheetById: datasheets,
    sheetsByName,
  };
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

/** Name search over datasheets, optionally limited to factions. Virtual datasheets are hidden. */
export function searchDatasheets(rules: Rules, query: string, factionIds?: string[]): Datasheet[] {
  const q = normalizeName(query);
  const inFaction = factionIds && factionIds.length > 0 ? new Set(factionIds) : null;
  return rules.datasheets.filter(
    (d) => !d.virtual && (!inFaction || inFaction.has(d.factionId)) && (q === '' || normalizeName(d.name).includes(q)),
  );
}

export function detachmentsFor(rules: Rules, factionId: string): Detachment[] {
  return rules.detachments.filter((d) => d.factionId === factionId).sort((a, b) => a.name.localeCompare(b.name));
}
