import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';

describe('parseCsv', () => {
  it('splits on pipes, strips the BOM, and drops the trailing delimiter', () => {
    const rows = parseCsv('﻿id|name|link|\nORK|Orks|https://x|\nSM|Space Marines|https://y|\n');
    expect(rows).toEqual([
      { id: 'ORK', name: 'Orks', link: 'https://x' },
      { id: 'SM', name: 'Space Marines', link: 'https://y' },
    ]);
  });

  it('keeps empty fields and handles CRLF', () => {
    const rows = parseCsv('a|b|c|\r\n1||3|\r\n');
    expect(rows).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('joins a field that contains a newline', () => {
    const rows = parseCsv('id|text|\n1|first line\nsecond line|\n2|ok|\n');
    expect(rows).toEqual([
      { id: '1', text: 'first line\nsecond line' },
      { id: '2', text: 'ok' },
    ]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
