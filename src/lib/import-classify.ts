// Guess which entity an uploaded file is, so the "migrate from another CRM"
// wizard can pre-assign each file. Heuristic on the header row; the user always
// gets to override. Pure + testable.

export type ImportEntity = 'clients' | 'services' | 'jobs' | 'invoices';

function headerCells(grid: string[][]): string[] {
  const header = grid[0] ?? [];
  // A real header has no digits/@ in any cell (those signal a data row).
  if (header.some((c) => /[0-9@]/.test(c))) return [];
  return header.map((c) => c.trim().toLowerCase());
}

export function classifyGrid(grid: string[][]): ImportEntity {
  const cells = headerCells(grid);
  const has = (kw: string) => cells.some((c) => c.includes(kw));

  const strongInvoice = has('invoice') || has('balance') || has('amount due') || has('grand total') || has('unpaid') || has('overdue');
  const jobSignal = has('scope') || has('job') || has('scheduled') || has('service date') || has('stage');
  const serviceSignal = (has('unit') || has('rate') || has('price book') || has('/hr') || has('uom')) && !has('phone') && !has('email');
  const contactSignal = has('name') || has('client') || has('customer') || has('contact');
  const moneyish = has('total') || has('amount') || has('paid') || has('price') || has('cost');

  // Order matters: a strong invoice word wins; then explicit job words; then a
  // price list without contacts; then customer+money (an invoice list); then a
  // bare price list; else it's a contact list.
  if (strongInvoice) return 'invoices';
  if (jobSignal) return 'jobs';
  if (serviceSignal) return 'services';
  if (moneyish && contactSignal) return 'invoices';
  if (moneyish) return 'services';
  return 'clients';
}

// Rough row count for the review screen (no mapping needed): data rows are the
// grid minus a header row when one is present.
export function roughRowCount(grid: string[][]): number {
  if (grid.length === 0) return 0;
  const hasHeader = headerCells(grid).length > 0;
  return Math.max(0, grid.length - (hasHeader ? 1 : 0));
}
