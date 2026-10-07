// Parser for Wahapedia's export CSVs: "|" delimited, UTF-8 with BOM, one trailing "|" per row.
// Pure: no file system, no network.

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  // Strip a leading byte order mark (U+FEFF).
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/);
  const headerLine = lines.shift();
  if (!headerLine) return [];
  const header = splitRow(headerLine);
  // Wahapedia rows end with a delimiter. A line without one is a field that contains a newline.
  const trailing = headerLine.endsWith('|');
  const rows: Row[] = [];
  let pending: string | null = null;
  for (const raw of lines) {
    if (raw === '' && pending === null) continue;
    const line: string = pending === null ? raw : `${pending}\n${raw}`;
    const fields = splitRow(line);
    if ((trailing && !line.endsWith('|')) || fields.length < header.length) {
      pending = line;
      continue;
    }
    pending = null;
    const row: Row = {};
    header.forEach((h, i) => {
      row[h] = fields[i] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

/** Splits one row and drops the empty field produced by the trailing delimiter. */
function splitRow(line: string): string[] {
  const fields = line.split('|');
  if (fields.length > 1 && fields[fields.length - 1] === '') fields.pop();
  return fields;
}
