import { useEffect, useState } from 'preact/hooks';
import { resolveUnit, type ArmyList } from '../data/army.ts';
import { listArmies } from '../data/armyStorage.ts';
import { loadGame, saveGame } from '../data/gameStorage.ts';
import { parseTarget } from '../data/pack.ts';
import type { Rules } from '../data/rules.ts';
import type { GameSetup as Setup, PlayerId, PlayerSetup, UnitSetup } from '../engine/types.ts';
import { t } from '../i18n/index.ts';
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

/** Builds the engine's unit list from an army. Units without a datasheet are kept with a warning. */
export function unitsFromArmy(army: ArmyList, owner: PlayerId, rules: Rules): { units: UnitSetup[]; unknown: string[] } {
  const units: UnitSetup[] = [];
  const unknown: string[] = [];
  const seen = new Map<string, number>();
  army.units.forEach((u, i) => {
    const { sheet } = resolveUnit(u, rules);
    const n = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, n);
    const name = n > 1 ? `${u.name} ${n}` : u.name;
    const ld = sheet ? parseTarget(sheet.models[0]?.ld ?? '') : undefined;
    if (!sheet || ld === undefined) unknown.push(u.name);
    units.push({
      id: `${owner}-${i}`,
      name,
      owner,
      models: u.models,
      ld: ld ?? UNKNOWN_LD,
      datasheetId: sheet?.id,
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
    for (const id of ['p1', 'p2'] as const) {
      const army = armies.find((a) => a.id === armyIds[id]);
      if (!army) continue;
      const built = unitsFromArmy(army, id, rules);
      units.push(...built.units);
      unknown.push(...built.unknown);
    }
    const setup: Setup = {
      players: {
        p1: { ...players.p1, name: players.p1.name.trim() || DEFAULTS.p1.name },
        p2: { ...players.p2, name: players.p2.name.trim() || DEFAULTS.p2.name },
      },
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

  return (
    <Shell
      header={<h1>{t.nav.setup}</h1>}
      footer={
        <>
          <Button href={routeHref({ screen: 'home' })} variant="ghost">
            {t.nav.back}
          </Button>
          <Button variant="primary" onClick={() => void start()}>
            {warning ? t.setup.startAnyway : t.setup.start}
          </Button>
        </>
      }
    >
      <div class={styles.form}>
        {hasGame && <p class={styles.warning}>{t.setup.replaceWarning}</p>}
        {warning && <p class={styles.warning}>{warning}</p>}

        {(['p1', 'p2'] as const).map((id) => (
          <section class={`plate plate-dim ${styles.player}`} key={id}>
            <h2 class={styles.playerTitle}>{id === 'p1' ? t.setup.player1 : t.setup.player2}</h2>
            <label class={styles.field}>
              <span>{t.setup.army}</span>
              <select class={styles.input} value={armyIds[id]} onChange={(e) => pickArmy(id, (e.currentTarget as HTMLSelectElement).value)}>
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
                value={players[id].name}
                maxLength={24}
                onInput={(e) => update(id, { name: (e.currentTarget as HTMLInputElement).value })}
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
                    aria-checked={players[id].color === c}
                    aria-label={c}
                    class={players[id].color === c ? styles.swatchOn : styles.swatch}
                    style={{ background: c }}
                    onClick={() => update(id, { color: c })}
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
        {armies.length === 0 && (
          <p class={styles.hint}>
            {t.setup.noArmiesHint}{' '}
            <a href={routeHref({ screen: 'armies' })}>{t.nav.armies}</a>
          </p>
        )}

        <section class={`plate plate-dim ${styles.player}`}>
          <p class={styles.playerTitle}>{t.setup.firstPlayer}</p>
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
                {players[id].name || (id === 'p1' ? t.setup.player1 : t.setup.player2)}
              </button>
            ))}
          </div>
          <p class={styles.hint}>{t.setup.firstPlayerHint}</p>
        </section>

        <section class={`plate plate-dim ${styles.player}`}>
          <Counter label={t.setup.rounds} value={rounds} min={1} max={10} onChange={setRounds} />
          <Counter label={t.setup.startingCp} value={startingCp} min={0} max={12} onChange={setStartingCp} />
          <p class={styles.hint}>{t.setup.startingCpHint}</p>
        </section>
      </div>
    </Shell>
  );
}
