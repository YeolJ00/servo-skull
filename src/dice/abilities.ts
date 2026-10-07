// Weapon abilities (24) as printed in the export's wargear description, e.g.
// "RAPID FIRE 1, LETHAL HITS" or "DEVASTATING WOUNDS,PISTOL" or "LETHAL HITS: non-MONSTER/VEHICLE".
import { parseExpr, type DiceExpr } from './expr.ts';

export interface AntiAbility {
  keyword: string;
  /** Unmodified wound roll that is a critical wound against that keyword. */
  target: number;
}

export interface WeaponAbilities {
  assault: boolean; // 24.04
  closeQuarters: boolean; // 24.07, also [PISTOL] 24.27
  indirectFire: boolean; // 24.19
  heavy: boolean; // 24.16
  torrent: boolean; // 24.37
  lethalHits: boolean; // 24.23
  devastatingWounds: boolean; // 24.10
  ignoresCover: boolean; // 24.18
  lance: boolean; // 24.21
  twinLinked: boolean; // 24.38
  precision: boolean; // 24.28
  hazardous: boolean; // 24.15
  psychic: boolean; // 24.29
  extraAttacks: boolean; // 24.11
  oneShot: boolean; // 24.26
  sustainedHits: DiceExpr | null; // 24.36
  rapidFire: DiceExpr | null; // 24.30
  melta: number | null; // 24.25
  blast: number | null; // 24.05, 1 for plain [BLAST]
  cleave: number | null; // 24.06
  anti: AntiAbility[]; // 24.03
  /** Conditions and abilities the helper does not resolve; shown to the players. */
  notes: string[];
}

export const NO_ABILITIES: WeaponAbilities = {
  assault: false,
  closeQuarters: false,
  indirectFire: false,
  heavy: false,
  torrent: false,
  lethalHits: false,
  devastatingWounds: false,
  ignoresCover: false,
  lance: false,
  twinLinked: false,
  precision: false,
  hazardous: false,
  psychic: false,
  extraAttacks: false,
  oneShot: false,
  sustainedHits: null,
  rapidFire: null,
  melta: null,
  blast: null,
  cleave: null,
  anti: [],
  notes: [],
};

export function parseAbilities(description: string): WeaponAbilities {
  const a: WeaponAbilities = { ...NO_ABILITIES, anti: [], notes: [] };
  const text = description.replace(/<[^>]+>/g, ' ').replace(/[[\]]/g, '');
  for (const raw of text.split(/,\s*/)) {
    const token = raw.trim();
    if (!token) continue;
    // "LETHAL HITS: non-MONSTER/VEHICLE" carries a condition the helper cannot check.
    const [head, condition] = token.split(/\s*:\s*/, 2) as [string, string | undefined];
    const name = head.trim().toUpperCase();
    if (condition) a.notes.push(token);
    let m: RegExpExecArray | null;
    if (name === 'ASSAULT') a.assault = true;
    else if (name === 'PISTOL' || name === 'CLOSE-QUARTERS') a.closeQuarters = true;
    else if (name === 'INDIRECT FIRE') a.indirectFire = true;
    else if (name === 'HEAVY') a.heavy = true;
    else if (name === 'TORRENT') a.torrent = true;
    else if (name === 'LETHAL HITS') a.lethalHits = true;
    else if (name === 'DEVASTATING WOUNDS') a.devastatingWounds = true;
    else if (name === 'IGNORES COVER') a.ignoresCover = true;
    else if (name === 'LANCE') a.lance = true;
    else if (name === 'TWIN-LINKED') a.twinLinked = true;
    else if (name === 'PRECISION') a.precision = true;
    else if (name === 'HAZARDOUS') a.hazardous = true;
    else if (name === 'PSYCHIC') a.psychic = true;
    else if (name === 'EXTRA ATTACKS') a.extraAttacks = true;
    else if (name === 'ONE SHOT') a.oneShot = true;
    else if ((m = /^SUSTAINED HITS\s*(.*)$/.exec(name))) a.sustainedHits = parseExpr(m[1] || '1') ?? parseExpr('1')!;
    else if ((m = /^RAPID FIRE\s*(.*)$/.exec(name))) a.rapidFire = parseExpr(m[1] || '1') ?? parseExpr('1')!;
    else if ((m = /^MELTA\s*(\d+)$/.exec(name))) a.melta = Number(m[1]);
    else if ((m = /^BLAST\s*(\d*)$/.exec(name))) a.blast = m[1] ? Number(m[1]) : 1;
    else if ((m = /^CLEAVE\s*(\d*)$/.exec(name))) a.cleave = m[1] ? Number(m[1]) : 1;
    else if ((m = /^ANTI-(.+?)\s+(\d)\+?$/.exec(name))) a.anti.push({ keyword: m[1]!.trim(), target: Number(m[2]) });
    else if (!condition) a.notes.push(token);
  }
  return a;
}

/** Hit and wound roll modifiers can never exceed +1 or -1 in total (02.02.01). */
export function capModifier(total: number): number {
  return Math.max(-1, Math.min(1, total));
}
