import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { ruleUrl, stepDef } from '../engine/flow.ts';
import { activePlayer, currentStep, unitsOf } from '../engine/reducer.ts';
import type { GameState, PlayerId, UnitState } from '../engine/types.ts';
import { t } from '../i18n/index.ts';
import { BottomSheet } from '../ui/BottomSheet.tsx';
import { Button } from '../ui/Button.tsx';
import { Counter } from '../ui/Counter.tsx';
import { IconHelp, IconLog, IconScore, IconStratagem, IconUnits } from '../ui/icons.tsx';
import styles from './Game.module.css';
import { GameLog } from './game/GameLog.tsx';
import gameStyles from './game/game.module.css';
import { PhasePanel } from './game/PhasePanel.tsx';
import { StratagemPanel } from './game/StratagemPanel.tsx';
import { UnitChips } from './game/UnitChips.tsx';
import { UnitSheet } from './game/UnitSheet.tsx';
import { navigate, routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useGame, type GameHandle } from './useGame.ts';
import { TWO_PANES, useMediaQuery } from './useMediaQuery.ts';
import { useRules } from './useRules.ts';
import { useWakeLock } from './useWakeLock.ts';

type Panel = 'score' | 'units' | 'stratagems' | 'log';
const PANELS: Panel[] = ['score', 'units', 'stratagems', 'log'];

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
          <div class={styles.bar}>
            <Button href={routeHref({ screen: 'home' })} variant="ghost">
              {t.nav.back}
            </Button>
            <Button href={routeHref({ screen: 'setup' })} variant="primary">
              {t.home.newGame}
            </Button>
          </div>
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
  const twoPanes = useMediaQuery(TWO_PANES);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sheet, setSheet] = useState<Panel | null>(null);
  const [tab, setTab] = useState<Panel>('units');
  const { setup } = state;
  const step = currentStep(state);
  const def = stepDef(step);
  const active = activePlayer(state);
  const activeName = active ? setup.players[active].name : null;
  const title = t.steps[step].title;
  const phaseName = def.phase ? t.phases[def.phase] : null;
  const openUnit = openUnitId ? (state.units[openUnitId] ?? null) : null;
  const hasUnits = state.unitOrder.length > 0;
  const hasStratagems = rules.stratagems.length > 0;

  const endGame = async () => {
    if (!window.confirm(t.game.endConfirm)) return;
    await game.end();
    navigate({ screen: 'home' });
  };

  const panelBody = (p: Panel): ComponentChildren => {
    switch (p) {
      case 'score':
        return (
          <div class={styles.scoreBody}>
            {(['p1', 'p2'] as const).map((pl) => (
              <div class={styles.playerBlock} key={pl}>
                <h2 class={styles.playerName}>
                  <span class={styles.dot} style={{ background: setup.players[pl].color }} />
                  {setup.players[pl].name}
                </h2>
                <Counter
                  label={t.game.cp}
                  value={state.cp[pl]}
                  onChange={(v) => dispatch({ t: 'cp/adjust', player: pl, delta: v - state.cp[pl], reason: 'manual' })}
                />
                <Counter
                  label={t.game.vp}
                  value={state.vp[pl]}
                  onChange={(v) => dispatch({ t: 'vp/adjust', player: pl, delta: v - state.vp[pl], reason: 'manual' })}
                />
              </div>
            ))}
            <div class={styles.leave}>
              <Button href={routeHref({ screen: 'home' })} variant="ghost">
                {t.game.leave}
              </Button>
              <Button variant="ghost" onClick={() => void endGame()}>
                {t.game.end}
              </Button>
            </div>
          </div>
        );
      case 'units':
        return hasUnits ? (
          <div class={gameStyles.roster}>
            {(['p1', 'p2'] as const).map((pl) => (
              <div key={pl} class={gameStyles.group}>
                <p class={gameStyles.groupTitle}>
                  <span class={gameStyles.dot} style={{ background: setup.players[pl].color }} />
                  {setup.players[pl].name}
                </p>
                <ul class={gameStyles.list}>
                  {unitsOf(state, pl).map((u) => (
                    <RosterRow unit={u} onOpen={() => setOpenUnitId(u.id)} key={u.id} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p class={gameStyles.muted}>{t.game.noUnits}</p>
        );
      case 'stratagems':
        return hasStratagems ? <StratagemPanel state={state} rules={rules} dispatch={dispatch} /> : <p class={gameStyles.muted}>{t.game.noStratagems}</p>;
      case 'log':
        return <GameLog.Body setup={setup} events={events} />;
    }
  };
  const panelTitle: Record<Panel, string> = { score: t.game.panels.score, units: t.game.panels.units, stratagems: t.game.panels.stratagems, log: t.game.panels.log };
  const panelIcon: Record<Panel, ComponentChildren> = { score: <IconScore />, units: <IconUnits />, stratagems: <IconStratagem />, log: <IconLog /> };

  return (
    <Shell
      tint={active ? setup.players[active].color : undefined}
      panes
      fixed
      header={
        <div class={styles.header}>
          <div class={styles.headRow}>
            <span class="num">{t.game.round(state.pos.round, setup.rounds)}</span>
            <span class={styles.turn}>
              {active && <span class={styles.dot} style={{ background: setup.players[active].color }} />}
              {state.finished ? t.game.over : activeName ? t.game.turnOf(activeName) : t.game.bothPlayers}
            </span>
          </div>
          <div class={styles.headRow}>
            <h1 class={styles.stepTitle}>{phaseName ?? title}</h1>
            <button type="button" class={styles.cpRow} onClick={() => (twoPanes ? setTab('score') : setSheet('score'))} aria-label={t.game.panels.score}>
              <span>{t.game.cp}</span>
              <PlayerStat state={state} player="p1" value={state.cp.p1} />
              <PlayerStat state={state} player="p2" value={state.cp.p2} />
            </button>
          </div>
        </div>
      }
      footer={
        <div class={styles.footerWrap}>
          {!twoPanes && (
            <div class={styles.toolbar}>
              {PANELS.map((p) => (
                <button type="button" class={styles.tool} key={p} onClick={() => setSheet(p)} aria-label={panelTitle[p]}>
                  {panelIcon[p]}
                  <span>{panelTitle[p]}</span>
                </button>
              ))}
            </div>
          )}
          <div class={styles.bar}>
            <Button variant="ghost" disabled={events.length === 0} onClick={undo}>
              {t.actions.undo}
            </Button>
            <Button variant="primary" disabled={state.finished} onClick={() => dispatch({ t: 'step/next' })}>
              {t.actions.nextStep}
            </Button>
          </div>
        </div>
      }
    >
      <div class={styles.left}>
        <section class={`plate ${styles.stepCard}`} aria-live="polite">
          <div class={styles.stepHead}>
            <div>
              <p class={styles.kickerSmall}>{state.finished ? t.game.over : t.game.whatToDo}</p>
              <h2 class={styles.stepHeading}>{state.finished ? t.game.overHelp : title}</h2>
            </div>
            {!state.finished && (
              <button type="button" class={styles.helpBtn} onClick={() => setHelpOpen(true)} aria-label={t.game.help}>
                <IconHelp />
              </button>
            )}
          </div>
          {!state.finished && <p class={styles.helpLine}>{t.steps[step].help}</p>}
          {error && <p class={styles.error}>{t.errors[error]}</p>}
        </section>

        <section class={`plate plate-dim ${styles.panelCard}`}>
          {!state.finished && hasUnits ? (
            <PhasePanel state={state} step={step} rules={rules} dispatch={dispatch} onOpenUnit={(u) => setOpenUnitId(u.id)} />
          ) : (
            <p class={gameStyles.muted}>{state.finished ? t.game.overHelp : t.game.noUnitsHint}</p>
          )}
        </section>
      </div>

      {twoPanes && (
        <div class={styles.right}>
          <div class={styles.tabs} role="tablist">
            {PANELS.map((p) => (
              <button type="button" role="tab" aria-selected={tab === p} class={tab === p ? styles.tabOn : styles.tab} key={p} onClick={() => setTab(p)}>
                {panelIcon[p]}
                <span>{panelTitle[p]}</span>
              </button>
            ))}
          </div>
          <section class={`plate plate-dim ${styles.tabBody}`}>{panelBody(tab)}</section>
        </div>
      )}

      {!twoPanes && (
        <BottomSheet open={sheet !== null} title={sheet ? panelTitle[sheet] : ''} onClose={() => setSheet(null)}>
          {sheet && panelBody(sheet)}
        </BottomSheet>
      )}

      <BottomSheet open={helpOpen} title={title} onClose={() => setHelpOpen(false)}>
        <div class={gameStyles.sheetBody}>
          <p class={styles.help}>{t.steps[step].help}</p>
          <a class={styles.ruleLink} href={ruleUrl(step)} target="_blank" rel="noopener">
            {t.game.readRule(def.section)}
          </a>
        </div>
      </BottomSheet>

      <UnitSheet unit={openUnit} rules={rules} dispatch={dispatch} onClose={() => setOpenUnitId(null)} />
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
      <strong class="num">{value}</strong>
    </span>
  );
}
