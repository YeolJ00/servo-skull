import { useEffect, useState } from 'preact/hooks';
import { resolveUnit, type ArmyList } from '../data/army.ts';
import { listArmies } from '../data/armyStorage.ts';
import { loadGame, saveGame } from '../data/gameStorage.ts';
import { parseTarget } from '../data/pack.ts';
import type { Rules } from '../data/rules.ts';
import { expandModels } from '../data/unitStats.ts';
import type { GameSetup as Setup, PlayerId, PlayerSetup, UnitSetup } from '../engine/types.ts';
import { t } from '../i18n/index.ts';
import { BottomSheet } from '../ui/BottomSheet.tsx';
import { Button } from '../ui/Button.tsx';
import { Counter } from '../ui/Counter.tsx';
import styles from './GameSetup.module.css';
import { navigate, routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useRules } from './useRules.ts';

// Player colors. Blood red is reserved for danger, brass for the primary action.
const COLORS = ['#3F6FD8', '#5E9E3A', '#D97B2B', '#8E5CD9', '#2E9E9E', '#C84B8A'];

const DEFAULTS: Record<PlayerId, PlayerSetup> = {
  p1: { id: 'p1', name: t.setup.defaultName1, color: COLORS[0]! },
  p2: { id: 'p2', name: t.setup.defaultName2, color: COLORS[1]! },
};

// Leadership when a unit has no datasheet: the host cannot know it, so the players are told to check.
const UNKNOWN_LD = 7;

/**
 * Builds the engine's unit list from an army. Units without a datasheet are kept with a warning.
 * A leader attached to a bodyguard unit (19.01) becomes one unit: bodyguard models first, then
 * the leader's, so casualties by count and allocation reach the leader last.
 */
export function unitsFromArmy(army: ArmyList, owner: PlayerId, rules: Rules): { units: UnitSetup[]; unknown: string[] } {
  const units: UnitSetup[] = [];
  const unknown: string[] = [];
  const seen = new Map<string, number>();
  const leaderOf = new Map<string, typeof army.units>();
  for (const u of army.units) {
    if (u.attachedTo && army.units.some((b) => b.key === u.attachedTo)) {
      const list = leaderOf.get(u.attachedTo) ?? [];
      list.push(u);
      leaderOf.set(u.attachedTo, list);
    }
  }
  const attachedLeaders = new Set([...leaderOf.values()].flat().map((u) => u.key));

  army.units.forEach((u, i) => {
    if (attachedLeaders.has(u.key)) return; // folded into its bodyguard unit below
    const members = [u, ...(leaderOf.get(u.key) ?? [])];
    const resolved = members.map((m) => ({ unit: m, sheet: resolveUnit(m, rules).sheet }));
    const baseName = members.map((m) => m.name).join(' + ');
    const n = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, n);
    const name = n > 1 ? `${baseName} ${n}` : baseName;
    const first = resolved[0];
    const ld = first?.sheet ? parseTarget(first.sheet.models[0]?.ld ?? '') : undefined;
    for (const r of resolved) if (!r.sheet) unknown.push(r.unit.name);
    if (ld === undefined && first?.sheet) unknown.push(first.unit.name);
    const stats = resolved.flatMap((r) => (r.sheet ? expandModels(r.sheet, r.unit.models) : Array.from({ length: r.unit.models }, () => null)));
    units.push({
      id: `${owner}-${i}`,
      name,
      owner,
      models: members.reduce((s, m) => s + m.models, 0),
      // 19: the attached unit's Leadership is taken from the bodyguard unit. Check the datasheets if they differ.
      ld: ld ?? UNKNOWN_LD,
      datasheetId: first?.sheet?.id,
      modelWounds: stats.map((s) => s?.w ?? 1),
      modelCharacter: stats.map((s) => s?.character ?? false),
      parts: resolved.filter((r) => r.sheet).map((r) => ({ datasheetId: r.sheet!.id, name: r.unit.name, models: r.unit.models })),
    });
  });
  return { units, unknown };
}

export function GameSetup() {
  const { rules } = useRules();
  const [players, setPlayers] = useState<Record<PlayerId, PlayerSetup>>(DEFAULTS);
  const [armyIds, setArmyIds] = useState<Record<PlayerId, string>>({ p1: '', p2: '' });
  const [armies, setArmies] = useState<ArmyList[]>([]);
  const [firstPlayer, setFirstPlayer] = useState<PlayerId>('p1');
  const [rounds, setRounds] = useState(5);
  const [startingCp, setStartingCp] = useState(0);
  const [hasGame, setHasGame] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlayerId | null>(null);

  useEffect(() => {
    void loadGame().then((g) => setHasGame(!!g));
    void listArmies().then(setArmies);
  }, []);

  const update = (id: PlayerId, patch: Partial<PlayerSetup>) =>
    setPlayers((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const pickArmy = (id: PlayerId, armyId: string) => {
    setArmyIds((a) => ({ ...a, [id]: armyId }));
    const army = armies.find((a) => a.id === armyId);
    if (army) update(id, { name: army.name });
  };

  const start = async () => {
    const units: UnitSetup[] = [];
    const unknown: string[] = [];
    const armyOf: Partial<Record<PlayerId, ArmyList>> = {};
    for (const id of ['p1', 'p2'] as const) {
      const army = armies.find((a) => a.id === armyIds[id]);
      if (!army) continue;
      armyOf[id] = army;
      const built = unitsFromArmy(army, id, rules);
      units.push(...built.units);
      unknown.push(...built.unknown);
    }
    const playerSetup = (id: PlayerId): PlayerSetup => ({
      ...players[id],
      name: players[id].name.trim() || DEFAULTS[id].name,
      factionIds: armyOf[id]?.factionIds ?? [],
      detachmentId: armyOf[id]?.detachmentId,
    });
    const setup: Setup = {
      players: { p1: playerSetup('p1'), p2: playerSetup('p2') },
      firstPlayer,
      rounds,
      startingCp,
      units,
    };
    if (unknown.length > 0 && !warning) {
      setWarning(t.setup.unknownUnits(unknown.join(', ')));
      return;
    }
    await saveGame(setup, []);
    navigate({ screen: 'game' });
  };

  const armyName = (id: PlayerId) => armies.find((a) => a.id === armyIds[id])?.name ?? t.setup.noArmy;
  const label = (id: PlayerId) => (id === 'p1' ? t.setup.player1 : t.setup.player2);

  return (
    <Shell
      fixed
      header={<h1>{t.nav.setup}</h1>}
      footer={
        <div class={styles.bar}>
          <Button href={routeHref({ screen: 'home' })} variant="ghost">
            {t.nav.back}
          </Button>
          <Button variant="primary" onClick={() => void start()}>
            {warning ? t.setup.startAnyway : t.setup.start}
          </Button>
        </div>
      }
    >
      <div class={`scroll ${styles.form}`}>
        {hasGame && <p class={styles.warning}>{t.setup.replaceWarning}</p>}
        {warning && <p class={styles.warning}>{warning}</p>}

        {(['p1', 'p2'] as const).map((id) => (
          <button type="button" class={`plate plate-dim ${styles.playerRow}`} key={id} onClick={() => setEditing(id)}>
            <span class={styles.swatchBig} style={{ background: players[id].color }} />
            <span class={styles.playerText}>
              <span class={styles.playerLabel}>{label(id)}</span>
              <span class={styles.playerName}>{players[id].name || label(id)}</span>
              <span class={styles.hint}>{armyName(id)}</span>
            </span>
            <span class={styles.edit}>{t.setup.edit}</span>
          </button>
        ))}
        {armies.length === 0 && (
          <p class={styles.hint}>
            {t.setup.noArmiesHint} <a href={routeHref({ screen: 'armies' })}>{t.nav.armies}</a>
          </p>
        )}

        <section class={`plate plate-dim ${styles.settings}`}>
          <p class={styles.playerLabel}>{t.setup.firstPlayer}</p>
          <div class={styles.segmented} role="radiogroup" aria-label={t.setup.firstPlayer}>
            {(['p1', 'p2'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={firstPlayer === id}
                class={firstPlayer === id ? styles.segmentOn : styles.segment}
                onClick={() => setFirstPlayer(id)}
              >
                <span class={styles.dot} style={{ background: players[id].color }} />
                {players[id].name || label(id)}
              </button>
            ))}
          </div>
          <Counter label={t.setup.rounds} value={rounds} min={1} max={10} onChange={setRounds} />
          <Counter label={t.setup.startingCp} value={startingCp} min={0} max={12} onChange={setStartingCp} />
        </section>
      </div>

      <BottomSheet open={editing !== null} title={editing ? label(editing) : ''} onClose={() => setEditing(null)}>
        {editing && (
          <div class={styles.sheet}>
            <label class={styles.field}>
              <span>{t.setup.army}</span>
              <select class={styles.input} value={armyIds[editing]} onChange={(e) => pickArmy(editing, (e.currentTarget as HTMLSelectElement).value)}>
                <option value="">{t.setup.noArmy}</option>
                {armies.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label class={styles.field}>
              <span>{t.setup.name}</span>
              <input
                class={styles.input}
                type="text"
                value={players[editing].name}
                maxLength={24}
                onInput={(e) => update(editing, { name: (e.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <div class={styles.field}>
              <span>{t.setup.color}</span>
              <div class={styles.swatches} role="radiogroup" aria-label={t.setup.color}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={players[editing].color === c}
                    aria-label={c}
                    class={players[editing].color === c ? styles.swatchOn : styles.swatch}
                    style={{ background: c }}
                    onClick={() => update(editing, { color: c })}
                  />
                ))}
              </div>
            </div>
            <p class={styles.hint}>{t.setup.firstPlayerHint}</p>
            <Button variant="primary" block onClick={() => setEditing(null)}>
              {t.editor.done}
            </Button>
          </div>
        )}
      </BottomSheet>
    </Shell>
  );
}
