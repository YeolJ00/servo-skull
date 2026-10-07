import { describe, expect, it } from 'vitest';
import { isVariable, maxOf, minOf, parseExpr, rollExpr } from './expr.ts';
import { seededRng } from './rng.ts';

describe('dice expressions', () => {
  it('parses flat values and dice with bonuses', () => {
    expect(parseExpr('1')).toEqual({ count: 0, sides: 0, bonus: 1 });
    expect(parseExpr('D6')).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(parseExpr('d3')).toEqual({ count: 1, sides: 3, bonus: 0 });
    expect(parseExpr('2D6')).toEqual({ count: 2, sides: 6, bonus: 0 });
    expect(parseExpr('D6+1')).toEqual({ count: 1, sides: 6, bonus: 1 });
    expect(parseExpr(' D3 + 2 ')).toEqual({ count: 1, sides: 3, bonus: 2 });
    expect(parseExpr('N/A')).toBeUndefined();
    expect(parseExpr('')).toBeUndefined();
  });

  it('knows ranges', () => {
    const e = parseExpr('2D6+1')!;
    expect(isVariable(e)).toBe(true);
    expect(minOf(e)).toBe(3);
    expect(maxOf(e)).toBe(13);
    expect(isVariable(parseExpr('4')!)).toBe(false);
    expect(minOf(parseExpr('4')!)).toBe(4);
  });

  it('rolls within range and keeps the dice', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const r = rollExpr(parseExpr('D3+2')!, rng);
      expect(r.dice).toHaveLength(1);
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(5);
    }
    expect(rollExpr(parseExpr('2')!, rng)).toEqual({ dice: [], total: 2 });
  });
});
