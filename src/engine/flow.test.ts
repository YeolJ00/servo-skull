import { describe, expect, it } from 'vitest';
import { CORE_RULES_URL, STEPS, TURN_STEPS, globalTurnIndex, roundSlots, ruleUrl, slotAt, stepDef } from './flow.ts';
import type { GameSetup } from './types.ts';

const setup: GameSetup = {
  players: {
    p1: { id: 'p1', name: 'Marines', color: '#3F6FD8' },
    p2: { id: 'p2', name: 'Orks', color: '#5E9E3A' },
  },
  firstPlayer: 'p2',
  rounds: 5,
  startingCp: 0,
  units: [],
};

describe('flow', () => {
  it('a turn runs from start of turn to end of turn through the five phases in order', () => {
    expect(TURN_STEPS[0]).toBe('turn/start');
    expect(TURN_STEPS[TURN_STEPS.length - 1]).toBe('turn/end');
    const phases = TURN_STEPS.map((s) => stepDef(s).phase).filter((p, i, a) => p && a.indexOf(p) === i);
    expect(phases).toEqual(['command', 'movement', 'shooting', 'charge', 'fight']);
  });

  it('a round is start, first player turn, second player turn, end', () => {
    const slots = roundSlots('p2');
    expect(slots[0]).toEqual({ step: 'round/start', player: null, turnInRound: 0 });
    expect(slots[slots.length - 1]).toEqual({ step: 'round/end', player: null, turnInRound: 1 });
    const turns = slots.slice(1, -1);
    expect(turns).toHaveLength(TURN_STEPS.length * 2);
    expect(turns.slice(0, TURN_STEPS.length).every((s) => s.player === 'p2' && s.turnInRound === 0)).toBe(true);
    expect(turns.slice(TURN_STEPS.length).every((s) => s.player === 'p1' && s.turnInRound === 1)).toBe(true);
  });

  it('every step links to a section anchor on the core rules page', () => {
    for (const s of STEPS) {
      expect(s.section).toMatch(/^\d\d\.\d\d$/);
      expect(ruleUrl(s.id)).toBe(`${CORE_RULES_URL}#${s.anchor}`);
    }
  });

  it('counts global turns across rounds', () => {
    expect(globalTurnIndex(setup, { round: 1, index: 1 })).toBe(0);
    expect(globalTurnIndex(setup, { round: 1, index: 1 + TURN_STEPS.length })).toBe(1);
    expect(globalTurnIndex(setup, { round: 3, index: 1 })).toBe(4);
  });

  it('rejects a bad position', () => {
    expect(() => slotAt(setup, { round: 1, index: 999 })).toThrow();
  });
});
