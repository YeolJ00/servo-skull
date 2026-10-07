import { useState } from 'preact/hooks';
import type { Rules } from '../../data/rules.ts';
import type { StepId } from '../../engine/flow.ts';
import { activePlayer, check, needsBattleShockTest, unitsOf } from '../../engine/reducer.ts';
import { otherPlayer, type FightType, type GameEvent, type GameState, type MoveType, type PlayerId, type ShootingType, type UnitState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import { Button } from '../../ui/Button.tsx';
import { DiceRoll } from '../../ui/DiceRoll.tsx';
import { AttackSheet } from './AttackSheet.tsx';
import styles from './game.module.css';
import { UnitChips } from './UnitChips.tsx';

interface Props {
  state: GameState;
  step: StepId;
  rules: Rules;
  dispatch: (e: GameEvent) => void;
  onOpenUnit: (unit: UnitState) => void;
}

// The "what to do now" checklist for the current step. Every button dispatches an engine event;
// eligibility comes from the engine (check), never from rules written here.
export function PhasePanel({ state, step, rules, dispatch, onOpenUnit }: Props) {
  const active = activePlayer(state);
  if (!active || state.unitOrder.length === 0) return null;
  const mine = unitsOf(state, active).filter((u) => !u.destroyed);
  const enemy = unitsOf(state, otherPlayer(active)).filter((u) => !u.destroyed);

  switch (step) {
    case 'command/battleShock':
      return <BattleShockPanel units={mine.filter(needsBattleShockTest)} dispatch={dispatch} onOpenUnit={onOpenUnit} />;
    case 'movement/move':
      return <MovePanel state={state} units={mine} dispatch={dispatch} onOpenUnit={onOpenUnit} />;
    case 'shooting/shoot':
      return <ShootPanel state={state} units={mine} enemy={enemy} rules={rules} dispatch={dispatch} onOpenUnit={onOpenUnit} />;
    case 'charge/charge':
      return <ChargePanel state={state} units={mine} enemy={enemy} dispatch={dispatch} onOpenUnit={onOpenUnit} />;
    case 'fight/fightsFirst':
    case 'fight/remaining':
      return <FightPanel state={state} step={step} rules={rules} dispatch={dispatch} onOpenUnit={onOpenUnit} />;
    default:
      return null;
  }
}

function Row({ unit, onOpen, children }: { unit: UnitState; onOpen: (u: UnitState) => void; children?: preact.ComponentChildren }) {
  return (
    <li class={styles.row}>
      <button type="button" class={styles.rowMain} onClick={() => onOpen(unit)}>
        <span class={styles.rowName}>{unit.name}</span>
        <UnitChips unit={unit} />
      </button>
      {children && <div class={styles.rowAction}>{children}</div>}
    </li>
  );
}

function Progress({ done, total, label }: { done: number; total: number; label: (d: number, n: number) => string }) {
  return (
    <p class={`${styles.progress} num`}>
      {label(done, total)}
      <span class={styles.bar}>
        <span style={{ width: `${total === 0 ? 100 : (done / total) * 100}%` }} />
      </span>
    </p>
  );
}

// ---- Command phase: battle-shock tests (08.03) ----

function BattleShockPanel({ units, dispatch, onOpenUnit }: { units: UnitState[]; dispatch: (e: GameEvent) => void; onOpenUnit: (u: UnitState) => void }) {
  const [testing, setTesting] = useState<UnitState | null>(null);
  const pending = units.filter((u) => !u.battleShockTested);
  if (units.length === 0) return <p class={styles.panelNote}>{t.play.battleShock.none}</p>;
  return (
    <section class={styles.panel}>
      <Progress done={units.length - pending.length} total={units.length} label={t.play.battleShock.progress} />
      <ul class={styles.list}>
        {units.map((u) => (
          <Row unit={u} onOpen={onOpenUnit} key={u.id}>
            {u.battleShockTested ? (
              <span class={u.battleShocked ? styles.bad : styles.good}>{u.battleShocked ? t.play.battleShock.failed : t.play.battleShock.passed}</span>
            ) : (
              <Button variant="secondary" onClick={() => setTesting(u)}>
                {t.play.battleShock.test}
              </Button>
            )}
          </Row>
        ))}
      </ul>
      <BottomSheet open={testing !== null} title={t.play.battleShock.sheetTitle(testing?.name ?? '')} onClose={() => setTesting(null)}>
        {testing && (
          <div class={styles.sheetBody}>
            <p>{t.play.battleShock.sheetHelp(testing.ld)}</p>
            <DiceRoll
              kind="2d6"
              onResult={(roll) => {
                dispatch({ t: 'unit/battleShock', unitId: testing.id, roll });
                setTesting(null);
              }}
            />
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

// ---- Movement phase (09.02) ----

const MOVE_TYPES: MoveType[] = ['normal', 'stationary', 'advance', 'fallBack', 'disembark', 'ingress'];

function MovePanel({ state, units, dispatch, onOpenUnit }: { state: GameState; units: UnitState[]; dispatch: (e: GameEvent) => void; onOpenUnit: (u: UnitState) => void }) {
  const [moving, setMoving] = useState<UnitState | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const done = units.filter((u) => u.selectedToMove).length;
  const close = () => {
    setMoving(null);
    setAdvancing(false);
  };
  const choose = (moveType: MoveType) => {
    if (!moving) return;
    if (moveType === 'advance') {
      setAdvancing(true);
      return;
    }
    dispatch({ t: 'unit/move', unitId: moving.id, moveType });
    close();
  };
  return (
    <section class={styles.panel}>
      <Progress done={done} total={units.length} label={t.play.move.progress} />
      <ul class={styles.list}>
        {units.map((u) => (
          <Row unit={u} onOpen={onOpenUnit} key={u.id}>
            {u.selectedToMove ? (
              <span class={styles.good}>{t.play.move.done}</span>
            ) : (
              <Button variant="secondary" onClick={() => setMoving(u)}>
                {t.play.move.move}
              </Button>
            )}
          </Row>
        ))}
      </ul>
      <BottomSheet open={moving !== null} title={moving?.name ?? ''} onClose={close}>
        {moving && !advancing && (
          <ul class={styles.options}>
            {MOVE_TYPES.map((mt) => {
              const err = check(state, { t: 'unit/move', unitId: moving.id, moveType: mt, advanceRoll: 1 });
              return (
                <li key={mt}>
                  <button type="button" class={styles.option} disabled={err !== null} onClick={() => choose(mt)}>
                    <span class={styles.optionTitle}>{t.play.move.types[mt].title}</span>
                    <span class={styles.muted}>{t.play.move.types[mt].help}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {moving && advancing && (
          <div class={styles.sheetBody}>
            <p>{t.play.move.advanceHelp}</p>
            <DiceRoll
              kind="d6"
              onResult={(advanceRoll) => {
                dispatch({ t: 'unit/move', unitId: moving.id, moveType: 'advance', advanceRoll });
                close();
              }}
            />
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

// ---- Shooting phase (10.02) ----

const SHOOT_TYPES: ShootingType[] = ['normal', 'assault', 'closeQuarters', 'indirect'];

function ShootPanel({ state, units, enemy, rules, dispatch, onOpenUnit }: { state: GameState; units: UnitState[]; enemy: UnitState[]; rules: Rules; dispatch: (e: GameEvent) => void; onOpenUnit: (u: UnitState) => void }) {
  const [shooting, setShooting] = useState<UnitState | null>(null);
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const attacking = attackingId ? (state.units[attackingId] ?? null) : null;
  const eligible = units.filter((u) => check(state, { t: 'unit/shoot', unitId: u.id, shootingType: u.advanced ? 'assault' : 'normal' }) === null);
  const sheet = shooting?.datasheetId ? rules.sheetById.get(shooting.datasheetId) : undefined;
  const ranged = sheet?.weapons.filter((w) => w.type === 'Ranged') ?? [];
  return (
    <section class={styles.panel}>
      <p class={styles.panelNote}>{eligible.length === 0 ? t.play.shoot.none : t.play.shoot.remaining(eligible.length)}</p>
      <ul class={styles.list}>
        {units.map((u) => {
          const can = eligible.includes(u);
          const why = u.fellBack ? t.play.chips.fellBack : null;
          return (
            <Row unit={u} onOpen={onOpenUnit} key={u.id}>
              {can ? (
                <Button variant="secondary" onClick={() => setShooting(u)}>
                  {t.play.shoot.shoot}
                </Button>
              ) : u.selectedToShoot ? (
                <Button variant="ghost" onClick={() => setAttackingId(u.id)}>
                  {t.play.attack.open}
                </Button>
              ) : (
                why && <span class={styles.muted}>{why}</span>
              )}
            </Row>
          );
        })}
      </ul>
      <AttackSheet attacker={attacking} mode="ranged" enemies={enemy} rules={rules} state={state} dispatch={dispatch} onClose={() => setAttackingId(null)} />
      <BottomSheet open={shooting !== null} title={shooting?.name ?? ''} onClose={() => setShooting(null)}>
        {shooting && (
          <div class={styles.sheetBody}>
            <p>{t.play.shoot.sheetHelp}</p>
            <ul class={styles.options}>
              {SHOOT_TYPES.map((st) => {
                const err = check(state, { t: 'unit/shoot', unitId: shooting.id, shootingType: st });
                return (
                  <li key={st}>
                    <button
                      type="button"
                      class={styles.option}
                      disabled={err !== null}
                      onClick={() => {
                        dispatch({ t: 'unit/shoot', unitId: shooting.id, shootingType: st });
                        setShooting(null);
                        setAttackingId(shooting.id);
                      }}
                    >
                      <span class={styles.optionTitle}>{t.play.shoot.types[st].title}</span>
                      <span class={styles.muted}>{t.play.shoot.types[st].help}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {ranged.length > 0 && (
              <section class={styles.block}>
                <p class="kicker">{t.play.weapons}</p>
                <table class={`${styles.table} num`}>
                  <thead>
                    <tr>
                      <th>{t.play.stats.weapon}</th>
                      <th>R</th>
                      <th>A</th>
                      <th>BS</th>
                      <th>S</th>
                      <th>AP</th>
                      <th>D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranged.map((w, i) => (
                      <tr key={`${w.name}-${i}`}>
                        <td>
                          {w.name}
                          {w.description && <span class={styles.weaponNote}>{w.description}</span>}
                        </td>
                        <td>{w.range}</td>
                        <td>{w.a}</td>
                        <td>{w.bsWs}</td>
                        <td>{w.s}</td>
                        <td>{w.ap}</td>
                        <td>{w.d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p class={styles.muted}>{t.play.shoot.helperNext}</p>
              </section>
            )}
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

// ---- Charge phase (11.02): declare, roll, then targets ----

function ChargePanel({ state, units, enemy, dispatch, onOpenUnit }: { state: GameState; units: UnitState[]; enemy: UnitState[]; dispatch: (e: GameEvent) => void; onOpenUnit: (u: UnitState) => void }) {
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const charging = chargingId ? (state.units[chargingId] ?? null) : null;
  const canDeclare = (u: UnitState) => check(state, { t: 'charge/declare', unitId: u.id }) === null;
  const close = () => {
    setChargingId(null);
    setTargets([]);
  };
  const stage = !charging ? null : !charging.declaredCharge ? 'declare' : charging.chargeRoll === null ? 'roll' : !charging.chargeResolved ? 'targets' : 'done';
  const inProgress = units.filter((u) => u.declaredCharge && !u.chargeResolved);
  return (
    <section class={styles.panel}>
      <p class={styles.panelNote}>{t.play.charge.note}</p>
      <ul class={styles.list}>
        {units.map((u) => {
          const status = u.chargeResolved ? (u.charged ? t.play.charge.succeeded : t.play.charge.failed) : u.declaredCharge ? t.play.charge.inProgress : null;
          return (
            <Row unit={u} onOpen={onOpenUnit} key={u.id}>
              {canDeclare(u) || inProgress.includes(u) ? (
                <Button variant="secondary" onClick={() => setChargingId(u.id)}>
                  {u.declaredCharge ? t.play.charge.continue : t.play.charge.charge}
                </Button>
              ) : (
                status && <span class={u.charged ? styles.good : styles.muted}>{status}</span>
              )}
            </Row>
          );
        })}
      </ul>
      <BottomSheet open={charging !== null} title={charging?.name ?? ''} onClose={close}>
        {charging && stage === 'declare' && (
          <div class={styles.sheetBody}>
            <p>{t.play.charge.declareHelp}</p>
            <Button variant="primary" block onClick={() => dispatch({ t: 'charge/declare', unitId: charging.id })}>
              {t.play.charge.declare}
            </Button>
          </div>
        )}
        {charging && stage === 'roll' && (
          <div class={styles.sheetBody}>
            <p>{t.play.charge.rollHelp}</p>
            <DiceRoll kind="2d6" onResult={(roll) => dispatch({ t: 'charge/roll', unitId: charging.id, roll })} />
          </div>
        )}
        {charging && stage === 'targets' && (
          <div class={styles.sheetBody}>
            <p class={`${styles.big} num`}>{t.play.charge.rolled(charging.chargeRoll ?? 0)}</p>
            <p>{t.play.charge.targetsHelp}</p>
            <ul class={styles.options}>
              {enemy.map((e) => (
                <li key={e.id}>
                  <label class={styles.check}>
                    <input
                      type="checkbox"
                      checked={targets.includes(e.id)}
                      onChange={(ev) => {
                        const on = (ev.currentTarget as HTMLInputElement).checked;
                        setTargets((ts) => (on ? [...ts, e.id] : ts.filter((x) => x !== e.id)));
                      }}
                    />
                    <span>{e.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div class={styles.twoButtons}>
              <Button
                variant="ghost"
                onClick={() => {
                  dispatch({ t: 'charge/resolve', unitId: charging.id, targetIds: [], success: false });
                  close();
                }}
              >
                {t.play.charge.markFailed}
              </Button>
              <Button
                variant="primary"
                disabled={targets.length === 0}
                onClick={() => {
                  dispatch({ t: 'charge/resolve', unitId: charging.id, targetIds: targets, success: true });
                  close();
                }}
              >
                {t.play.charge.markSucceeded}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </section>
  );
}

// ---- Fight phase (12.03): alternate picks, active player first ----

const FIGHT_TYPES: FightType[] = ['normal', 'overrun'];

function FightPanel({ state, step, rules, dispatch, onOpenUnit }: { state: GameState; step: StepId; rules: Rules; dispatch: (e: GameEvent) => void; onOpenUnit: (u: UnitState) => void }) {
  const [fighting, setFighting] = useState<UnitState | null>(null);
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const attacking = attackingId ? (state.units[attackingId] ?? null) : null;
  const enemiesOf = (u: UnitState) => unitsOf(state, otherPlayer(u.owner)).filter((e) => !e.destroyed);
  const picker: PlayerId = state.fight.nextPlayer;
  const pickerName = state.setup.players[picker].name;
  const canFight = (u: UnitState) => check(state, { t: 'unit/fight', unitId: u.id, fightType: 'normal' }) === null;
  const groups = (['p1', 'p2'] as const).map((p) => ({
    player: p,
    units: unitsOf(state, p).filter((u) => !u.destroyed && (step !== 'fight/fightsFirst' || u.fightsFirst || u.selectedToFight)),
  }));
  return (
    <section class={styles.panel}>
      <p class={styles.panelNote}>
        <span class={styles.dot} style={{ background: state.setup.players[picker].color }} />
        {t.play.fight.picks(pickerName)}
      </p>
      {groups.map((g) => (
        <div key={g.player} class={styles.group}>
          <p class={styles.groupTitle}>
            <span class={styles.dot} style={{ background: state.setup.players[g.player].color }} />
            {state.setup.players[g.player].name}
          </p>
          {g.units.length === 0 && <p class={styles.muted}>{t.play.fight.noUnits}</p>}
          <ul class={styles.list}>
            {g.units.map((u) => (
              <Row unit={u} onOpen={onOpenUnit} key={u.id}>
                {u.selectedToFight ? (
                  <Button variant="ghost" onClick={() => setAttackingId(u.id)}>
                    {t.play.attack.open}
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={!canFight(u)} onClick={() => setFighting(u)}>
                    {t.play.fight.fight}
                  </Button>
                )}
              </Row>
            ))}
          </ul>
        </div>
      ))}
      <Button variant="ghost" onClick={() => dispatch({ t: 'fight/pass', player: picker })}>
        {t.play.fight.pass(pickerName)}
      </Button>
      <AttackSheet
        attacker={attacking}
        mode="melee"
        enemies={attacking ? enemiesOf(attacking) : []}
        rules={rules}
        state={state}
        dispatch={dispatch}
        onClose={() => setAttackingId(null)}
      />
      <BottomSheet open={fighting !== null} title={fighting?.name ?? ''} onClose={() => setFighting(null)}>
        {fighting && (
          <div class={styles.sheetBody}>
            <p>{t.play.fight.sheetHelp}</p>
            <ul class={styles.options}>
              {FIGHT_TYPES.map((ft) => (
                <li key={ft}>
                  <button
                    type="button"
                    class={styles.option}
                    onClick={() => {
                      dispatch({ t: 'unit/fight', unitId: fighting.id, fightType: ft });
                      setFighting(null);
                      setAttackingId(fighting.id);
                    }}
                  >
                    <span class={styles.optionTitle}>{t.play.fight.types[ft].title}</span>
                    <span class={styles.muted}>{t.play.fight.types[ft].help}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </BottomSheet>
    </section>
  );
}
