import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';

// CSV import for the client/CRM list — so a contractor can bring their existing
// customer list over from a spreadsheet or another tool in one paste. Parsing is
// pure (and unit-tested); the DB import dedupes against existing clients by phone
// then email, exactly like findOrCreateClientId, so a re-import is safe.

type Field = 'name' | 'phone' | 'email' | 'address';

export type ParsedClientRow = { name: string | null; phone: string | null; email: string | null; address: string | null };

const HEADER_KEYS: Record<Field, string[]> = {
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'mobile', 'cell', 'tel', 'number'],
  name: ['name', 'client', 'customer', 'contact', 'first', 'last'],
  address: ['address', 'street', 'location', 'addr', 'city'],
};

// A tolerant RFC-4180-ish tokenizer: quoted fields, "" escapes, the delimiter
// and newlines inside quotes, CRLF or LF line endings. Wholly-empty rows (e.g.
// from a trailing newline) are dropped. Returns a grid of raw cells.
function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Comma-delimited parse — kept as the stable, unit-tested entry point.
export function parseCsv(text: string): string[][] {
  return tokenize(text, ',');
}

// Guess the delimiter from the first non-empty line: spreadsheets export commas,
// but a paste from Excel/Sheets is usually tab-separated, and some locales use
// semicolons. Falls back to comma.
function detectDelimiter(text: string): string {
  const firstLine = text.replace(/\r\n/g, '\n').split('\n').find((line) => line.trim() !== '') ?? '';
  let best = ',';
  let bestCount = 0;
  for (const d of [',', '\t', ';', '|']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

// Parse pasted/uploaded text into a grid, auto-detecting the delimiter.
export function parseTable(text: string): string[][] {
  return tokenize(text, detectDelimiter(text));
}

// Decide the column→field mapping from a possible header row. A real header has
// NO digits or '@' in any cell (those signal a data row), and at least one cell
// naming a known field. Returns null when the first row is actually data.
function detectColumns(header: string[]): Partial<Record<Field, number>> | null {
  if (header.some((cell) => /[0-9@]/.test(cell))) return null;
  const map: Partial<Record<Field, number>> = {};
  header.forEach((raw, idx) => {
    const cell = raw.trim().toLowerCase();
    if (!cell) return;
    // Order matters: check email before address so "email address" → email.
    const field = (['email', 'phone', 'name', 'address'] as Field[]).find((f) => HEADER_KEYS[f].some((k) => cell.includes(k)));
    if (field && map[field] === undefined) map[field] = idx;
  });
  return Object.keys(map).length > 0 ? map : null;
}

// Parse pasted/uploaded CSV into client rows. If the first row is a recognizable
// header, columns are mapped by name; otherwise they're read positionally as
// name, phone, email, address. Wholly-empty rows are dropped.
export function parseClientCsv(text: string): { rows: ParsedClientRow[]; headerUsed: boolean } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], headerUsed: false };

  const detected = detectColumns(table[0]);
  const headerUsed = detected !== null;
  const columnMap: Partial<Record<Field, number>> = detected ?? { name: 0, phone: 1, email: 2, address: 3 };
  const dataRows = headerUsed ? table.slice(1) : table;

  const rows: ParsedClientRow[] = [];
  for (const r of dataRows) {
    const get = (f: Field): string => {
      const idx = columnMap[f];
      return idx !== undefined ? (r[idx] ?? '').trim() : '';
    };
    const name = get('name');
    const phone = get('phone');
    const email = get('email');
    const address = get('address');
    if (!name && !phone && !email) continue;
    rows.push({ name: name || null, phone: phone || null, email: email || null, address: address || null });
  }
  return { rows, headerUsed };
}

export type ImportResult = { imported: number; duplicates: number; skipped: number };

// Insert parsed rows as clients, deduped against existing clients AND within the
// file itself (by normalized phone, then lowercased email). A row with no phone
// and no email can't be deduped, so it's skipped rather than risk junk/dupes.
export async function importClients(
  supabase: SupabaseClient,
  accountId: string,
  parsed: ParsedClientRow[],
): Promise<ImportResult> {
  const { data: existing } = await supabase.from('clients').select('phone, email').eq('account_id', accountId);
  const seen = new Set<string>();
  for (const client of existing ?? []) {
    if (client.phone) seen.add(`p:${client.phone}`);
    if (client.email) seen.add(`e:${String(client.email).toLowerCase()}`);
  }

  const toInsert: Array<{ account_id: string; name: string; phone: string | null; email: string | null; address: string | null }> = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of parsed) {
    const phone = row.phone ? normalizeUsPhone(row.phone) : null;
    const email = row.email ? row.email.trim().toLowerCase() : null;
    if (!phone && !email) {
      skipped += 1; // no contact to key on
      continue;
    }
    const pk = phone ? `p:${phone}` : null;
    const ek = email ? `e:${email}` : null;
    if ((pk && seen.has(pk)) || (ek && seen.has(ek))) {
      duplicates += 1;
      continue;
    }
    if (pk) seen.add(pk);
    if (ek) seen.add(ek);
    toInsert.push({ account_id: accountId, name: row.name?.trim() || 'Client', phone, email, address: row.address?.trim() || null });
  }

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { data, error } = await supabase.from('clients').insert(chunk).select('id');
    if (error) {
      console.error('Client import chunk failed:', error.message);
      skipped += chunk.length;
    } else {
      imported += (data ?? []).length;
    }
  }

  return { imported, duplicates, skipped };
}

// -- Column mapping (smart import) --------------------------------------------
// The smart importer maps arbitrary uploads to our schema, then applies that
// mapping locally to every row. A field maps to one or more source columns so a
// split First/Last name or a street/city/state/zip address can be recombined.

export type ColumnSources = Record<Field, number[]>;
export type ColumnMapping = { hasHeader: boolean; sources: ColumnSources };

function gridWidth(grid: string[][]): number {
  return grid.reduce((max, r) => Math.max(max, r.length), 0);
}

// Build client rows from a grid + column mapping. name joins its columns with a
// space (First + Last), address with ", " (street/city/state/zip); phone and
// email take the first non-empty of their column(s). Rows with no name, phone,
// or email are dropped — same rule as the legacy parser.
export function applyMapping(grid: string[][], mapping: ColumnMapping): ParsedClientRow[] {
  const data = mapping.hasHeader ? grid.slice(1) : grid;
  const rows: ParsedClientRow[] = [];
  for (const r of data) {
    const compose = (field: Field): string | null => {
      const parts = (mapping.sources[field] ?? [])
        .map((i) => (r[i] ?? '').trim())
        .filter((value) => value.length > 0);
      if (parts.length === 0) return null;
      if (field === 'phone' || field === 'email') return parts[0];
      return parts.join(field === 'address' ? ', ' : ' ');
    };
    const name = compose('name');
    const phone = compose('phone');
    const email = compose('email');
    const address = compose('address');
    if (!name && !phone && !email) continue;
    rows.push({ name, phone, email, address });
  }
  return rows;
}

// The free/instant path: a recognizable header naming a name AND a contact
// column. Anything short of that returns null so the caller escalates to the AI
// mapper rather than guess.
export function deterministicMapping(grid: string[][]): ColumnMapping | null {
  if (grid.length === 0) return null;
  const detected = detectColumns(grid[0]);
  if (!detected) return null;
  const hasContact = detected.phone !== undefined || detected.email !== undefined;
  if (detected.name === undefined || !hasContact) return null;
  const sources: ColumnSources = { name: [], phone: [], email: [], address: [] };
  (Object.keys(sources) as Field[]).forEach((field) => {
    if (detected[field] !== undefined) sources[field] = [detected[field] as number];
  });
  return { hasHeader: true, sources };
}

// Last resort when neither rules nor AI produced a mapping: read columns
// positionally as name, phone, email, address (the legacy importer's behavior).
export function positionalMapping(grid: string[][]): ColumnMapping {
  const width = gridWidth(grid);
  const at = (i: number): number[] => (i < width ? [i] : []);
  return { hasHeader: false, sources: { name: at(0), phone: at(1), email: at(2), address: at(3) } };
}

// Labels for each column, used by the confirm-step dropdowns: the header title
// when there's a header row, otherwise "Column 1", "Column 2", …
export function columnLabels(grid: string[][], hasHeader: boolean): string[] {
  const width = gridWidth(grid);
  return Array.from({ length: width }, (_, i) => {
    const raw = hasHeader ? (grid[0]?.[i] ?? '').trim() : '';
    return raw || `Column ${i + 1}`;
  });
}
