// Pure types for the game engine. No DOM, no Preact.

export type PlayerId = 'p1' | 'p2';

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'p1' ? 'p2' : 'p1';
}

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  /** CSS color chosen in setup. Always shown next to the player's name. */
  color: string;
}

export interface UnitSetup {
  id: string;
  name: string;
  owner: PlayerId;
  models: number;
  /** Leadership characteristic, used for battle-shock tests (08.03). */
  ld: number;
}

export interface GameSetup {
  players: Record<PlayerId, PlayerSetup>;
  firstPlayer: PlayerId;
  rounds: number;
  /** Pre-battle CP comes from the mission. The host does not know it, so setup asks. */
  startingCp: number;
  units: UnitSetup[];
}

export type MoveType = 'stationary' | 'normal' | 'advance' | 'fallBack' | 'disembark' | 'ingress';
export type ShootingType = 'normal' | 'assault' | 'closeQuarters' | 'indirect';
export type FightType = 'normal' | 'overrun';

export interface UnitState {
  id: string;
  name: string;
  owner: PlayerId;
  models: number;
  startingStrength: number;
  ld: number;
  destroyed: boolean;

  // Until a test passes (08.03).
  battleShocked: boolean;

  // Phase flags: cleared when the phase changes.
  battleShockTested: boolean;
  selectedToMove: boolean;
  selectedToShoot: boolean;
  selectedToFight: boolean;
  declaredCharge: boolean;
  chargeRoll: number | null;

  // Turn flags: cleared at the end of the turn.
  advanced: boolean;
  fellBack: boolean;
  remainedStationary: boolean;
  charged: boolean;
  fightsFirst: boolean;

  // Global turn index of the last ranged attack (13.09). Persistent.
  lastRangedAttackTurn: number | null;
}

/** Where we are: the battle round and the index into that round's slot list (see flow.ts). */
export interface Position {
  round: number;
  index: number;
}

export interface GameState {
  setup: GameSetup;
  pos: Position;
  finished: boolean;
  cp: Record<PlayerId, number>;
  vp: Record<PlayerId, number>;
  units: Record<string, UnitState>;
  unitOrder: string[];
  /** Fight phase: whose turn it is to pick the next unit to fight (12.03). */
  fight: { nextPlayer: PlayerId };
}

export type GameEvent =
  | { t: 'step/next' }
  | { t: 'cp/adjust'; player: PlayerId; delta: number; reason: string }
  | { t: 'vp/adjust'; player: PlayerId; delta: number; reason: string }
  /** Record casualties. 0 models destroys the unit. */
  | { t: 'unit/models'; unitId: string; models: number }
  /** Battle-shock test result: the 2D6 total (08.03). */
  | { t: 'unit/battleShock'; unitId: string; roll: number }
  | { t: 'unit/move'; unitId: string; moveType: MoveType; advanceRoll?: number }
  | { t: 'unit/shoot'; unitId: string; shootingType: ShootingType }
  | { t: 'charge/declare'; unitId: string }
  | { t: 'charge/roll'; unitId: string; roll: number }
  | { t: 'charge/resolve'; unitId: string; targetIds: string[]; success: boolean }
  | { t: 'unit/fight'; unitId: string; fightType: FightType }
  /** The player whose pick it is has no unit able to fight. */
  | { t: 'fight/pass'; player: PlayerId };

export type EngineErrorCode =
  | 'finished'
  | 'battleShockPending'
  | 'unitsNotMoved'
  | 'cpNegative'
  | 'vpNegative'
  | 'unknownUnit'
  | 'notYourUnit'
  | 'wrongStep'
  | 'alreadySelected'
  | 'destroyed'
  | 'needAdvanceRoll'
  | 'badRoll'
  | 'badModels'
  | 'fellBackCannotShoot'
  | 'advancedMustAssault'
  | 'advancedCannotCharge'
  | 'fellBackCannotCharge'
  | 'alreadyCharged'
  | 'notDeclared'
  | 'alreadyRolled'
  | 'noRoll'
  | 'needTargets'
  | 'badTarget'
  | 'notYourPick'
  | 'noFightsFirst'
  | 'alreadyFought';

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode) {
    super(code);
    this.name = 'EngineError';
  }
}
