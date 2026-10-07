// The attack sequence (05) with weapon abilities (24), modifiers (02.02.01), re-rolls (01.05.02),
// Feel No Pain (24.12), hazard rolls (06.03) and mortal wounds (06.02).
// Pure. Every stage takes dice as input so the players can roll real dice and enter the faces,
// or let the app roll. `resolveAttack` runs the whole sequence with an Rng for the digital case.
import { capModifier, NO_ABILITIES, type WeaponAbilities } from './abilities.ts';
import { type DiceExpr, rollExpr } from './expr.ts';
import type { Rng } from './rng.ts';
import { rollD6, rollDice } from './roll.ts';

export interface WeaponProfile {
  name: string;
  /** Attacks per model, as an expression. */
  attacks: DiceExpr;
  /** Ballistic or Weapon Skill target, e.g. 3 for "3+". Null for weapons that hit automatically. */
  skill: number | null;
  strength: number;
  /** AP as a non-positive number: "-1" → -1. */
  ap: number;
  damage: DiceExpr;
  ranged: boolean;
  abilities: WeaponAbilities;
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
  /** This model's Feel No Pain X+ (24.12), if it differs from the unit-wide option. */
  fnp?: number | null;
}

/** Everything the players know that the dice cannot: ranges, terrain, choices. */
export interface AttackOptions {
  /** The target has the benefit of cover (13.08). Ignored by [IGNORES COVER]. */
  cover?: boolean;
  /** Target within half range at the Select Targets step: [RAPID FIRE], [MELTA]. */
  halfRange?: boolean;
  /** The [HEAVY] conditions apply: unengaged, not set up this turn, no model moved more than 3". */
  heavyBraced?: boolean;
  /** The attacking unit made a charge move this turn: [LANCE]. */
  charged?: boolean;
  /** The attacking model is damaged (24.39): -1 to hit. */
  damaged?: boolean;
  /** Other hit and wound roll modifiers from abilities or stratagems. Capped with the rest at ±1. */
  hitModifier?: number;
  woundModifier?: number;
  /** [LETHAL HITS]: the attacker chooses to auto-wound on critical hits (default true). */
  lethalAutoWound?: boolean;
  /** Target unit keywords, for [ANTI-X]. */
  targetKeywords?: string[];
  /** Models in the target at the Select Targets step, for [BLAST] and [CLEAVE]. */
  targetModelsAtSelection?: number;
  /** [CLEAVE] only adds dice when the weapon's attacks all go at one unit (default true). */
  singleTarget?: boolean;
  /** Target's Feel No Pain X+ (24.12), or null. */
  feelNoPain?: number | null;
  /** [PRECISION]: allocate to a visible CHARACTER group first. */
  precision?: boolean;
  /** [TWIN-LINKED]: re-roll failed wound rolls (default true). */
  twinLinkedReroll?: boolean;
}

export interface AttackCountResult {
  dice: number[];
  attacks: number;
  /** Extra dice from [RAPID FIRE], [BLAST] or [CLEAVE]. */
  bonus: number;
}

export interface HitResult {
  dice: number[];
  /** Hits that go on to the wound roll (critical hits included unless they auto-wound). */
  hits: number;
  criticalHits: number;
  /** Critical hits that auto-wound through [LETHAL HITS]; they skip the wound roll. */
  autoWounds: number;
  /** Extra hits from [SUSTAINED HITS], already counted in `hits`. */
  extraHits: number;
  sustainedDice: number[];
  /** The skill after cover, or null for automatic hits. */
  needed: number | null;
  /** Total roll modifier after the ±1 cap. */
  modifier: number;
}

export interface WoundResult {
  dice: number[];
  /** Re-rolled results for failed dice, in order, when [TWIN-LINKED] applied. */
  rerolls: number[];
  /** Wounds that go to the save roll (lethal auto-wounds included, devastating critical wounds excluded). */
  wounds: number;
  criticalWounds: number;
  /** Critical wounds turned into mortal wounds by [DEVASTATING WOUNDS]. */
  devastating: number;
  needed: number;
  /** The unmodified result that counts as a critical wound (6, or lower with [ANTI-X]). */
  criticalOn: number;
  modifier: number;
}

export interface DamageEvent {
  modelId: string;
  /** The save roll, or null for a mortal wound. */
  saveRoll: number | null;
  damageDice: number[];
  damage: number;
  /** Damage beyond the model's remaining wounds is lost (05.04). */
  lost: number;
  /** Wounds that Feel No Pain stopped. */
  ignored: number;
  destroyed: boolean;
}

export interface SaveResult {
  dice: number[];
  saved: number;
  failed: number;
  events: DamageEvent[];
  /** Feel No Pain dice used, in order. */
  fnpDice: number[];
  /** Target models after damage and mortal wounds, same order as the input. */
  models: TargetModel[];
  /** Mortal wounds dealt by [DEVASTATING WOUNDS], after normal damage. */
  mortalWounds: number;
}

export interface HazardResult {
  dice: number[];
  failed: number;
  /** Mortal wounds the attacking unit suffers (06.03). */
  mortalWounds: number;
}

type DamageSource = (() => { dice: number[]; total: number }) | number[][];
type FnpSource = (() => number) | number[];

// ---- 04.03 Gather attack dice ----

/** Attack dice: one roll of the A expression per attacking model, plus ability bonuses per weapon. */
export function attackCount(weapon: WeaponProfile, models: number, opts: AttackOptions, rng: Rng): AttackCountResult {
  const ab = weapon.abilities;
  const dice: number[] = [];
  let attacks = 0;
  let bonus = 0;
  const per5 = Math.floor((opts.targetModelsAtSelection ?? 0) / 5);
  for (let i = 0; i < models; i++) {
    const r = rollExpr(weapon.attacks, rng);
    dice.push(...r.dice);
    attacks += r.total;
    // 24.30 [RAPID FIRE X]: X more dice within half range.
    if (ab.rapidFire && opts.halfRange) {
      const x = rollExpr(ab.rapidFire, rng);
      dice.push(...x.dice);
      bonus += x.total;
    }
    // 24.05 [BLAST X]: X more dice per five models in the target.
    if (ab.blast) bonus += ab.blast * per5;
    // 24.06 [CLEAVE X]: as blast, melee, only when all attacks go at one unit.
    if (ab.cleave && (opts.singleTarget ?? true)) bonus += ab.cleave * per5;
  }
  return { dice, attacks: attacks + bonus, bonus };
}

// ---- 05.01 Hit roll ----

/** Hit roll modifier (before the cap): [HEAVY] +1, Damaged -1, plus anything the players add. */
export function hitModifier(weapon: WeaponProfile, opts: AttackOptions): number {
  let m = opts.hitModifier ?? 0;
  if (weapon.abilities.heavy && opts.heavyBraced) m += 1; // 24.16
  if (opts.damaged) m -= 1; // 24.39
  if (weapon.abilities.psychic) m = Math.max(m, 0); // 24.29: the attacker may ignore the bad ones
  return capModifier(m);
}

/**
 * 05.01: an unmodified 1 always fails, an unmodified 6 is a critical hit and always hits.
 * Otherwise the modified roll must meet the skill. 13.08: cover worsens BS by 1 for ranged attacks,
 * unless the weapon [IGNORES COVER]. [TORRENT] hits automatically (24.37).
 * [SUSTAINED HITS X] adds X hits per critical hit; [LETHAL HITS] lets critical hits auto-wound.
 */
export function resolveHits(dice: number[], weapon: WeaponProfile, opts: AttackOptions = {}, sustained: number[] | Rng = []): HitResult {
  const ab = weapon.abilities;
  const auto = weapon.skill === null || ab.torrent;
  const cover = !!opts.cover && weapon.ranged && !ab.ignoresCover;
  const needed = auto ? null : (weapon.skill as number) + (cover ? 1 : 0);
  const modifier = auto ? 0 : hitModifier(weapon, opts);
  let hits = 0;
  let criticalHits = 0;
  for (const d of dice) {
    if (auto) {
      hits++;
      // 01.05.01: automatic hits never count as a dice result, so no critical hits.
      continue;
    }
    if (d === 1) continue;
    if (d === 6) {
      hits++;
      criticalHits++;
    } else if (d + modifier >= (needed as number)) hits++;
  }
  // 24.36 [SUSTAINED HITS X] per critical hit. X may be a dice expression.
  let extraHits = 0;
  const sustainedDice: number[] = [];
  if (ab.sustainedHits && criticalHits > 0) {
    const expr = ab.sustainedHits;
    let i = 0;
    for (let c = 0; c < criticalHits; c++) {
      if (expr.sides === 0) extraHits += expr.bonus;
      else if (typeof sustained === 'function') {
        const r = rollExpr(expr, sustained);
        sustainedDice.push(...r.dice);
        extraHits += r.total;
      } else {
        const d = sustained[i++] ?? 1;
        sustainedDice.push(d);
        extraHits += d + expr.bonus;
      }
    }
    hits += extraHits;
  }
  // 24.23 [LETHAL HITS]: critical hits can wound automatically instead of rolling.
  const autoWounds = ab.lethalHits && (opts.lethalAutoWound ?? true) ? criticalHits : 0;
  return { dice, hits, criticalHits, autoWounds, extraHits, sustainedDice, needed, modifier };
}

// ---- 05.02 Wound roll ----

/** The wound roll needed for a Strength against a Toughness (05.02). */
export function woundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

export function woundModifier(weapon: WeaponProfile, opts: AttackOptions): number {
  let m = opts.woundModifier ?? 0;
  if (weapon.abilities.lance && opts.charged) m += 1; // 24.21
  return capModifier(m);
}

/** 24.03 [ANTI-X Y+]: the lowest Y among antis whose keyword the target has, else 6. */
export function criticalWoundOn(weapon: WeaponProfile, targetKeywords: string[] = []): number {
  const kws = new Set(targetKeywords.map((k) => k.toUpperCase()));
  let on = 6;
  for (const a of weapon.abilities.anti) if (kws.has(a.keyword.toUpperCase())) on = Math.min(on, a.target);
  return on;
}

/**
 * 05.02: unmodified 1 fails, unmodified 6 (or the [ANTI] value) is a critical wound; otherwise the
 * modified roll must meet the S vs T target. [TWIN-LINKED] re-rolls failed dice once (re-rolls come
 * before modifiers, 01.05.02). `autoWounds` from [LETHAL HITS] are added without a roll.
 * [DEVASTATING WOUNDS] turns critical wounds into mortal wounds resolved after the saves.
 */
export function resolveWounds(
  dice: number[],
  weapon: WeaponProfile,
  toughness: number,
  opts: AttackOptions = {},
  autoWounds = 0,
  rerolls: number[] | Rng = [],
): WoundResult {
  const ab = weapon.abilities;
  const needed = woundTarget(weapon.strength, toughness);
  const modifier = woundModifier(weapon, opts);
  const criticalOn = criticalWoundOn(weapon, opts.targetKeywords ?? []);
  const passes = (d: number) => d !== 1 && (d >= criticalOn || d + modifier >= needed);
  const rerolled: number[] = [];
  let results = [...dice];
  if (ab.twinLinked && (opts.twinLinkedReroll ?? true)) {
    let i = 0;
    results = results.map((d) => {
      if (passes(d)) return d;
      const r = typeof rerolls === 'function' ? rollD6(rerolls) : (rerolls[i++] ?? d);
      rerolled.push(r);
      return r;
    });
  }
  let wounds = autoWounds;
  let criticalWounds = 0;
  for (const d of results) {
    if (d === 1) continue;
    if (d >= criticalOn) {
      criticalWounds++;
      wounds++;
    } else if (d + modifier >= needed) wounds++;
  }
  const devastating = ab.devastatingWounds ? criticalWounds : 0;
  return { dice, rerolls: rerolled, wounds: wounds - devastating, criticalWounds, devastating, needed, criticalOn, modifier };
}

// ---- 05.03 and 05.04 Saves and damage ----

/**
 * Groups the target's living models for allocation (05.03): each CHARACTER is its own group;
 * other models are grouped by matching wounds, save, and invulnerable save. Order: a non-character
 * group with a wounded model first, then other non-character groups, then characters, wounded first.
 * With [PRECISION] (24.28) the attacker may put one CHARACTER group first instead.
 */
export function allocationGroups(models: TargetModel[], precision = false): TargetModel[][] {
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
    if (!character) return isWounded(g) ? 1 : 2;
    return isWounded(g) ? 3 : 4;
  };
  const ordered = groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i)
    .map((x) => x.g);
  if (precision) {
    const idx = ordered.findIndex((g) => g[0]?.character);
    if (idx > 0) {
      const [chosen] = ordered.splice(idx, 1);
      if (chosen) ordered.unshift(chosen);
    }
  }
  return ordered;
}

/** 06.02 model selection for a mortal wound. */
function mortalWoundTarget(models: TargetModel[]): TargetModel | undefined {
  const alive = models.filter((m) => m.wounds > 0);
  return (
    alive.find((m) => !m.character && m.wounds < m.maxWounds) ??
    alive.find((m) => !m.character) ??
    alive.find((m) => m.wounds < m.maxWounds) ??
    alive[0]
  );
}

/** Applies `amount` damage to a model, with Feel No Pain per wound (24.12). Returns what happened. */
function damageModel(
  model: TargetModel,
  amount: number,
  fnp: number | null | undefined,
  fnpSource: FnpSource,
  fnpDice: number[],
): { applied: number; lost: number; ignored: number } {
  const wouldLose = Math.min(amount, model.wounds);
  const lost = amount - wouldLose;
  let ignored = 0;
  let applied = 0;
  const threshold = model.fnp ?? fnp;
  for (let i = 0; i < wouldLose; i++) {
    if (threshold) {
      const roll = typeof fnpSource === 'function' ? fnpSource() : (fnpSource[fnpDice.length] ?? 1);
      fnpDice.push(roll);
      if (roll >= threshold) {
        ignored++;
        continue;
      }
    }
    applied++;
  }
  model.wounds -= applied;
  return { applied, lost, ignored };
}

/**
 * 05.04: one save die per wounding hit, lowest result first: an unmodified 1 fails; a roll at or
 * above the invulnerable save passes; a roll plus AP at or above the armour save passes; otherwise
 * the current model (a wounded one if any) loses the damage. Then [DEVASTATING WOUNDS] mortal
 * wounds, after the normal damage, at most one model per critical wound (24.10).
 */
export function resolveSaves(
  saveDice: number[],
  weapon: WeaponProfile,
  target: TargetModel[],
  damageRolls: DamageSource,
  opts: AttackOptions = {},
  devastating = 0,
  fnpSource: FnpSource = [],
): SaveResult {
  const models = target.map((m) => ({ ...m }));
  const sorted = [...saveDice].sort((a, b) => a - b);
  const events: DamageEvent[] = [];
  const fnpDice: number[] = [];
  let saved = 0;
  let failed = 0;
  let damageIndex = 0;
  const fnp = opts.feelNoPain ?? null;

  const nextDamage = (): { dice: number[]; total: number } => {
    if (typeof damageRolls === 'function') return damageRolls();
    const dice = damageRolls[damageIndex++] ?? [];
    const flat = weapon.damage.sides === 0 ? weapon.damage.bonus : 0;
    return { dice, total: flat || dice.reduce((a, b) => a + b, 0) + weapon.damage.bonus };
  };
  // 24.25 [MELTA X]: +X damage within half range.
  const meltaBonus = weapon.abilities.melta && opts.halfRange ? weapon.abilities.melta : 0;

  for (const roll of sorted) {
    const group = allocationGroups(models, opts.precision ?? false)[0];
    if (!group) break; // the unit is destroyed; excess attacks are lost
    const model = group.find((m) => m.wounds < m.maxWounds) ?? group[0];
    if (!model) break;
    const passes = roll !== 1 && ((model.invSv !== null && roll >= model.invSv) || roll + weapon.ap >= model.sv);
    if (passes) {
      saved++;
      continue;
    }
    failed++;
    const dmg = nextDamage();
    const total = dmg.total + meltaBonus;
    const r = damageModel(model, total, fnp, fnpSource, fnpDice);
    events.push({ modelId: model.id, saveRoll: roll, damageDice: dmg.dice, damage: total, lost: r.lost, ignored: r.ignored, destroyed: model.wounds === 0 });
  }

  // 24.10: each critical wound inflicts D mortal wounds on one model, after the normal damage.
  let mortalWounds = 0;
  for (let c = 0; c < devastating; c++) {
    const model = opts.precision ? (allocationGroups(models, true)[0]?.[0] ?? mortalWoundTarget(models)) : mortalWoundTarget(models);
    if (!model) break;
    const dmg = nextDamage();
    const total = dmg.total + meltaBonus;
    const r = damageModel(model, total, fnp, fnpSource, fnpDice);
    mortalWounds += r.applied;
    events.push({ modelId: model.id, saveRoll: null, damageDice: dmg.dice, damage: total, lost: r.lost, ignored: r.ignored, destroyed: model.wounds === 0 });
  }

  return { dice: saveDice, saved, failed, events, fnpDice, models, mortalWounds };
}

// ---- 06.02 Mortal wounds from other sources ----

/** Mortal wounds one at a time: wounded non-characters first, then other non-characters, then characters. */
export function applyMortalWounds(target: TargetModel[], count: number, fnp: number | null = null, fnpSource: FnpSource = []): { models: TargetModel[]; destroyed: string[]; fnpDice: number[]; ignored: number } {
  const models = target.map((m) => ({ ...m }));
  const destroyed: string[] = [];
  const fnpDice: number[] = [];
  let ignored = 0;
  for (let i = 0; i < count; i++) {
    const pick = mortalWoundTarget(models);
    if (!pick) break;
    const r = damageModel(pick, 1, fnp, fnpSource, fnpDice);
    ignored += r.ignored;
    if (pick.wounds === 0 && r.applied > 0) destroyed.push(pick.id);
  }
  return { models, destroyed, fnpDice, ignored };
}

// ---- 06.03 Hazard rolls ----

/** One D6 per [HAZARDOUS] weapon selected: a 1 or 2 fails and costs 1 mortal wound (3 for a MONSTER / VEHICLE unit). */
export function resolveHazard(dice: number[], monsterOrVehicle: boolean): HazardResult {
  const failed = dice.filter((d) => d <= 2).length;
  return { dice, failed, mortalWounds: failed * (monsterOrVehicle ? 3 : 1) };
}

// ---- Whole sequence with digital dice ----

export interface AttackInput {
  weapon: WeaponProfile;
  attackingModels: number;
  toughness: number;
  target: TargetModel[];
  options?: AttackOptions;
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
  const opts = input.options ?? {};
  const { dice: attackDice, attacks } = attackCount(input.weapon, input.attackingModels, opts, rng);
  const hit = resolveHits(rollDice(attacks, rng), input.weapon, opts, rng);
  const wound = resolveWounds(rollDice(hit.hits - hit.autoWounds, rng), input.weapon, input.toughness, opts, hit.autoWounds, rng);
  const save = resolveSaves(rollDice(wound.wounds, rng), input.weapon, input.target, () => rollExpr(input.weapon.damage, rng), opts, wound.devastating, () => rollD6(rng));
  const destroyed = save.models.filter((m, i) => m.wounds === 0 && (input.target[i]?.wounds ?? 0) > 0).map((m) => m.id);
  return { weaponName: input.weapon.name, attacks, attackDice, hit, wound, save, destroyed };
}

export { NO_ABILITIES };
