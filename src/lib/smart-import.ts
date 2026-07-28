// Generic smart-import engine, factored out of the client importer so Services
// and Jobs (and later Invoices/Payments) reuse one AI column-mapping + preview
// pipeline. A target "field" can draw from one or more source columns so split
// values recombine (First+Last -> name, street/city/state/zip -> address).
import { parseTable, columnLabels } from '@/lib/client-import';

export { parseTable, columnLabels };

export type ImportField = {
  key: string;            // target field key
  label: string;          // UI label
  keywords: string[];     // header substrings for the free rule-based match
  hint: string;           // what this field is, for the AI
  compose?: 'space' | 'comma' | 'first'; // how to join multiple source columns (default 'first')
  required?: boolean;     // a kept row needs >=1 required field; also gates rule-based confidence
};

export type FieldSources = Record<string, number[]>;
export type SmartMapping = { hasHeader: boolean; sources: FieldSources };
export type MappedRow = Record<string, string | null>;

export type SmartImportPreview =
  | { ok: false; error: 'empty' | 'norows' }
  | {
      ok: true;
      usedAi: boolean;
      hasHeader: boolean;
      sources: FieldSources;
      columnLabels: string[];
      sampleRows: MappedRow[];
      totalRows: number;
    };

export type CommitResult = { imported: number; duplicates: number; skipped: number; error?: 'norows' };

export function emptySources(fields: ImportField[]): FieldSources {
  const out: FieldSources = {};
  for (const f of fields) out[f.key] = [];
  return out;
}

function gridWidth(grid: string[][]): number {
  return grid.reduce((max, r) => Math.max(max, r.length), 0);
}

// Keep only valid, in-range indices — the confirm step sends back a user-edited
// mapping, so never trust it blind.
export function sanitizeSources(raw: unknown, fields: ImportField[], width: number): FieldSources {
  const out = emptySources(fields);
  const obj = (raw ?? {}) as Record<string, unknown>;
  for (const f of fields) {
    const arr = obj[f.key];
    if (Array.isArray(arr)) {
      out[f.key] = Array.from(
        new Set(arr.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n < width)),
      );
    }
  }
  return out;
}

// Build records from a grid + mapping. compose: 'space' joins with " " (names),
// 'comma' with ", " (addresses), 'first' takes the first non-empty (phone/price).
export function applyGenericMapping(grid: string[][], fields: ImportField[], mapping: SmartMapping): MappedRow[] {
  const data = mapping.hasHeader ? grid.slice(1) : grid;
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  const rows: MappedRow[] = [];
  for (const r of data) {
    const row: MappedRow = {};
    for (const f of fields) {
      const parts = (mapping.sources[f.key] ?? [])
        .map((i) => (r[i] ?? '').trim())
        .filter((v) => v.length > 0);
      if (parts.length === 0) {
        row[f.key] = null;
        continue;
      }
      const mode = f.compose ?? 'first';
      row[f.key] = mode === 'first' ? parts[0] : parts.join(mode === 'comma' ? ', ' : ' ');
    }
    const keep = requiredKeys.length > 0 ? requiredKeys.some((k) => row[k]) : fields.some((f) => row[f.key]);
    if (keep) rows.push(row);
  }
  return rows;
}

// The free/instant path: match columns by header keyword. A real header has no
// digits/@ in any cell. Confident only when every required field is matched;
// otherwise return null so the caller escalates to the AI mapper.
export function deterministicGenericMapping(grid: string[][], fields: ImportField[]): SmartMapping | null {
  if (grid.length === 0) return null;
  const header = grid[0];
  if (header.some((cell) => /[0-9@]/.test(cell))) return null;

  const sources = emptySources(fields);
  const used = new Set<number>();
  header.forEach((raw, idx) => {
    const cell = raw.trim().toLowerCase();
    if (!cell || used.has(idx)) return;
    // Fields are checked in declaration order, so list more-specific fields first
    // (e.g. unit_price before unit) to win ambiguous headers like "unit price".
    for (const f of fields) {
      if (sources[f.key].length > 0) continue;
      if (f.keywords.some((k) => cell.includes(k))) {
        sources[f.key] = [idx];
        used.add(idx);
        break;
      }
    }
  });

  const anyMatched = fields.some((f) => sources[f.key].length > 0);
  if (!anyMatched) return null;
  const requiredOk = fields.filter((f) => f.required).every((f) => sources[f.key].length > 0);
  if (!requiredOk) return null;
  return { hasHeader: true, sources };
}

// Last resort: read columns positionally in field-declaration order.
export function positionalGenericMapping(grid: string[][], fields: ImportField[]): SmartMapping {
  const width = gridWidth(grid);
  const sources = emptySources(fields);
  fields.forEach((f, i) => {
    sources[f.key] = i < width ? [i] : [];
  });
  return { hasHeader: false, sources };
}

// Parse a money-ish string ("$1,250.50") to rounded dollars.
export function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
