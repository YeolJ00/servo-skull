// Army lists: what each player brings. Pure model and helpers.
import { costFor, type Datasheet } from './pack.ts';
import { normalizeName, type Rules } from './rules.ts';

export interface ArmyUnit {
  /** Wahapedia datasheet id. */
  datasheetId: string;
  /** Datasheet name, kept so the unit can be re-resolved after a pack update. */
  name: string;
  models: number;
  wargear?: string[];
}

export interface ArmyList {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Main faction first, allies after. */
  factionIds: string[];
  detachmentId?: string;
  pointsLimit?: number;
  units: ArmyUnit[];
  updatedAt: number;
}

export function newArmyId(): string {
  return `army-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newArmy(name: string, factionIds: string[] = []): ArmyList {
  return { schemaVersion: 1, id: newArmyId(), name, factionIds, units: [], updatedAt: Date.now() };
}

export interface ResolvedUnit {
  unit: ArmyUnit;
  sheet: Datasheet | undefined;
  /** The id was missing after a pack update and the unit was matched by name. */
  renamed: boolean;
}

/** Looks a unit up by id, then by name. */
export function resolveUnit(unit: ArmyUnit, rules: Rules): ResolvedUnit {
  const byId = rules.sheetById.get(unit.datasheetId);
  if (byId) return { unit, sheet: byId, renamed: false };
  const byName = rules.sheetsByName.get(normalizeName(unit.name))?.[0];
  return { unit, sheet: byName, renamed: !!byName };
}

export function unitPoints(unit: ArmyUnit, rules: Rules): number | undefined {
  const { sheet } = resolveUnit(unit, rules);
  return sheet ? costFor(sheet, unit.models) : undefined;
}

export interface ArmySummary {
  points: number;
  /** Units whose points are unknown (no datasheet or no costs). */
  unpriced: number;
  models: number;
}

export function summarizeArmy(army: ArmyList, rules: Rules): ArmySummary {
  let points = 0;
  let unpriced = 0;
  let models = 0;
  for (const u of army.units) {
    const p = unitPoints(u, rules);
    if (p === undefined) unpriced++;
    else points += p;
    models += u.models;
  }
  return { points, unpriced, models };
}

export type ArmyWarning =
  | { code: 'unknownUnit'; unit: ArmyUnit }
  | { code: 'renamedUnit'; unit: ArmyUnit }
  | { code: 'modelsOutOfRange'; unit: ArmyUnit; min: number; max: number }
  | { code: 'overPoints'; points: number; limit: number }
  | { code: 'noUnits' };

/** Validation warns but never blocks. Casual games are fine. */
export function armyWarnings(army: ArmyList, rules: Rules): ArmyWarning[] {
  const out: ArmyWarning[] = [];
  if (army.units.length === 0) out.push({ code: 'noUnits' });
  for (const unit of army.units) {
    const { sheet, renamed } = resolveUnit(unit, rules);
    if (!sheet) {
      out.push({ code: 'unknownUnit', unit });
      continue;
    }
    if (renamed) out.push({ code: 'renamedUnit', unit });
    if (sheet.maxModels > 0 && (unit.models < sheet.minModels || unit.models > sheet.maxModels)) {
      out.push({ code: 'modelsOutOfRange', unit, min: sheet.minModels, max: sheet.maxModels });
    }
  }
  if (army.pointsLimit) {
    const { points } = summarizeArmy(army, rules);
    if (points > army.pointsLimit) out.push({ code: 'overPoints', points, limit: army.pointsLimit });
  }
  return out;
}

export class ArmyFormatError extends Error {}

/** Parses an exported army JSON. Assigns a fresh id so imports never collide. */
export function parseArmyJson(text: string): ArmyList {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ArmyFormatError('json');
  }
  if (!value || typeof value !== 'object') throw new ArmyFormatError('shape');
  const a = value as Partial<ArmyList>;
  if (a.schemaVersion !== 1 || typeof a.name !== 'string' || !Array.isArray(a.factionIds) || !Array.isArray(a.units)) {
    throw new ArmyFormatError('shape');
  }
  const units: ArmyUnit[] = a.units.map((u: Partial<ArmyUnit>) => {
    if (typeof u.datasheetId !== 'string' || typeof u.name !== 'string' || typeof u.models !== 'number') {
      throw new ArmyFormatError('shape');
    }
    return { datasheetId: u.datasheetId, name: u.name, models: u.models, ...(u.wargear ? { wargear: u.wargear } : {}) };
  });
  return {
    schemaVersion: 1,
    id: newArmyId(),
    name: a.name,
    factionIds: a.factionIds.filter((f): f is string => typeof f === 'string'),
    ...(typeof a.detachmentId === 'string' ? { detachmentId: a.detachmentId } : {}),
    ...(typeof a.pointsLimit === 'number' ? { pointsLimit: a.pointsLimit } : {}),
    units,
    updatedAt: Date.now(),
  };
}

export interface Preset {
  name: string;
  factionIds: string[];
  pointsLimit?: number;
  units: { name: string; models: number }[];
}

/** Builds an army from a preset by resolving datasheet names against the loaded rules. */
export function armyFromPreset(preset: Preset, rules: Rules): { army: ArmyList; missing: string[] } {
  const army = newArmy(preset.name, preset.factionIds);
  if (preset.pointsLimit) army.pointsLimit = preset.pointsLimit;
  const missing: string[] = [];
  for (const u of preset.units) {
    const sheet = rules.sheetsByName.get(normalizeName(u.name))?.find((s) => preset.factionIds.includes(s.factionId));
    if (!sheet) {
      missing.push(u.name);
      continue;
    }
    army.units.push({ datasheetId: sheet.id, name: sheet.name, models: u.models });
  }
  return { army, missing };
}
