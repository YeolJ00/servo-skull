import { describe, expect, it } from 'vitest';
import { costFor, parseTarget } from '../pack.ts';
import { buildPack, parseComposition, parseCosts, type PackFiles } from './buildPack.ts';

// Small fixtures shaped like the real export (pipe delimited, trailing pipe). Made-up values.
const files: PackFiles = {
  Last_update: '﻿last_update|\n2026-09-28 02:38:04|\n',
  Factions: '﻿id|name|link|\nORK|Orks|https://w/orks|\nSM|Space Marines|https://w/sm|\nNEC|Necrons|https://w/nec|\n',
  Datasheets:
    '﻿id|name|faction_id|source_id|legend|role|loadout|transport|virtual|is_support|leader_head|leader_footer|damaged_w|damaged_description|link|\n' +
    '1|Boyz|ORK|s|lore|Battleline|||false|false|||||https://w/boyz|\n' +
    '2|Warboss|ORK|s|lore|Infantry Character|||false|false|||||https://w/warboss|\n' +
    '3|Tomb Blades|NEC|s|lore|Mounted|||false|false|||||https://w/tb|\n',
  Datasheets_models:
    '﻿datasheet_id|line|name|M|T|Sv|inv_sv|inv_sv_descr|W|Ld|OC|base_size|base_size_descr|\n' +
    '1|2|Nob|6"|5|5+|-||3|7+|2|40mm||\n' +
    '1|1|Boy|6"|5|5+|-||1|7+|2|32mm||\n' +
    '2|1|Warboss|6"|6|4+|5||6|6+|1|40mm||\n',
  Datasheets_models_cost:
    '﻿datasheet_id|line|description|cost|\n' +
    '1|1|YOUR 1ST TO 3RD UNITS COST||\n1|2|10 models|90|\n1|3|20 models|180|\n1|4|YOUR 4TH + UNIT COSTS||\n1|5|10 models|100|\n' +
    '2|1|1 model|65|\n',
  Datasheets_keywords:
    '﻿datasheet_id|keyword|model|is_faction_keyword|\n1|Orks||true|\n1|Infantry||false|\n1|Battleline||false|\n2|Orks||true|\n2|Character||false|\n',
  Datasheets_wargear:
    '﻿datasheet_id|line|line_in_wargear|dice|name|description|range|type|A|BS_WS|S|AP|D|\n' +
    '1|2|1||Choppa||Melee|Melee|3|3+|4|-1|1|\n1|1|1||Slugga|CLOSE-QUARTERS|12|Ranged|1|5+|4|0|1|\n',
  Datasheets_unit_composition:
    '﻿datasheet_id|line|description|\n1|1|1-2 Nob models|\n1|2|9-18 Boy models|\n2|1|1 Warboss|\n',
  Datasheets_abilities:
    '﻿datasheet_id|line|ability_id|model|name|description|type|parameter|\n' +
    '1|1|A1||||Core||\n1|2|||Mob Rule|Some text|Datasheet||\n',
  Abilities: '﻿id|name|legend|faction_id|description|\nA1|Deep Strike||ORK|Shared text|\n',
  Datasheets_leader: '﻿leader_id|attached_id|\n2|1|\n',
  Detachments:
    '﻿id|faction_id|name|legend|type|dp|force_disposition|\nD1|ORK|War Horde|||2|Take and Hold|\nD2|SM|Gladius|||3|Priority Assets|\n',
  Stratagems:
    '﻿faction_id|name|id|type|cp_cost|legend|turn|phase|detachment|detachment_id|description|\n' +
    'ORK|Careen!|S1|War Horde – Battle Tactic|1||Your turn|Shooting phase|War Horde|D1|desc|\n' +
    '|Command Re-roll|S0|Core – Battle Tactic|1||Either player’s turn|Any phase|||desc|\n' +
    'SM|Armour of Contempt|S2|Core|1||Either player’s turn|Any phase|||desc|\n',
};

describe('buildPack', () => {
  const pack = buildPack(files, { factions: ['ORK'], now: new Date('2026-10-07T00:00:00Z') });

  it('keeps only the wanted faction, with source metadata', () => {
    expect(pack.schemaVersion).toBe(1);
    expect(pack.id).toBe('wahapedia-ork');
    expect(pack.name).toBe('Orks');
    expect(pack.source.lastUpdate).toBe('2026-09-28 02:38:04');
    expect(pack.source.builtAt).toBe('2026-10-07T00:00:00.000Z');
    expect(pack.factions.map((f) => f.id)).toEqual(['ORK']);
    expect(pack.datasheets.map((d) => d.name)).toEqual(['Boyz', 'Warboss']);
    expect(pack.detachments.map((d) => d.name)).toEqual(['War Horde']);
  });

  it('assembles a datasheet from the linked tables, sorted by line', () => {
    const boyz = pack.datasheets[0]!;
    expect(boyz.models.map((m) => m.name)).toEqual(['Boy', 'Nob']);
    expect(boyz.models[0]).toMatchObject({ m: '6"', t: '5', sv: '5+', w: '1', ld: '7+', oc: '2' });
    expect(boyz.keywords).toEqual(['Infantry', 'Battleline']);
    expect(boyz.factionKeywords).toEqual(['Orks']);
    expect(boyz.composition).toEqual([
      { description: '1-2 Nob models', min: 1, max: 2 },
      { description: '9-18 Boy models', min: 9, max: 18 },
    ]);
    expect(boyz.minModels).toBe(10);
    expect(boyz.maxModels).toBe(20);
    expect(boyz.costs).toEqual([
      { models: 10, cost: 90 },
      { models: 20, cost: 180 },
    ]);
    expect(boyz.weapons.map((w) => w.name)).toEqual(['Slugga', 'Choppa']);
    expect(boyz.weapons[0]).toMatchObject({ range: '12', type: 'Ranged', a: '1', bsWs: '5+', s: '4', ap: '0', d: '1' });
    expect(boyz.abilities).toEqual([
      { name: 'Deep Strike', description: 'Shared text', type: 'Core', parameter: '' },
      { name: 'Mob Rule', description: 'Some text', type: 'Datasheet', parameter: '' },
    ]);
    expect(pack.datasheets[1]?.leads).toEqual(['1']);
    expect(pack.datasheets[1]?.costs).toEqual([{ models: 1, cost: 65 }]);
  });

  it('includes faction stratagems and shared core ones, not other factions', () => {
    expect(pack.stratagems.map((s) => s.id)).toEqual(['S1', 'S0']);
    expect(pack.stratagems[0]).toMatchObject({ turn: 'Your turn', phase: 'Shooting phase', detachmentId: 'D1' });
  });

  it('accepts faction names and builds multi-faction packs', () => {
    const both = buildPack(files, { factions: ['orks', 'Space Marines'] });
    expect(both.id).toBe('wahapedia-ork-sm');
    expect(both.detachments).toHaveLength(2);
    expect(both.stratagems).toHaveLength(3);
  });

  it('rejects unknown factions and missing core files', () => {
    expect(() => buildPack(files, { factions: ['Tau'] })).toThrow(/Unknown faction/);
    expect(() => buildPack({ Factions: files.Factions as string }, { factions: ['ORK'] })).toThrow(/Missing Datasheets/);
  });
});

describe('helpers', () => {
  it('parses composition ranges', () => {
    expect(parseComposition({ description: '4-9 Intercessors' })).toEqual({ description: '4-9 Intercessors', min: 4, max: 9 });
    expect(parseComposition({ description: '1 Captain' })).toEqual({ description: '1 Captain', min: 1, max: 1 });
    expect(parseComposition({ description: '' })).toEqual({ description: '', min: 0, max: 0 });
  });

  it('skips cost headers and keeps the first tier per model count', () => {
    expect(
      parseCosts([
        { description: 'YOUR UNIT COSTS', cost: '' },
        { description: '5 models', cost: '80' },
        { description: '5 models', cost: '85' },
        { description: '10 models', cost: '150' },
      ]),
    ).toEqual([
      { models: 5, cost: 80 },
      { models: 10, cost: 150 },
    ]);
  });

  it('parses target values and finds the cost tier for a model count', () => {
    expect(parseTarget('6+')).toBe(6);
    expect(parseTarget('7')).toBe(7);
    expect(parseTarget('-')).toBeUndefined();
    const sheet = { costs: [{ models: 5, cost: 80 }, { models: 10, cost: 150 }] };
    expect(costFor(sheet, 5)).toBe(80);
    expect(costFor(sheet, 7)).toBe(150);
    expect(costFor(sheet, 10)).toBe(150);
    expect(costFor(sheet, 12)).toBe(150);
    expect(costFor({ costs: [] }, 5)).toBeUndefined();
  });
});
