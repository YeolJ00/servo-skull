// The attack sequence (05): hit roll, wound roll, saves and damage allocation, then mortal wounds.
// Pure. Every stage takes dice as input so the players can roll real dice and enter the faces,
// or let the app roll. `resolveAttack` runs the whole sequence with an Rng for the digital case.
import { type DiceExpr, rollExpr } from './expr.ts';
import type { Rng } from './rng.ts';
import { rollDice } from './roll.ts';

export interface WeaponProfile {
  name: string;
  /** Attacks per model, as an expression. */
  attacks: DiceExpr;
  /** Ballistic or Weapon Skill target, e.g. 3 for "3+". Null for weapons that hit automatically (torrent). */
  skill: number | null;
  strength: number;
  /** AP as a non-positive number: "-1" → -1. */
  ap: number;
  damage: DiceExpr;
  ranged: boolean;
}

export interface TargetModel {
  id: string;
  /** Remaining wounds. 0 means destroyed. */
  wounds: number;
  maxWounds: number;
  /** Armour save target, e.g. 3 for "3+". 7 means no save. */
  sv: number;
  /** Invulnerable save target, or null. */
  invSv: number | null;
  character: boolean;
}

export interface HitResult {
  dice: number[];
  hits: number;
  criticalHits: number;
  /** The skill after modifiers, or null for automatic hits. */
  needed: number | null;
}

export interface WoundResult {
  dice: number[];
  wounds: number;
  criticalWounds: number;
  needed: number;
}

export interface DamageEvent {
  modelId: string;
  saveRoll: number;
  damageDice: number[];
  damage: number;
  /** Damage beyond the model's remaining wounds is lost (05). */
  lost: number;
  destroyed: boolean;
}

export interface SaveResult {
  dice: number[];
  saved: number;
  failed: number;
  events: DamageEvent[];
  /** Target models after damage, same order as the input. */
  models: TargetModel[];
}

// ---- 05.02 Hit roll ----

/** Number of attacks: one roll of the attacks expression per attacking model. */
export function attackCount(weapon: WeaponProfile, models: number, rng: Rng): { dice: number[]; attacks: number } {
  const dice: number[] = [];
  let attacks = 0;
  for (let i = 0; i < models; i++) {
    const r = rollExpr(weapon.attacks, rng);
    dice.push(...r.dice);
    attacks += r.total;
  }
  return { dice, attacks };
}

/**
 * 05.02: an unmodified 1 always fails, an unmodified 6 is a critical hit and always hits.
 * Otherwise the roll must meet the skill. 13.08: benefit of cover worsens the skill by 1 for ranged attacks.
 */
export function resolveHits(dice: number[], weapon: WeaponProfile, options: { cover?: boolean } = {}): HitResult {
  if (weapon.skill === null) {
    return { dice, hits: dice.length, criticalHits: dice.filter((d) => d === 6).length, needed: null };
  }
  const needed = weapon.skill + (options.cover && weapon.ranged ? 1 : 0);
  let hits = 0;
  let criticalHits = 0;
  for (const d of dice) {
    if (d === 1) continue;
    if (d === 6) {
      hits++;
      criticalHits++;
    } else if (d >= needed) hits++;
  }
  return { dice, hits, criticalHits, needed };
}

// ---- 05.03 Wound roll ----

/** The wound roll needed for a Strength against a Toughness (05.03). */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

/** 05.03: unmodified 1 fails, unmodified 6 is a critical wound. */
export function resolveWounds(dice: number[], strength: number, toughness: number): WoundResult {
  const needed = woundTarget(strength, toughness);
  let wounds = 0;
  let criticalWounds = 0;
  for (const d of dice) {
    if (d === 1) continue;
    if (d === 6) {
      wounds++;
      criticalWounds++;
    } else if (d >= needed) wounds++;
  }
  return { dice, wounds, criticalWounds, needed };
}

// ---- 05.04 Saves and damage ----

/**
 * Groups the target's living models for allocation (05.04): each CHARACTER is its own group;
 * other models are grouped by matching wounds, save, and invulnerable save. Order: a non-character
 * group with a wounded model first, then other non-character groups, then characters, wounded first.
 */
export function allocationGroups(models: TargetModel[]): TargetModel[][] {
  const alive = models.filter((m) => m.wounds > 0);
  const groups: TargetModel[][] = [];
  const keyed = new Map<string, TargetModel[]>();
  for (const m of alive) {
    if (m.character) {
      groups.push([m]);
      continue;
    }
    const key = `${m.maxWounds}/${m.sv}/${m.invSv ?? '-'}`;
    const g = keyed.get(key);
    if (g) g.push(m);
    else {
      const ng = [m];
      keyed.set(key, ng);
      groups.push(ng);
    }
  }
  const isWounded = (g: TargetModel[]) => g.some((m) => m.wounds < m.maxWounds);
  const rank = (g: TargetModel[]) => {
    const character = g[0]?.character ?? false;
    if (!character) return isWounded(g) ? 0 : 1;
    return isWounded(g) ? 2 : 3;
  };
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map((x) => x.g);
}

/**
 * Applies one save die per wounding hit, lowest result first (05.04):
 * an unmodified 1 fails; a roll at or above the invulnerable save passes; a roll plus AP at or above
 * the armour save passes; otherwise the current model (a wounded one if any) loses the damage.
 * Each failed save rolls its own damage from `damageDice` in order (one entry per failed save).
 */
export function resolveSaves(
  saveDice: number[],
  weapon: WeaponProfile,
  target: TargetModel[],
  damageRolls: (() => { dice: number[]; total: number }) | number[][],
): SaveResult {
  const models = target.map((m) => ({ ...m }));
  const sorted = [...saveDice].sort((a, b) => a - b);
  const events: DamageEvent[] = [];
  let saved = 0;
  let failed = 0;
  let damageIndex = 0;

  const nextDamage = (): { dice: number[]; total: number } => {
    if (typeof damageRolls === 'function') return damageRolls();
    const dice = damageRolls[damageIndex++] ?? [];
    const flat = weapon.damage.sides === 0 ? weapon.damage.bonus : 0;
    return { dice, total: flat || dice.reduce((a, b) => a + b, 0) + weapon.damage.bonus };
  };

  for (const roll of sorted) {
    const groups = allocationGroups(models);
    const group = groups[0];
    if (!group) break; // the unit is destroyed
    // The current model: a wounded one in the group if there is one, else the first.
    const model = group.find((m) => m.wounds < m.maxWounds) ?? group[0];
    if (!model) break;

    const passes = roll !== 1 && ((model.invSv !== null && roll >= model.invSv) || roll + weapon.ap >= model.sv);
    if (passes) {
      saved++;
      continue;
    }
    failed++;
    const dmg = nextDamage();
    const applied = Math.min(dmg.total, model.wounds);
    const lost = dmg.total - applied;
    model.wounds -= applied;
    events.push({
      modelId: model.id,
      saveRoll: roll,
      damageDice: dmg.dice,
      damage: dmg.total,
      lost,
      destroyed: model.wounds === 0,
    });
  }
  return { dice: saveDice, saved, failed, events, models };
}

// ---- 06.02 Mortal wounds ----

/** Mortal wounds are applied after normal damage, one at a time, to wounded non-characters first. */
export function applyMortalWounds(target: TargetModel[], count: number): { models: TargetModel[]; destroyed: string[] } {
  const models = target.map((m) => ({ ...m }));
  const destroyed: string[] = [];
  for (let i = 0; i < count; i++) {
    const alive = models.filter((m) => m.wounds > 0);
    if (alive.length === 0) break;
    const pick =
      alive.find((m) => !m.character && m.wounds < m.maxWounds) ??
      alive.find((m) => !m.character) ??
      alive.find((m) => m.wounds < m.maxWounds) ??
      alive[0];
    if (!pick) break;
    pick.wounds -= 1;
    if (pick.wounds === 0) destroyed.push(pick.id);
  }
  return { models, destroyed };
}

// ---- Whole sequence with digital dice ----

export interface AttackInput {
  weapon: WeaponProfile;
  attackingModels: number;
  toughness: number;
  target: TargetModel[];
  cover?: boolean;
}

export interface AttackResult {
  weaponName: string;
  attacks: number;
  attackDice: number[];
  hit: HitResult;
  wound: WoundResult;
  save: SaveResult;
  destroyed: string[];
}

export function resolveAttack(input: AttackInput, rng: Rng): AttackResult {
  const { dice: attackDice, attacks } = attackCount(input.weapon, input.attackingModels, rng);
  const hit = resolveHits(rollDice(attacks, rng), input.weapon, { cover: input.cover ?? false });
  const wound = resolveWounds(rollDice(hit.hits, rng), input.weapon.strength, input.toughness);
  const save = resolveSaves(rollDice(wound.wounds, rng), input.weapon, input.target, () => rollExpr(input.weapon.damage, rng));
  const destroyed = save.models.filter((m, i) => m.wounds === 0 && (input.target[i]?.wounds ?? 0) > 0).map((m) => m.id);
  return { weaponName: input.weapon.name, attacks, attackDice, hit, wound, save, destroyed };
}
