import { describe, expect, it } from 'vitest';
import { NO_ABILITIES, parseAbilities } from './abilities.ts';
import {
  allocationGroups,
  applyMortalWounds,
  attackCount,
  criticalWoundOn,
  resolveAttack,
  resolveHazard,
  resolveHits,
  resolveSaves,
  resolveWounds,
  woundTarget,
  type TargetModel,
  type WeaponProfile,
} from './attack.ts';
import { parseExpr } from './expr.ts';
import { seededRng } from './rng.ts';

const weapon = (over: Partial<WeaponProfile> = {}, abilities = ''): WeaponProfile => ({
  name: 'Test weapon',
  attacks: parseExpr('2')!,
  skill: 3,
  strength: 4,
  ap: -1,
  damage: parseExpr('1')!,
  ranged: true,
  abilities: abilities ? parseAbilities(abilities) : NO_ABILITIES,
  ...over,
});
const bolter = weapon();
const choppa = weapon({ name: 'Choppa', attacks: parseExpr('3')!, ranged: false });
const bigGun = weapon({ name: 'Big gun', attacks: parseExpr('1')!, skill: 4, strength: 9, ap: -2, damage: parseExpr('3')! });

const boy = (id: string, wounds = 1): TargetModel => ({ id, wounds, maxWounds: 1, sv: 5, invSv: null, character: false });
const marine = (id: string, wounds = 2): TargetModel => ({ id, wounds, maxWounds: 2, sv: 3, invSv: null, character: false });
const captain = (id: string, wounds = 5): TargetModel => ({ id, wounds, maxWounds: 5, sv: 3, invSv: 4, character: true });
const fixed = (values: number[]) => {
  const v = [...values];
  return () => ((v.shift() ?? 1) - 0.5) / 6;
};

describe('hit roll (05.01)', () => {
  it('unmodified 1 always fails and unmodified 6 is a critical hit', () => {
    const r = resolveHits([1, 2, 3, 4, 5, 6], bolter);
    expect(r.needed).toBe(3);
    expect(r.hits).toBe(4);
    expect(r.criticalHits).toBe(1);
    expect(r.autoWounds).toBe(0);
  });

  it('cover worsens the BS by one for ranged attacks only (13.08), unless the weapon ignores cover', () => {
    expect(resolveHits([3, 3, 6], bolter, { cover: true })).toMatchObject({ hits: 1, needed: 4 });
    expect(resolveHits([3, 3, 6], choppa, { cover: true })).toMatchObject({ hits: 3, needed: 3 });
    expect(resolveHits([3, 3, 6], weapon({}, 'IGNORES COVER'), { cover: true })).toMatchObject({ hits: 3, needed: 3 });
  });

  it('a 6 still hits even if the modified skill would need a 7', () => {
    expect(resolveHits([6, 5], weapon({ skill: 6 }), { cover: true })).toMatchObject({ hits: 1, needed: 7 });
  });

  it('torrent and weapons without a skill hit automatically, with no critical hits (01.05.01)', () => {
    expect(resolveHits([1, 1, 6], weapon({ skill: null })).hits).toBe(3);
    const t = resolveHits([1, 1, 6], weapon({}, 'TORRENT'));
    expect(t).toMatchObject({ hits: 3, criticalHits: 0, needed: null });
  });

  it('hit modifiers stack and cap at plus or minus one (02.02.01)', () => {
    // HEAVY braced +1, extra +1 → capped to +1: a 2 hits on 3+.
    expect(resolveHits([2], weapon({}, 'HEAVY'), { heavyBraced: true, hitModifier: 1 })).toMatchObject({ hits: 1, modifier: 1 });
    expect(resolveHits([2], weapon({}, 'HEAVY'), { heavyBraced: false })).toMatchObject({ hits: 0, modifier: 0 });
    // Damaged -1 and another -1 → capped to -1: a 3 misses on 3+, a 4 hits.
    expect(resolveHits([3, 4], bolter, { damaged: true, hitModifier: -1 })).toMatchObject({ hits: 1, modifier: -1 });
    // A 1 fails even with +1.
    expect(resolveHits([1], weapon({ skill: 2 }), { hitModifier: 1 }).hits).toBe(0);
  });

  it('psychic weapons ignore negative hit modifiers (24.29)', () => {
    expect(resolveHits([3], weapon({}, 'PSYCHIC'), { damaged: true }).hits).toBe(1);
  });

  it('sustained hits add hits per critical hit, with dice values rolled or entered (24.36)', () => {
    expect(resolveHits([6, 6, 2], weapon({}, 'SUSTAINED HITS 2'))).toMatchObject({ hits: 6, criticalHits: 2, extraHits: 4 });
    const d3 = resolveHits([6, 6], weapon({}, 'SUSTAINED HITS D3'), {}, [3, 1]);
    expect(d3).toMatchObject({ hits: 6, extraHits: 4, sustainedDice: [3, 1] });
  });

  it('lethal hits turn critical hits into automatic wounds when the attacker chooses (24.23)', () => {
    const r = resolveHits([6, 4, 1], weapon({}, 'LETHAL HITS'));
    expect(r).toMatchObject({ hits: 2, criticalHits: 1, autoWounds: 1 });
    expect(resolveHits([6], weapon({}, 'LETHAL HITS'), { lethalAutoWound: false }).autoWounds).toBe(0);
  });
});

describe('attack dice (04.03)', () => {
  it('adds rapid fire dice within half range, blast per five target models, cleave only on a single target', () => {
    const rng = seededRng(1);
    expect(attackCount(weapon({ attacks: parseExpr('1')! }, 'RAPID FIRE 1'), 3, { halfRange: true }, rng)).toMatchObject({ attacks: 6, bonus: 3 });
    expect(attackCount(weapon({ attacks: parseExpr('1')! }, 'RAPID FIRE 1'), 3, { halfRange: false }, rng).attacks).toBe(3);
    expect(attackCount(weapon({ attacks: parseExpr('3')! }, 'BLAST 2'), 1, { targetModelsAtSelection: 12 }, rng).attacks).toBe(7);
    expect(attackCount(weapon({ attacks: parseExpr('3')!, ranged: false }, 'CLEAVE 1'), 1, { targetModelsAtSelection: 16 }, rng).attacks).toBe(6);
    expect(attackCount(weapon({ attacks: parseExpr('3')!, ranged: false }, 'CLEAVE 1'), 1, { targetModelsAtSelection: 16, singleTarget: false }, rng).attacks).toBe(3);
  });
});

describe('wound roll (05.02)', () => {
  it.each([
    [8, 4, 2],
    [9, 4, 2],
    [5, 4, 3],
    [4, 4, 4],
    [3, 4, 5],
    [2, 4, 6],
    [1, 4, 6],
    [5, 10, 6],
    [6, 10, 5],
    [7, 12, 5],
  ])('S%i vs T%i needs %i+', (s, t, needed) => {
    expect(woundTarget(s, t)).toBe(needed);
  });

  it('unmodified 1 fails and unmodified 6 is a critical wound', () => {
    const r = resolveWounds([1, 4, 4, 6], bolter, 4);
    expect(r).toMatchObject({ needed: 4, wounds: 3, criticalWounds: 1, criticalOn: 6 });
  });

  it('anti lowers the critical wound value against the keyword only (24.03)', () => {
    const w = weapon({}, 'ANTI-VEHICLE 4+, ANTI-INFANTRY 3+');
    expect(criticalWoundOn(w, ['Vehicle'])).toBe(4);
    expect(criticalWoundOn(w, ['Infantry', 'Vehicle'])).toBe(3);
    expect(criticalWoundOn(w, ['Monster'])).toBe(6);
    const r = resolveWounds([4, 4], w, 12, { targetKeywords: ['VEHICLE'] });
    expect(r).toMatchObject({ wounds: 2, criticalWounds: 2 });
  });

  it('lance adds one to the wound roll after a charge, capped with other modifiers (24.21)', () => {
    expect(resolveWounds([3], weapon({}, 'LANCE'), 4, { charged: true })).toMatchObject({ wounds: 1, modifier: 1 });
    expect(resolveWounds([3], weapon({}, 'LANCE'), 4, { charged: true, woundModifier: 1 }).modifier).toBe(1);
    expect(resolveWounds([3], weapon({}, 'LANCE'), 4, { charged: false }).wounds).toBe(0);
  });

  it('twin-linked re-rolls failed wound dice once, before modifiers (24.38, 01.05.02)', () => {
    const r = resolveWounds([2, 5, 1], weapon({}, 'TWIN-LINKED'), 4, {}, 0, [4, 6]);
    expect(r.rerolls).toEqual([4, 6]);
    expect(r).toMatchObject({ wounds: 3, criticalWounds: 1 });
    expect(resolveWounds([2, 5], weapon({}, 'TWIN-LINKED'), 4, { twinLinkedReroll: false }, 0, [6]).wounds).toBe(1);
  });

  it('lethal auto-wounds are added without a roll and devastating critical wounds leave the save pool', () => {
    const r = resolveWounds([6, 3], weapon({}, 'DEVASTATING WOUNDS'), 4, {}, 2);
    expect(r).toMatchObject({ wounds: 2, criticalWounds: 1, devastating: 1 });
  });
});

describe('allocation groups (05.03)', () => {
  it('groups by matching W/Sv/InSv, characters alone, wounded non-characters first and characters last', () => {
    const models = [captain('c', 5), marine('m1'), marine('m2', 1), boy('b1'), captain('c2', 3)];
    expect(allocationGroups(models).map((g) => g.map((m) => m.id))).toEqual([['m1', 'm2'], ['b1'], ['c2'], ['c']]);
  });

  it('precision moves a character group to the front (24.28)', () => {
    const models = [captain('c'), boy('b1')];
    expect(allocationGroups(models, true).map((g) => g[0]?.id)).toEqual(['c', 'b1']);
  });

  it('ignores destroyed models', () => {
    expect(allocationGroups([boy('b1', 0), boy('b2')]).map((g) => g.map((m) => m.id))).toEqual([['b2']]);
  });
});

describe('saves and damage (05.04)', () => {
  it('applies saves lowest first, a 1 always fails, AP worsens the save, excess damage is lost', () => {
    const target = [marine('m1'), marine('m2')];
    const r = resolveSaves([4, 1, 3, 6], bigGun, target, [[], [], [], []]);
    expect(r.events[0]).toMatchObject({ modelId: 'm1', saveRoll: 1, damage: 3, lost: 1, destroyed: true });
    expect(r.events[1]).toMatchObject({ modelId: 'm2', saveRoll: 3, damage: 3, lost: 1, destroyed: true });
    expect(r.models.every((m) => m.wounds === 0)).toBe(true);
    expect(r.events).toHaveLength(2);
  });

  it('an invulnerable save passes when the armour save would not', () => {
    const r = resolveSaves([4, 3], bigGun, [captain('c')], [[], []]);
    expect(r.saved).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.models[0]?.wounds).toBe(2);
  });

  it('wounded models in the current group take damage before unwounded ones', () => {
    const r = resolveSaves([2, 2], bolter, [marine('m1'), marine('m2', 1), marine('m3')], [[], []]);
    expect(r.events.map((e) => e.modelId)).toEqual(['m2', 'm1']);
    expect(r.models.map((m) => m.wounds)).toEqual([1, 0, 2]);
  });

  it('moves to the next group when one is gone, non-characters before characters', () => {
    const r = resolveSaves([1, 1], bolter, [captain('c'), boy('b1')], [[], []]);
    expect(r.events.map((e) => e.modelId)).toEqual(['b1', 'c']);
    expect(r.models.map((m) => m.wounds)).toEqual([4, 0]);
  });

  it('rolls variable damage per failed save and melta adds damage within half range (24.25)', () => {
    const d6 = weapon({ attacks: parseExpr('1')!, skill: 4, strength: 9, ap: -2, damage: parseExpr('D6')! }, 'MELTA 2');
    const r = resolveSaves([1, 1], d6, [captain('c')], [[2], [5]], { halfRange: true });
    expect(r.events.map((e) => e.damage)).toEqual([4, 7]);
    expect(r.models[0]?.wounds).toBe(0);
    expect(r.events[1]?.lost).toBe(6);
  });

  it('feel no pain rolls once per wound that would be lost (24.12)', () => {
    // 3 damage on a 5-wound captain: FNP 5+ dice 5, 2, 6 → one wound lost.
    const r = resolveSaves([1], bigGun, [captain('c')], [[]], { feelNoPain: 5 }, 0, [5, 2, 6]);
    expect(r.events[0]).toMatchObject({ damage: 3, ignored: 2, destroyed: false });
    expect(r.models[0]?.wounds).toBe(4);
    expect(r.fnpDice).toEqual([5, 2, 6]);
  });

  it('devastating wounds become mortal wounds after normal damage, one model per critical wound (24.10)', () => {
    // Two boys, 1W each: one failed save kills b1; one devastating wound of D3 kills b2 and loses the rest.
    const r = resolveSaves([1], bigGun, [boy('b1'), boy('b2')], [[], []], {}, 1);
    expect(r.events.map((e) => [e.modelId, e.saveRoll, e.lost])).toEqual([
      ['b1', 1, 2],
      ['b2', null, 2],
    ]);
    expect(r.mortalWounds).toBe(1);
    expect(r.models.map((m) => m.wounds)).toEqual([0, 0]);
  });

  it('precision allocates to the character first (24.28)', () => {
    const r = resolveSaves([1], bolter, [captain('c'), boy('b1')], [[]], { precision: true });
    expect(r.events[0]?.modelId).toBe('c');
  });
});

describe('mortal wounds and hazards', () => {
  it('mortal wounds go one at a time to wounded non-characters first, then others, then characters (06.02)', () => {
    const r = applyMortalWounds([captain('c'), marine('m1'), marine('m2', 1)], 4);
    expect(r.destroyed).toEqual(['m2', 'm1']);
    expect(r.models.map((m) => m.wounds)).toEqual([4, 0, 0]);
  });

  it('feel no pain applies to mortal wounds too', () => {
    const r = applyMortalWounds([boy('b1')], 1, 5, [6]);
    expect(r.ignored).toBe(1);
    expect(r.models[0]?.wounds).toBe(1);
  });

  it('a hazard roll fails on 1 or 2 and costs 1 mortal wound, or 3 for monsters and vehicles (06.03)', () => {
    expect(resolveHazard([1, 2, 3, 6], false)).toEqual({ dice: [1, 2, 3, 6], failed: 2, mortalWounds: 2 });
    expect(resolveHazard([2], true).mortalWounds).toBe(3);
  });
});

describe('whole attack with digital dice', () => {
  it('runs every stage and never produces impossible counts', () => {
    const rng = seededRng(11);
    for (let i = 0; i < 30; i++) {
      const target = [boy('b1'), boy('b2'), boy('b3'), boy('b4'), boy('b5')];
      const r = resolveAttack({ weapon: choppa, attackingModels: 5, toughness: 5, target }, rng);
      expect(r.attacks).toBe(15);
      expect(r.hit.dice).toHaveLength(15);
      expect(r.wound.dice).toHaveLength(r.hit.hits);
      expect(r.save.dice).toHaveLength(r.wound.wounds);
      expect(r.save.saved + r.save.failed).toBeLessThanOrEqual(r.wound.wounds);
      expect(r.destroyed.length).toBe(r.save.models.filter((m) => m.wounds === 0).length);
    }
  });

  it('with lethal hits the wound dice exclude the auto-wounds', () => {
    const rng = seededRng(2);
    const w = weapon({}, 'LETHAL HITS');
    for (let i = 0; i < 20; i++) {
      const r = resolveAttack({ weapon: w, attackingModels: 5, toughness: 4, target: [marine('m1'), marine('m2')] }, rng);
      expect(r.wound.dice).toHaveLength(r.hit.hits - r.hit.autoWounds);
    }
  });

  it('is reproducible with a seed', () => {
    const target = () => [marine('m1'), marine('m2')];
    const a = resolveAttack({ weapon: bolter, attackingModels: 5, toughness: 4, target: target() }, seededRng(5));
    const b = resolveAttack({ weapon: bolter, attackingModels: 5, toughness: 4, target: target() }, seededRng(5));
    expect(a).toEqual(b);
  });

  it('fixed dice drive the whole sequence deterministically', () => {
    // attacks flat 2 × 1 model; hits: 6, 3; wound: 6 (crit, devastating → mortal), hit 3 → wound die 2 fails... use plain weapon.
    const rng = fixed([6, 3, 4, 4, 2, 5]);
    const r = resolveAttack({ weapon: bolter, attackingModels: 1, toughness: 4, target: [marine('m1')] }, rng);
    expect(r.hit.hits).toBe(2);
    expect(r.wound.wounds).toBe(2);
    // saves 2 and 5: AP -1 vs Sv 3: 2 fails, 5 passes → 1 damage.
    expect(r.save.failed).toBe(1);
    expect(r.save.models[0]?.wounds).toBe(1);
  });
});
