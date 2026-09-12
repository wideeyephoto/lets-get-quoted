import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/export — every route a contractor can pull their own data out through,
 * and the CSV builders behind them. Nine route files and src/lib/data-export.ts,
 * all at zero executed lines before this.
 *
 * This is the account's whole record leaving the building in one request, so the
 * thing worth holding is narrow and absolute: the workspace comes from the
 * session, every builder is handed that workspace and no other, and a request
 * without owner context produces no bytes at all. The second concern is the
 * response itself — an export that renders in the browser instead of
 * downloading, or that a proxy is allowed to cache, is a different kind of leak.
 */

const mocks = vi.hoisted(() => ({
  requireOwnerContext: vi.fn(),
  requireOfficeContext: vi.fn(),
  fetchAllPages: vi.fn(),
  listJobs: vi.fn(),
  listServices: vi.fn(),
  buildQuickBooksCsv: vi.fn(),
  listAllAccountExpenses: vi.fn(),
  generateExpensesCsv: vi.fn(),
  buildProfitAndLoss: vi.fn(),
  buildProfitAndLossCsv: vi.fn(),
  buildScheduleCWorksheet: vi.fn(),
  buildScheduleCCsv: vi.fn(),
  build1099PrepList: vi.fn(),
  build1099Csv: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.requireOwnerContext,
  requireOfficeContext: mocks.requireOfficeContext,
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/quickbooks', () => ({ buildQuickBooksCsv: mocks.buildQuickBooksCsv }));
vi.mock('@/lib/expense-ledger', () => ({
  listAllAccountExpenses: mocks.listAllAccountExpenses,
  generateExpensesCsv: mocks.generateExpensesCsv,
}));
vi.mock('@/lib/tax-reports', () => ({
  buildProfitAndLoss: mocks.buildProfitAndLoss,
  buildProfitAndLossCsv: mocks.buildProfitAndLossCsv,
  buildScheduleCWorksheet: mocks.buildScheduleCWorksheet,
  buildScheduleCCsv: mocks.buildScheduleCCsv,
  build1099PrepList: mocks.build1099PrepList,
  build1099Csv: mocks.build1099Csv,
}));
vi.mock('@/lib/pagination', () => ({ fetchAllPages: mocks.fetchAllPages }));
vi.mock('@/lib/jobs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/jobs')>('@/lib/jobs');
  return { ...actual, listJobs: mocks.listJobs };
});
vi.mock('@/lib/services', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services')>('@/lib/services');
  return { ...actual, listServices: mocks.listServices };
});

import { buildClientsCsv, buildInvoicesCsv, buildJobsCsv, buildServicesCsv } from '@/lib/data-export';
import { EXPORT_SETS, exportArchiveName, parseExportSets } from '@/lib/data-export-sets';
import { GET as exportAll } from '@/app/api/export/all/route';
import { GET as exportClients } from '@/app/api/export/clients/route';
import { GET as exportJobs } from '@/app/api/export/jobs/route';
import { GET as exportServices } from '@/app/api/export/services/route';
import { GET as exportInvoices } from '@/app/api/export/invoices/route';
import { GET as exportQuickBooks } from '@/app/api/export/quickbooks/route';
import { GET as exportExpenses } from '@/app/api/export/expenses/route';
import { GET as exportTax } from '@/app/api/export/tax/route';

const ACCOUNT_ID = 'workspace-a';

/** Records which table each read was aimed at, and how it was narrowed. */
function ownerContext() {
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const supabase = {
    from: (table: string) => {
      const record: { table: string; filters: [string, unknown][] } = { table, filters: [] };
      queries.push(record);
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          record.filters.push([column, value]);
          return chain;
        },
        order: () => chain,
        range: () => chain,
      };
      return chain;
    },
  };
  mocks.requireOwnerContext.mockResolvedValue({ supabase, accountId: ACCOUNT_ID });
  return { queries, supabase };
}

const request = (url = 'https://app.letsgetquoted.com/api/export/all') => new Request(url);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchAllPages.mockResolvedValue([]);
  mocks.listJobs.mockResolvedValue([]);
  mocks.listServices.mockResolvedValue([]);
  mocks.buildQuickBooksCsv.mockResolvedValue('Ref,Total\n');
  mocks.listAllAccountExpenses.mockResolvedValue({ rows: [] });
  mocks.generateExpensesCsv.mockReturnValue('Date,Supplier,Amount\n');
  mocks.buildProfitAndLoss.mockResolvedValue({});
  mocks.buildProfitAndLossCsv.mockReturnValue('Profit and loss\n');
  mocks.buildScheduleCWorksheet.mockReturnValue({});
  mocks.buildScheduleCCsv.mockReturnValue('Schedule C\n');
  mocks.build1099PrepList.mockResolvedValue([]);
  mocks.build1099Csv.mockReturnValue('1099\n');
});

describe('the tenancy gate on every export route', () => {
  const routes = [
    ['all', () => exportAll(request())],
    ['clients', () => exportClients()],
    ['jobs', () => exportJobs()],
    ['services', () => exportServices()],
    ['invoices', () => exportInvoices()],
  ] as const;

  it.each(routes)('asks for owner context before reading anything on /%s', async (_name, run) => {
    const { queries } = ownerContext();

    await run();

    expect(mocks.requireOwnerContext).toHaveBeenCalledTimes(1);
    // Whatever was read, it was read through the session's own client.
    for (const query of queries) {
      expect(query.filters).toContainEqual(['account_id', ACCOUNT_ID]);
    }
  });

  it.each(routes)('produces no bytes on /%s when the caller is not an owner', async (_name, run) => {
    ownerContext();
    // requireOwnerContext redirects rather than returning for a signed-out or
    // non-owner caller, which surfaces here as a throw.
    mocks.requireOwnerContext.mockRejectedValue(new Error('NEXT_REDIRECT;/login'));

    await expect(run()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.fetchAllPages).not.toHaveBeenCalled();
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.listServices).not.toHaveBeenCalled();
  });

  it.each(routes)('hands the resolved workspace to the builders on /%s', async (_name, run) => {
    ownerContext();

    await run();

    for (const spy of [mocks.listJobs, mocks.listServices]) {
      for (const call of spy.mock.calls) expect(call[1]).toBe(ACCOUNT_ID);
    }
  });
});

describe('the single-file downloads', () => {
  it.each([
    ['clients', () => exportClients(), 'letsgetquoted-customers.csv'],
    ['jobs', () => exportJobs(), 'letsgetquoted-jobs.csv'],
    ['services', () => exportServices(), 'letsgetquoted-price-book.csv'],
    ['invoices', () => exportInvoices(), 'letsgetquoted-invoices.csv'],
  ] as const)('sends /%s as a named CSV attachment', async (_name, run, filename) => {
    ownerContext();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    // attachment, not inline: a CSV rendered in the tab is a CSV in the
    // browser's history and cache rather than in the contractor's downloads.
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`);
  });
});

describe('the whole-account archive', () => {
  it('sends a dated zip that nothing is allowed to cache', async () => {
    ownerContext();

    const response = await exportAll(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="letsgetquoted-export-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    // A snapshot of live data. A cached copy is a stale copy.
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Number(response.headers.get('content-length'))).toBeGreaterThan(0);
  });

  it('builds every set when none was asked for', async () => {
    ownerContext();

    await exportAll(request('https://app.letsgetquoted.com/api/export/all'));

    // clients and invoices page through fetchAllPages; jobs and services have
    // their own listers. All four sets means all four are reached.
    expect(mocks.listJobs).toHaveBeenCalled();
    expect(mocks.listServices).toHaveBeenCalled();
    expect(mocks.fetchAllPages).toHaveBeenCalled();
  });

  it('builds only the sets that were asked for', async () => {
    ownerContext();

    await exportAll(request('https://app.letsgetquoted.com/api/export/all?sets=services'));

    expect(mocks.listServices).toHaveBeenCalled();
    expect(mocks.listJobs).not.toHaveBeenCalled();
    expect(mocks.fetchAllPages).not.toHaveBeenCalled();
  });

  it('drops a set name it does not recognise and keeps the rest', async () => {
    ownerContext();

    const response = await exportAll(request('https://app.letsgetquoted.com/api/export/all?sets=services,payroll'));

    expect(response.status).toBe(200);
    expect(mocks.listServices).toHaveBeenCalled();
    expect(mocks.listJobs).not.toHaveBeenCalled();
  });

  it('falls back to everything when no asked-for set exists', async () => {
    ownerContext();

    await exportAll(request('https://app.letsgetquoted.com/api/export/all?sets=payroll,timesheets'));

    expect(mocks.listJobs).toHaveBeenCalled();
    expect(mocks.listServices).toHaveBeenCalled();
  });
});

describe('parseExportSets', () => {
  const allIds = EXPORT_SETS.map((set) => set.id);

  it.each([null, undefined, ''])('treats %j as every set', (raw) => {
    expect(parseExportSets(raw)).toEqual(allIds);
  });

  it('keeps the requested sets in the catalogue order, not the caller order', () => {
    expect(parseExportSets('invoices,clients')).toEqual(['clients', 'invoices']);
  });

  it('ignores spacing and case', () => {
    expect(parseExportSets(' Clients , JOBS ')).toEqual(['clients', 'jobs']);
  });

  it('drops names that are not sets', () => {
    expect(parseExportSets('clients,payroll')).toEqual(['clients']);
  });

  it('returns everything rather than nothing when every name is unknown', () => {
    expect(parseExportSets('payroll,timesheets')).toEqual(allIds);
  });

  it('never invents a set id', () => {
    for (const id of parseExportSets('clients,jobs,services,invoices')) {
      expect(allIds).toContain(id);
    }
  });

  it('names the archive by the day it was taken', () => {
    expect(exportArchiveName('2026-09-12')).toBe('letsgetquoted-export-2026-09-12.zip');
  });
});

/**
 * The CSVs themselves. The promise this feature makes is that anything exported
 * re-imports as-is, so the headers and the value formats are the contract, not
 * an implementation detail.
 */
describe('the exported CSVs', () => {
  const supabase = {} as never;

  it('scopes the customer read to the given workspace', async () => {
    const { supabase: scoped, queries } = ownerContext();
    mocks.fetchAllPages.mockImplementation(async (page: (from: number, to: number) => unknown) => {
      page(0, 999);
      return [];
    });

    await buildClientsCsv(scoped as never, ACCOUNT_ID);

    expect(queries[0].table).toBe('clients');
    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
  });

  it('writes the customer headers the importer reads back', async () => {
    mocks.fetchAllPages.mockResolvedValue([
      { name: 'Sam Rivera', phone: '+15550000000', email: 'sam@example.com', address: '1 Test Street', notes: null },
    ]);

    const csv = await buildClientsCsv(supabase, ACCOUNT_ID);

    const [header, row] = csv.split('\n');
    expect(header).toBe('Name,Phone,Email,Address,Notes');
    expect(row).toContain('Sam Rivera');
    // A null note becomes an empty cell, not the text "null".
    expect(row).not.toContain('null');
  });

  it('writes money as a bare number so parseMoney reads it straight back', async () => {
    mocks.listServices.mockResolvedValue([
      { name: 'Tune-up', unit_price: 150, unit: 'visit', description: null, active: true },
      { name: 'Repair', unit_price: 99.5, unit: 'hour', description: null, active: false },
    ]);

    const csv = await buildServicesCsv(supabase, ACCOUNT_ID);
    const rows = csv.split('\n');

    expect(rows[0]).toBe('Name,Price,Unit,Description,Active');
    expect(rows[1]).toContain('150');
    expect(rows[1]).not.toContain('$');
    // Fractional cents keep two places; whole numbers stay clean.
    expect(rows[2]).toContain('99.50');
    expect(rows[1]).toContain('true');
    expect(rows[2]).toContain('false');
  });

  it('writes job status as the label the importer maps back, and dates as YYYY-MM-DD', async () => {
    mocks.listJobs.mockResolvedValue([
      {
        ref: 'J-1',
        client_name: 'Sam Rivera',
        client_phone: null,
        client_email: null,
        address: null,
        scope: 'Roof repair',
        status: 'in_progress',
        scheduled_for: '2026-09-20T14:30:00.000Z',
        estimated_hours: 4,
        quoted_amount: 1200,
      },
    ]);

    const csv = await buildJobsCsv(supabase, ACCOUNT_ID);
    const [header, row] = csv.split('\n');

    expect(header).toBe('Ref,Customer,Phone,Email,Address,Job / scope,Status,Date,Est. hours,Amount');
    expect(row).toContain('In progress');
    expect(row).toContain('2026-09-20');
    expect(row).not.toContain('14:30');
  });

  it('passes an unknown job status through rather than dropping the row', async () => {
    mocks.listJobs.mockResolvedValue([
      { ref: 'J-2', client_name: 'Sam', scope: null, status: 'on_hold', scheduled_for: null, estimated_hours: null, quoted_amount: null },
    ]);

    const csv = await buildJobsCsv(supabase, ACCOUNT_ID);

    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('on_hold');
  });

  it('joins invoices to their job through the account it was asked about', async () => {
    mocks.fetchAllPages.mockResolvedValue([
      { ref: 'INV-1', job_id: 'job-a', status: 'paid', total: 500, created_at: '2026-09-01T00:00:00.000Z' },
    ]);
    mocks.listJobs.mockResolvedValue([
      { id: 'job-a', client_name: 'Sam Rivera', client_phone: '+15550000000', client_email: null, address: '1 Test Street', scope: 'Roof repair' },
    ]);

    const csv = await buildInvoicesCsv(supabase, ACCOUNT_ID);
    const [header, row] = csv.split('\n');

    expect(header).toBe('Ref,Customer,Phone,Email,Address,Description,Date,Total,Status');
    expect(row).toContain('INV-1');
    expect(row).toContain('Sam Rivera');
    expect(mocks.listJobs).toHaveBeenCalledWith(supabase, ACCOUNT_ID, undefined, { fetchAll: true });
  });

  it('still writes an invoice whose job has been removed', async () => {
    mocks.fetchAllPages.mockResolvedValue([
      { ref: 'INV-2', job_id: 'job-gone', status: 'void', total: 0, created_at: '2026-09-01T00:00:00.000Z' },
    ]);
    mocks.listJobs.mockResolvedValue([]);

    const csv = await buildInvoicesCsv(supabase, ACCOUNT_ID);

    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('INV-2');
  });

  it('writes a header row and nothing else for an empty account', async () => {
    mocks.fetchAllPages.mockResolvedValue([]);
    mocks.listJobs.mockResolvedValue([]);
    mocks.listServices.mockResolvedValue([]);

    for (const build of [buildClientsCsv, buildServicesCsv, buildJobsCsv, buildInvoicesCsv]) {
      const csv = await build(supabase, ACCOUNT_ID);
      expect(csv.split('\n').filter((line) => line.trim())).toHaveLength(1);
    }
  });
});

describe('the accounting exports', () => {
  it('sends the QuickBooks file for the owner workspace only', async () => {
    ownerContext();

    const response = await exportQuickBooks();

    expect(mocks.buildQuickBooksCsv).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="letsgetquoted-quickbooks-export.csv"',
    );
  });

  it('builds no QuickBooks file for a caller without owner context', async () => {
    mocks.requireOwnerContext.mockRejectedValue(new Error('NEXT_REDIRECT;/login'));

    await expect(exportQuickBooks()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.buildQuickBooksCsv).not.toHaveBeenCalled();
  });

  /**
   * The expenses ledger is the one export gated on a capability rather than
   * ownership, so that an office user with reports.read can pull it and one
   * without cannot. Naming the capability is the whole check.
   */
  it('requires the reports.read capability for the expenses ledger', async () => {
    mocks.requireOfficeContext.mockResolvedValue({ supabase: {}, accountId: ACCOUNT_ID, accountTimeZone: 'America/Detroit' });

    await exportExpenses(request('https://app.letsgetquoted.com/api/export/expenses'));

    expect(mocks.requireOfficeContext).toHaveBeenCalledWith('reports.read');
    expect(mocks.listAllAccountExpenses).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, expect.anything());
  });

  it('reads no expenses when the capability check refuses', async () => {
    mocks.requireOfficeContext.mockRejectedValue(new Error('NEXT_REDIRECT;/dashboard'));

    await expect(exportExpenses(request('https://app.letsgetquoted.com/api/export/expenses'))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mocks.listAllAccountExpenses).not.toHaveBeenCalled();
  });

  it('defaults the expense filters to everything, and passes the ones that were asked for', async () => {
    mocks.requireOfficeContext.mockResolvedValue({ supabase: {}, accountId: ACCOUNT_ID, accountTimeZone: 'America/Detroit' });

    await exportExpenses(request('https://app.letsgetquoted.com/api/export/expenses'));
    expect(mocks.listAllAccountExpenses.mock.calls[0][2]).toMatchObject({ type: 'all', source: 'all' });

    mocks.listAllAccountExpenses.mockClear();
    await exportExpenses(
      request('https://app.letsgetquoted.com/api/export/expenses?type=material&supplier=all&jobId=job-a&dateFrom=2026-01-01'),
    );
    expect(mocks.listAllAccountExpenses.mock.calls[0][2]).toMatchObject({
      type: 'material',
      jobId: 'job-a',
      dateFrom: '2026-01-01',
      // "all" is the absence of a supplier filter, not a supplier named "all".
      supplier: undefined,
    });
  });

  it('stamps the expenses file with the day it was taken', async () => {
    mocks.requireOfficeContext.mockResolvedValue({ supabase: {}, accountId: ACCOUNT_ID, accountTimeZone: 'America/Detroit' });

    const response = await exportExpenses(request('https://app.letsgetquoted.com/api/export/expenses'));

    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="letsgetquoted-expenses-ledger-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it('renders the expense rows in the account time zone, not the server one', async () => {
    mocks.requireOfficeContext.mockResolvedValue({ supabase: {}, accountId: ACCOUNT_ID, accountTimeZone: 'America/Detroit' });

    await exportExpenses(request('https://app.letsgetquoted.com/api/export/expenses'));

    expect(mocks.generateExpensesCsv).toHaveBeenCalledWith(expect.anything(), 'America/Detroit');
  });
});

describe('the tax exports', () => {
  const taxRequest = (search = '') => request(`https://app.letsgetquoted.com/api/export/tax${search}`);

  it('defaults to the profit and loss for the current year', async () => {
    ownerContext();
    const thisYear = new Date().getFullYear();

    const response = await exportTax(taxRequest());

    expect(mocks.buildProfitAndLoss).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, thisYear);
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="letsgetquoted-profit-and-loss-${thisYear}.csv"`,
    );
  });

  it('builds the Schedule C worksheet when asked for it', async () => {
    ownerContext();

    const response = await exportTax(taxRequest('?type=schedule-c&year=2025'));

    expect(mocks.buildProfitAndLoss).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 2025);
    expect(mocks.buildScheduleCCsv).toHaveBeenCalled();
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="letsgetquoted-schedule-c-worksheet-2025.csv"',
    );
  });

  it('builds the 1099 prep list when asked for it', async () => {
    ownerContext();

    const response = await exportTax(taxRequest('?type=1099&year=2025'));

    expect(mocks.build1099PrepList).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 2025);
    expect(mocks.buildProfitAndLoss).not.toHaveBeenCalled();
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-1099-prep-2025.csv"');
  });

  it.each(['', '?year=', '?year=nineteen', '?year=abc'])(
    'falls back to the current year for %j rather than a filename with NaN in it',
    async (search) => {
      ownerContext();
      const thisYear = new Date().getFullYear();

      const response = await exportTax(taxRequest(search));

      expect(response.headers.get('content-disposition')).toContain(String(thisYear));
      expect(response.headers.get('content-disposition')).not.toContain('NaN');
    },
  );

  it('treats an unknown report type as the profit and loss rather than failing', async () => {
    ownerContext();

    const response = await exportTax(taxRequest('?type=balance-sheet'));

    expect(response.status).toBe(200);
    expect(mocks.buildProfitAndLossCsv).toHaveBeenCalled();
  });

  it('builds nothing for a caller without owner context', async () => {
    mocks.requireOwnerContext.mockRejectedValue(new Error('NEXT_REDIRECT;/login'));

    await expect(exportTax(taxRequest())).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.buildProfitAndLoss).not.toHaveBeenCalled();
    expect(mocks.build1099PrepList).not.toHaveBeenCalled();
  });
});
