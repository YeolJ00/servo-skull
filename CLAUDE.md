# CLAUDE.md: 40k game host

## What this is

A static web app that hosts a game of Warhammer 40,000 (11th edition) for two players at the table. It tells new players which stage of the game they're in and what to do next. It also tracks CP, VP, and unit state, and resolves dice for attacks. It's opened on a phone or tablet and hosted on GitHub Pages.

Primary users: two new players (Space Marines/Ultramarines vs Orks, starting from a starter set). Write every piece of help text for someone in their first few games.

## Hard constraints

- Static only. GitHub Pages serves files: no server, no database, no runtime API. Everything runs in the browser. Build-time scripts that run on a dev machine are fine.
- No runtime requests to Wahapedia or any other third-party site.
- Mobile first. Must work one-handed on a ~390x844 phone, and on a tablet in portrait and landscape.
- Works offline after first load (installable PWA).
- No Games Workshop rules text in the repo or the deployed site (see "Rules data").

## Commands

```bash
npm install
npm run dev        # Vite dev server; add --host to open it on a phone over LAN
npm test           # Vitest: engine, dice, importer
npm run check      # tsc --noEmit + eslint
npm run build      # production build to dist/
npm run preview    # serve dist/ locally
npm run pack -- --factions space-marines,orks   # build a rules pack (needs network)
npm run icons      # rasterize public/icon.svg into public/icons/*.png with headless Chrome
node scripts/screenshot.mjs --url http://localhost:4173/servo-skull/#/game --out shot.png --size 390x844 --scheme dark [--seed game.json]
                   # headless Chrome screenshot at a phone/tablet size; --seed writes a saved game into IndexedDB first
```

Before finishing any task, `npm run check && npm test` must pass.

## Stack

- Vite + TypeScript (strict) + Preact (`@preact/preset-vite`). Keep dependencies few, and ask before adding one.
- Plain CSS with custom properties (`src/styles/tokens.css`) plus CSS modules. No CSS framework.
- Hash routing (`#/game`) so GitHub Pages never 404s on refresh.
- IndexedDB via `idb-keyval` for rules packs, saved armies, and game event logs. Use `localStorage` only for small settings.
- `vite-plugin-pwa` for the manifest and offline caching.
- Fonts self-hosted with `@fontsource/barlow`, `@fontsource/barlow-condensed`, and `@fontsource/cinzel`. No Google Fonts requests, so it works offline.
- Vitest for tests. Node 20+.

## Architecture

```
src/
  engine/   pure TS: turn flow, game state, events, reducer, flag expiry. No DOM, no Preact.
  dice/     pure TS: RNG, dice expressions (D3, D6+1), attack sequence.
  data/     rules pack types + loader, importer, army model, IndexedDB storage, presets.
  app/      screens: Home, Import, Armies, ArmyEditor, GameSetup, Game.
  ui/       shared components: Button, BottomSheet, Stepper, Counter, FaceCounter.
  i18n/     UI strings (en.ts). Never hardcode UI strings in components, so another language (e.g. Korean) can be added.
  styles/   tokens.css, base.css
scripts/
  build-pack.ts   Node: Wahapedia export -> packs/<name>.pack.json
```

- `engine/` and `dice/` are framework-free and fully unit-tested. The UI is a thin layer that renders state and dispatches events.
- Game state is event-sourced: `state = events.reduce(apply, init(setup))`. Every user action is an event.
  - Undo means dropping the last event and replaying.
  - Persist the event log after every event, so a refresh or a dead battery never loses the game.
- Voice and camera input will later produce the same events. Don't build them now, but never put game logic in UI handlers.

```ts
type GameEvent =
  | { t: 'step/next' }
  | { t: 'unit/select'; unitId: string }
  | { t: 'unit/move'; unitId: string; moveType: MoveType; advanceRoll?: number }
  | { t: 'attack/resolved'; attackerId: string; targetId: string; result: AttackResult }
  | { t: 'cp/adjust'; player: PlayerId; delta: number; reason: string }
  | { t: 'vp/adjust'; player: PlayerId; delta: number; reason: string };
```

## Rules data

The source is Wahapedia's 11th edition data export: CSV files linked by IDs.

- Page: https://wahapedia.ru/wh40k11ed/the-rules/data-export
- The spec workbook (`Export Data Specs.xlsx`) is linked from that page. Read it before writing the importer. Do not guess file names, delimiters, or columns.

How it flows:

- `scripts/build-pack.ts` downloads the spec and CSVs into `.cache/wahapedia/` (gitignored), filters by faction, and writes `packs/<name>.pack.json`.
  - The pack includes `schemaVersion`, the source, and Wahapedia's last-update stamp.
  - Cache downloads and never re-download in a loop. Wahapedia does not run an API.
- `packs/` and `.cache/` are gitignored. Datasheets, stratagems, and rules text are Games Workshop IP, and a GitHub Pages site is public.
  - The app has an Import screen: pick a `.pack.json` on the device, and it is stored in IndexedDB and works offline from then on.
  - The loader also accepts a same-origin URL. To publish packs later, un-ignore `packs/` and copy them to `public/`.
- Wahapedia asks for credit. Show "Powered by Wahapedia" with a link on the Home and Import screens.
- The importer is a pure module (`src/data/import/`) so it can later also run in the browser on raw CSVs.
- An army can include units from more than one faction (allies, e.g. Imperial Agents). Never assume one faction per army.
- If games use the Combat Patrol format, its rules are at https://wahapedia.ru/wh40k11ed_cp/the-rules/core-rules/. Check it before building mission setup.

## Game flow (11th edition core rules)

Section numbers come from https://wahapedia.ru/wh40k11ed/the-rules/core-rules/

`engine/flow.ts` encodes this as data: step ids, rule refs, and help keys. Each step links to its anchor on that page. Link to the rules; never copy their text.

- **Pre-battle** comes from the mission. It's a placeholder for now: pick armies, who goes first, and the number of battle rounds (default 5).
- **Battle round (07):** start of round → first player's turn → second player's turn → end of round (other rules first, then mission scoring).
- **Player turn (07.02):** start of turn → Command → Movement → Shooting → Charge → Fight → end of turn.
- **Command (08):**
  1. Start of phase.
  2. Gain core CP: BOTH players get +1.
  3. Battle-shock step: the active player tests each of their units that is battle-shocked or at or below half strength. The test is 2D6 ≥ Ld. A pass clears battle-shock; a fail sets it.
  4. Command abilities.
  5. End of phase (other rules first, then mission).
- **Movement (09):** start → move units one at a time → end.
  - EVERY unit must be selected before the phase can end, including units in reserves or embarked.
  - Move types:
    - Remain stationary.
    - Normal move: up to M.
    - Advance: M + D6. The unit can't charge or start actions this turn.
    - Fall back: only if engaged. The unit can't shoot, charge, or start actions. A battle-shocked unit must use desperate escape: one hazard roll per model.
    - Disembark.
    - Ingress (arrive from reserves).
- **Shooting (10):** start → repeat for each unit the player chooses → end.
  - Select a unit that didn't fall back and hasn't shot this phase.
  - Pick a shooting type:
    - Normal: unengaged, didn't advance.
    - Assault: advanced; [ASSAULT] weapons only.
    - Close-quarters: engaged.
    - Indirect.
  - Make attacks.
- **Charge (11):** start → repeat for each unit → end.
  1. Declare a charge: the unit is within 12" of an enemy, unengaged, and didn't advance or fall back.
  2. Roll 2D6 for the charge.
  3. AFTER the roll, pick targets within 12" and within the rolled distance.
  4. Move: the unit must end engaged with every target and no other enemy.
  5. The unit has Fights First until the end of the turn.
- **Fight (12):** every unit that can fight must fight.
  1. Start of phase.
  2. Pile in: active player first, then the opponent; up to 3".
  3. Fights First combats: players alternate, active player first.
  4. Remaining combats: players alternate; each unit makes a normal or overrun fight.
  5. Consolidate: active player first; up to 3"; ongoing, engaging, or objective mode.
  6. End of phase.
- **End of turn:**
  1. Other rules.
  2. Units out of coherency remove models until they are back in coherency (03.03).
  3. Mission scoring.
  4. Expire "until end of turn" effects.

Constants (verify against GW's free core rules PDF):

- Engagement range: 2" horizontal, 5" vertical (03.04).
- Coherency: within 2" of at least one other model AND within 9" of every other model (03.03).

### Unit flags and lifetimes

The reducer expires each flag at the right boundary:

- **Phase:** `selectedToMove`, `selectedToShoot`, `selectedToFight`, `declaredCharge`.
- **Turn:** `advanced`, `fellBack`, `remainedStationary`, `charged`, `fightsFirst`.
- **Global turn index:** `lastRangedAttackTurn`. A unit can only be Hidden if it made no ranged attacks this turn or the previous turn, whoever's turns those were (13.09).
- **Until a test passes:** `battleShocked`.
- **Persistent:** `startingStrength`, wounds remaining per model, `destroyed`.

The host does not measure anything yet. Ask the players about range, visibility, coherency, and engagement ("Is the target visible and in range?"). Automate only bookkeeping and arithmetic.

## Dice and the attack sequence (05)

- Every roll has two input modes:
  - Digital: crypto RNG.
  - Physical: the players roll real dice and enter the results. For a pool, entry is six tappable face counters (1 to 6) whose total must equal the number of dice. Order never matters.
- Tests use a seeded RNG.
- **Hit roll:**
  - Unmodified 1 fails; unmodified 6 is a critical hit.
  - Otherwise it hits if it meets BS/WS.
  - Benefit of cover worsens the attacker's BS by 1, for ranged attacks only (13.08).
- **Wound roll:**
  - Unmodified 1 fails; unmodified 6 is a critical wound.
  - Otherwise compare S to T: S ≥ 2T needs 2+, S > T 3+, S = T 4+, S < T 5+, S ≤ T/2 6+.
- **Saves** (made by the opposing player):
  1. Create groups: each CHARACTER is its own group; other models are grouped by matching W/Sv/InSv.
  2. Set the allocation order: a non-character group with a wounded model goes first, characters go last, and wounded characters come before unwounded ones.
  3. Roll ALL saves at once.
  4. Apply the results from lowest to highest:
     - An unmodified 1 inflicts damage.
     - A result ≥ InSv means the attack fails.
     - If (roll + AP) ≥ Sv, the attack fails.
     - Otherwise the selected model (a wounded one if possible) loses D wounds and is destroyed at 0.
     - When a group is gone, the next group becomes current. Excess damage is lost.
- **Mortal wounds** are applied after all normal damage (06.02): one wound at a time, to wounded non-characters first.
- **D3** is a D6 halved, rounded up.
- Wahapedia renders the threshold numbers above as images. Confirm them against the official core rules PDF, and port the worked examples in section 05 into tests.
- Before implementing roll modifiers or re-rolls, read rules appendix 01.05.02 to 01.05.04. Don't assume older-edition caps.
- Weapon abilities (section 24: [LETHAL HITS], [SUSTAINED HITS], [DEVASTATING WOUNDS], ...) are added one at a time, each with its own tests.

## Army selector

Flow: Armies list → Army editor → Game setup → Game.

- **Army editor:** pick faction, then detachment, then units.
  - Units come from a searchable list built from the pack. Tap to add.
  - Each unit has a model-count stepper within its datasheet limits.
  - Show the points total against the battle size if the pack includes points.
  - The MVP uses default wargear. Wargear options, leaders (19), and enhancements come later.
- Validation warns but never blocks. Casual games are fine.
- **Saved armies** live in IndexedDB. They export and import as JSON so the two players can share lists.
- **Starter presets** live in `src/data/presets/*.json`: datasheet names and counts only, with no rules text, so they're safe to commit. The owner fills in the actual box contents.
- Armies reference datasheets by Wahapedia id AND name. If an id is missing after a pack update, re-resolve by name and show a warning.
- **Game setup:** pick an army and color for each player, who goes first, and the number of rounds. "Start game" builds the initial engine state.
- **Game screen:** list the stratagems usable in the current phase by each player. Filter with timing data from the pack if it exists; otherwise use a hand-maintained overlay, `src/data/overlays/stratagem-timing.json`.

```ts
interface ArmyList {
  schemaVersion: 1;
  id: string;
  name: string;
  factionIds: string[];   // main faction first, allies after
  detachmentId?: string;
  battleSize?: string;
  units: { datasheetId: string; name: string; models: number; wargear?: string[] }[];
}
```

## UI guidelines (mobile first)

Design direction: a field dataslate, not a website. Immersive and dark: void-black depths, brass fittings, bone text, chamfered plates. The current step is the hero; everything else is secondary.

**Colors**

| Token | Hex | Use |
|---|---|---|
| Void | #1B2230 | Background (dark mode is the default) |
| Void deep | #12171F | Bottom of the background gradient, icon tile |
| Hull | #262F3F | Surfaces |
| Bone | #ECE6D6 | Text |
| Brass | #B8913A | Primary action, plate edges |
| Brass bright | #D8B35A | Titles, numerals, highlights |
| Blood | #B3362C | Destroyed, battle-shock, danger |

- Player colors are chosen in setup (defaults: blue #3F6FD8 and green #5E9E3A). The header is tinted with the active player's color and carries a thin bar of it along the top. Color carries information, so always pair it with the player's name.
- Light mode, for bright rooms: parchment #E7E1D2 background with Void text and darker brass. Same structure, same fittings.
- Background: a radial glow at the top fading into the void, plus a static diagonal hatch at ~3% (`body::before`). No animation.

**Surfaces and fittings**

- Panels are chamfered plates: the `.plate` global class (edge gradient + inner face via `::before`, corners cut by `clip-path`, `--cut` 10px). `.plate-dim` for secondary panels. Buttons and counter buttons use the same chamfer.
- Section kickers use the `.kicker` global class: small Cinzel caps between two hairlines.
- The servo-skull mark is `src/ui/SkullIcon.tsx` (inline SVG, `currentColor`), the same geometry as `public/icon.svg`. It is the Home hero and a faint watermark behind the Game screen. PNG icons are rasterized from the SVG by `npm run icons` (needs Chrome).

**Type**

- Cinzel for the app name, step titles, and player names: inscriptional, letter-spaced, brass bright.
- Barlow for text; Barlow Condensed for phase names, buttons, labels, and big numbers.
- Use tabular numerals for counters.
- Body text ≥ 16px. Inputs ≥ 16px, which prevents iOS from zooming.

**Phone layout**

```
+------------------------------+
| Round 2           Orks' turn |  tinted with the active player's color
| Shooting: select a unit      |
| CP  Marines 2   Orks 3       |
+------------------------------+
| What to do now (step card)   |
| Units / checklist            |
+------------------------------+
| Undo               Next step |  thumb zone, safe-area padded
+------------------------------+
```

**Layout and interaction**

- On a tablet in landscape (≥ 900px wide), use two panes: the turn tracker on the left, details and dice on the right.
- Touch targets ≥ 48px. The primary action sits bottom-right, within thumb reach. Nothing depends on hover.
- Details open in bottom sheets, not new pages, and only one sheet is open at a time.
- Use `100dvh` and `env(safe-area-inset-*)`. The viewport meta tag needs `viewport-fit=cover`.
- During a game, keep the screen awake with the Screen Wake Lock API where it's supported. Re-acquire the lock on `visibilitychange`.

**Avoid**

- All-caps labels and monospace data labels.
- Plates that hold nothing, and meta strings joined with middle dots.
- Animation that isn't a response to a tap. Respect `prefers-reduced-motion`.

**Copy**

- Plain verbs, sentence case.
- Buttons say exactly what happens ("Roll hits", "Next step").
- Help text is written for a first-time player and ends with a link to the rule section.

## Deploy

- This is its own repo, `servo-skull`. GitHub serves it at `https://yeolj00.github.io/servo-skull/`, next to the existing user site.
- In `vite.config.ts`, `base` is `/servo-skull/`. Build output (`dist/`) is never committed.
- `.github/workflows/deploy.yml` runs on push to main:
  1. `npm ci`
  2. `npm run check`
  3. `npm test`
  4. `npm run build`
  5. `actions/upload-pages-artifact` (dist)
  6. `actions/deploy-pages`
- In the repo settings, set Pages → Source to "GitHub Actions".

## Testing

Unit tests (Vitest) get most of the effort.

**Engine**

- A full turn walk-through.
- Both players gain CP in each Command phase.
- Movement can't end until every unit has been selected.
- A unit that advanced can't charge, but it can make assault shooting.
- A unit that fell back can't shoot or charge.
- Charge targets are chosen after the roll.
- Fights First alternation starts with the active player.
- Each flag expires at the right boundary.
- Undo replays to an identical state.

**Dice**

- Table-driven S vs T thresholds.
- Crits on unmodified 6s only.
- Cover.
- Save application order with mixed groups and characters.
- Excess damage is lost.
- Mortal wounds are applied after normal damage.
- The worked examples from core rules section 05.

**Importer**

- Small fixture CSVs produce the expected pack JSON.

**Coverage and manual checks**

- Coverage target: ≥ 90% of lines in `engine/` and `dice/`.
- Check UI changes manually at 390x844 portrait, 844x390 landscape, and 1024x768 tablet, in both dark and light mode.

## Working agreements

- Never invent rules. Every implemented rule cites its core rules section in a comment, e.g. `// 08.03 Battle-shock step`. If unsure, make it a question to the players instead of automating it.
- Never paste GW rules text into source. Keep help text short, in your own words, and link to the Wahapedia anchor.
- Keep `engine/` and `dice/` pure.
- Make small, focused changes. Update this file when a decision changes.

## Roadmap

- **M0 Scaffold:** Vite + TS + Preact, PWA manifest, tokens, app shell (header and bottom bar), deploy workflow.
- **M1 Turn tracker:** `flow.ts`, reducer, undo, persistence. Game screen with the step card and CP/VP counters.
- **M2 Dice:** attack sequence module, plus a dice sheet with digital and physical entry.
- **M3 Rules data and army selector:** build-pack script, Import screen, army editor, presets, game setup.
- **M4 Integration:**
  - Units in the game state.
  - An attack helper that takes datasheet weapons against a target unit.
  - Wound tracking.
  - Battle-shock prompts.
  - Phase-filtered stratagems.
- **Later (not now):** missions and scoring, voice, camera, projector.

## Decisions

- 2026-10: 11th edition core rules. The Wahapedia data export is the data source.
- 2026-10: Rules packs are not committed or deployed; each device imports them. The owner may switch to publishing them.
- 2026-10: The engine is event-sourced. Physical and digital dice are both first-class.
- 2026-10-07: The app is its own repo and Pages site, not a folder of the personal site. It was briefly a subfolder with committed build output; that was reverted so no build output is ever committed.
