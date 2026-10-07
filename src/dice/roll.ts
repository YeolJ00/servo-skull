// Dice (04). Every roll goes through here so digital and physical results look the same to the engine.
import type { Rng } from './rng.ts';

export function rollD6(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

/** D3: a D6 halved, rounded up (04). */
export function rollD3(rng: Rng): number {
  return Math.ceil(rollD6(rng) / 2);
}

/** A pool of D6s, in the order rolled. */
export function rollDice(count: number, rng: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(rollD6(rng));
  return out;
}

export function roll2D6(rng: Rng): { dice: [number, number]; total: number } {
  const a = rollD6(rng);
  const b = rollD6(rng);
  return { dice: [a, b], total: a + b };
}

/** Counts of each face 1..6 in a pool, which is how physical results are entered. */
export function faceCounts(dice: number[]): [number, number, number, number, number, number] {
  const counts: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d - 1] = (counts[d - 1] ?? 0) + 1;
  }
  return counts;
}
