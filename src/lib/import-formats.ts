// Pure helpers that normalize non-CSV uploads into CSV text, so the smart-import
// pipeline (parse -> AI map -> preview) has one input format. Excel is read in
// the browser (see read-import-file.ts) into a grid and serialized here; vCard
// (.vcf phone/Google contact exports) is parsed to name/phone/email/address.

export type ImportContact = { name: string | null; phone: string | null; email: string | null; address: string | null };

// Serialize a grid to RFC-4180 CSV: quote any cell containing a comma, quote, or
// newline, doubling embedded quotes. The inverse of parseCsv, so a round-trip is
// lossless.
export function gridToCsv(grid: string[][]): string {
  return grid.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string {
  const v = value ?? '';
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// vCard line unfolding (RFC 6350 §3.2): a line beginning with a space or tab is a
// continuation of the previous line.
function unfold(text: string): string[] {
  const raw = text.split(/\r\n|\r|\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// Unescape a vCard text value: \n -> space, and \\ \, \; -> the literal char.
function decode(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\([\\,;])/g, '$1')
    .trim();
}

// Split a structured vCard value (N, ADR) on unescaped semicolons.
function splitStructured(value: string): string[] {
  return value.split(/(?<!\\);/).map(decode);
}

// N: Family;Given;Additional;Prefix;Suffix -> "Prefix Given Additional Family Suffix"
function nameFromN(value: string): string {
  const [family = '', given = '', additional = '', prefix = '', suffix = ''] = splitStructured(value);
  return [prefix, given, additional, family, suffix]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ADR: PO;Ext;Street;City;State;Zip;Country -> non-empty parts joined with ", "
function adrJoin(value: string): string {
  return splitStructured(value).filter((part) => part.length > 0).join(', ');
}

export function parseVcards(text: string): ImportContact[] {
  const lines = unfold(text);
  const contacts: ImportContact[] = [];
  let cur: { fn?: string; n?: string; tel?: string; email?: string; adr?: string } | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VCARD')) {
      cur = {};
      continue;
    }
    if (upper.startsWith('END:VCARD')) {
      if (cur) {
        contacts.push({
          name: cur.fn || cur.n || null,
          phone: cur.tel || null,
          email: cur.email || null,
          address: cur.adr || null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);

    // Keep the first of each — a contact can list several phones/emails.
    if (key === 'FN' && !cur.fn) cur.fn = decode(value);
    else if (key === 'N' && !cur.n) cur.n = nameFromN(value);
    else if (key === 'TEL' && !cur.tel) cur.tel = decode(value);
    else if (key === 'EMAIL' && !cur.email) cur.email = decode(value);
    else if (key === 'ADR' && !cur.adr) cur.adr = adrJoin(value);
  }

  return contacts;
}

// vCard text -> CSV with a clear header, so the importer maps it by name without
// needing the AI (the header names match our schema exactly).
export function vcardsToCsv(text: string): string {
  const contacts = parseVcards(text);
  const grid: string[][] = [['name', 'phone', 'email', 'address']];
  for (const c of contacts) {
    grid.push([c.name ?? '', c.phone ?? '', c.email ?? '', c.address ?? '']);
  }
  return gridToCsv(grid);
}
