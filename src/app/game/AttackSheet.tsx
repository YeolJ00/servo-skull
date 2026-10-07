import { useMemo, useState } from 'preact/hooks';
import type { Datasheet, Weapon } from '../../data/pack.ts';
import { parseTarget } from '../../data/pack.ts';
import type { Rules } from '../../data/rules.ts';
import { expandModels } from '../../data/unitStats.ts';
import {
  attackCount,
  resolveHits,
  resolveSaves,
  resolveWounds,
  type HitResult,
  type SaveResult,
  type TargetModel,
  type WeaponProfile,
  type WoundResult,
} from '../../dice/attack.ts';
import { isVariable, parseExpr, rollExpr } from '../../dice/expr.ts';
import { cryptoRng } from '../../dice/rng.ts';
import { rollDice } from '../../dice/roll.ts';
import type { GameEvent, UnitState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import { Button } from '../../ui/Button.tsx';
import { FaceCounter } from '../../ui/FaceCounter.tsx';
import styles from './game.module.css';

interface Props {
  attacker: UnitState | null;
  mode: 'ranged' | 'melee';
  enemies: UnitState[];
  rules: Rules;
  dispatch: (e: GameEvent) => void;
  onClose: () => void;
}

type Stage =
  | { k: 'weapon' }
  | { k: 'target'; weapon: WeaponProfile; models: number }
  | { k: 'hits'; weapon: WeaponProfile; models: number; target: UnitState; cover: boolean; attacks: number }
  | { k: 'wounds'; weapon: WeaponProfile; target: UnitState; cover: boolean; attacks: number; hit: HitResult }
  | { k: 'saves'; weapon: WeaponProfile; target: UnitState; attacks: number; hit: HitResult; wound: WoundResult }
  | { k: 'damage'; weapon: WeaponProfile; target: UnitState; attacks: number; hit: HitResult; wound: WoundResult; saveDice: number[] }
  | { k: 'result'; weapon: WeaponProfile; target: UnitState; attacks: number; hit: HitResult; wound: WoundResult; save: SaveResult };

/** Turns a pack weapon into a profile the dice module understands. Undefined if it cannot be parsed. */
export function weaponProfile(w: Weapon, ranged: boolean): WeaponProfile | undefined {
  const attacks = parseExpr(w.a);
  const damage = parseExpr(w.d);
  const strength = Number(w.s);
  const ap = Number(w.ap);
  if (!attacks || !damage || !Number.isFinite(strength) || !Number.isFinite(ap)) return undefined;
  const skill = /n\/?a/i.test(w.bsWs) ? null : (parseTarget(w.bsWs) ?? null);
  return { name: w.name, attacks, skill, strength, ap, damage, ranged };
}

function targetModels(unit: UnitState, sheet: Datasheet | undefined): { models: TargetModel[]; toughness: number } {
  const stats = sheet ? expandModels(sheet, unit.maxWounds.length) : [];
  const models = unit.maxWounds.map((max, i) => ({
    id: String(i),
    wounds: unit.wounds[i] ?? 0,
    maxWounds: max,
    sv: stats[i]?.sv ?? 7,
    invSv: stats[i]?.invSv ?? null,
    character: stats[i]?.character ?? false,
  }));
  return { models, toughness: stats[0]?.t ?? (Number(sheet?.models[0]?.t) || 4) };
}

// The attack helper: weapon → target → hits → wounds → saves → damage. Each roll is digital or
// entered from real dice. The result is applied through one engine event.
export function AttackSheet({ attacker, mode, enemies, rules, dispatch, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ k: 'weapon' });
  const [models, setModels] = useState<number>(attacker?.models ?? 1);
  const rng = useMemo(() => cryptoRng(), []);
  const sheet = attacker?.datasheetId ? rules.sheetById.get(attacker.datasheetId) : undefined;
  const weapons = (sheet?.weapons ?? []).filter((w) => (mode === 'ranged' ? w.type === 'Ranged' : w.type === 'Melee'));

  const close = () => {
    setStage({ k: 'weapon' });
    onClose();
  };
  if (!attacker) return null;

  const title = `${t.play.attack.title}: ${attacker.name}`;
  const targetSheet = (u: UnitState) => (u.datasheetId ? rules.sheetById.get(u.datasheetId) : undefined);

  return (
    <BottomSheet open title={title} onClose={close}>
      {stage.k === 'weapon' && (
        <div class={styles.sheetBody}>
          <p>{t.play.attack.pickWeapon}</p>
          <div class={styles.block}>
            <label class={styles.inlineField}>
              <span>{t.play.attack.modelsAttacking}</span>
              <input
                class={styles.numInput}
                type="number"
                min={1}
                max={attacker.models}
                value={models}
                onInput={(e) => setModels(Math.max(1, Math.min(attacker.models, Number((e.currentTarget as HTMLInputElement).value) || 1)))}
              />
            </label>
          </div>
          <ul class={styles.options}>
            {weapons.map((w, i) => {
              const profile = weaponProfile(w, mode === 'ranged');
              return (
                <li key={`${w.name}-${i}`}>
                  <button type="button" class={styles.option} disabled={!profile} onClick={() => profile && setStage({ k: 'target', weapon: profile, models })}>
                    <span class={styles.optionTitle}>{w.name}</span>
                    <span class={`${styles.muted} num`}>
                      {w.range !== 'Melee' ? `${w.range}" ` : ''}A{w.a} {mode === 'ranged' ? 'BS' : 'WS'}
                      {w.bsWs} S{w.s} AP{w.ap} D{w.d}
                      {w.description ? ` · ${w.description}` : ''}
                    </span>
                    {!profile && <span class={styles.muted}>{t.play.attack.cannotParse}</span>}
                  </button>
                </li>
              );
            })}
            {weapons.length === 0 && <li class={styles.muted}>{t.play.attack.noWeapons}</li>}
          </ul>
        </div>
      )}

      {stage.k === 'target' && (
        <div class={styles.sheetBody}>
          <p class={styles.muted}>{stage.weapon.name}</p>
          <p>{t.play.attack.pickTarget}</p>
          <ul class={styles.options}>
            {enemies.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  class={styles.option}
                  onClick={() => {
                    const { attacks } = attackCount(stage.weapon, stage.models, rng);
                    setStage({ k: 'hits', weapon: stage.weapon, models: stage.models, target: e, cover: false, attacks });
                  }}
                >
                  <span class={styles.optionTitle}>{e.name}</span>
                  <span class={`${styles.muted} num`}>
                    {t.play.chips.models(e.models, e.startingStrength)}
                    {targetSheet(e) ? ` · T${targetSheet(e)?.models[0]?.t} Sv${targetSheet(e)?.models[0]?.sv}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.k === 'hits' && (
        <RollStage
          title={t.play.attack.hitTitle(stage.attacks, stage.weapon.skill === null ? null : stage.weapon.skill + (stage.cover && stage.weapon.ranged ? 1 : 0))}
          count={stage.attacks}
          extra={
            stage.weapon.ranged ? (
              <label class={styles.check}>
                <input type="checkbox" checked={stage.cover} onChange={(e) => setStage({ ...stage, cover: (e.currentTarget as HTMLInputElement).checked })} />
                <span>{t.play.attack.cover}</span>
              </label>
            ) : null
          }
          onDice={(dice) => {
            const hit = resolveHits(dice, stage.weapon, { cover: stage.cover });
            setStage({ k: 'wounds', weapon: stage.weapon, target: stage.target, cover: stage.cover, attacks: stage.attacks, hit });
          }}
          rng={rng}
        />
      )}

      {stage.k === 'wounds' && (
        <RollStage
          title={t.play.attack.woundTitle(stage.hit.hits, targetModels(stage.target, targetSheet(stage.target)).toughness, stage.weapon.strength)}
          count={stage.hit.hits}
          summary={t.play.attack.hitSummary(stage.hit.hits, stage.attacks, stage.hit.criticalHits)}
          onDice={(dice) => {
            const { toughness } = targetModels(stage.target, targetSheet(stage.target));
            const wound = resolveWounds(dice, stage.weapon.strength, toughness);
            setStage({ k: 'saves', weapon: stage.weapon, target: stage.target, attacks: stage.attacks, hit: stage.hit, wound });
          }}
          rng={rng}
        />
      )}

      {stage.k === 'saves' && (
        <RollStage
          title={t.play.attack.saveTitle(stage.wound.wounds, stage.target.name)}
          count={stage.wound.wounds}
          summary={t.play.attack.woundSummary(stage.wound.wounds, stage.hit.hits, stage.wound.criticalWounds)}
          onDice={(saveDice) => {
            if (isVariable(stage.weapon.damage)) {
              setStage({ k: 'damage', weapon: stage.weapon, target: stage.target, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, saveDice });
              return;
            }
            const { models } = targetModels(stage.target, targetSheet(stage.target));
            const save = resolveSaves(saveDice, stage.weapon, models, () => ({ dice: [], total: stage.weapon.damage.bonus }));
            setStage({ k: 'result', weapon: stage.weapon, target: stage.target, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, save });
          }}
          rng={rng}
        />
      )}

      {stage.k === 'damage' && (
        <DamageStage
          stage={stage}
          models={targetModels(stage.target, targetSheet(stage.target)).models}
          rng={rng}
          onDone={(damageRolls) => {
            const { models } = targetModels(stage.target, targetSheet(stage.target));
            const save = resolveSaves(stage.saveDice, stage.weapon, models, damageRolls);
            setStage({ k: 'result', weapon: stage.weapon, target: stage.target, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, save });
          }}
        />
      )}

      {stage.k === 'result' && (
        <div class={styles.sheetBody}>
          <p class="kicker">{t.play.attack.resultTitle}</p>
          <ul class={styles.summary}>
            <li class="num">{t.play.attack.hitSummary(stage.hit.hits, stage.attacks, stage.hit.criticalHits)}</li>
            <li class="num">{t.play.attack.woundSummary(stage.wound.wounds, stage.hit.hits, stage.wound.criticalWounds)}</li>
            <li class="num">{t.play.attack.saveSummary(stage.save.failed, stage.save.saved)}</li>
            <li class={`${styles.big} num`}>
              {t.play.attack.damageSummary(
                stage.save.models.filter((m, i) => m.wounds === 0 && (stage.target.wounds[i] ?? 0) > 0).length,
                stage.save.models.reduce((n, m, i) => n + ((stage.target.wounds[i] ?? 0) - m.wounds), 0),
              )}
            </li>
          </ul>
          <p class={styles.muted}>{t.play.attack.applyHelp}</p>
          <div class={styles.twoButtons}>
            <Button variant="ghost" onClick={close}>
              {t.play.attack.discard}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                dispatch({
                  t: 'attack/resolved',
                  attackerId: attacker.id,
                  targetId: stage.target.id,
                  result: {
                    weaponName: stage.weapon.name,
                    attacks: stage.attacks,
                    hits: stage.hit.hits,
                    wounds: stage.wound.wounds,
                    failedSaves: stage.save.failed,
                    targetWounds: stage.save.models.map((m) => m.wounds),
                  },
                });
                close();
              }}
            >
              {t.play.attack.apply}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function RollStage({
  title,
  count,
  summary,
  extra,
  onDice,
  rng,
}: {
  title: string;
  count: number;
  summary?: string;
  extra?: preact.ComponentChildren;
  onDice: (dice: number[]) => void;
  rng: () => number;
}) {
  const [physical, setPhysical] = useState(false);
  if (count === 0) {
    return (
      <div class={styles.sheetBody}>
        {summary && <p class={`${styles.muted} num`}>{summary}</p>}
        <p>{t.play.attack.nothingToRoll}</p>
        <Button variant="primary" block onClick={() => onDice([])}>
          {t.play.attack.continue}
        </Button>
      </div>
    );
  }
  return (
    <div class={styles.sheetBody}>
      {summary && <p class={`${styles.muted} num`}>{summary}</p>}
      <p class={styles.optionTitle}>{title}</p>
      {extra}
      {!physical ? (
        <div class={styles.twoButtons}>
          <Button variant="ghost" onClick={() => setPhysical(true)}>
            {t.play.attack.enterDice}
          </Button>
          <Button variant="primary" onClick={() => onDice(rollDice(count, rng))}>
            {t.play.attack.rollDice(count)}
          </Button>
        </div>
      ) : (
        <FaceCounter count={count} confirmLabel={t.play.attack.continue} onConfirm={onDice} />
      )}
    </div>
  );
}

function DamageStage({
  stage,
  models,
  rng,
  onDone,
}: {
  stage: Stage & { k: 'damage' };
  models: TargetModel[];
  rng: () => number;
  onDone: (rolls: number[][]) => void;
}) {
  const [physical, setPhysical] = useState(false);
  // How many saves fail is known before damage is rolled: probe with 1 damage, which is the most
  // saves that can be applied before the unit runs out of models. Spare damage rolls go unused.
  const probe = resolveSaves(stage.saveDice, stage.weapon, models, () => ({ dice: [], total: 1 }));
  const failed = probe.failed;
  const expr = stage.weapon.damage;
  const diceEach = expr.count;
  const total = failed * diceEach;
  if (failed === 0) {
    return (
      <div class={styles.sheetBody}>
        <p>{t.play.attack.nothingToRoll}</p>
        <Button variant="primary" block onClick={() => onDone([])}>
          {t.play.attack.continue}
        </Button>
      </div>
    );
  }
  return (
    <div class={styles.sheetBody}>
      <p class={styles.optionTitle}>{t.play.attack.damageTitle(failed, `${expr.count}D${expr.sides}${expr.bonus ? `+${expr.bonus}` : ''}`)}</p>
      {!physical ? (
        <div class={styles.twoButtons}>
          <Button variant="ghost" onClick={() => setPhysical(true)}>
            {t.play.attack.enterDice}
          </Button>
          <Button variant="primary" onClick={() => onDone(Array.from({ length: failed }, () => rollExpr(expr, rng).dice))}>
            {t.play.attack.rollDice(total)}
          </Button>
        </div>
      ) : (
        <FaceCounter
          count={total}
          faces={expr.sides === 3 ? 3 : 6}
          confirmLabel={t.play.attack.continue}
          onConfirm={(dice) => {
            const rolls: number[][] = [];
            for (let i = 0; i < failed; i++) rolls.push(dice.slice(i * diceEach, (i + 1) * diceEach));
            onDone(rolls);
          }}
        />
      )}
    </div>
  );
}
