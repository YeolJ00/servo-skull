import { t } from '../i18n/index.ts';
import { Button } from '../ui/Button.tsx';
import { routeHref } from './router.ts';
import { Shell } from './Shell.tsx';

interface Props {
  title: string;
  body: string;
}

// Stands in for screens that later milestones build.
export function Placeholder({ title, body }: Props) {
  return (
    <Shell
      header={<h1>{title}</h1>}
      footer={
        <Button href={routeHref({ screen: 'home' })} variant="ghost">
          {t.nav.back}
        </Button>
      }
    >
      <h2>{t.placeholder.title}</h2>
      <p>{body}</p>
    </Shell>
  );
}
