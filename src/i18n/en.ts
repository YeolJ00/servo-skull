// All UI strings live here so another language can be added later.
// Help text is in our own words for a first-time player. It never copies rules text.

import type { PhaseId, StepId } from '../engine/flow.ts';
import type { EngineErrorCode } from '../engine/types.ts';

interface StepText {
  title: string;
  help: string;
}

const steps: Record<StepId, StepText> = {
  'round/start': {
    title: 'Start of battle round',
    help: 'A new battle round begins. Resolve anything that happens at the start of a round, then the first player takes their turn.',
  },
  'turn/start': {
    title: 'Start of turn',
    help: 'The active player takes a turn: Command, Movement, Shooting, Charge, then Fight. Resolve anything that triggers at the start of the turn.',
  },
  'command/start': {
    title: 'Start of Command phase',
    help: 'Resolve anything that triggers at the start of the Command phase.',
  },
  'command/cp': {
    title: 'Gain Command Points',
    help: 'Both players gain 1 Command Point. Spend CP on stratagems during the game.',
  },
  'command/battleShock': {
    title: 'Battle-shock tests',
    help: 'Roll 2D6 for each of your units that is battle-shocked or has lost half or more of its starting strength. If the total is at least the unit’s Leadership, it passes and is no longer battle-shocked. If it fails, the unit is battle-shocked until it passes a later test.',
  },
  'command/abilities': {
    title: 'Command abilities',
    help: 'Use any datasheet abilities and stratagems that happen in your Command phase.',
  },
  'command/end': {
    title: 'End of Command phase',
    help: 'Resolve anything that triggers at the end of the phase, then any mission rules for this point.',
  },
  'movement/start': {
    title: 'Start of Movement phase',
    help: 'Resolve anything that triggers at the start of the Movement phase.',
  },
  'movement/move': {
    title: 'Move units',
    help: 'Pick each of your units one at a time, including units in reserves or inside a transport. Each one either stays still, makes a normal move (up to M), advances (M plus a D6, and then cannot charge this turn), falls back out of combat (and then cannot shoot or charge this turn), disembarks, or arrives from reserves. Every unit must be picked before the phase ends.',
  },
  'movement/end': {
    title: 'End of Movement phase',
    help: 'Resolve anything that triggers at the end of the phase, then any mission rules.',
  },
  'shooting/start': {
    title: 'Start of Shooting phase',
    help: 'Resolve anything that triggers at the start of the Shooting phase.',
  },
  'shooting/shoot': {
    title: 'Shoot',
    help: 'One unit at a time, pick a unit that did not fall back and has not shot yet. If it advanced, only its Assault weapons can shoot. Check the target is visible and in range, then roll the attacks: hit, wound, save, damage.',
  },
  'shooting/end': {
    title: 'End of Shooting phase',
    help: 'Resolve anything that triggers at the end of the phase, then any mission rules.',
  },
  'charge/start': {
    title: 'Start of Charge phase',
    help: 'Resolve anything that triggers at the start of the Charge phase.',
  },
  'charge/charge': {
    title: 'Charge',
    help: 'One unit at a time, pick a unit within 12" of an enemy that is not already in combat and did not advance or fall back. Roll 2D6 first, then choose targets within 12" and within the distance rolled. The unit must end in contact range of every target and no other enemy. A unit that charged fights first this turn.',
  },
  'charge/end': {
    title: 'End of Charge phase',
    help: 'Resolve anything that triggers at the end of the phase, then any mission rules.',
  },
  'fight/start': {
    title: 'Start of Fight phase',
    help: 'Every unit in combat must fight this phase, on both sides. Resolve anything that triggers at the start of the Fight phase.',
  },
  'fight/pileIn': {
    title: 'Pile in',
    help: 'The active player first, then the opponent: move engaged models up to 3" so they can get into the fight.',
  },
  'fight/fightsFirst': {
    title: 'Fights First',
    help: 'Units with Fights First go now, including units that charged this turn. Players take turns picking one of these units, the active player first. Each unit makes its attacks.',
  },
  'fight/remaining': {
    title: 'Remaining fights',
    help: 'Every other unit in combat now fights. Keep taking turns picking a unit, the active player first. Each unit makes a normal fight or an overrun.',
  },
  'fight/consolidate': {
    title: 'Consolidate',
    help: 'The active player first: move each unit that fought up to 3", either towards the enemy, to stay in the fight, or onto an objective.',
  },
  'fight/end': {
    title: 'End of Fight phase',
    help: 'Resolve anything that triggers at the end of the phase, then any mission rules.',
  },
  'turn/end': {
    title: 'End of turn',
    help: 'Resolve end-of-turn rules. A unit that is out of coherency removes models until it is back in coherency. Score the mission for this turn. Effects that last until the end of the turn expire now.',
  },
  'round/end': {
    title: 'End of battle round',
    help: 'Resolve end-of-round rules first, then score the mission for this round.',
  },
};

const phases: Record<PhaseId, string> = {
  command: 'Command phase',
  movement: 'Movement phase',
  shooting: 'Shooting phase',
  charge: 'Charge phase',
  fight: 'Fight phase',
};

const errors: Record<EngineErrorCode, string> = {
  finished: 'The game is over.',
  battleShockPending: 'Some units still need a battle-shock test.',
  unitsNotMoved: 'Every unit must be picked before the Movement phase ends.',
  cpNegative: 'Not enough CP.',
  vpNegative: 'VP cannot go below zero.',
  unknownUnit: 'That unit is not in this game.',
  notYourUnit: 'That unit belongs to the other player.',
  wrongStep: 'That cannot happen in this step.',
  alreadySelected: 'That unit has already been picked this phase.',
  destroyed: 'That unit has been destroyed.',
  needAdvanceRoll: 'An advance needs a D6 result from 1 to 6.',
  badRoll: 'A 2D6 result is between 2 and 12.',
  badModels: 'Models must be between 0 and the starting strength.',
  fellBackCannotShoot: 'A unit that fell back cannot shoot this turn.',
  advancedMustAssault: 'A unit that advanced can only shoot Assault weapons.',
  advancedCannotCharge: 'A unit that advanced cannot charge this turn.',
  fellBackCannotCharge: 'A unit that fell back cannot charge this turn.',
  alreadyCharged: 'That unit has already declared a charge this phase.',
  notDeclared: 'Declare the charge first.',
  alreadyRolled: 'The charge roll has already been made.',
  noRoll: 'Roll the charge first, then pick targets.',
  needTargets: 'A successful charge needs at least one target.',
  badTarget: 'Charge targets must be enemy units that are still on the table.',
  notYourPick: 'It is the other player’s turn to pick a unit.',
  noFightsFirst: 'Only units with Fights First can fight in this step.',
  alreadyFought: 'That unit has already fought this phase.',
};

export const en = {
  app: {
    name: 'Servo-skull',
    tagline: 'A table-side host for Warhammer 40,000.',
    poweredBy: 'Powered by Wahapedia',
    wahapediaUrl: 'https://wahapedia.ru/',
  },
  nav: {
    home: 'Home',
    back: 'Back',
    game: 'Game',
    armies: 'Armies',
    import: 'Import rules',
    setup: 'New game',
  },
  home: {
    continueGame: 'Continue game',
    continueHint: 'Pick up the game in progress on this device.',
    newGame: 'New game',
    newGameHint: 'Pick two players and start the turn tracker.',
    armies: 'Armies',
    armiesHint: 'Build and save army lists.',
    import: 'Import rules pack',
    importHint: 'Load a rules pack onto this device. Works offline afterwards.',
    theme: 'Theme',
    themeSystem: 'Match device',
    themeDark: 'Dark',
    themeLight: 'Light',
  },
  setup: {
    player1: 'Player 1',
    player2: 'Player 2',
    defaultName1: 'Marines',
    defaultName2: 'Orks',
    name: 'Name',
    color: 'Color',
    firstPlayer: 'Who goes first',
    firstPlayerHint: 'Your mission says how to decide. If in doubt, roll off and the winner chooses.',
    rounds: 'Battle rounds',
    startingCp: 'Starting CP',
    startingCpHint: 'Your mission says how many CP each player starts with. Both players gain 1 more in every Command phase.',
    replaceWarning: 'Starting a new game replaces the game in progress on this device.',
    start: 'Start game',
  },
  game: {
    noGame: 'There is no game in progress on this device.',
    round: (n: number, of: number) => `Round ${n} of ${of}`,
    turnOf: (name: string) => `${name}: your turn`,
    bothPlayers: 'Both players',
    over: 'Game over',
    overHelp: 'The last battle round is complete. Compare VP to find the winner.',
    whatToDo: 'What to do now',
    cp: 'CP',
    vp: 'VP',
    cpApplied: 'Already added to both counters.',
    readRule: (section: string) => `Read the rule (${section})`,
    leave: 'Leave for now',
    end: 'End game',
    endConfirm: 'End this game? The game log on this device will be deleted.',
  },
  counter: {
    decrease: 'Decrease',
    increase: 'Increase',
  },
  placeholder: {
    title: 'Not built yet',
    armies: 'The army editor arrives after rules packs can be imported.',
    import: 'Rules packs are built from the Wahapedia data export and imported here, one device at a time.',
  },
  actions: {
    undo: 'Undo',
    nextStep: 'Next step',
  },
  steps,
  phases,
  errors,
} as const;
