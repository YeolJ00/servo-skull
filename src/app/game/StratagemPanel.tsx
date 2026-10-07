import { useState } from 'preact/hooks';
import type { Stratagem } from '../../data/pack.ts';
import type { Rules } from '../../data/rules.ts';
import { cpCost, isCore, stripHtml, usableStratagems } from '../../data/stratagems.ts';
import { phaseOf } from '../../engine/flow.ts';
import { activePlayer, check, currentStep } from '../../engine/reducer.ts';
import type { GameEvent, GameState, PlayerId } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import { Button } from '../../ui/Button.tsx';
import styles from './game.module.css';

interface Props {
  state: GameState;
  rules: Rules;
  dispatch: (e: GameEvent) => void;
}

// Stratagems each player can use at the current step (15.01), from the pack's phase and turn data.
export function StratagemPanel({ state, rules, dispatch }: Props) {
  const [open, setOpen] = useState<{ player: PlayerId; stratagem: Stratagem } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const step = currentStep(state);
  const phase = phaseOf(step);
  const active = activePlayer(state);
  if (rules.stratagems.length === 0) return null;

  const lists = (['p1', 'p2'] as const).map((p) => {
    const ps = state.setup.players[p];
    const ctx = { phase, ownTurn: active === p, factionIds: ps.factionIds ?? [], detachmentId: ps.detachmentId };
    const all = usableStratagems(rules.stratagems, ctx);
    return { player: p, list: showAll ? all : all.filter((s) => !isCore(s) || /re-roll|insane bravery|epic challenge|explosives/i.test(s.name)), total: all.length };
  });

  const usedNow = (p: PlayerId, s: Stratagem) => check(state, { t: 'stratagem/use', player: p, stratagemId: s.id, name: s.name, cp: cpCost(s) });

  return (
    <section class={styles.panel}>
      {lists.map(({ player, list, total }) => (
        <div class={styles.group} key={player}>
          <p class={styles.groupTitle}>
            <span class={styles.dot} style={{ background: state.setup.players[player].color }} />
            {state.setup.players[player].name}
            <span class={`${styles.muted} num`}> · {t.play.strat.cp(state.cp[player])}</span>
          </p>
          {list.length === 0 && <p class={styles.muted}>{(state.setup.players[player].factionIds ?? []).length === 0 ? t.play.strat.noArmy : t.play.strat.none}</p>}
          <ul class={styles.list}>
            {list.map((s) => {
              const err = usedNow(player, s);
              return (
                <li class={styles.row} key={s.id}>
                  <button type="button" class={styles.rowMain} onClick={() => setOpen({ player, stratagem: s })}>
                    <span class={styles.rowName}>{s.name}</span>
                    <span class={`${styles.muted} num`}>
                      {t.play.strat.cost(cpCost(s))} · {s.type.split(' – ').pop()}
                      {s.turn ? ` · ${s.turn}` : ''}
                    </span>
                  </button>
                  <div class={styles.rowAction}>
                    {err === 'stratagemUsedThisPhase' ? (
                      <span class={styles.good}>{t.play.strat.used}</span>
                    ) : (
                      <Button variant="secondary" disabled={err !== null} onClick={() => setOpen({ player, stratagem: s })}>
                        {t.play.strat.use}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {total > list.length && (
            <button type="button" class={styles.linkButton} onClick={() => setShowAll(true)}>
              {t.play.strat.showAll(total - list.length)}
            </button>
          )}
        </div>
      ))}
      <BottomSheet open={open !== null} title={open?.stratagem.name ?? ''} onClose={() => setOpen(null)}>
        {open && (
          <div class={styles.sheetBody}>
            <p class={`${styles.muted} num`}>
              {t.play.strat.cost(cpCost(open.stratagem))} · {open.stratagem.type}
              {open.stratagem.phase ? ` · ${open.stratagem.phase}` : ''}
              {open.stratagem.turn ? ` · ${open.stratagem.turn}` : ''}
            </p>
            <p class={styles.prewrap}>{stripHtml(open.stratagem.description)}</p>
            {(() => {
              const err = usedNow(open.player, open.stratagem);
              return (
                <div class={styles.twoButtons}>
                  <Button variant="ghost" onClick={() => setOpen(null)}>
                    {t.nav.back}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={err !== null}
                    onClick={() => {
                      dispatch({ t: 'stratagem/use', player: open.player, stratagemId: open.stratagem.id, name: open.stratagem.name, cp: cpCost(open.stratagem) });
                      setOpen(null);
                    }}
                  >
                    {err === 'stratagemUsedThisPhase' ? t.play.strat.used : err === 'cpNegative' ? t.play.strat.notEnoughCp : t.play.strat.useFor(cpCost(open.stratagem))}
                  </Button>
                </div>
              );
            })()}
          </div>
        )}
      </BottomSheet>
    </section>
  );
}
