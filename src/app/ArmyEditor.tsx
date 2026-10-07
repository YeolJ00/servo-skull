import { useEffect, useMemo, useState } from 'preact/hooks';
import { armyWarnings, leadableUnits, newUnitKey, resolveUnit, summarizeArmy, unitPoints, type ArmyList, type ArmyWarning } from '../data/army.ts';
import { getArmy, removeArmy, saveArmy } from '../data/armyStorage.ts';
import type { Datasheet } from '../data/pack.ts';
import { detachmentsFor, searchDatasheets } from '../data/rules.ts';
import { t } from '../i18n/index.ts';
import { BottomSheet } from '../ui/BottomSheet.tsx';
import { Button } from '../ui/Button.tsx';
import { Counter } from '../ui/Counter.tsx';
import { IconSettings, IconWarning } from '../ui/icons.tsx';
import styles from './ArmyEditor.module.css';
import { navigate, routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useRules } from './useRules.ts';

const POINT_LIMITS = [500, 1000, 2000];

type ArmyPatch = { [K in keyof ArmyList]?: ArmyList[K] | undefined };
type Sheet = 'add' | 'settings' | 'warnings' | null;

export function ArmyEditor({ armyId }: { armyId: string }) {
  const { rules } = useRules();
  const [army, setArmy] = useState<ArmyList | null | undefined>(undefined);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [allFactions, setAllFactions] = useState(false);

  useEffect(() => {
    void getArmy(armyId).then((a) => setArmy(a ?? null));
  }, [armyId]);

  // Every change is saved. There is no separate save button to forget.
  // A key set to undefined removes that optional field.
  const update = (patch: ArmyPatch) => {
    setArmy((a) => {
      if (!a) return a;
      const next: ArmyList = { ...a };
      for (const [key, value] of Object.entries(patch) as [keyof ArmyList, unknown][]) {
        if (value === undefined) delete next[key];
        else (next as unknown as Record<string, unknown>)[key] = value;
      }
      void saveArmy(next);
      return next;
    });
  };

  const mainFaction = army?.factionIds[0] ?? '';
  const detachments = useMemo(() => detachmentsFor(rules, mainFaction), [rules, mainFaction]);
  const results = useMemo(
    () => (army ? searchDatasheets(rules, query, allFactions ? undefined : army.factionIds).slice(0, 60) : []),
    [rules, query, allFactions, army],
  );

  if (army === undefined) return <Shell header={<h1>{t.nav.armies}</h1>}>{null}</Shell>;
  if (army === null) {
    return (
      <Shell
        header={<h1>{t.nav.armies}</h1>}
        footer={
          <Button href={routeHref({ screen: 'armies' })} variant="ghost">
            {t.nav.back}
          </Button>
        }
      >
        <p>{t.editor.notFound}</p>
      </Shell>
    );
  }

  const summary = summarizeArmy(army, rules);
  const warnings = armyWarnings(army, rules);
  const editing = editIndex !== null ? army.units[editIndex] : undefined;
  const editingSheet = editing ? resolveUnit(editing, rules).sheet : undefined;

  const addUnit = (sheetDef: Datasheet) => {
    update({ units: [...army.units, { key: newUnitKey(), datasheetId: sheetDef.id, name: sheetDef.name, models: Math.max(1, sheetDef.minModels) }] });
    setSheet(null);
    setQuery('');
  };
  const setModels = (index: number, models: number) => update({ units: army.units.map((u, i) => (i === index ? { ...u, models } : u)) });
  const removeUnit = (index: number) => {
    const gone = army.units[index];
    update({
      units: army.units
        .filter((_, i) => i !== index)
        .map((u) => {
          const { attachedTo, ...rest } = u;
          return attachedTo && attachedTo !== gone?.key ? { ...rest, attachedTo } : rest;
        }),
    });
    setEditIndex(null);
  };
  const setAttached = (index: number, key: string) =>
    update({
      units: army.units.map((u, i) => {
        if (i !== index) return u;
        const { attachedTo, ...rest } = u;
        void attachedTo;
        return key ? { ...rest, attachedTo: key } : rest;
      }),
    });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(army, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${army.name.replace(/[^\w-]+/g, '_') || 'army'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const deleteArmy = async () => {
    if (!window.confirm(t.editor.deleteConfirm(army.name))) return;
    await removeArmy(army.id);
    navigate({ screen: 'armies' });
  };

  const factionName = rules.factions.find((f) => f.id === mainFaction)?.name ?? '';
  const detachmentName = detachments.find((d) => d.id === army.detachmentId)?.name;

  return (
    <Shell
      fixed
      header={
        <div class={styles.header}>
          <div class={styles.headText}>
            <h1 class={styles.headTitle}>{army.name || t.armies.untitled}</h1>
            <p class={`${styles.headMeta} num`}>
              {[factionName, detachmentName].filter(Boolean).join(' · ')}
              {factionName ? ' · ' : ''}
              {t.editor.points(summary.points, army.pointsLimit)}
            </p>
          </div>
          {warnings.length > 0 && (
            <button type="button" class={`icon-button ${styles.warnBtn}`} onClick={() => setSheet('warnings')} aria-label={t.editor.warnings}>
              <IconWarning />
              <span class={`${styles.badge} num`}>{warnings.length}</span>
            </button>
          )}
          <button type="button" class="icon-button" onClick={() => setSheet('settings')} aria-label={t.editor.settings}>
            <IconSettings />
          </button>
        </div>
      }
      footer={
        <div class={styles.bar}>
          <Button href={routeHref({ screen: 'armies' })} variant="ghost">
            {t.editor.done}
          </Button>
          <Button variant="primary" onClick={() => setSheet('add')}>
            {t.editor.addUnit}
          </Button>
        </div>
      }
    >
      <div class={`scroll ${styles.page}`}>
        {army.units.length === 0 && <p class={styles.muted}>{t.editor.noUnits}</p>}
        <ul class={styles.units}>
          {army.units.map((u, i) => {
            const { sheet: def, renamed } = resolveUnit(u, rules);
            const pts = unitPoints(u, rules);
            const leader = u.attachedTo ? army.units.find((b) => b.key === u.attachedTo) : undefined;
            return (
              <li key={u.key}>
                <button type="button" class={`plate plate-dim ${styles.unit}`} onClick={() => setEditIndex(i)}>
                  <span class={styles.unitText}>
                    <span class={styles.unitName}>{u.name}</span>
                    <span class={styles.muted}>
                      {t.editor.modelsCount(u.models)}
                      {def ? ` · ${def.role}` : ` · ${t.editor.unknownSheet}`}
                      {renamed ? ` · ${t.editor.renamed}` : ''}
                      {leader ? ` · ${t.editor.leadsShort(leader.name)}` : ''}
                    </span>
                  </span>
                  <span class={`${styles.unitPoints} num`}>{pts === undefined ? '—' : t.editor.pts(pts)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <BottomSheet open={editing !== undefined} title={editing?.name ?? ''} onClose={() => setEditIndex(null)}>
        {editing && editIndex !== null && (
          <div class={styles.sheet}>
            <p class={styles.muted}>
              {editingSheet ? editingSheet.role : t.editor.unknownSheet}
              {unitPoints(editing, rules) !== undefined ? ` · ${t.editor.pts(unitPoints(editing, rules) ?? 0)}` : ''}
            </p>
            <Counter
              label={t.editor.models}
              value={editing.models}
              min={editingSheet && editingSheet.minModels > 0 ? editingSheet.minModels : 1}
              max={editingSheet && editingSheet.maxModels > 0 ? editingSheet.maxModels : 30}
              onChange={(v) => setModels(editIndex, v)}
            />
            {editingSheet && editingSheet.leads.length > 0 && (
              <label class={styles.field}>
                <span>{t.editor.leads}</span>
                <select class={styles.input} value={editing.attachedTo ?? ''} onChange={(e) => setAttached(editIndex, (e.currentTarget as HTMLSelectElement).value)}>
                  <option value="">{t.editor.leadsNone}</option>
                  {leadableUnits(army, editing, rules).map((b) => (
                    <option value={b.key} key={b.key}>
                      {b.name} ({b.models})
                    </option>
                  ))}
                  {editing.attachedTo && !leadableUnits(army, editing, rules).some((b) => b.key === editing.attachedTo) && (
                    <option value={editing.attachedTo}>{army.units.find((b) => b.key === editing.attachedTo)?.name ?? '?'}</option>
                  )}
                </select>
              </label>
            )}
            <div class={styles.unitActions}>
              {editingSheet && (
                <a href={editingSheet.link} target="_blank" rel="noopener">
                  {t.editor.datasheet}
                </a>
              )}
              <Button variant="ghost" onClick={() => removeUnit(editIndex)}>
                {t.editor.remove}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === 'settings'} title={t.editor.settings} onClose={() => setSheet(null)}>
        <div class={styles.sheet}>
          <label class={styles.field}>
            <span>{t.editor.name}</span>
            <input class={styles.input} type="text" value={army.name} maxLength={40} onInput={(e) => update({ name: (e.currentTarget as HTMLInputElement).value })} />
          </label>
          <label class={styles.field}>
            <span>{t.editor.faction}</span>
            <select
              class={styles.input}
              value={mainFaction}
              onChange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                const rest = army.factionIds.slice(1).filter((f) => f !== id);
                const next: ArmyPatch = { factionIds: [id, ...rest] };
                if (army.detachmentId && !detachmentsFor(rules, id).some((d) => d.id === army.detachmentId)) next.detachmentId = undefined;
                update(next);
              }}
            >
              {rules.factions.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label class={styles.field}>
            <span>{t.editor.detachment}</span>
            <select
              class={styles.input}
              value={army.detachmentId ?? ''}
              onChange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                update(id ? { detachmentId: id } : { detachmentId: undefined });
              }}
            >
              <option value="">{t.editor.noDetachment}</option>
              {detachments.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label class={styles.field}>
            <span>{t.editor.ally}</span>
            <select
              class={styles.input}
              value={army.factionIds[1] ?? ''}
              onChange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                update({ factionIds: id ? [mainFaction, id] : [mainFaction] });
              }}
            >
              <option value="">{t.editor.noAlly}</option>
              {rules.factions
                .filter((f) => f.id !== mainFaction)
                .map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <div class={styles.field}>
            <span>{t.editor.pointsLimit}</span>
            <div class={styles.limits}>
              {POINT_LIMITS.map((n) => (
                <button
                  key={n}
                  type="button"
                  class={army.pointsLimit === n ? styles.limitOn : styles.limit}
                  aria-pressed={army.pointsLimit === n}
                  onClick={() => update({ pointsLimit: army.pointsLimit === n ? undefined : n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div class={styles.manage}>
            <Button variant="ghost" onClick={exportJson}>
              {t.editor.export}
            </Button>
            <Button variant="ghost" onClick={() => void deleteArmy()}>
              {t.editor.delete}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'warnings'} title={t.editor.warnings} onClose={() => setSheet(null)}>
        <div class={styles.sheet}>
          {warnings.map((w, i) => (
            <p class={styles.warning} key={i}>
              {warningText(w)}
            </p>
          ))}
          <p class={styles.muted}>{t.editor.warningsHint}</p>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'add'} title={t.editor.addUnit} onClose={() => setSheet(null)}>
        <div class={styles.search}>
          <input
            class={styles.input}
            type="search"
            placeholder={t.editor.searchPlaceholder}
            value={query}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
          />
          <label class={styles.toggle}>
            <input type="checkbox" checked={allFactions} onChange={(e) => setAllFactions((e.currentTarget as HTMLInputElement).checked)} />
            <span>{t.editor.allFactions}</span>
          </label>
        </div>
        <ul class={styles.results}>
          {results.map((d) => (
            <li key={d.id}>
              <button type="button" class={styles.result} onClick={() => addUnit(d)}>
                <span class={styles.resultName}>{d.name}</span>
                <span class={styles.muted}>
                  {d.role}
                  {d.costs[0] ? ` · ${t.editor.fromPts(d.costs[0].cost)}` : ''}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li class={styles.muted}>{t.editor.noResults}</li>}
        </ul>
      </BottomSheet>
    </Shell>
  );
}

function warningText(w: ArmyWarning): string {
  switch (w.code) {
    case 'noUnits':
      return t.editor.warn.noUnits;
    case 'unknownUnit':
      return t.editor.warn.unknownUnit(w.unit.name);
    case 'renamedUnit':
      return t.editor.warn.renamedUnit(w.unit.name);
    case 'modelsOutOfRange':
      return t.editor.warn.modelsOutOfRange(w.unit.name, w.min, w.max);
    case 'overPoints':
      return t.editor.warn.overPoints(w.points, w.limit);
  }
}
