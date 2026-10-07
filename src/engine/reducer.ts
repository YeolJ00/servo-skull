// Event-sourced game state: state = events.reduce(apply, init(setup)).
// Every rule here cites its core rules section. Anything the host cannot know
// (range, visibility, engagement) is left to the players and not validated.
import { globalTurnIndex, phaseOf, roundSlots, slotAt, type RoundSlot, type StepId } from './flow.ts';
import {
  EngineError,
  otherPlayer,
  type EngineErrorCode,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MoveType,
  type PlayerId,
  type ShootingType,
  type UnitSetup,
  type UnitState,
} from './types.ts';

function fail(code: EngineErrorCode): never {
  throw new EngineError(code);
}

function newUnit(u: UnitSetup): UnitState {
  return {
    id: u.id,
    name: u.name,
    owner: u.owner,
    models: u.models,
    startingStrength: u.models,
    ld: u.ld,
    datasheetId: u.datasheetId ?? null,
    destroyed: u.models <= 0,
    battleShocked: false,
    battleShockTested: false,
    selectedToMove: false,
    selectedToShoot: false,
    selectedToFight: false,
    declaredCharge: false,
    chargeRoll: null,
    chargeResolved: false,
    advanced: false,
    fellBack: false,
    remainedStationary: false,
    charged: false,
    fightsFirst: false,
    lastRangedAttackTurn: null,
  };
}

export function init(setup: GameSetup): GameState {
  const units: Record<string, UnitState> = {};
  for (const u of setup.units) units[u.id] = newUnit(u);
  return {
    setup,
    pos: { round: 1, index: 0 },
    finished: false,
    cp: { p1: setup.startingCp, p2: setup.startingCp },
    vp: { p1: 0, p2: 0 },
    units,
    unitOrder: setup.units.map((u) => u.id),
    fight: { nextPlayer: setup.firstPlayer },
  };
}

export function replay(setup: GameSetup, events: readonly GameEvent[]): GameState {
  return events.reduce(apply, init(setup));
}

/**
 * Replays as far as the log is valid. A log written by an older engine, or corrupted storage,
 * stops at the first event that no longer applies instead of losing the whole game.
 */
export function replaySafe(
  setup: GameSetup,
  events: readonly GameEvent[],
): { state: GameState; events: GameEvent[]; dropped: number } {
  let state = init(setup);
  const kept: GameEvent[] = [];
  for (const e of events) {
    try {
      state = apply(state, e);
      kept.push(e);
    } catch (err) {
      if (err instanceof EngineError) break;
      throw err;
    }
  }
  return { state, events: kept, dropped: events.length - kept.length };
}

export function currentSlot(state: GameState): RoundSlot {
  return slotAt(state.setup, state.pos);
}

export function currentStep(state: GameState): StepId {
  return currentSlot(state).step;
}

export function activePlayer(state: GameState): PlayerId | null {
  return currentSlot(state).player;
}

export function unitsOf(state: GameState, player: PlayerId): UnitState[] {
  return state.unitOrder.map((id) => state.units[id]).filter((u): u is UnitState => !!u && u.owner === player);
}

// 08.03: a unit tests if it is battle-shocked or at or below half-strength.
export function needsBattleShockTest(u: UnitState): boolean {
  return !u.destroyed && (u.battleShocked || u.models * 2 <= u.startingStrength);
}

/** Returns the error code the event would raise, or null if it can be applied. */
export function check(state: GameState, event: GameEvent): EngineErrorCode | null {
  try {
    apply(state, event);
    return null;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
}

export function apply(state: GameState, event: GameEvent): GameState {
  switch (event.t) {
    case 'step/next':
      return stepNext(state);
    case 'cp/adjust': {
      const next = state.cp[event.player] + event.delta;
      if (next < 0) fail('cpNegative');
      return { ...state, cp: { ...state.cp, [event.player]: next } };
    }
    case 'vp/adjust': {
      const next = state.vp[event.player] + event.delta;
      if (next < 0) fail('vpNegative');
      return { ...state, vp: { ...state.vp, [event.player]: next } };
    }
    case 'unit/models': {
      const u = getUnit(state, event.unitId);
      if (!Number.isInteger(event.models) || event.models < 0 || event.models > u.startingStrength) fail('badModels');
      return withUnit(state, { ...u, models: event.models, destroyed: event.models === 0 });
    }
    case 'unit/battleShock':
      return battleShock(state, event.unitId, event.roll);
    case 'unit/move':
      return move(state, event.unitId, event.moveType, event.advanceRoll);
    case 'unit/shoot':
      return shoot(state, event.unitId, event.shootingType);
    case 'charge/declare':
      return chargeDeclare(state, event.unitId);
    case 'charge/roll':
      return chargeRoll(state, event.unitId, event.roll);
    case 'charge/resolve':
      return chargeResolve(state, event.unitId, event.targetIds, event.success);
    case 'unit/fight':
      return fight(state, event.unitId);
    case 'fight/pass':
      return fightPass(state, event.player);
  }
}

// ---- helpers ----

function getUnit(state: GameState, id: string): UnitState {
  const u = state.units[id];
  if (!u) fail('unknownUnit');
  return u;
}

function withUnit(state: GameState, u: UnitState): GameState {
  return { ...state, units: { ...state.units, [u.id]: u } };
}

function mapUnits(state: GameState, f: (u: UnitState) => UnitState): GameState {
  const units: Record<string, UnitState> = {};
  for (const id of state.unitOrder) {
    const u = state.units[id];
    if (u) units[id] = f(u);
  }
  return { ...state, units };
}

function clearPhaseFlags(u: UnitState): UnitState {
  return {
    ...u,
    battleShockTested: false,
    selectedToMove: false,
    selectedToShoot: false,
    selectedToFight: false,
    declaredCharge: false,
    chargeRoll: null,
    chargeResolved: false,
  };
}

// 07.02: "until the end of the turn" effects expire at the end of the turn.
function clearTurnFlags(u: UnitState): UnitState {
  return { ...u, advanced: false, fellBack: false, remainedStationary: false, charged: false, fightsFirst: false };
}

/** The unit must belong to the active player and the game must be at the given step. */
function ownActiveUnit(state: GameState, unitId: string, step: StepId): UnitState {
  if (state.finished) fail('finished');
  if (currentStep(state) !== step) fail('wrongStep');
  const u = getUnit(state, unitId);
  if (u.owner !== activePlayer(state)) fail('notYourUnit');
  if (u.destroyed) fail('destroyed');
  return u;
}

function is2D6(roll: number): boolean {
  return Number.isInteger(roll) && roll >= 2 && roll <= 12;
}

// ---- step/next ----

function stepNext(state: GameState): GameState {
  if (state.finished) fail('finished');
  const slot = currentSlot(state);
  const active = slot.player;

  // 08.03: every unit that needs a battle-shock test takes one before the step ends.
  if (slot.step === 'command/battleShock' && active) {
    if (unitsOf(state, active).some((u) => needsBattleShockTest(u) && !u.battleShockTested)) fail('battleShockPending');
  }
  // 09.02: every unit, including those in reserves or embarked, is selected before the phase ends.
  if (slot.step === 'movement/move' && active) {
    if (unitsOf(state, active).some((u) => !u.destroyed && !u.selectedToMove)) fail('unitsNotMoved');
  }

  const slots = roundSlots(state.setup.firstPlayer);
  let { round, index } = state.pos;
  let finished = false;
  index += 1;
  if (index >= slots.length) {
    if (round >= state.setup.rounds) {
      finished = true;
      index = slots.length - 1;
    } else {
      round += 1;
      index = 0;
    }
  }
  const next = slots[index];
  if (!next) fail('finished');

  let out: GameState = { ...state, pos: { round, index }, finished };

  if (phaseOf(slot.step) !== phaseOf(next.step)) out = mapUnits(out, clearPhaseFlags);
  if (slot.step === 'turn/end') out = mapUnits(out, clearTurnFlags);

  if (finished) return out;

  // 08.02: both players gain 1 CP in each Command phase.
  if (next.step === 'command/cp') out = { ...out, cp: { p1: out.cp.p1 + 1, p2: out.cp.p2 + 1 } };

  // 12.03: players alternate picking units to fight, starting with the active player.
  if ((next.step === 'fight/fightsFirst' || next.step === 'fight/remaining') && next.player) {
    out = { ...out, fight: { nextPlayer: next.player } };
  }

  return out;
}

// ---- Command phase ----

// 08.03: 2D6; a result at or above Ld passes. A pass clears battle-shock, a fail sets it.
function battleShock(state: GameState, unitId: string, roll: number): GameState {
  const u = ownActiveUnit(state, unitId, 'command/battleShock');
  if (!is2D6(roll)) fail('badRoll');
  if (u.battleShockTested) fail('alreadySelected');
  return withUnit(state, { ...u, battleShockTested: true, battleShocked: roll < u.ld });
}

// ---- Movement phase ----

// 09.02: each unit is selected once and makes one kind of move.
function move(state: GameState, unitId: string, moveType: MoveType, advanceRoll: number | undefined): GameState {
  const u = ownActiveUnit(state, unitId, 'movement/move');
  if (u.selectedToMove) fail('alreadySelected');
  if (moveType === 'advance' && !(Number.isInteger(advanceRoll) && advanceRoll! >= 1 && advanceRoll! <= 6)) fail('needAdvanceRoll');
  return withUnit(state, {
    ...u,
    selectedToMove: true,
    advanced: moveType === 'advance',
    fellBack: moveType === 'fallBack',
    remainedStationary: moveType === 'stationary',
  });
}

// ---- Shooting phase ----

function shoot(state: GameState, unitId: string, shootingType: ShootingType): GameState {
  const u = ownActiveUnit(state, unitId, 'shooting/shoot');
  if (u.selectedToShoot) fail('alreadySelected');
  // 09.02: a unit that fell back cannot shoot this turn.
  if (u.fellBack) fail('fellBackCannotShoot');
  // 09.02 / 10.02: a unit that advanced can only make assault attacks.
  if (u.advanced && shootingType !== 'assault') fail('advancedMustAssault');
  // 13.09: remember the turn of the last ranged attack.
  return withUnit(state, {
    ...u,
    selectedToShoot: true,
    lastRangedAttackTurn: globalTurnIndex(state.setup, state.pos),
  });
}

// ---- Charge phase ----

// 11.02: declare, then roll, then pick targets within the rolled distance.
function chargeDeclare(state: GameState, unitId: string): GameState {
  const u = ownActiveUnit(state, unitId, 'charge/charge');
  if (u.advanced) fail('advancedCannotCharge');
  if (u.fellBack) fail('fellBackCannotCharge');
  if (u.declaredCharge || u.charged) fail('alreadyCharged');
  return withUnit(state, { ...u, declaredCharge: true });
}

function chargeRoll(state: GameState, unitId: string, roll: number): GameState {
  const u = ownActiveUnit(state, unitId, 'charge/charge');
  if (!u.declaredCharge) fail('notDeclared');
  if (u.chargeRoll !== null) fail('alreadyRolled');
  if (!is2D6(roll)) fail('badRoll');
  return withUnit(state, { ...u, chargeRoll: roll });
}

function chargeResolve(state: GameState, unitId: string, targetIds: string[], success: boolean): GameState {
  const u = ownActiveUnit(state, unitId, 'charge/charge');
  if (!u.declaredCharge) fail('notDeclared');
  if (u.chargeRoll === null) fail('noRoll');
  if (u.chargeResolved) fail('alreadyCharged');
  if (success) {
    if (targetIds.length === 0) fail('needTargets');
    for (const id of targetIds) {
      const target = state.units[id];
      if (!target || target.owner === u.owner || target.destroyed) fail('badTarget');
    }
  }
  // 11.02: a unit that makes a charge move has Fights First until the end of the turn.
  return withUnit(state, { ...u, chargeResolved: true, charged: success, fightsFirst: u.fightsFirst || success });
}

// ---- Fight phase ----

// 12.03: players alternate, active player first. Fights First units fight before the rest.
function fight(state: GameState, unitId: string): GameState {
  if (state.finished) fail('finished');
  const step = currentStep(state);
  if (step !== 'fight/fightsFirst' && step !== 'fight/remaining') fail('wrongStep');
  const u = getUnit(state, unitId);
  if (u.destroyed) fail('destroyed');
  if (u.selectedToFight) fail('alreadyFought');
  if (u.owner !== state.fight.nextPlayer) fail('notYourPick');
  if (step === 'fight/fightsFirst' && !u.fightsFirst) fail('noFightsFirst');
  const next = withUnit(state, { ...u, selectedToFight: true });
  return { ...next, fight: { nextPlayer: otherPlayer(u.owner) } };
}

function fightPass(state: GameState, player: PlayerId): GameState {
  if (state.finished) fail('finished');
  const step = currentStep(state);
  if (step !== 'fight/fightsFirst' && step !== 'fight/remaining') fail('wrongStep');
  if (player !== state.fight.nextPlayer) fail('notYourPick');
  return { ...state, fight: { nextPlayer: otherPlayer(player) } };
}
