import { useEffect, useState } from 'preact/hooks';

// Hash routing (#/game) so GitHub Pages never 404s on refresh.
export type Route =
  | { screen: 'home' }
  | { screen: 'import' }
  | { screen: 'armies' }
  | { screen: 'army'; armyId: string }
  | { screen: 'setup' }
  | { screen: 'game' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const [head = '', tail] = path.split('/', 2);
  switch (head) {
    case '':
      return { screen: 'home' };
    case 'import':
      return { screen: 'import' };
    case 'armies':
      return tail ? { screen: 'army', armyId: decodeURIComponent(tail) } : { screen: 'armies' };
    case 'setup':
      return { screen: 'setup' };
    case 'game':
      return { screen: 'game' };
    default:
      return { screen: 'home' };
  }
}

export function routeHref(route: Route): string {
  switch (route.screen) {
    case 'home':
      return '#/';
    case 'army':
      return `#/armies/${encodeURIComponent(route.armyId)}`;
    default:
      return `#/${route.screen}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
