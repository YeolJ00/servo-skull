import { parseTarget, type Datasheet } from '../../data/pack.ts';
import type { Rules } from '../../data/rules.ts';
import { expandModels } from '../../data/unitStats.ts';
import type { GameEvent, UnitState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import { Counter } from '../../ui/Counter.tsx';
import styles from './game.module.css';
import { UnitChips } from './UnitChips.tsx';

interface Props {
  unit: UnitState | null;
  rules: Rules;
  dispatch: (e: GameEvent) => void;
  onClose: () => void;
}

// Unit details: datasheet stats, casualties, wounds per model, weapons. An attached unit (19) shows every part.
export function UnitSheet({ unit, rules, dispatch, onClose }: Props) {
  const parts = unit ? (unit.parts.length > 0 ? unit.parts : unit.datasheetId ? [{ datasheetId: unit.datasheetId, name: unit.name, models: unit.maxWounds.length }] : []) : [];
  const sheets = parts.map((p) => ({ part: p, sheet: rules.sheetById.get(p.datasheetId) })).filter((x): x is { part: (typeof parts)[number]; sheet: Datasheet } => !!x.sheet);
  const modelNames = sheets.flatMap((x) => expandModels(x.sheet, x.part.models).map((m) => m.name));
  const ld = sheets[0] ? parseTarget(sheets[0].sheet.models[0]?.ld ?? '') : undefined;
  return (
    <BottomSheet open={unit !== null} title={unit?.name ?? ''} onClose={onClose}>
      {unit && (
        <div class={styles.sheetBody}>
          <UnitChips unit={unit} />

          <section class={styles.block}>
            <p class="kicker">{t.play.casualties}</p>
            <Counter
              label={t.play.modelsLeft}
              value={unit.models}
              min={0}
              max={unit.startingStrength}
              onChange={(v) => dispatch({ t: 'unit/models', unitId: unit.id, models: v })}
            />
            <p class={styles.muted}>{t.play.casualtiesHelp(ld ?? unit.ld)}</p>
          </section>

          {unit.maxWounds.some((w) => w > 1) && (
            <section class={styles.block}>
              <p class="kicker">{t.play.woundsTitle}</p>
              <p class={styles.muted}>{t.play.woundsHelp}</p>
              <ul class={styles.options}>
                {unit.maxWounds.map((max, i) => {
                  const w = unit.wounds[i] ?? 0;
                  return (
                    <li class={styles.woundRow} key={i}>
                      <button
                        type="button"
                        class={styles.option}
                        onClick={() => {
                          const next = [...unit.wounds];
                          next[i] = w === 0 ? max : w - 1;
                          dispatch({ t: 'unit/wounds', unitId: unit.id, wounds: next });
                        }}
                      >
                        <span class={styles.optionTitle}>
                          {modelNames[i] || `${i + 1}`} <span class={`${styles.muted} num`}>{w}/{max}</span>
                        </span>
                        <span class={styles.woundPips} aria-hidden="true">
                          {Array.from({ length: max }, (_, p) => (
                            <span key={p} class={p < w ? styles.pipOn : styles.pipOff} />
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {sheets.map(({ part, sheet }) => (
            <div class={styles.block} key={part.datasheetId}>
              {sheets.length > 1 && <p class={styles.groupTitle}>{part.name}</p>}
              {sheet.models.length > 0 && (
                <section class={styles.block}>
                  <p class="kicker">{t.play.profile}</p>
                  <table class={`${styles.table} num`}>
                    <thead>
                      <tr>
                        <th>{t.play.stats.model}</th>
                        <th>M</th>
                        <th>T</th>
                        <th>Sv</th>
                        <th>W</th>
                        <th>Ld</th>
                        <th>OC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.models.map((m) => (
                        <tr key={m.name}>
                          <td>{m.name}</td>
                          <td>{m.m}</td>
                          <td>{m.t}</td>
                          <td>
                            {m.sv}
                            {m.invSv && m.invSv !== '-' ? ` / ${m.invSv}++` : ''}
                          </td>
                          <td>{m.w}</td>
                          <td>{m.ld}</td>
                          <td>{m.oc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {sheet.abilities.length > 0 && (
                <section class={styles.block}>
                  <p class="kicker">{t.play.abilities}</p>
                  <ul class={styles.summary}>
                    {sheet.abilities.map((a, i) => (
                      <li key={`${a.name}-${i}`}>
                        <span class={styles.rowName}>
                          {a.name}
                          {a.parameter ? ` ${a.parameter}` : ''}
                        </span>
                        {a.type && <span class={styles.muted}> · {a.type}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {sheet.weapons.length > 0 && (
                <section class={styles.block}>
                  <p class="kicker">{t.play.weapons}</p>
                  <table class={`${styles.table} num`}>
                    <thead>
                      <tr>
                        <th>{t.play.stats.weapon}</th>
                        <th>R</th>
                        <th>A</th>
                        <th>BS/WS</th>
                        <th>S</th>
                        <th>AP</th>
                        <th>D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.weapons.map((w, i) => (
                        <tr key={`${w.name}-${i}`}>
                          <td>
                            {w.name}
                            {w.description && <span class={styles.weaponNote}>{w.description}</span>}
                          </td>
                          <td>{w.range === 'Melee' ? '—' : w.range}</td>
                          <td>{w.a}</td>
                          <td>{w.bsWs}</td>
                          <td>{w.s}</td>
                          <td>{w.ap}</td>
                          <td>{w.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              <a href={sheet.link} target="_blank" rel="noopener">
                {t.editor.datasheet}
                {sheets.length > 1 ? `: ${part.name}` : ''}
              </a>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
