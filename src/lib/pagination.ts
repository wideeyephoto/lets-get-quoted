/**
 * High-Volume Database Pagination Helper.
 *
 * Supabase/PostgREST defaults to capping single queries at 1,000 rows.
 * For production accounts with thousands of jobs, invoices, payments, or client
 * records, this helper iterates through all rows using `.range(from, to)` to
 * prevent silent truncation during data exports, tax computations, and sync sweeps.
 */

export type PaginatedQueryRunner<T> = (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: unknown;
}>;

export const DEFAULT_PAGE_SIZE = 1000;

/**
 * Fetches all pages of a query by iteratively calling a range-bound query runner.
 */
export async function fetchAllPages<T>(
  runQueryPage: PaginatedQueryRunner<T>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await runQueryPage(from, to);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as T[];
    allRows.push(...rows);

    // If the returned batch is smaller than the requested page size, we have reached the end.
    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

/**
 * Processes pages iteratively with a callback to avoid loading millions of records
 * into memory simultaneously.
 */
export async function processPages<T>(
  runQueryPage: PaginatedQueryRunner<T>,
  onPage: (batch: T[], pageIndex: number) => Promise<void> | void,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<number> {
  let from = 0;
  let totalProcessed = 0;
  let pageIndex = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await runQueryPage(from, to);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as T[];
    if (rows.length > 0) {
      await onPage(rows, pageIndex);
      totalProcessed += rows.length;
      pageIndex++;
    }

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return totalProcessed;
}
