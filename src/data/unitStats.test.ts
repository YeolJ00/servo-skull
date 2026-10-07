import { describe, expect, it } from 'vitest';
import type { Datasheet } from './pack.ts';
import { expandModels } from './unitStats.ts';

const base: Datasheet = {
  id: '1',
  name: 'Boyz',
  factionId: 'ORK',
  role: 'Battleline',
  link: '',
  virtual: false,
  keywords: ['Infantry'],
  factionKeywords: ['Orks'],
  models: [
    { name: 'Boy', m: '6"', t: '5', sv: '5+', invSv: '-', w: '1', ld: '7+', oc: '2' },
    { name: 'Nob', m: '6"', t: '5', sv: '5+', invSv: '-', w: '3', ld: '7+', oc: '2' },
  ],
  composition: [
    { description: '1-2 Nob models', min: 1, max: 2 },
    { description: '9-18 Boy models', min: 9, max: 18 },
  ],
  minModels: 10,
  maxModels: 20,
  costs: [],
  weapons: [],
  abilities: [],
  leads: [],
};

describe('expandModels', () => {
  it('fills composition minimums first, then the widest line', () => {
    const ten = expandModels(base, 10);
    expect(ten.map((m) => m.name)).toEqual(['Nob', ...Array(9).fill('Boy')]);
    expect(ten[0]).toMatchObject({ w: 3, t: 5, sv: 5, invSv: null, character: false });
    const twenty = expandModels(base, 20);
    expect(twenty.filter((m) => m.name === 'Nob')).toHaveLength(2);
    expect(twenty.filter((m) => m.name === 'Boy')).toHaveLength(18);
  });

  it('uses the single profile for every model and reads invulnerable saves and character', () => {
    const captain: Datasheet = {
      ...base,
      name: 'Captain',
      keywords: ['Character', 'Infantry'],
      models: [{ name: 'Captain', m: '6"', t: '4', sv: '3+', invSv: '4', w: '5', ld: '6+', oc: '1' }],
      composition: [{ description: '1 Captain', min: 1, max: 1 }],
    };
    expect(expandModels(captain, 1)).toEqual([{ name: 'Captain', w: 5, t: 4, sv: 3, invSv: 4, character: true }]);
  });

  it('never returns fewer models than asked', () => {
    expect(expandModels(base, 25)).toHaveLength(25);
    expect(expandModels({ ...base, models: [], composition: [] }, 3)).toHaveLength(3);
  });
});
