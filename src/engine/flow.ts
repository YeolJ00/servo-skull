// The turn structure of the 11th edition core rules, as data.
// Section numbers and anchors refer to https://wahapedia.ru/wh40k11ed/the-rules/core-rules/
import { otherPlayer, type GameSetup, type PlayerId, type Position } from './types.ts';

export const CORE_RULES_URL = 'https://wahapedia.ru/wh40k11ed/the-rules/core-rules/';

export type PhaseId = 'command' | 'movement' | 'shooting' | 'charge' | 'fight';

export type StepId =
  | 'round/start'
  | 'turn/start'
  | 'command/start'
  | 'command/cp'
  | 'command/battleShock'
  | 'command/abilities'
  | 'command/end'
  | 'movement/start'
  | 'movement/move'
  | 'movement/end'
  | 'shooting/start'
  | 'shooting/shoot'
  | 'shooting/end'
  | 'charge/start'
  | 'charge/charge'
  | 'charge/end'
  | 'fight/start'
  | 'fight/pileIn'
  | 'fight/fightsFirst'
  | 'fight/remaining'
  | 'fight/consolidate'
  | 'fight/end'
  | 'turn/end'
  | 'round/end';

export interface StepDef {
  id: StepId;
  phase: PhaseId | null;
  /** Core rules section, e.g. "08.03". */
  section: string;
  /** Heading anchor on the Wahapedia core rules page. */
  anchor: string;
}

export const STEPS: readonly StepDef[] = [
  { id: 'round/start', phase: null, section: '07.01', anchor: '1.-Start-of-Battle-Round' },
  { id: 'turn/start', phase: null, section: '07.02', anchor: '2.-Player-Turns' },
  { id: 'command/start', phase: 'command', section: '08.01', anchor: '1.-Start-of-Command-Phase' },
  { id: 'command/cp', phase: 'command', section: '08.02', anchor: '2.-Gain-Core-CP' },
  { id: 'command/battleShock', phase: 'command', section: '08.03', anchor: '3.-Battle-shock-Step' },
  { id: 'command/abilities', phase: 'command', section: '08.04', anchor: '4.-Command-Abilities' },
  { id: 'command/end', phase: 'command', section: '08.05', anchor: '5.-End-of-Command-Phase' },
  { id: 'movement/start', phase: 'movement', section: '09.01', anchor: '1.-Start-of-Movement-Phase' },
  { id: 'movement/move', phase: 'movement', section: '09.02', anchor: '2.-Move-Units-Step' },
  { id: 'movement/end', phase: 'movement', section: '09.03', anchor: '3.-End-of-Movement-Phase' },
  { id: 'shooting/start', phase: 'shooting', section: '10.01', anchor: '1.-Start-of-Shooting-Phase' },
  { id: 'shooting/shoot', phase: 'shooting', section: '10.02', anchor: '2.-Shoot' },
  { id: 'shooting/end', phase: 'shooting', section: '10.03', anchor: '3.-End-of-Shooting-Phase' },
  { id: 'charge/start', phase: 'charge', section: '11.01', anchor: '1.-Start-of-Charge-Phase' },
  { id: 'charge/charge', phase: 'charge', section: '11.02', anchor: '2.-Charge-Step' },
  { id: 'charge/end', phase: 'charge', section: '11.03', anchor: '3.-End-of-Charge-Phase' },
  { id: 'fight/start', phase: 'fight', section: '12.01', anchor: '1.-Start-of-Fight-Phase' },
  { id: 'fight/pileIn', phase: 'fight', section: '12.02', anchor: '2.-Pile-In' },
  { id: 'fight/fightsFirst', phase: 'fight', section: '12.03', anchor: '3.-Fight-Step' },
  { id: 'fight/remaining', phase: 'fight', section: '12.03', anchor: '3.-Fight-Step' },
  { id: 'fight/consolidate', phase: 'fight', section: '12.04', anchor: '4.-Consolidate' },
  { id: 'fight/end', phase: 'fight', section: '12.05', anchor: '5.-End-of-Fight-Phase' },
  { id: 'turn/end', phase: null, section: '07.02', anchor: '2.-Player-Turns' },
  { id: 'round/end', phase: null, section: '07.03', anchor: '3.-End-of-Battle-Round' },
];

const STEP_BY_ID: Record<StepId, StepDef> = Object.fromEntries(STEPS.map((s) => [s.id, s])) as Record<
  StepId,
  StepDef
>;

export function stepDef(id: StepId): StepDef {
  return STEP_BY_ID[id];
}

export function phaseOf(id: StepId): PhaseId | null {
  return STEP_BY_ID[id].phase;
}

export function ruleUrl(id: StepId): string {
  return `${CORE_RULES_URL}#${STEP_BY_ID[id].anchor}`;
}

/** The steps of one player's turn (07.02), from start of turn to end of turn. */
export const TURN_STEPS: readonly StepId[] = STEPS.map((s) => s.id).slice(
  STEPS.findIndex((s) => s.id === 'turn/start'),
  STEPS.findIndex((s) => s.id === 'turn/end') + 1,
);

export interface RoundSlot {
  step: StepId;
  /** The active player, or null at the start and end of the round. */
  player: PlayerId | null;
  /** 0 for the first player's turn, 1 for the second's. */
  turnInRound: 0 | 1;
}

/** A battle round (07): start, first player's turn, second player's turn, end. */
export function roundSlots(firstPlayer: PlayerId): RoundSlot[] {
  const second = otherPlayer(firstPlayer);
  return [
    { step: 'round/start', player: null, turnInRound: 0 },
    ...TURN_STEPS.map((step): RoundSlot => ({ step, player: firstPlayer, turnInRound: 0 })),
    ...TURN_STEPS.map((step): RoundSlot => ({ step, player: second, turnInRound: 1 })),
    { step: 'round/end', player: null, turnInRound: 1 },
  ];
}

export function slotAt(setup: GameSetup, pos: Position): RoundSlot {
  const slots = roundSlots(setup.firstPlayer);
  const slot = slots[pos.index];
  if (!slot) throw new Error(`Bad position index ${pos.index}`);
  return slot;
}

/** Counts player turns across the whole battle: round 1 first turn is 0. Used for 13.09. */
export function globalTurnIndex(setup: GameSetup, pos: Position): number {
  return (pos.round - 1) * 2 + slotAt(setup, pos).turnInRound;
}
