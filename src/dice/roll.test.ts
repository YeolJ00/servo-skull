import { describe, expect, it } from 'vitest';
import { seededRng } from './rng.ts';
import { faceCounts, roll2D6, rollD3, rollD6, rollDice } from './roll.ts';

describe('dice', () => {
  it('a D6 is always 1 to 6 and covers every face', () => {
    const rng = seededRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const d = rollD6(rng);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
      seen.add(d);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a D3 is a D6 halved and rounded up', () => {
    const faces = [1, 2, 3, 4, 5, 6];
    const rng = () => (faces.shift()! - 0.5) / 6;
    expect([rollD3(rng), rollD3(rng), rollD3(rng), rollD3(rng), rollD3(rng), rollD3(rng)]).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('2D6 totals are 2 to 12 and the dice are kept', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      const r = roll2D6(rng);
      expect(r.total).toBe(r.dice[0] + r.dice[1]);
      expect(r.total).toBeGreaterThanOrEqual(2);
      expect(r.total).toBeLessThanOrEqual(12);
    }
  });

  it('seeded rolls are reproducible', () => {
    expect(rollDice(10, seededRng(42))).toEqual(rollDice(10, seededRng(42)));
    expect(rollDice(10, seededRng(42))).not.toEqual(rollDice(10, seededRng(43)));
  });

  it('counts faces in a pool and ignores junk', () => {
    expect(faceCounts([1, 6, 6, 3, 9, 0])).toEqual([1, 0, 1, 0, 0, 2]);
  });
});
