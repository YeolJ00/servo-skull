// Dice expressions as printed on datasheets: "1", "D6", "D3", "2D6", "D6+1", "D3+2", "2D6+3".
import type { Rng } from './rng.ts';
import { rollD3, rollD6 } from './roll.ts';

export interface DiceExpr {
  count: number;
  /** 0 for a flat number. */
  sides: 0 | 3 | 6;
  bonus: number;
}

export function parseExpr(text: string): DiceExpr | undefined {
  const s = text.trim().toUpperCase().replace(/\s+/g, '');
  const flat = /^(\d+)$/.exec(s);
  if (flat) return { count: 0, sides: 0, bonus: Number(flat[1]) };
  const m = /^(\d*)D(3|6)(?:\+(\d+))?$/.exec(s);
  if (!m) return undefined;
  return { count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]) as 3 | 6, bonus: m[3] ? Number(m[3]) : 0 };
}

export function isVariable(expr: DiceExpr): boolean {
  return expr.sides !== 0 && expr.count > 0;
}

export function minOf(expr: DiceExpr): number {
  return expr.count * (expr.sides ? 1 : 0) + expr.bonus;
}

export function maxOf(expr: DiceExpr): number {
  return expr.count * expr.sides + expr.bonus;
}

/** Rolls the expression. Returns the dice (empty for flat values) and the total. */
export function rollExpr(expr: DiceExpr, rng: Rng): { dice: number[]; total: number } {
  const dice: number[] = [];
  for (let i = 0; i < expr.count; i++) dice.push(expr.sides === 3 ? rollD3(rng) : rollD6(rng));
  return { dice, total: dice.reduce((a, b) => a + b, 0) + expr.bonus };
}
