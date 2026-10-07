import { useState } from 'preact/hooks';
import { ruleUrl, stepDef } from '../engine/flow.ts';
import { activePlayer, currentStep, unitsOf } from '../engine/reducer.ts';
import type { GameState, PlayerId, UnitState } from '../engine/types.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.tsx';
import { Counter } from '../ui/Counter.tsx';
import { SkullIcon } from '../ui/SkullIcon.tsx';
import styles from './Game.module.css';
import gameStyles from './game/game.module.css';
import { PhasePanel } from './game/PhasePanel.tsx';
import { UnitChips } from './game/UnitChips.tsx';
import { UnitSheet } from './game/UnitSheet.tsx';
import { navigate, routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useGame, type GameHandle } from './useGame.ts';
import { useRules } from './useRules.ts';
import { useWakeLock } from './useWakeLock.ts';

export function Game() {
  const game = useGame();
  useWakeLock(game.status === 'ready');

  if (game.status === 'loading') {
    return <Shell header={<h1>{t.nav.game}</h1>}>{null}</Shell>;
  }
  if (game.status === 'none') {
    return (
      <Shell
        header={<h1>{t.nav.game}</h1>}
        footer={
          <>
            <Button href={routeHref({ screen: 'home' })} variant="ghost">
              {t.nav.back}
            </Button>
            <Button href={routeHref({ screen: 'setup' })} variant="primary">
              {t.home.newGame}
            </Button>
          </>
        }
      >
        <p>{t.game.noGame}</p>
      </Shell>
    );
  }
  return <Board game={game} />;
}

function Board({ game }: { game: GameHandle & { status: 'ready' } }) {
  const { state, events, error, dispatch, undo } = game;
  const { rules } = useRules();
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const { setup } = state;
  const step = currentStep(state);
  const def = stepDef(step);
  const active = activePlayer(state);
  const activeName = active ? setup.players[active].name : null;
  const title = t.steps[step].title;
  const phaseName = def.phase ? t.phases[def.phase] : null;
  const [helpOpen, setHelpOpen] = useState(false);
  const openUnit = openUnitId ? (state.units[openUnitId] ?? null) : null;
  // Steps with a unit checklist keep the help short so the checklist stays on screen.
  const hasPanel =
    state.unitOrder.length > 0 &&
    ['command/battleShock', 'movement/move', 'shooting/shoot', 'charge/charge', 'fight/fightsFirst', 'fight/remaining'].includes(step);
  const openSheet = openUnit?.datasheetId ? rules.sheetById.get(openUnit.datasheetId) : undefined;
  const hasUnits = state.unitOrder.length > 0;

  const endGame = async () => {
    if (!window.confirm(t.game.endConfirm)) return;
    await game.end();
    navigate({ screen: 'home' });
  };

  return (
    <Shell
      tint={active ? setup.players[active].color : undefined}
      panes
      header={
        <div class={styles.header}>
          <div class={styles.headRow}>
            <span class="num">{t.game.round(state.pos.round, setup.rounds)}</span>
            <span class={styles.turn}>
              {active && <span class={styles.dot} style={{ background: setup.players[active].color }} />}
              {state.finished ? t.game.over : activeName ? t.game.turnOf(activeName) : t.game.bothPlayers}
            </span>
          </div>
          <h1 class={styles.stepTitle}>{phaseName ? `${phaseName}: ${title}` : title}</h1>
          <div class={styles.cpRow}>
            <span>{t.game.cp}</span>
            <PlayerStat state={state} player="p1" value={state.cp.p1} />
            <PlayerStat state={state} player="p2" value={state.cp.p2} />
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" disabled={events.length === 0} onClick={undo}>
            {t.actions.undo}
          </Button>
          <Button variant="primary" disabled={state.finished} onClick={() => dispatch({ t: 'step/next' })}>
            {t.actions.nextStep}
          </Button>
        </>
      }
    >
      <SkullIcon size={340} class={styles.watermark} />

      <div class={`${styles.left} ${styles.content}`}>
        <section class={`plate ${styles.stepCard}`} aria-live="polite">
          <p class="kicker">{state.finished ? t.game.over : t.game.whatToDo}</p>
          <h2 class={styles.stepHeading}>{state.finished ? t.game.overHelp : title}</h2>
          {!state.finished && (
            <p class={hasPanel && !helpOpen ? styles.helpClamped : styles.help}>{t.steps[step].help}</p>
          )}
          {!state.finished && hasPanel && (
            <button type="button" class={styles.more} onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen}>
              {helpOpen ? t.game.less : t.game.more}
            </button>
          )}
          {step === 'command/cp' && !state.finished && <p class={styles.note}>{t.game.cpApplied}</p>}
          {error && <p class={styles.error}>{t.errors[error]}</p>}
          {!state.finished && (
            <a class={styles.ruleLink} href={ruleUrl(step)} target="_blank" rel="noopener">
              {t.game.readRule(def.section)}
            </a>
          )}
        </section>

        {!state.finished && hasUnits && (
          <section class={`plate plate-dim ${styles.panelCard}`}>
            <PhasePanel state={state} step={step} rules={rules} dispatch={dispatch} onOpenUnit={(u) => setOpenUnitId(u.id)} />
          </section>
        )}
      </div>

      <div class={`${styles.right} ${styles.content}`}>
        <section class={styles.counters}>
          {(['p1', 'p2'] as const).map((p) => (
            <div class={`plate plate-dim ${styles.playerBlock}`} key={p}>
              <h2 class={styles.playerName}>
                <span class={styles.dot} style={{ background: setup.players[p].color }} />
                {setup.players[p].name}
              </h2>
              <Counter
                label={t.game.cp}
                value={state.cp[p]}
                onChange={(v) => dispatch({ t: 'cp/adjust', player: p, delta: v - state.cp[p], reason: 'manual' })}
              />
              <Counter
                label={t.game.vp}
                value={state.vp[p]}
                onChange={(v) => dispatch({ t: 'vp/adjust', player: p, delta: v - state.vp[p], reason: 'manual' })}
              />
            </div>
          ))}
        </section>

        {hasUnits && (
          <section class={`plate plate-dim ${styles.panelCard}`}>
            <p class="kicker">{t.play.roster}</p>
            <div class={gameStyles.roster}>
              {(['p1', 'p2'] as const).map((p) => (
                <div key={p} class={gameStyles.group}>
                  <p class={gameStyles.groupTitle}>
                    <span class={gameStyles.dot} style={{ background: setup.players[p].color }} />
                    {setup.players[p].name}
                  </p>
                  <ul class={gameStyles.list}>
                    {unitsOf(state, p).map((u) => (
                      <RosterRow unit={u} onOpen={() => setOpenUnitId(u.id)} key={u.id} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <div class={styles.leave}>
          <Button href={routeHref({ screen: 'home' })} variant="ghost">
            {t.game.leave}
          </Button>
          <Button variant="ghost" onClick={() => void endGame()}>
            {t.game.end}
          </Button>
        </div>
      </div>

      <UnitSheet unit={openUnit} sheet={openSheet} dispatch={dispatch} onClose={() => setOpenUnitId(null)} />
    </Shell>
  );
}

function RosterRow({ unit, onOpen }: { unit: UnitState; onOpen: () => void }) {
  return (
    <li class={gameStyles.row}>
      <button type="button" class={gameStyles.rowMain} onClick={onOpen}>
        <span class={gameStyles.rowName}>{unit.name}</span>
        <UnitChips unit={unit} />
      </button>
      <span class={`${gameStyles.muted} num`}>{t.play.chips.models(unit.models, unit.startingStrength)}</span>
    </li>
  );
}

function PlayerStat({ state, player, value }: { state: GameState; player: PlayerId; value: number }) {
  const p = state.setup.players[player];
  return (
    <span class={styles.stat}>
      <span class={styles.dot} style={{ background: p.color }} />
      {p.name} <strong class="num">{value}</strong>
    </span>
  );
}
