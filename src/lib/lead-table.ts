/**
 * The Table view's column model, sort and export.
 *
 * Table was the strongest of the three structurally and the weakest in purpose:
 * a denser copy of the same six fields. What earns it a place is being the one
 * view where you operate on MANY leads at once — pick columns, sort, select,
 * act in bulk, take the result away as a file. All of that is data about the
 * table rather than markup, so it lives here and is testable without a DOM.
 */

export type TableColumnId =
  | 'lead'
  | 'project'
  | 'stage'
  | 'waiting'
  | 'value'
  | 'source'
  | 'next'
  | 'heat'
  | 'location'
  | 'received';

export type TableColumn = {
  id: TableColumnId;
  label: string;
  /** Shown for a chooser that has never been touched. */
  onByDefault: boolean;
  sortable: boolean;
  /** Right-aligned, tabular figures. */
  numeric?: boolean;
};

export const TABLE_COLUMNS: TableColumn[] = [
  { id: 'lead', label: 'Lead', onByDefault: true, sortable: true },
  { id: 'project', label: 'Project', onByDefault: true, sortable: false },
  { id: 'stage', label: 'Stage', onByDefault: true, sortable: true },
  { id: 'waiting', label: 'Waiting', onByDefault: true, sortable: true, numeric: true },
  { id: 'value', label: 'Est. value', onByDefault: true, sortable: true, numeric: true },
  { id: 'source', label: 'Source', onByDefault: true, sortable: false },
  { id: 'next', label: 'Next action', onByDefault: true, sortable: false },
  { id: 'heat', label: 'Heat', onByDefault: false, sortable: true },
  { id: 'location', label: 'Location', onByDefault: false, sortable: false },
  { id: 'received', label: 'Received', onByDefault: false, sortable: true },
];

/** The Lead column can never be switched off — a row with no name is not a row. */
export const LOCKED_COLUMN: TableColumnId = 'lead';

export const DEFAULT_COLUMNS: TableColumnId[] = TABLE_COLUMNS.filter((c) => c.onByDefault).map((c) => c.id);

export function normalizeColumns(value: unknown): TableColumnId[] {
  const known = new Set(TABLE_COLUMNS.map((c) => c.id));
  if (!Array.isArray(value)) return DEFAULT_COLUMNS;
  const picked = value.filter((id): id is TableColumnId => typeof id === 'string' && known.has(id as TableColumnId));
  if (picked.length === 0) return DEFAULT_COLUMNS;
  // The lock is enforced here rather than in the chooser, so no stored
  // preference — however it got there — can produce a nameless table.
  return picked.includes(LOCKED_COLUMN) ? picked : [LOCKED_COLUMN, ...picked];
}

/**
 * One CSV cell.
 *
 * Quotes everything containing a comma, a quote or a newline, and doubles inner
 * quotes — the actual CSV rules rather than "hope no address has a comma in
 * it", which every address does.
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  // CRLF: Excel treats a bare LF file as one long row on Windows, which is
  // where these get opened.
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** "leads-2026-08-05.csv" — sortable in a downloads folder. */
export function csvFilename(todayKey: string): string {
  return `leads-${todayKey}.csv`;
}
