import { parseTarget, type Datasheet } from '../../data/pack.ts';
import { expandModels } from '../../data/unitStats.ts';
import type { GameEvent, UnitState } from '../../engine/types.ts';
import { t } from '../../i18n/index.ts';
import { BottomSheet } from '../../ui/BottomSheet.tsx';
import { Counter } from '../../ui/Counter.tsx';
import styles from './game.module.css';
import { UnitChips } from './UnitChips.tsx';

interface Props {
  unit: UnitState | null;
  sheet: Datasheet | undefined;
  dispatch: (e: GameEvent) => void;
  onClose: () => void;
}

// Unit details: datasheet stats, casualties, weapons. Opens from any unit row.
export function UnitSheet({ unit, sheet, dispatch, onClose }: Props) {
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
            <p class={styles.muted}>{t.play.casualtiesHelp(parseTarget(sheet?.models[0]?.ld ?? '') ?? unit.ld)}</p>
          </section>

          {unit.maxWounds.some((w) => w > 1) && (
            <section class={styles.block}>
              <p class="kicker">{t.play.woundsTitle}</p>
              <p class={styles.muted}>{t.play.woundsHelp}</p>
              <ul class={styles.options}>
                {unit.maxWounds.map((max, i) => {
                  const w = unit.wounds[i] ?? 0;
                  const name = sheet ? (expandModels(sheet, unit.maxWounds.length)[i]?.name ?? '') : '';
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
                          {name || `${i + 1}`} <span class={`${styles.muted} num`}>{w}/{max}</span>
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

          {sheet && sheet.models.length > 0 && (
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

          {sheet && sheet.weapons.length > 0 && (
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

          {sheet && (
            <a href={sheet.link} target="_blank" rel="noopener">
              {t.editor.datasheet}
            </a>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
