// Random number sources. Pure interfaces; the crypto source is the only browser-dependent piece.

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Crypto-backed RNG for real games. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return (buf[0] ?? 0) / 4294967296;
  };
}

/** Deterministic RNG (mulberry32) for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
