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

// A tolerant RFC-4180-ish CSV tokenizer: quoted fields, "" escapes, commas and
// newlines inside quotes, CRLF or LF line endings. Returns a grid of raw cells.
export function parseCsv(text: string): string[][] {
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
    } else if (c === ',') {
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

  // Drop rows that are entirely empty (e.g. from a trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
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
