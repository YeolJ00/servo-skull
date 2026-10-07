import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router.ts';

describe('parseRoute', () => {
  it('maps an empty hash to home', () => {
    expect(parseRoute('')).toEqual({ screen: 'home' });
    expect(parseRoute('#')).toEqual({ screen: 'home' });
    expect(parseRoute('#/')).toEqual({ screen: 'home' });
  });

  it('maps top-level screens', () => {
    expect(parseRoute('#/game')).toEqual({ screen: 'game' });
    expect(parseRoute('#/game/')).toEqual({ screen: 'game' });
    expect(parseRoute('#/setup')).toEqual({ screen: 'setup' });
    expect(parseRoute('#/import')).toEqual({ screen: 'import' });
    expect(parseRoute('#/armies')).toEqual({ screen: 'armies' });
  });

  it('maps an army id and decodes it', () => {
    expect(parseRoute('#/armies/abc')).toEqual({ screen: 'army', armyId: 'abc' });
    expect(parseRoute('#/armies/a%20b')).toEqual({ screen: 'army', armyId: 'a b' });
  });

  it('falls back to home for unknown paths', () => {
    expect(parseRoute('#/nope')).toEqual({ screen: 'home' });
  });

  it('round-trips through routeHref', () => {
    const routes = [
      parseRoute('#/'),
      parseRoute('#/game'),
      parseRoute('#/armies'),
      parseRoute('#/armies/x%2Fy'),
    ];
    for (const r of routes) expect(parseRoute(routeHref(r))).toEqual(r);
  });
});
