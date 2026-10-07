import { stepDef } from '../../engine/flow.ts';
import { activePlayer, apply, currentStep, init } from '../../engine/reducer.ts';
import type { GameEvent, GameSetup, GameState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import styles from './game.module.css';

interface Props {
  open: boolean;
  setup: GameSetup;
  events: GameEvent[];
  onClose: () => void;
}

export interface LogEntry {
  round: number;
  step: string;
  text: string;
}

/** Human-readable entries derived from the event log, newest first. */
export function logEntries(setup: GameSetup, events: GameEvent[]): LogEntry[] {
  let state: GameState = init(setup);
  const out: LogEntry[] = [];
  const name = (id: string) => state.units[id]?.name ?? id;
  const player = (p: 'p1' | 'p2') => setup.players[p].name;
  for (const e of events) {
    const before = state;
    let next: GameState;
    try {
      next = apply(state, e);
    } catch {
      break;
    }
    const step = currentStep(before);
    const label = t.steps[step].title;
    const g = t.log;
    let text: string | null = null;
    switch (e.t) {
      case 'step/next': {
        const to = currentStep(next);
        const who = activePlayer(next);
        if (stepDef(to).phase !== stepDef(step).phase || to === 'turn/start' || to === 'round/start') {
          text = g.enter(t.steps[to].title, who ? player(who) : null, next.pos.round);
        }
        break;
      }
      case 'cp/adjust':
        text = g.cp(player(e.player), e.delta, next.cp[e.player]);
        break;
      case 'vp/adjust':
        text = g.vp(player(e.player), e.delta, next.vp[e.player]);
        break;
      case 'unit/models':
        text = g.models(name(e.unitId), e.models, before.units[e.unitId]?.models ?? 0);
        break;
      case 'unit/wounds':
        text = g.wounds(name(e.unitId), next.units[e.unitId]?.models ?? 0);
        break;
      case 'unit/battleShock':
        text = g.battleShock(name(e.unitId), e.roll, !(next.units[e.unitId]?.battleShocked ?? false));
        break;
      case 'unit/move':
        text = g.move(name(e.unitId), t.play.move.types[e.moveType].title, e.advanceRoll);
        break;
      case 'unit/shoot':
        text = g.shoot(name(e.unitId), t.play.shoot.types[e.shootingType].title);
        break;
      case 'charge/declare':
        text = g.chargeDeclare(name(e.unitId));
        break;
      case 'charge/roll':
        text = g.chargeRoll(name(e.unitId), e.roll);
        break;
      case 'charge/resolve':
        text = e.success ? g.chargeMade(name(e.unitId), e.targetIds.map(name).join(', ')) : g.chargeFailed(name(e.unitId));
        break;
      case 'unit/fight':
        text = g.fight(name(e.unitId), t.play.fight.types[e.fightType].title);
        break;
      case 'fight/pass':
        text = g.pass(player(e.player));
        break;
      case 'attack/resolved':
        text = g.attack(name(e.attackerId), e.result.weaponName, name(e.targetId), e.result.attacks, e.result.hits, e.result.wounds, e.result.failedSaves, (before.units[e.targetId]?.models ?? 0) - (next.units[e.targetId]?.models ?? 0));
        break;
      case 'stratagem/use':
        text = g.stratagem(player(e.player), e.name, e.cp);
        break;
    }
    if (text) out.push({ round: before.pos.round, step: label, text });
    state = next;
  }
  return out.reverse();
}

export function GameLog({ open, setup, events, onClose }: Props) {
  const entries = open ? logEntries(setup, events) : [];
  return (
    <BottomSheet open={open} title={t.log.title} onClose={onClose}>
      {entries.length === 0 && <p class={styles.muted}>{t.log.empty}</p>}
      <ul class={styles.logList}>
        {entries.map((e, i) => (
          <li class={styles.logRow} key={i}>
            <span class={`${styles.muted} num`}>
              {t.log.round(e.round)} · {e.step}
            </span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
