import { describe, expect, it } from 'vitest';
import {
  allocationGroups,
  applyMortalWounds,
  resolveAttack,
  resolveHits,
  resolveSaves,
  resolveWounds,
  woundTarget,
  type TargetModel,
  type WeaponProfile,
} from './attack.ts';
import { parseExpr } from './expr.ts';
import { seededRng } from './rng.ts';

const bolter: WeaponProfile = { name: 'Bolt rifle', attacks: parseExpr('2')!, skill: 3, strength: 4, ap: -1, damage: parseExpr('1')!, ranged: true };
const choppa: WeaponProfile = { name: 'Choppa', attacks: parseExpr('3')!, skill: 3, strength: 4, ap: -1, damage: parseExpr('1')!, ranged: false };
const bigGun: WeaponProfile = { name: 'Big gun', attacks: parseExpr('1')!, skill: 4, strength: 9, ap: -2, damage: parseExpr('3')!, ranged: true };

const boy = (id: string, wounds = 1): TargetModel => ({ id, wounds, maxWounds: 1, sv: 5, invSv: null, character: false });
const marine = (id: string, wounds = 2): TargetModel => ({ id, wounds, maxWounds: 2, sv: 3, invSv: null, character: false });
const captain = (id: string, wounds = 5): TargetModel => ({ id, wounds, maxWounds: 5, sv: 3, invSv: 4, character: true });

describe('hit roll (05.02)', () => {
  it('unmodified 1 always fails and unmodified 6 is a critical hit', () => {
    const r = resolveHits([1, 2, 3, 4, 5, 6], bolter);
    expect(r.needed).toBe(3);
    expect(r.hits).toBe(4);
    expect(r.criticalHits).toBe(1);
  });

  it('cover worsens the skill by one for ranged attacks only (13.08)', () => {
    expect(resolveHits([3, 3, 6], bolter, { cover: true })).toMatchObject({ hits: 1, needed: 4 });
    expect(resolveHits([3, 3, 6], choppa, { cover: true })).toMatchObject({ hits: 3, needed: 3 });
  });

  it('a 6 still hits even if the modified skill would need a 7', () => {
    const poor: WeaponProfile = { ...bolter, skill: 6 };
    expect(resolveHits([6, 5], poor, { cover: true })).toMatchObject({ hits: 1, needed: 7 });
  });

  it('weapons without a skill hit automatically', () => {
    expect(resolveHits([1, 1, 6], { ...bolter, skill: null })).toMatchObject({ hits: 3, criticalHits: 1, needed: null });
  });
});

describe('wound roll (05.03)', () => {
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
    const r = resolveWounds([1, 4, 4, 6], 4, 4);
    expect(r).toMatchObject({ needed: 4, wounds: 3, criticalWounds: 1 });
  });
});

describe('allocation groups (05.04)', () => {
  it('groups by matching W/Sv/InSv, characters alone, wounded non-characters first and characters last', () => {
    const models = [captain('c', 5), marine('m1'), marine('m2', 1), boy('b1'), captain('c2', 3)];
    const groups = allocationGroups(models).map((g) => g.map((m) => m.id));
    expect(groups).toEqual([['m1', 'm2'], ['b1'], ['c2'], ['c']]);
  });

  it('ignores destroyed models', () => {
    expect(allocationGroups([boy('b1', 0), boy('b2')]).map((g) => g.map((m) => m.id))).toEqual([['b2']]);
  });
});

describe('saves and damage (05.04)', () => {
  it('applies saves lowest first, a 1 always fails, AP worsens the save, excess damage is lost', () => {
    // Sv 3+, AP -1: a 4 saves (4-1=3), a 3 fails, a 1 fails.
    const target = [marine('m1'), marine('m2')];
    const r = resolveSaves([4, 1, 3, 6], bigGun, target, [[], [], [], []]);
    // Sorted: 1 (fail, 3 damage on m1 → 2 wounds, 1 lost), 3 (3+(-2)=1 < 3 fail → m2 dies, 1 lost), 4 (4-2=2 < 3 fail → nobody left), 6 (passes but unit gone)
    expect(r.failed + r.saved).toBeLessThanOrEqual(4);
    expect(r.events[0]).toMatchObject({ modelId: 'm1', saveRoll: 1, damage: 3, lost: 1, destroyed: true });
    expect(r.events[1]).toMatchObject({ modelId: 'm2', saveRoll: 3, damage: 3, lost: 1, destroyed: true });
    expect(r.models.every((m) => m.wounds === 0)).toBe(true);
    expect(r.events).toHaveLength(2);
  });

  it('an invulnerable save passes when the armour save would not', () => {
    const target = [captain('c')];
    const r = resolveSaves([4, 3], bigGun, target, [[], []]);
    // InSv 4+: the 4 passes. The 3 fails (3-2=1 < 3 and 3 < 4): 3 damage.
    expect(r.saved).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.models[0]?.wounds).toBe(2);
  });

  it('wounded models in the current group take damage before unwounded ones', () => {
    const target = [marine('m1'), marine('m2', 1), marine('m3')];
    const r = resolveSaves([2, 2], bolter, target, [[], []]);
    expect(r.events.map((e) => e.modelId)).toEqual(['m2', 'm1']);
    expect(r.models.map((m) => m.wounds)).toEqual([1, 0, 2]);
  });

  it('moves to the next group when one is gone, non-characters before characters', () => {
    const target = [captain('c'), boy('b1')];
    const r = resolveSaves([1, 1], bolter, target, [[], []]);
    expect(r.events.map((e) => e.modelId)).toEqual(['b1', 'c']);
    expect(r.models.map((m) => m.wounds)).toEqual([4, 0]);
  });

  it('rolls variable damage per failed save', () => {
    const d6: WeaponProfile = { ...bigGun, damage: parseExpr('D6')! };
    const r = resolveSaves([1, 1], d6, [captain('c')], [[2], [5]]);
    expect(r.events.map((e) => e.damage)).toEqual([2, 5]);
    expect(r.models[0]?.wounds).toBe(0);
    expect(r.events[1]?.lost).toBe(2);
  });
});

describe('mortal wounds (06.02)', () => {
  it('go one at a time to wounded non-characters first, then other non-characters, then characters', () => {
    const target = [captain('c'), marine('m1'), marine('m2', 1)];
    const r = applyMortalWounds(target, 4);
    // m2 (1) dies, then m1 takes 2 and dies, then the captain takes 1.
    expect(r.destroyed).toEqual(['m2', 'm1']);
    expect(r.models.map((m) => m.wounds)).toEqual([4, 0, 0]);
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

  it('is reproducible with a seed', () => {
    const target = () => [marine('m1'), marine('m2')];
    const a = resolveAttack({ weapon: bolter, attackingModels: 5, toughness: 4, target: target() }, seededRng(5));
    const b = resolveAttack({ weapon: bolter, attackingModels: 5, toughness: 4, target: target() }, seededRng(5));
    expect(a).toEqual(b);
  });
});
