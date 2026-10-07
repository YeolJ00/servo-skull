import { useEffect, useState } from 'preact/hooks';
import { loadGame } from '../data/gameStorage.ts';
import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.tsx';
import { SkullIcon } from '../ui/SkullIcon.tsx';
import styles from './Home.module.css';
import { routeHref } from './router.ts';
import { Shell } from './Shell.tsx';
import { useTheme, type Theme } from './theme.ts';

const themes: Theme[] = ['system', 'dark', 'light'];
const themeLabel: Record<Theme, string> = {
  system: t.home.themeSystem,
  dark: t.home.themeDark,
  light: t.home.themeLight,
};

export function Home() {
  const [theme, setTheme] = useTheme();
  const [hasGame, setHasGame] = useState(false);
  useEffect(() => {
    void loadGame().then((g) => setHasGame(!!g));
  }, []);
  return (
    <Shell>
      <section class={styles.hero}>
        <SkullIcon size={112} class={styles.skull} title={t.app.name} />
        <h1 class={styles.title}>{t.app.name}</h1>
        <p class={styles.tagline}>{t.app.tagline}</p>
        <div class={styles.rule} aria-hidden="true">
          <span />
          <i />
          <span />
        </div>
      </section>

      <div class={styles.menu}>
        {hasGame && (
          <MenuItem href={routeHref({ screen: 'game' })} label={t.home.continueGame} hint={t.home.continueHint} primary />
        )}
        <MenuItem
          href={routeHref({ screen: 'setup' })}
          label={t.home.newGame}
          hint={t.home.newGameHint}
          primary={!hasGame}
        />
        <MenuItem href={routeHref({ screen: 'armies' })} label={t.home.armies} hint={t.home.armiesHint} />
        <MenuItem href={routeHref({ screen: 'import' })} label={t.home.import} hint={t.home.importHint} />
      </div>

      <section class={styles.settings} aria-label={t.home.theme}>
        <p class="kicker">{t.home.theme}</p>
        <div class={styles.segmented} role="group">
          {themes.map((th) => (
            <button
              key={th}
              type="button"
              class={th === theme ? styles.segmentOn : styles.segment}
              aria-pressed={th === theme}
              onClick={() => setTheme(th)}
            >
              {themeLabel[th]}
            </button>
          ))}
        </div>
      </section>

      <p class={styles.credit}>
        <a href={t.app.wahapediaUrl} target="_blank" rel="noopener">
          {t.app.poweredBy}
        </a>
      </p>
    </Shell>
  );
}

function MenuItem({ href, label, hint, primary }: { href: string; label: string; hint: string; primary?: boolean }) {
  return (
    <div class={styles.item}>
      <Button href={href} variant={primary ? 'primary' : 'secondary'} block>
        {label}
      </Button>
      <p class={styles.hint}>{hint}</p>
    </div>
  );
}
