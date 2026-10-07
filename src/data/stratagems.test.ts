import { describe, expect, it } from 'vitest';
import type { Stratagem } from './pack.ts';
import { cpCost, isCore, phaseMatches, stripHtml, turnMatches, usableStratagems } from './stratagems.ts';

const strat = (over: Partial<Stratagem>): Stratagem => ({
  id: 'x',
  factionId: 'ORK',
  detachmentId: '',
  name: 'X',
  type: 'War Horde – Battle Tactic Stratagem',
  cpCost: '1',
  turn: 'Your turn',
  phase: 'Shooting phase',
  description: '',
  ...over,
});

describe('stratagem filtering', () => {
  it('matches phases, including combined and any', () => {
    expect(phaseMatches('Shooting phase', 'shooting')).toBe(true);
    expect(phaseMatches('Shooting or Fight phase', 'fight')).toBe(true);
    expect(phaseMatches('Shooting or Fight phase', 'charge')).toBe(false);
    expect(phaseMatches('Any phase', null)).toBe(true);
    expect(phaseMatches('Command phase', null)).toBe(false);
    expect(phaseMatches('', 'movement')).toBe(true);
  });

  it('matches turns', () => {
    expect(turnMatches('Your turn', true)).toBe(true);
    expect(turnMatches('Your turn', false)).toBe(false);
    expect(turnMatches('Opponent’s turn', false)).toBe(true);
    expect(turnMatches('Either player’s turn', false)).toBe(true);
    expect(turnMatches('', true)).toBe(true);
  });

  it('keeps faction and chosen-detachment stratagems plus core ones, core last', () => {
    const all = [
      strat({ id: 'a', name: 'Zzz', detachmentId: 'D1' }),
      strat({ id: 'b', name: 'Other det', detachmentId: 'D2' }),
      strat({ id: 'c', name: 'Marines', factionId: 'SM' }),
      strat({ id: 'd', name: 'Command Re-roll', factionId: '', type: 'Core Stratagem – Epic Deed Stratagem', phase: 'Any phase', turn: 'Either player’s turn' }),
      strat({ id: 'd2', name: 'COMMAND RE-ROLL', factionId: '', type: 'Core Stratagem – Epic Deed Stratagem', phase: 'Any phase', turn: 'Either player’s turn' }),
      strat({ id: 'e', name: 'Boarding', factionId: '', type: 'Boarding Actions – Battle Tactic Stratagem', phase: 'Any phase' }),
      strat({ id: 'e2', name: 'Grenade', factionId: '', type: 'Core – Battle Tactic Stratagem', phase: 'Any phase' }),
      strat({ id: 'f', name: 'Fight only', phase: 'Fight phase' }),
      strat({ id: 'g', name: 'Enemy turn', turn: 'Opponent’s turn' }),
    ];
    const ids = usableStratagems(all, { phase: 'shooting', ownTurn: true, factionIds: ['ORK'], detachmentId: 'D1' }).map((s) => s.id);
    expect(ids).toEqual(['a', 'd']);
    const enemy = usableStratagems(all, { phase: 'shooting', ownTurn: false, factionIds: ['ORK'], detachmentId: 'D1' }).map((s) => s.id);
    expect(enemy).toEqual(['g', 'd']);
    expect(isCore(all[3]!)).toBe(true);
    expect(isCore(all[5]!)).toBe(false);
    expect(isCore(all[6]!)).toBe(false);
  });

  it('strips HTML and parses CP', () => {
    expect(stripHtml('<b>WHEN:</b> Your turn.<br>EFFECT: <span>Do a thing</span>')).toBe('WHEN: Your turn.\nEFFECT: Do a thing');
    expect(cpCost(strat({ cpCost: '2' }))).toBe(2);
    expect(cpCost(strat({ cpCost: '' }))).toBe(0);
  });
});
