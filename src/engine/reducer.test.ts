import { describe, expect, it } from 'vitest';
import { roundSlots, type StepId } from './flow.ts';
import { activePlayer, apply, check, currentStep, init, needsBattleShockTest, replay, replaySafe, unitsOf } from './reducer.ts';
import { EngineError, type GameEvent, type GameSetup, type GameState, type PlayerId } from './types.ts';

function makeSetup(over: Partial<GameSetup> = {}): GameSetup {
  return {
    players: {
      p1: { id: 'p1', name: 'Marines', color: '#3F6FD8' },
      p2: { id: 'p2', name: 'Orks', color: '#5E9E3A' },
    },
    firstPlayer: 'p1',
    rounds: 2,
    startingCp: 0,
    units: [
      { id: 'm1', name: 'Intercessors', owner: 'p1', models: 5, ld: 6 },
      { id: 'm2', name: 'Captain', owner: 'p1', models: 1, ld: 6 },
      { id: 'o1', name: 'Boyz', owner: 'p2', models: 10, ld: 7 },
      { id: 'o2', name: 'Warboss', owner: 'p2', models: 1, ld: 6 },
    ],
    ...over,
  };
}

const next: GameEvent = { t: 'step/next' };

/** Marks every unit of the active player as remaining stationary. */
function moveAll(state: GameState): GameState {
  const p = activePlayer(state);
  if (!p) return state;
  return unitsOf(state, p)
    .filter((u) => !u.destroyed && !u.selectedToMove)
    .reduce((s, u) => apply(s, { t: 'unit/move', unitId: u.id, moveType: 'stationary' }), state);
}

/** Steps forward until the given step is current for the given player, satisfying gates on the way. */
function goTo(state: GameState, step: StepId, player?: PlayerId): GameState {
  for (let i = 0; i < 200; i++) {
    if (currentStep(state) === step && (player === undefined || activePlayer(state) === player)) return state;
    if (currentStep(state) === 'movement/move') state = moveAll(state);
    state = apply(state, next);
  }
  throw new Error(`never reached ${step}`);
}

function code(state: GameState, event: GameEvent) {
  return check(state, event);
}

describe('init', () => {
  it('starts at the start of round 1 with the mission CP', () => {
    const s = init(makeSetup({ startingCp: 1 }));
    expect(s.pos).toEqual({ round: 1, index: 0 });
    expect(currentStep(s)).toBe('round/start');
    expect(activePlayer(s)).toBeNull();
    expect(s.cp).toEqual({ p1: 1, p2: 1 });
    expect(s.vp).toEqual({ p1: 0, p2: 0 });
    expect(s.finished).toBe(false);
    expect(s.units.m1?.startingStrength).toBe(5);
  });
});

describe('turn flow', () => {
  it('walks through a full round in the documented order and finishes after the last round', () => {
    const setup = makeSetup({ rounds: 1 });
    let s = init(setup);
    const seen: Array<[StepId, PlayerId | null]> = [];
    while (!s.finished) {
      seen.push([currentStep(s), activePlayer(s)]);
      if (currentStep(s) === 'movement/move') s = moveAll(s);
      s = apply(s, next);
    }
    expect(seen).toEqual(roundSlots('p1').map((slot) => [slot.step, slot.player]));
    expect(currentStep(s)).toBe('round/end');
    expect(code(s, next)).toBe('finished');
  });

  it('moves to round 2 after the end of round 1', () => {
    let s = init(makeSetup({ rounds: 2 }));
    s = goTo(s, 'round/end');
    s = apply(s, next);
    expect(s.pos).toEqual({ round: 2, index: 0 });
    expect(s.finished).toBe(false);
  });

  it('the second player takes the second turn', () => {
    const s = goTo(init(makeSetup({ firstPlayer: 'p2' })), 'command/start');
    expect(activePlayer(s)).toBe('p2');
    const s2 = goTo(s, 'command/start', 'p1');
    expect(s2.pos.round).toBe(1);
  });
});

describe('Command phase', () => {
  it('both players gain 1 CP in each Command phase (08.02)', () => {
    let s = init(makeSetup());
    s = goTo(s, 'command/cp', 'p1');
    expect(s.cp).toEqual({ p1: 1, p2: 1 });
    s = goTo(s, 'command/cp', 'p2');
    expect(s.cp).toEqual({ p1: 2, p2: 2 });
    s = goTo(apply(s, next), 'command/cp', 'p1');
    expect(s.pos.round).toBe(2);
    expect(s.cp).toEqual({ p1: 3, p2: 3 });
  });

  it('CP and VP can be adjusted but never go below zero', () => {
    const s = init(makeSetup());
    expect(apply(s, { t: 'cp/adjust', player: 'p1', delta: 2, reason: 'test' }).cp.p1).toBe(2);
    expect(code(s, { t: 'cp/adjust', player: 'p1', delta: -1, reason: 'test' })).toBe('cpNegative');
    expect(apply(s, { t: 'vp/adjust', player: 'p2', delta: 5, reason: 'objective' }).vp.p2).toBe(5);
    expect(code(s, { t: 'vp/adjust', player: 'p2', delta: -1, reason: 'test' })).toBe('vpNegative');
  });

  it('a unit at or below half strength must take a battle-shock test before the step ends (08.03)', () => {
    let s = init(makeSetup());
    s = apply(s, { t: 'unit/models', unitId: 'm1', models: 2 });
    expect(needsBattleShockTest(s.units.m1!)).toBe(true);
    s = goTo(s, 'command/battleShock', 'p1');
    expect(code(s, next)).toBe('battleShockPending');
    expect(code(s, { t: 'unit/battleShock', unitId: 'm1', roll: 13 })).toBe('badRoll');

    const failed = apply(s, { t: 'unit/battleShock', unitId: 'm1', roll: 5 });
    expect(failed.units.m1?.battleShocked).toBe(true);
    expect(code(failed, { t: 'unit/battleShock', unitId: 'm1', roll: 7 })).toBe('alreadySelected');
    expect(code(failed, next)).toBeNull();

    const passed = apply(s, { t: 'unit/battleShock', unitId: 'm1', roll: 6 });
    expect(passed.units.m1?.battleShocked).toBe(false);
  });

  it('exactly half strength counts as at half strength', () => {
    let s = init(makeSetup());
    s = apply(s, { t: 'unit/models', unitId: 'o1', models: 5 });
    expect(needsBattleShockTest(s.units.o1!)).toBe(true);
    s = apply(s, { t: 'unit/models', unitId: 'o1', models: 6 });
    expect(needsBattleShockTest(s.units.o1!)).toBe(false);
  });

  it('a battle-shocked unit stays shocked until it passes a later test', () => {
    let s = init(makeSetup());
    s = apply(s, { t: 'unit/models', unitId: 'm1', models: 2 });
    s = goTo(s, 'command/battleShock', 'p1');
    s = apply(s, { t: 'unit/battleShock', unitId: 'm1', roll: 3 });
    s = goTo(s, 'command/battleShock', 'p2');
    expect(s.units.m1?.battleShocked).toBe(true);
    s = goTo(apply(s, next), 'command/battleShock', 'p1');
    expect(code(s, next)).toBe('battleShockPending');
    s = apply(s, { t: 'unit/battleShock', unitId: 'm1', roll: 9 });
    expect(s.units.m1?.battleShocked).toBe(false);
  });

  it('only the active player tests, and only at the battle-shock step', () => {
    let s = init(makeSetup());
    expect(code(s, { t: 'unit/battleShock', unitId: 'm1', roll: 7 })).toBe('wrongStep');
    s = goTo(s, 'command/battleShock', 'p1');
    expect(code(s, { t: 'unit/battleShock', unitId: 'o1', roll: 7 })).toBe('notYourUnit');
    expect(code(s, { t: 'unit/battleShock', unitId: 'nope', roll: 7 })).toBe('unknownUnit');
  });
});

describe('Movement phase', () => {
  it('cannot end until every unit of the active player has been selected (09.02)', () => {
    let s = goTo(init(makeSetup()), 'movement/move', 'p1');
    expect(code(s, next)).toBe('unitsNotMoved');
    s = apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'normal' });
    expect(code(s, next)).toBe('unitsNotMoved');
    s = apply(s, { t: 'unit/move', unitId: 'm2', moveType: 'stationary' });
    expect(code(s, next)).toBeNull();
  });

  it('destroyed units do not need to be selected', () => {
    let s = apply(init(makeSetup()), { t: 'unit/models', unitId: 'm2', models: 0 });
    expect(s.units.m2?.destroyed).toBe(true);
    s = goTo(s, 'movement/move', 'p1');
    s = apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'normal' });
    expect(code(s, next)).toBeNull();
    expect(code(s, { t: 'unit/move', unitId: 'm2', moveType: 'normal' })).toBe('destroyed');
  });

  it('a unit is selected once, by its owner, and an advance needs its D6', () => {
    const s = goTo(init(makeSetup()), 'movement/move', 'p1');
    expect(code(s, { t: 'unit/move', unitId: 'o1', moveType: 'normal' })).toBe('notYourUnit');
    expect(code(s, { t: 'unit/move', unitId: 'm1', moveType: 'advance' })).toBe('needAdvanceRoll');
    expect(code(s, { t: 'unit/move', unitId: 'm1', moveType: 'advance', advanceRoll: 7 })).toBe('needAdvanceRoll');
    const moved = apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'advance', advanceRoll: 4 });
    expect(moved.units.m1).toMatchObject({ selectedToMove: true, advanced: true, fellBack: false });
    expect(code(moved, { t: 'unit/move', unitId: 'm1', moveType: 'normal' })).toBe('alreadySelected');
  });

  it('tracks wounds per model; the model count follows the wounds array', () => {
    const setup = makeSetup({
      units: [{ id: 'b', name: 'Boyz', owner: 'p1', models: 3, ld: 7, modelWounds: [3, 1, 1] }],
    });
    let s = init(setup);
    expect(s.units.b).toMatchObject({ wounds: [3, 1, 1], maxWounds: [3, 1, 1], models: 3 });
    s = apply(s, { t: 'unit/wounds', unitId: 'b', wounds: [1, 0, 1] });
    expect(s.units.b).toMatchObject({ wounds: [1, 0, 1], models: 2, destroyed: false });
    expect(code(s, { t: 'unit/wounds', unitId: 'b', wounds: [4, 0, 1] })).toBe('badWounds');
    expect(code(s, { t: 'unit/wounds', unitId: 'b', wounds: [1, 0] })).toBe('badWounds');
    // Casualties by count remove models from the end; revivals restore from the end.
    s = apply(s, { t: 'unit/models', unitId: 'b', models: 1 });
    expect(s.units.b?.wounds).toEqual([1, 0, 0]);
    s = apply(s, { t: 'unit/models', unitId: 'b', models: 3 });
    expect(s.units.b?.wounds).toEqual([1, 1, 1]);
    s = apply(s, { t: 'unit/models', unitId: 'b', models: 0 });
    expect(s.units.b).toMatchObject({ wounds: [0, 0, 0], models: 0, destroyed: true });
  });

  it('casualties by count spare CHARACTER models until last', () => {
    const setup = makeSetup({
      units: [{ id: 'a', name: 'Captain + squad', owner: 'p1', models: 3, ld: 6, modelWounds: [1, 1, 5], modelCharacter: [false, false, true] }],
    });
    let s = init(setup);
    expect(s.units.a?.character).toEqual([false, false, true]);
    s = apply(s, { t: 'unit/models', unitId: 'a', models: 1 });
    expect(s.units.a?.wounds).toEqual([0, 0, 5]);
    s = apply(s, { t: 'unit/models', unitId: 'a', models: 0 });
    expect(s.units.a?.wounds).toEqual([0, 0, 0]);
  });

  it('an attack result applies the target wounds', () => {
    let s = init(makeSetup());
    const result = { weaponName: 'Bolt rifle', attacks: 10, hits: 6, wounds: 3, failedSaves: 2, targetWounds: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0] };
    s = apply(s, { t: 'attack/resolved', attackerId: 'm1', targetId: 'o1', result });
    expect(s.units.o1?.models).toBe(8);
    expect(code(s, { t: 'attack/resolved', attackerId: 'm1', targetId: 'o1', result: { ...result, targetWounds: [1] } })).toBe('badWounds');
    expect(code(s, { t: 'attack/resolved', attackerId: 'zz', targetId: 'o1', result })).toBe('unknownUnit');
  });

  it('models cannot exceed starting strength', () => {
    const s = init(makeSetup());
    expect(code(s, { t: 'unit/models', unitId: 'm1', models: 6 })).toBe('badModels');
    expect(code(s, { t: 'unit/models', unitId: 'm1', models: -1 })).toBe('badModels');
  });
});

describe('Shooting and Charge phases', () => {
  function afterMoves(moves: Record<string, GameEvent & { t: 'unit/move' }>): GameState {
    let s = goTo(init(makeSetup()), 'movement/move', 'p1');
    for (const u of unitsOf(s, 'p1')) {
      s = apply(s, moves[u.id] ?? { t: 'unit/move', unitId: u.id, moveType: 'stationary' });
    }
    return s;
  }

  it('a unit that advanced can only make assault attacks and cannot charge', () => {
    let s = afterMoves({ m1: { t: 'unit/move', unitId: 'm1', moveType: 'advance', advanceRoll: 3 } });
    s = goTo(s, 'shooting/shoot');
    expect(code(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'normal' })).toBe('advancedMustAssault');
    s = apply(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'assault' });
    expect(s.units.m1?.selectedToShoot).toBe(true);
    expect(s.units.m1?.shootingType).toBe('assault');
    expect(s.units.m1?.lastRangedAttackTurn).toBe(0);
    expect(code(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'assault' })).toBe('alreadySelected');
    s = goTo(s, 'charge/charge');
    expect(code(s, { t: 'charge/declare', unitId: 'm1' })).toBe('advancedCannotCharge');
    expect(code(s, { t: 'charge/declare', unitId: 'm2' })).toBeNull();
  });

  it('a unit that fell back cannot shoot or charge', () => {
    let s = afterMoves({ m1: { t: 'unit/move', unitId: 'm1', moveType: 'fallBack' } });
    s = goTo(s, 'shooting/shoot');
    expect(code(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'normal' })).toBe('fellBackCannotShoot');
    expect(code(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'closeQuarters' })).toBe('fellBackCannotShoot');
    s = goTo(s, 'charge/charge');
    expect(code(s, { t: 'charge/declare', unitId: 'm1' })).toBe('fellBackCannotCharge');
  });

  it('charge targets are chosen after the roll (11.02)', () => {
    let s = goTo(afterMoves({}), 'charge/charge');
    expect(code(s, { t: 'charge/roll', unitId: 'm1', roll: 8 })).toBe('notDeclared');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true })).toBe('notDeclared');
    s = apply(s, { t: 'charge/declare', unitId: 'm1' });
    expect(code(s, { t: 'charge/declare', unitId: 'm1' })).toBe('alreadyCharged');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true })).toBe('noRoll');
    expect(code(s, { t: 'charge/roll', unitId: 'm1', roll: 1 })).toBe('badRoll');
    s = apply(s, { t: 'charge/roll', unitId: 'm1', roll: 8 });
    expect(code(s, { t: 'charge/roll', unitId: 'm1', roll: 8 })).toBe('alreadyRolled');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: [], success: true })).toBe('needTargets');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['m2'], success: true })).toBe('badTarget');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['zz'], success: true })).toBe('badTarget');
    s = apply(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true });
    expect(s.units.m1).toMatchObject({ charged: true, fightsFirst: true });
  });

  it('a failed charge leaves the unit unchanged and it cannot try again this phase', () => {
    let s = goTo(afterMoves({}), 'charge/charge');
    s = apply(s, { t: 'charge/declare', unitId: 'm1' });
    s = apply(s, { t: 'charge/roll', unitId: 'm1', roll: 3 });
    s = apply(s, { t: 'charge/resolve', unitId: 'm1', targetIds: [], success: false });
    expect(s.units.m1).toMatchObject({ charged: false, fightsFirst: false, chargeResolved: true });
    expect(code(s, { t: 'charge/declare', unitId: 'm1' })).toBe('alreadyCharged');
    expect(code(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true })).toBe('alreadyCharged');
    s = goTo(s, 'charge/charge', 'p2');
    expect(s.units.m1?.chargeResolved).toBe(false);
  });
});

describe('Fight phase', () => {
  function withCharge(): GameState {
    let s = goTo(init(makeSetup()), 'charge/charge', 'p1');
    s = apply(s, { t: 'charge/declare', unitId: 'm1' });
    s = apply(s, { t: 'charge/roll', unitId: 'm1', roll: 9 });
    s = apply(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true });
    return s;
  }

  it('Fights First alternation starts with the active player (12.03)', () => {
    let s = goTo(withCharge(), 'fight/fightsFirst');
    expect(s.fight.nextPlayer).toBe('p1');
    expect(code(s, { t: 'unit/fight', unitId: 'o1', fightType: 'normal' })).toBe('notYourPick');
    expect(code(s, { t: 'unit/fight', unitId: 'm2', fightType: 'normal' })).toBe('noFightsFirst');
    s = apply(s, { t: 'unit/fight', unitId: 'm1', fightType: 'normal' });
    expect(s.fight.nextPlayer).toBe('p2');
    expect(code(s, { t: 'unit/fight', unitId: 'm1', fightType: 'normal' })).toBe('alreadyFought');
    expect(code(s, { t: 'fight/pass', player: 'p1' })).toBe('notYourPick');
    s = apply(s, { t: 'fight/pass', player: 'p2' });
    expect(s.fight.nextPlayer).toBe('p1');
  });

  it('remaining fights also start with the active player and alternate', () => {
    let s = goTo(withCharge(), 'fight/remaining');
    expect(s.fight.nextPlayer).toBe('p1');
    s = apply(s, { t: 'unit/fight', unitId: 'm2', fightType: 'normal' });
    s = apply(s, { t: 'unit/fight', unitId: 'o1', fightType: 'overrun' });
    expect(s.fight.nextPlayer).toBe('p1');
    expect(s.units.o1?.selectedToFight).toBe(true);
  });

  it('fighting outside the fight steps is rejected', () => {
    const s = goTo(init(makeSetup()), 'fight/pileIn');
    expect(code(s, { t: 'unit/fight', unitId: 'm1', fightType: 'normal' })).toBe('wrongStep');
    expect(code(s, { t: 'fight/pass', player: 'p1' })).toBe('wrongStep');
  });
});

describe('stratagems (15.01)', () => {
  it('pays CP and refuses the same stratagem twice in one phase, or without enough CP', () => {
    let s = goTo(init(makeSetup({ startingCp: 2 })), 'shooting/shoot', 'p1');
    const use: GameEvent = { t: 'stratagem/use', player: 'p1', stratagemId: 'S1', name: 'Overwatch', cp: 1 };
    s = apply(s, use);
    expect(s.cp.p1).toBe(2); // 2 starting + 1 gained - 1 spent
    expect(s.stratagemsUsed).toHaveLength(1);
    expect(code(s, use)).toBe('stratagemUsedThisPhase');
    // The other player can use it, and a different stratagem is fine.
    expect(code(s, { ...use, player: 'p2' })).toBeNull();
    expect(code(s, { ...use, stratagemId: 'S2' })).toBeNull();
    expect(code(s, { ...use, stratagemId: 'S3', cp: 5 })).toBe('cpNegative');
    expect(code(s, { ...use, stratagemId: '', cp: 1 })).toBe('badStratagem');
    // Next phase: usable again.
    s = goTo(s, 'charge/charge');
    expect(code(s, use)).toBeNull();
    // The same phase in the other player's turn is a different phase.
    s = goTo(apply(s, use), 'shooting/shoot', 'p2');
    expect(code(s, use)).toBeNull();
  });

  it('a 0 CP stratagem still counts for the once-per-phase rule', () => {
    const s = init(makeSetup());
    const use: GameEvent = { t: 'stratagem/use', player: 'p1', stratagemId: 'free', name: 'Free', cp: 0 };
    expect(code(apply(s, use), use)).toBe('stratagemUsedThisPhase');
  });
});

describe('flag lifetimes', () => {
  it('phase flags expire when the phase changes', () => {
    let s = goTo(init(makeSetup()), 'movement/move', 'p1');
    s = apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'normal' });
    s = apply(s, { t: 'unit/move', unitId: 'm2', moveType: 'normal' });
    expect(s.units.m1?.selectedToMove).toBe(true);
    s = goTo(s, 'movement/end');
    expect(s.units.m1?.selectedToMove).toBe(true);
    s = goTo(s, 'shooting/start');
    expect(s.units.m1?.selectedToMove).toBe(false);
  });

  it('turn flags survive the turn and expire at the end of it', () => {
    let s = goTo(init(makeSetup()), 'movement/move', 'p1');
    s = apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'advance', advanceRoll: 2 });
    s = apply(s, { t: 'unit/move', unitId: 'm2', moveType: 'fallBack' });
    s = goTo(s, 'turn/end');
    expect(s.units.m1?.advanced).toBe(true);
    expect(s.units.m2?.fellBack).toBe(true);
    s = apply(s, next);
    expect(currentStep(s)).toBe('turn/start');
    expect(activePlayer(s)).toBe('p2');
    expect(s.units.m1?.advanced).toBe(false);
    expect(s.units.m2?.fellBack).toBe(false);
  });

  it('fightsFirst from a charge expires at the end of the turn', () => {
    let s = goTo(init(makeSetup()), 'charge/charge', 'p1');
    s = apply(s, { t: 'charge/declare', unitId: 'm1' });
    s = apply(s, { t: 'charge/roll', unitId: 'm1', roll: 9 });
    s = apply(s, { t: 'charge/resolve', unitId: 'm1', targetIds: ['o1'], success: true });
    s = goTo(s, 'fight/end');
    expect(s.units.m1?.fightsFirst).toBe(true);
    s = goTo(s, 'turn/start', 'p2');
    expect(s.units.m1?.fightsFirst).toBe(false);
    expect(s.units.m1?.charged).toBe(false);
  });

  it('the last ranged attack turn persists across turns (13.09)', () => {
    let s = goTo(init(makeSetup()), 'shooting/shoot', 'p1');
    s = apply(s, { t: 'unit/shoot', unitId: 'm1', shootingType: 'normal' });
    s = goTo(s, 'shooting/shoot', 'p2');
    expect(s.units.m1?.lastRangedAttackTurn).toBe(0);
    s = apply(s, { t: 'unit/shoot', unitId: 'o1', shootingType: 'normal' });
    expect(s.units.o1?.lastRangedAttackTurn).toBe(1);
  });
});

describe('event sourcing', () => {
  it('undo replays to an identical state', () => {
    const setup = makeSetup();
    const events: GameEvent[] = [];
    let s = init(setup);
    const push = (e: GameEvent) => {
      events.push(e);
      s = apply(s, e);
    };
    while (currentStep(s) !== 'movement/move') push(next);
    push({ t: 'cp/adjust', player: 'p1', delta: -1, reason: 'stratagem' });
    push({ t: 'unit/move', unitId: 'm1', moveType: 'advance', advanceRoll: 5 });
    const before = replay(setup, events);
    push({ t: 'unit/move', unitId: 'm2', moveType: 'normal' });
    push(next);
    expect(replay(setup, events)).toEqual(s);
    expect(replay(setup, events.slice(0, -2))).toEqual(before);
  });

  it('replaySafe keeps the valid prefix of a broken log', () => {
    const setup = makeSetup();
    const events: GameEvent[] = [next, next, { t: 'unit/move', unitId: 'm1', moveType: 'normal' }, next];
    const r = replaySafe(setup, events);
    expect(r.events).toEqual([next, next]);
    expect(r.dropped).toBe(2);
    expect(r.state).toEqual(replay(setup, [next, next]));
  });

  it('apply never mutates its input', () => {
    const s = goTo(init(makeSetup()), 'movement/move', 'p1');
    const snapshot = JSON.parse(JSON.stringify(s));
    apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'normal' });
    apply(s, { t: 'cp/adjust', player: 'p2', delta: 1, reason: 'x' });
    expect(s).toEqual(snapshot);
  });

  it('errors are EngineErrors with a code', () => {
    const s = init(makeSetup());
    try {
      apply(s, { t: 'unit/move', unitId: 'm1', moveType: 'normal' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      expect((e as EngineError).code).toBe('wrongStep');
    }
  });
});
