import { describe, expect, it } from 'vitest';
import { capModifier, parseAbilities } from './abilities.ts';

describe('parseAbilities', () => {
  it('reads plain abilities and values', () => {
    const a = parseAbilities('RAPID FIRE 1, LETHAL HITS, SUSTAINED HITS 2, MELTA 2, BLAST, CLEAVE 1, ANTI-VEHICLE 4+, TWIN-LINKED');
    expect(a.rapidFire).toEqual({ count: 0, sides: 0, bonus: 1 });
    expect(a.lethalHits).toBe(true);
    expect(a.sustainedHits).toEqual({ count: 0, sides: 0, bonus: 2 });
    expect(a.melta).toBe(2);
    expect(a.blast).toBe(1);
    expect(a.cleave).toBe(1);
    expect(a.anti).toEqual([{ keyword: 'VEHICLE', target: 4 }]);
    expect(a.twinLinked).toBe(true);
    expect(a.notes).toEqual([]);
  });

  it('treats PISTOL and CLOSE-QUARTERS alike and keeps conditions as notes', () => {
    const a = parseAbilities('CLOSE-QUARTERS, LETHAL HITS: non-MONSTER/VEHICLE');
    expect(a.closeQuarters).toBe(true);
    expect(a.lethalHits).toBe(true);
    expect(a.notes).toEqual(['LETHAL HITS: non-MONSTER/VEHICLE']);
    expect(parseAbilities('DEVASTATING WOUNDS,PISTOL')).toMatchObject({ devastatingWounds: true, closeQuarters: true });
  });

  it('keeps unknown abilities as notes and handles dice values', () => {
    const a = parseAbilities('SUSTAINED HITS D3, CONVERSION, ANTI-MONSTER/VEHICLE 2+');
    expect(a.sustainedHits).toEqual({ count: 1, sides: 3, bonus: 0 });
    expect(a.notes).toEqual(['CONVERSION']);
    expect(a.anti).toEqual([{ keyword: 'MONSTER/VEHICLE', target: 2 }]);
  });

  it('ignores empty descriptions and HTML', () => {
    expect(parseAbilities('')).toMatchObject({ notes: [], anti: [] });
    expect(parseAbilities('<span>HEAVY</span>, <b>TORRENT</b>')).toMatchObject({ heavy: true, torrent: true });
  });

  it('caps modifiers at plus or minus one', () => {
    expect(capModifier(3)).toBe(1);
    expect(capModifier(-2)).toBe(-1);
    expect(capModifier(0)).toBe(0);
  });
});
