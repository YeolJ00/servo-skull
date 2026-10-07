// Rules pack: the subset of the Wahapedia data export the app needs, per faction.
// Packs are built on a dev machine (scripts/build-pack.ts) or in the browser from raw CSVs,
// and imported per device. They contain Games Workshop text and are never committed.

export const PACK_SCHEMA_VERSION = 1;

export interface PackSource {
  name: 'Wahapedia';
  url: string;
  /** Wahapedia's Last_update stamp, "yyyy-MM-dd HH:mm:ss" (GMT+3). */
  lastUpdate: string;
  /** ISO timestamp of when the pack was built. */
  builtAt: string;
}

export interface Faction {
  id: string;
  name: string;
  link: string;
}

export interface Detachment {
  id: string;
  factionId: string;
  name: string;
  type: string;
  /** Detachment Points, if the export lists them. */
  dp: string;
  forceDisposition: string;
}

export interface ModelProfile {
  name: string;
  /** Raw characteristics as printed, e.g. M "6\"", Sv "3+", Ld "6+". */
  m: string;
  t: string;
  sv: string;
  invSv: string;
  w: string;
  ld: string;
  oc: string;
}

export interface CompositionLine {
  description: string;
  min: number;
  max: number;
}

export interface CostTier {
  models: number;
  cost: number;
}

export interface Weapon {
  name: string;
  /** Weapon abilities and notes as exported (text). */
  description: string;
  range: string;
  type: 'Ranged' | 'Melee' | string;
  a: string;
  bsWs: string;
  s: string;
  ap: string;
  d: string;
}

export interface Ability {
  name: string;
  description: string;
  type: string;
  parameter: string;
}

export interface Datasheet {
  id: string;
  name: string;
  factionId: string;
  role: string;
  link: string;
  virtual: boolean;
  keywords: string[];
  factionKeywords: string[];
  models: ModelProfile[];
  composition: CompositionLine[];
  /** Total model count limits derived from composition. */
  minModels: number;
  maxModels: number;
  /** Points by model count, lowest tier first. Empty if the export has no costs. */
  costs: CostTier[];
  weapons: Weapon[];
  abilities: Ability[];
  /** Datasheet ids this unit can lead (19). */
  leads: string[];
}

export interface Stratagem {
  id: string;
  factionId: string;
  detachmentId: string;
  name: string;
  type: string;
  cpCost: string;
  /** "Your turn", "Opponent’s turn", "Either player’s turn", or "". */
  turn: string;
  /** "Shooting phase", "Any phase", "Shooting or Fight phase", ... */
  phase: string;
  description: string;
}

export interface RulesPack {
  schemaVersion: typeof PACK_SCHEMA_VERSION;
  /** Stable id, e.g. "wahapedia-sm-ork". */
  id: string;
  name: string;
  source: PackSource;
  factions: Faction[];
  detachments: Detachment[];
  datasheets: Datasheet[];
  stratagems: Stratagem[];
}

/** Leadership as a number: "6+" → 6. Undefined if the value is not a target. */
export function parseTarget(value: string): number | undefined {
  const m = /^(\d+)\+?$/.exec(value.trim());
  return m ? Number(m[1]) : undefined;
}

/** Points for a given model count: the lowest tier whose model count is at least `models`. */
export function costFor(sheet: Pick<Datasheet, 'costs'>, models: number): number | undefined {
  const tiers = [...sheet.costs].sort((a, b) => a.models - b.models);
  const tier = tiers.find((c) => c.models >= models) ?? tiers[tiers.length - 1];
  return tier?.cost;
}
