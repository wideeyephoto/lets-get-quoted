/**
 * What "export my data" is made of.
 *
 * Client-safe: the picker and the route read the same list, so a set can never
 * be offered in the modal and then not exist on the server.
 */
export type ExportSetId = 'clients' | 'services' | 'jobs' | 'invoices';

export type ExportSet = {
  id: ExportSetId;
  label: string;
  /** What is actually in the file, so the choice is informed rather than a guess. */
  hint: string;
  /** The name inside the archive — and the name of the single-file download. */
  filename: string;
};

export const EXPORT_SETS: ExportSet[] = [
  { id: 'clients', label: 'Customers', hint: 'Names, phone, email, address and notes', filename: 'customers.csv' },
  { id: 'services', label: 'Price book', hint: 'Every service, its price and its unit', filename: 'price-book.csv' },
  { id: 'jobs', label: 'Jobs', hint: 'Scope, status, schedule and quoted amount', filename: 'jobs.csv' },
  { id: 'invoices', label: 'Invoices', hint: 'Reference, status, totals and what was paid', filename: 'invoices.csv' },
];

/**
 * Read a `?sets=` list back into real ids.
 *
 * Unknown names are DROPPED rather than failing the request: a link somebody
 * kept from an older version should hand over the sets that still exist, not
 * an error page. An empty or absent list means everything, which is what the
 * plain "Export business data" button asks for.
 */
export function parseExportSets(raw: string | null | undefined): ExportSetId[] {
  if (!raw) return EXPORT_SETS.map((set) => set.id);
  const asked = new Set(raw.split(',').map((part) => part.trim().toLowerCase()));
  const kept = EXPORT_SETS.filter((set) => asked.has(set.id)).map((set) => set.id);
  return kept.length > 0 ? kept : EXPORT_SETS.map((set) => set.id);
}

/** "letsgetquoted-export-2026-08-05.zip" — dated, because people keep several. */
export function exportArchiveName(todayKey: string): string {
  return `letsgetquoted-export-${todayKey}.zip`;
}
