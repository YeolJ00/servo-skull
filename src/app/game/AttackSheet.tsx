import { useMemo, useState } from 'preact/hooks';
import type { Datasheet, Weapon } from '../../data/pack.ts';
import { parseTarget } from '../../data/pack.ts';
import type { Rules } from '../../data/rules.ts';
import { cpCost, isCore } from '../../data/stratagems.ts';
import { expandModels, isDamaged } from '../../data/unitStats.ts';
import { parseAbilities } from '../../dice/abilities.ts';
import {
  applyMortalWounds,
  attackCount,
  resolveHazard,
  resolveHits,
  resolveSaves,
  resolveWounds,
  type AttackOptions,
  type HitResult,
  type SaveResult,
  type TargetModel,
  type WeaponProfile,
  type WoundResult,
} from '../../dice/attack.ts';
import { isVariable, parseExpr, rollExpr } from '../../dice/expr.ts';
import { cryptoRng } from '../../dice/rng.ts';
import { rollD6, rollDice } from '../../dice/roll.ts';
import type { GameEvent, GameState, UnitState } from '../../engine/types.ts';
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
  state: GameState;
  dispatch: (e: GameEvent) => void;
  onClose: () => void;
}

/** The attack once weapon and target are chosen. */
interface Ctx {
  weapon: WeaponProfile;
  models: number;
  target: UnitState;
  targetModels: TargetModel[];
  toughness: number;
  opts: AttackOptions;
}

type Stage =
  | { k: 'weapon' }
  | { k: 'target'; weapon: WeaponProfile; models: number }
  | { k: 'options'; ctx: Ctx }
  | { k: 'hits'; ctx: Ctx; attacks: number }
  | { k: 'sustained'; ctx: Ctx; attacks: number; hitDice: number[]; crits: number }
  | { k: 'wounds'; ctx: Ctx; attacks: number; hit: HitResult }
  | { k: 'rerolls'; ctx: Ctx; attacks: number; hit: HitResult; woundDice: number[]; failed: number }
  | { k: 'saves'; ctx: Ctx; attacks: number; hit: HitResult; wound: WoundResult }
  | { k: 'damage'; ctx: Ctx; attacks: number; hit: HitResult; wound: WoundResult; saveDice: number[] }
  | { k: 'fnp'; ctx: Ctx; attacks: number; hit: HitResult; wound: WoundResult; saveDice: number[]; damageRolls: number[][]; count: number }
  | { k: 'result'; ctx: Ctx; attacks: number; hit: HitResult; wound: WoundResult; save: SaveResult }
  | { k: 'hazard'; ctx: Ctx; count: number }
  | { k: 'hazardDone'; mortalWounds: number; failed: number };

/** Turns a pack weapon into a profile the dice module understands. Undefined if it cannot be parsed. */
export function weaponProfile(w: Weapon, ranged: boolean): WeaponProfile | undefined {
  const attacks = parseExpr(w.a);
  const damage = parseExpr(w.d);
  const strength = Number(w.s);
  const ap = Number(w.ap);
  if (!attacks || !damage || !Number.isFinite(strength) || !Number.isFinite(ap)) return undefined;
  const skill = /n\/?a/i.test(w.bsWs) ? null : (parseTarget(w.bsWs) ?? null);
  return { name: w.name, attacks, skill, strength, ap, damage, ranged, abilities: parseAbilities(w.description) };
}

/** Per-model stats for a unit from its datasheet parts (an attached unit has two). */
export function unitModelStats(unit: UnitState, rules: Rules) {
  const parts = unit.parts.length > 0 ? unit.parts : unit.datasheetId ? [{ datasheetId: unit.datasheetId, name: unit.name, models: unit.maxWounds.length }] : [];
  const stats = parts.flatMap((p) => {
    const sheet = rules.sheetById.get(p.datasheetId);
    return sheet ? expandModels(sheet, p.models) : [];
  });
  const sheets = parts.map((p) => rules.sheetById.get(p.datasheetId)).filter((s): s is Datasheet => !!s);
  return { stats, sheets };
}

/** Attack targets: models with saves from the datasheets, Toughness per 19.02, keywords per 19.03. */
export function targetModels(unit: UnitState, rules: Rules): { models: TargetModel[]; toughness: number; keywords: string[]; fnp: number | null } {
  const { stats, sheets } = unitModelStats(unit, rules);
  const models: TargetModel[] = unit.maxWounds.map((max, i) => ({
    id: String(i),
    wounds: unit.wounds[i] ?? 0,
    maxWounds: max,
    sv: stats[i]?.sv ?? 7,
    invSv: stats[i]?.invSv ?? null,
    character: unit.character[i] ?? stats[i]?.character ?? false,
    fnp: stats[i]?.fnp ?? null,
  }));
  // 19.02: an attached unit uses the highest T among its bodyguard (non-character) models while it has any.
  const alive = stats.filter((_, i) => (unit.wounds[i] ?? 0) > 0);
  const bodyguards = alive.filter((_, i) => !(unit.character[i] ?? false));
  const pool = bodyguards.length > 0 ? bodyguards : alive.length > 0 ? alive : stats;
  const toughness = pool.reduce((m, s) => Math.max(m, s.t), 0) || 4;
  const keywords = [...new Set(sheets.flatMap((s) => [...s.keywords, ...s.factionKeywords]))];
  const fnp = stats.find((s) => s.fnp)?.fnp ?? null;
  return { models, toughness, keywords, fnp };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// The attack helper: weapon → target → options → hits → wounds → saves → damage → result → hazard.
// Each roll is digital or entered from real dice. The result is applied through one engine event.
export function AttackSheet({ attacker, mode, enemies, rules, state, dispatch, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ k: 'weapon' });
  const [models, setModels] = useState<number>(attacker?.models ?? 1);
  const rng = useMemo(() => cryptoRng(), []);
  const close = () => {
    setStage({ k: 'weapon' });
    onClose();
  };
  if (!attacker) return null;

  const { sheets: attackerSheets } = unitModelStats(attacker, rules);
  const attackerKeywords = attackerSheets.flatMap((s) => s.keywords.map((k) => k.toUpperCase()));
  const monsterOrVehicle = attackerKeywords.includes('MONSTER') || attackerKeywords.includes('VEHICLE');
  const singleSheet = attackerSheets.length === 1 ? attackerSheets[0] : undefined;
  const damaged = !!singleSheet && isDamaged(singleSheet, attacker.wounds);

  // 10.04 to 10.07: the shooting mode limits which weapons may fire.
  const allowedByMode = (w: WeaponProfile): boolean => {
    if (mode === 'melee') return true;
    const st = attacker.shootingType;
    if (st === 'assault') return w.abilities.assault;
    if (st === 'closeQuarters') return w.abilities.closeQuarters || monsterOrVehicle;
    if (st === 'indirect') return w.abilities.indirectFire;
    return true;
  };
  const weapons = attackerSheets.flatMap((s) =>
    s.weapons
      .filter((w) => (mode === 'ranged' ? w.type === 'Ranged' : w.type === 'Melee'))
      .map((w) => ({ raw: w, profile: weaponProfile(w, mode === 'ranged'), part: s.name })),
  );

  const title = `${t.play.attack.title}: ${attacker.name}`;
  const digitalDamage = (ctx: Ctx) => () => rollExpr(ctx.weapon.damage, rng);

  /** Final save resolution with whatever damage and FNP sources apply. */
  const finish = (s: { ctx: Ctx; attacks: number; hit: HitResult; wound: WoundResult }, saveDice: number[], damageRolls?: number[][], fnpDice?: number[]) => {
    const save = resolveSaves(saveDice, s.ctx.weapon, s.ctx.targetModels, damageRolls ?? digitalDamage(s.ctx), s.ctx.opts, s.wound.devastating, fnpDice ?? (() => rollD6(rng)));
    setStage({ k: 'result', ctx: s.ctx, attacks: s.attacks, hit: s.hit, wound: s.wound, save });
  };
  const afterHits = (ctx: Ctx, attacks: number, hit: HitResult) => setStage({ k: 'wounds', ctx, attacks, hit });
  const afterWounds = (s: { ctx: Ctx; attacks: number; hit: HitResult }, wound: WoundResult) => setStage({ k: 'saves', ctx: s.ctx, attacks: s.attacks, hit: s.hit, wound });

  const applyResult = (s: Stage & { k: 'result' }) => {
    dispatch({
      t: 'attack/resolved',
      attackerId: attacker.id,
      targetId: s.ctx.target.id,
      result: {
        weaponName: s.ctx.weapon.name,
        attacks: s.attacks,
        hits: s.hit.hits,
        wounds: s.wound.wounds + s.wound.devastating,
        failedSaves: s.save.failed,
        targetWounds: s.save.models.map((m) => m.wounds),
      },
    });
    // 24.15 [HAZARDOUS]: one hazard roll per hazardous weapon selected, after the attacks.
    if (s.ctx.weapon.abilities.hazardous) setStage({ k: 'hazard', ctx: s.ctx, count: s.ctx.models });
    else close();
  };

  const applyHazard = (ctx: Ctx, dice: number[]) => {
    const hz = resolveHazard(dice, monsterOrVehicle);
    if (hz.mortalWounds > 0) {
      const own = targetModels(attacker, rules);
      const r = applyMortalWounds(own.models, hz.mortalWounds, own.fnp, () => rollD6(rng));
      dispatch({ t: 'unit/wounds', unitId: attacker.id, wounds: r.models.map((m) => m.wounds) });
    }
    setStage({ k: 'hazardDone', mortalWounds: hz.mortalWounds, failed: hz.failed });
  };

  return (
    <BottomSheet open title={title} onClose={close}>
      {stage.k === 'weapon' && (
        <div class={styles.sheetBody}>
          <p>{t.play.attack.pickWeapon}</p>
          {mode === 'ranged' && attacker.shootingType && attacker.shootingType !== 'normal' && (
            <p class={styles.muted}>{t.play.attack.modeLimit[attacker.shootingType]}</p>
          )}
          <label class={styles.inlineField}>
            <span>{mode === 'ranged' ? t.play.attack.modelsAttacking : t.play.attack.modelsFighting}</span>
            <input
              class={styles.numInput}
              type="number"
              min={1}
              max={attacker.models}
              value={models}
              onInput={(e) => setModels(Math.max(1, Math.min(attacker.models, Number((e.currentTarget as HTMLInputElement).value) || 1)))}
            />
          </label>
          <ul class={styles.options}>
            {weapons.map(({ raw: w, profile, part }, i) => {
              const ok = !!profile && allowedByMode(profile);
              return (
                <li key={`${w.name}-${i}`}>
                  <button type="button" class={styles.option} disabled={!ok} onClick={() => profile && setStage({ k: 'target', weapon: profile, models })}>
                    <span class={styles.optionTitle}>
                      {w.name}
                      {attackerSheets.length > 1 && <span class={styles.muted}> · {part}</span>}
                    </span>
                    <span class={`${styles.muted} num`}>
                      {w.range !== 'Melee' ? `${w.range}" ` : ''}A{w.a} {mode === 'ranged' ? 'BS' : 'WS'}
                      {w.bsWs} S{w.s} AP{w.ap} D{w.d}
                    </span>
                    {w.description && <span class={styles.muted}>{w.description}</span>}
                    {!profile && <span class={styles.muted}>{t.play.attack.cannotParse}</span>}
                    {profile && !ok && <span class={styles.muted}>{t.play.attack.notInThisMode}</span>}
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
            {enemies.map((e) => {
              const tm = targetModels(e, rules);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    class={styles.option}
                    onClick={() => {
                      const ab = stage.weapon.abilities;
                      const opts: AttackOptions = {
                        cover: false,
                        halfRange: false,
                        heavyBraced: ab.heavy ? attacker.remainedStationary : false,
                        charged: attacker.charged,
                        damaged,
                        lethalAutoWound: true,
                        targetKeywords: tm.keywords,
                        targetModelsAtSelection: e.models,
                        singleTarget: true,
                        feelNoPain: tm.fnp,
                        precision: false,
                        twinLinkedReroll: true,
                        hitModifier: 0,
                        woundModifier: 0,
                      };
                      setStage({ k: 'options', ctx: { weapon: stage.weapon, models: stage.models, target: e, targetModels: tm.models, toughness: tm.toughness, opts } });
                    }}
                  >
                    <span class={styles.optionTitle}>{e.name}</span>
                    <span class={`${styles.muted} num`}>
                      {t.play.chips.models(e.models, e.startingStrength)} · T{tm.toughness}
                      {tm.fnp ? ` · ${t.play.attack.fnpShort(tm.fnp)}` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stage.k === 'options' && (
        <OptionsStage
          ctx={stage.ctx}
          attacker={attacker}
          onChange={(opts) => setStage({ k: 'options', ctx: { ...stage.ctx, opts } })}
          onStart={() => {
            const { attacks } = attackCount(stage.ctx.weapon, stage.ctx.models, stage.ctx.opts, rng);
            setStage({ k: 'hits', ctx: stage.ctx, attacks });
          }}
        />
      )}

      {stage.k === 'hits' && (
        <RollStage
          title={t.play.attack.hitTitle(stage.attacks, stage.ctx.weapon.skill === null || stage.ctx.weapon.abilities.torrent ? null : (stage.ctx.weapon.skill ?? 0) + (stage.ctx.opts.cover && !stage.ctx.weapon.abilities.ignoresCover ? 1 : 0), resolveHits([], stage.ctx.weapon, stage.ctx.opts).modifier)}
          count={stage.attacks}
          rng={rng}
          state={state}
          rules={rules}
          dispatch={dispatch}
          player={attacker.owner}
          onDigital={(dice) => afterHits(stage.ctx, stage.attacks, resolveHits(dice, stage.ctx.weapon, stage.ctx.opts, rng))}
          onPhysical={(dice) => {
            const ab = stage.ctx.weapon.abilities;
            const probe = resolveHits(dice, stage.ctx.weapon, stage.ctx.opts, []);
            if (ab.sustainedHits && ab.sustainedHits.sides !== 0 && probe.criticalHits > 0) {
              setStage({ k: 'sustained', ctx: stage.ctx, attacks: stage.attacks, hitDice: dice, crits: probe.criticalHits });
              return;
            }
            afterHits(stage.ctx, stage.attacks, probe);
          }}
        />
      )}

      {stage.k === 'sustained' && (
        <div class={styles.sheetBody}>
          <p class={styles.optionTitle}>{t.play.attack.sustainedTitle(stage.crits)}</p>
          <FaceCounter
            count={stage.crits}
            faces={stage.ctx.weapon.abilities.sustainedHits?.sides === 3 ? 3 : 6}
            confirmLabel={t.play.attack.continue}
            onConfirm={(dice) => afterHits(stage.ctx, stage.attacks, resolveHits(stage.hitDice, stage.ctx.weapon, stage.ctx.opts, dice))}
          />
        </div>
      )}

      {stage.k === 'wounds' && (
        <RollStage
          title={t.play.attack.woundTitle(stage.hit.hits - stage.hit.autoWounds, stage.ctx.toughness, stage.ctx.weapon.strength, resolveWounds([], stage.ctx.weapon, stage.ctx.toughness, stage.ctx.opts).needed, resolveWounds([], stage.ctx.weapon, stage.ctx.toughness, stage.ctx.opts).modifier)}
          count={stage.hit.hits - stage.hit.autoWounds}
          summary={t.play.attack.hitSummary(stage.hit.hits, stage.attacks, stage.hit.criticalHits, stage.hit.autoWounds, stage.hit.extraHits)}
          rng={rng}
          state={state}
          rules={rules}
          dispatch={dispatch}
          player={attacker.owner}
          onDigital={(dice) => afterWounds(stage, resolveWounds(dice, stage.ctx.weapon, stage.ctx.toughness, stage.ctx.opts, stage.hit.autoWounds, rng))}
          onPhysical={(dice) => {
            const ab = stage.ctx.weapon.abilities;
            const first = resolveWounds(dice, stage.ctx.weapon, stage.ctx.toughness, stage.ctx.opts, stage.hit.autoWounds, []);
            const failed = dice.length - (first.wounds + first.devastating - stage.hit.autoWounds);
            if (ab.twinLinked && (stage.ctx.opts.twinLinkedReroll ?? true) && failed > 0) {
              setStage({ k: 'rerolls', ctx: stage.ctx, attacks: stage.attacks, hit: stage.hit, woundDice: dice, failed });
              return;
            }
            afterWounds(stage, first);
          }}
        />
      )}

      {stage.k === 'rerolls' && (
        <div class={styles.sheetBody}>
          <p class={styles.optionTitle}>{t.play.attack.rerollTitle(stage.failed)}</p>
          <FaceCounter
            count={stage.failed}
            confirmLabel={t.play.attack.continue}
            onConfirm={(dice) => afterWounds(stage, resolveWounds(stage.woundDice, stage.ctx.weapon, stage.ctx.toughness, stage.ctx.opts, stage.hit.autoWounds, dice))}
          />
        </div>
      )}

      {stage.k === 'saves' && (
        <RollStage
          title={t.play.attack.saveTitle(stage.wound.wounds, stage.ctx.target.name)}
          count={stage.wound.wounds}
          summary={t.play.attack.woundSummary(stage.wound.wounds + stage.wound.devastating, stage.hit.hits, stage.wound.criticalWounds, stage.wound.devastating, stage.wound.rerolls.length)}
          rng={rng}
          state={state}
          rules={rules}
          dispatch={dispatch}
          player={stage.ctx.target.owner}
          onDigital={(dice) => finish(stage, dice)}
          onPhysical={(saveDice) => {
            const variable = isVariable(stage.ctx.weapon.damage);
            if (variable) {
              setStage({ k: 'damage', ctx: stage.ctx, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, saveDice });
              return;
            }
            const fnp = stage.ctx.targetModels.some((m) => m.fnp) || stage.ctx.opts.feelNoPain;
            if (fnp) {
              const probe = resolveSaves(saveDice, stage.ctx.weapon, stage.ctx.targetModels, digitalDamage(stage.ctx), { ...stage.ctx.opts, feelNoPain: null }, stage.wound.devastating);
              const count = probe.events.reduce((n, e) => n + (e.damage - e.lost), 0);
              setStage({ k: 'fnp', ctx: stage.ctx, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, saveDice, damageRolls: [], count });
              return;
            }
            finish(stage, saveDice);
          }}
        />
      )}

      {stage.k === 'damage' && (
        <DamageStage
          stage={stage}
          rng={rng}
          onDone={(damageRolls) => {
            const fnp = stage.ctx.targetModels.some((m) => m.fnp) || stage.ctx.opts.feelNoPain;
            if (fnp) {
              const noFnpModels = stage.ctx.targetModels.map((m) => ({ ...m, fnp: null }));
              const probe = resolveSaves(stage.saveDice, stage.ctx.weapon, noFnpModels, damageRolls, { ...stage.ctx.opts, feelNoPain: null }, stage.wound.devastating);
              const count = probe.events.reduce((n, e) => n + (e.damage - e.lost), 0);
              setStage({ k: 'fnp', ctx: stage.ctx, attacks: stage.attacks, hit: stage.hit, wound: stage.wound, saveDice: stage.saveDice, damageRolls, count });
              return;
            }
            finish(stage, stage.saveDice, damageRolls);
          }}
        />
      )}

      {stage.k === 'fnp' && (
        <div class={styles.sheetBody}>
          <p class={styles.optionTitle}>{t.play.attack.fnpTitle(stage.count, stage.ctx.target.name)}</p>
          <p class={styles.muted}>{t.play.attack.fnpHelp}</p>
          <div class={styles.twoButtons}>
            <Button variant="ghost" onClick={() => finish(stage, stage.saveDice, stage.damageRolls.length ? stage.damageRolls : undefined, rollDice(stage.count, rng))}>
              {t.play.attack.rollDice(stage.count)}
            </Button>
          </div>
          <FaceCounter count={stage.count} confirmLabel={t.play.attack.continue} onConfirm={(dice) => finish(stage, stage.saveDice, stage.damageRolls.length ? stage.damageRolls : undefined, dice)} />
        </div>
      )}

      {stage.k === 'result' && (
        <div class={styles.sheetBody}>
          <p class="kicker">{t.play.attack.resultTitle}</p>
          <ul class={styles.summary}>
            <li class="num">{t.play.attack.hitSummary(stage.hit.hits, stage.attacks, stage.hit.criticalHits, stage.hit.autoWounds, stage.hit.extraHits)}</li>
            <li class="num">{t.play.attack.woundSummary(stage.wound.wounds + stage.wound.devastating, stage.hit.hits, stage.wound.criticalWounds, stage.wound.devastating, stage.wound.rerolls.length)}</li>
            <li class="num">{t.play.attack.saveSummary(stage.save.failed, stage.save.saved)}</li>
            {stage.save.mortalWounds > 0 && <li class="num">{t.play.attack.mortalSummary(stage.save.mortalWounds)}</li>}
            {sum(stage.save.events.map((e) => e.ignored)) > 0 && <li class="num">{t.play.attack.fnpSummary(sum(stage.save.events.map((e) => e.ignored)))}</li>}
            <li class={`${styles.big} num`}>
              {t.play.attack.damageSummary(
                stage.save.models.filter((m, i) => m.wounds === 0 && (stage.ctx.target.wounds[i] ?? 0) > 0).length,
                stage.save.models.reduce((n, m, i) => n + ((stage.ctx.target.wounds[i] ?? 0) - m.wounds), 0),
              )}
            </li>
          </ul>
          <p class={styles.muted}>{t.play.attack.applyHelp}</p>
          <div class={styles.twoButtons}>
            <Button variant="ghost" onClick={close}>
              {t.play.attack.discard}
            </Button>
            <Button variant="primary" onClick={() => applyResult(stage)}>
              {t.play.attack.apply}
            </Button>
          </div>
        </div>
      )}

      {stage.k === 'hazard' && (
        <div class={styles.sheetBody}>
          <p class={styles.optionTitle}>{t.play.attack.hazardTitle(stage.count)}</p>
          <p class={styles.muted}>{t.play.attack.hazardHelp(monsterOrVehicle ? 3 : 1)}</p>
          <div class={styles.twoButtons}>
            <Button variant="primary" onClick={() => applyHazard(stage.ctx, rollDice(stage.count, rng))}>
              {t.play.attack.rollDice(stage.count)}
            </Button>
          </div>
          <FaceCounter count={stage.count} confirmLabel={t.play.attack.continue} onConfirm={(dice) => applyHazard(stage.ctx, dice)} />
        </div>
      )}

      {stage.k === 'hazardDone' && (
        <div class={styles.sheetBody}>
          <p class={`${styles.big} num`}>{t.play.attack.hazardResult(stage.failed, stage.mortalWounds)}</p>
          <Button variant="primary" block onClick={close}>
            {t.play.attack.done}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

// ---- Options: what the dice cannot know ----

function OptionsStage({ ctx, attacker, onChange, onStart }: { ctx: Ctx; attacker: UnitState; onChange: (o: AttackOptions) => void; onStart: () => void }) {
  const ab = ctx.weapon.abilities;
  const o = ctx.opts;
  const set = (patch: Partial<AttackOptions>) => onChange({ ...o, ...patch });
  const toggle = (key: keyof AttackOptions, label: string, help?: string) => (
    <label class={styles.check} key={key}>
      <input type="checkbox" checked={!!o[key]} onChange={(e) => set({ [key]: (e.currentTarget as HTMLInputElement).checked })} />
      <span>
        {label}
        {help && <span class={styles.muted}> · {help}</span>}
      </span>
    </label>
  );
  const hasCharacter = ctx.targetModels.some((m) => m.character && m.wounds > 0) && ctx.targetModels.some((m) => !m.character && m.wounds > 0);
  const a = t.play.attack;
  return (
    <div class={styles.sheetBody}>
      <p class={styles.muted}>
        {ctx.weapon.name} → {ctx.target.name}
      </p>
      <p>{a.optionsHelp}</p>
      <ul class={styles.options}>
        {ctx.weapon.ranged && !ab.ignoresCover && toggle('cover', a.cover, a.coverHelp)}
        {ctx.weapon.ranged && ab.ignoresCover && <li class={styles.muted}>{a.ignoresCover}</li>}
        {(ab.rapidFire || ab.melta) && toggle('halfRange', a.halfRange, [ab.rapidFire ? a.rapidFireHelp : '', ab.melta ? a.meltaHelp(ab.melta) : ''].filter(Boolean).join(' '))}
        {ab.heavy && toggle('heavyBraced', a.heavy, a.heavyHelp)}
        {ab.lance && toggle('charged', a.lance, a.lanceHelp)}
        {ab.lethalHits && toggle('lethalAutoWound', a.lethal, a.lethalHelp)}
        {ab.twinLinked && toggle('twinLinkedReroll', a.twinLinked, a.twinLinkedHelp)}
        {ab.precision && hasCharacter && toggle('precision', a.precision, a.precisionHelp)}
        {ab.cleave && !ctx.weapon.ranged && toggle('singleTarget', a.cleave, a.cleaveHelp)}
        {attacker.wounds.length === 1 && o.damaged && <li class={styles.muted}>{a.damagedNote}</li>}
        {ab.blast && <li class={styles.muted}>{a.blastNote(ab.blast, Math.floor((o.targetModelsAtSelection ?? 0) / 5) * ab.blast)}</li>}
        {ab.sustainedHits && <li class={styles.muted}>{a.sustainedNote}</li>}
        {ab.devastatingWounds && <li class={styles.muted}>{a.devastatingNote}</li>}
        {ab.anti.length > 0 && <li class={styles.muted}>{a.antiNote(ab.anti.map((x) => `${x.keyword} ${x.target}+`).join(', '))}</li>}
        {ab.hazardous && <li class={styles.muted}>{a.hazardousNote}</li>}
        {ab.extraAttacks && <li class={styles.muted}>{a.extraAttacksNote}</li>}
        {ab.oneShot && <li class={styles.muted}>{a.oneShotNote}</li>}
        {ab.psychic && <li class={styles.muted}>{a.psychicNote}</li>}
        {ab.notes.length > 0 && <li class={styles.muted}>{a.notes(ab.notes.join(', '))}</li>}
        {ctx.opts.feelNoPain && <li class={styles.muted}>{a.fnpNote(ctx.opts.feelNoPain)}</li>}
      </ul>
      <div class={styles.block}>
        <ModStepper label={a.hitModifier} value={o.hitModifier ?? 0} onChange={(v) => set({ hitModifier: v })} />
        <ModStepper label={a.woundModifier} value={o.woundModifier ?? 0} onChange={(v) => set({ woundModifier: v })} />
        <p class={styles.muted}>{a.modifierHelp}</p>
      </div>
      <Button variant="primary" block onClick={onStart}>
        {a.start}
      </Button>
    </div>
  );
}

function ModStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div class={styles.inlineField}>
      <span>{label}</span>
      <span class={styles.modControls}>
        <button type="button" class={styles.modBtn} onClick={() => onChange(Math.max(-3, value - 1))} aria-label={`${t.counter.decrease} ${label}`}>
          −
        </button>
        <span class={`${styles.modValue} num`}>{value > 0 ? `+${value}` : value}</span>
        <button type="button" class={styles.modBtn} onClick={() => onChange(Math.min(3, value + 1))} aria-label={`${t.counter.increase} ${label}`}>
          +
        </button>
      </span>
    </div>
  );
}

// ---- A roll stage: digital with an optional Command Re-roll, or real dice ----

function RollStage({
  title,
  count,
  summary,
  rng,
  state,
  rules,
  dispatch,
  player,
  onDigital,
  onPhysical,
}: {
  title: string;
  count: number;
  summary?: string;
  rng: () => number;
  state: GameState;
  rules: Rules;
  dispatch: (e: GameEvent) => void;
  player: 'p1' | 'p2';
  onDigital: (dice: number[]) => void;
  onPhysical: (dice: number[]) => void;
}) {
  const [physical, setPhysical] = useState(false);
  const [rolled, setRolled] = useState<number[] | null>(null);
  const [rerolled, setRerolled] = useState(false);
  const commandReroll = rules.stratagems.find((s) => isCore(s) && /command re-roll/i.test(s.name));
  const usedThisPhase = state.stratagemsUsed.some((u) => u.player === player && u.stratagemId === (commandReroll?.id ?? 'core-command-reroll') && u.round === state.pos.round && u.index === state.pos.index);
  const canReroll = !!rolled && !rerolled && !usedThisPhase && state.cp[player] >= (commandReroll ? cpCost(commandReroll) : 1);

  if (count === 0) {
    return (
      <div class={styles.sheetBody}>
        {summary && <p class={`${styles.muted} num`}>{summary}</p>}
        <p>{t.play.attack.nothingToRoll}</p>
        <Button variant="primary" block onClick={() => onDigital([])}>
          {t.play.attack.continue}
        </Button>
      </div>
    );
  }
  if (rolled) {
    return (
      <div class={styles.sheetBody}>
        {summary && <p class={`${styles.muted} num`}>{summary}</p>}
        <p class={styles.optionTitle}>{title}</p>
        <div class={styles.diceRow}>
          {rolled.map((d, i) => (
            <button
              key={i}
              type="button"
              class={`${styles.die} num`}
              disabled={!canReroll}
              onClick={() => {
                // 15.02 Command Re-roll: one die, once; the engine refuses a second use this phase.
                dispatch({ t: 'stratagem/use', player, stratagemId: commandReroll?.id ?? 'core-command-reroll', name: commandReroll?.name ?? 'Command Re-roll', cp: commandReroll ? cpCost(commandReroll) : 1 });
                setRolled(rolled.map((x, j) => (j === i ? rollD6(rng) : x)));
                setRerolled(true);
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <p class={styles.muted}>{canReroll ? t.play.attack.rerollHint(state.setup.players[player].name) : rerolled ? t.play.attack.rerolledNote : t.play.attack.noRerollNote}</p>
        <Button variant="primary" block onClick={() => onDigital(rolled)}>
          {t.play.attack.continue}
        </Button>
      </div>
    );
  }
  return (
    <div class={styles.sheetBody}>
      {summary && <p class={`${styles.muted} num`}>{summary}</p>}
      <p class={styles.optionTitle}>{title}</p>
      {!physical ? (
        <div class={styles.twoButtons}>
          <Button variant="ghost" onClick={() => setPhysical(true)}>
            {t.play.attack.enterDice}
          </Button>
          <Button variant="primary" onClick={() => setRolled(rollDice(count, rng))}>
            {t.play.attack.rollDice(count)}
          </Button>
        </div>
      ) : (
        <FaceCounter count={count} confirmLabel={t.play.attack.continue} onConfirm={onPhysical} />
      )}
    </div>
  );
}

function DamageStage({ stage, rng, onDone }: { stage: Stage & { k: 'damage' }; rng: () => number; onDone: (rolls: number[][]) => void }) {
  const [physical, setPhysical] = useState(false);
  // Failed saves are known before damage: probe with 1 damage, the most saves that can apply before
  // the unit runs out of models. Devastating wounds each need a damage roll too. Spare rolls go unused.
  const noFnp = stage.ctx.targetModels.map((m) => ({ ...m, fnp: null }));
  const probe = resolveSaves(stage.saveDice, stage.ctx.weapon, noFnp, () => ({ dice: [], total: 1 }), { ...stage.ctx.opts, feelNoPain: null }, stage.wound.devastating);
  const rolls = probe.events.length;
  const expr = stage.ctx.weapon.damage;
  const total = rolls * expr.count;
  if (rolls === 0) {
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
      <p class={styles.optionTitle}>{t.play.attack.damageTitle(rolls, `${expr.count}D${expr.sides}${expr.bonus ? `+${expr.bonus}` : ''}`)}</p>
      {!physical ? (
        <div class={styles.twoButtons}>
          <Button variant="ghost" onClick={() => setPhysical(true)}>
            {t.play.attack.enterDice}
          </Button>
          <Button variant="primary" onClick={() => onDone(Array.from({ length: rolls }, () => rollExpr(expr, rng).dice))}>
            {t.play.attack.rollDice(total)}
          </Button>
        </div>
      ) : (
        <FaceCounter
          count={total}
          faces={expr.sides === 3 ? 3 : 6}
          confirmLabel={t.play.attack.continue}
          onConfirm={(dice) => {
            const out: number[][] = [];
            for (let i = 0; i < rolls; i++) out.push(dice.slice(i * expr.count, (i + 1) * expr.count));
            onDone(out);
          }}
        />
      )}
    </div>
  );
}
