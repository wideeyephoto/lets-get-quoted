import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadRevenueAnalyticsData } from '@/lib/revenue-analytics-data';
import { buildProfitAndLoss } from '@/lib/tax-reports';

// Allowed PostgreSQL payment_status enum values defined in the database schema
const VALID_PAYMENT_STATUS_ENUM_VALUES = new Set([
  'requested',
  'processing',
  'paid',
  'failed',
  'refunded',
  'disputed',
]);

type QueryInvocation = {
  table: string;
  select?: string;
  eqFilters: Record<string, any>;
  inFilters: Record<string, any[]>;
  gteFilters: Record<string, any>;
  ltFilters: Record<string, any>;
  orderField?: string;
  range?: [number, number];
};

function createMockSupabase(): { client: SupabaseClient; queries: QueryInvocation[] } {
  const queries: QueryInvocation[] = [];

  const createQueryBuilder = (tableName: string) => {
    const current: QueryInvocation = {
      table: tableName,
      eqFilters: {},
      inFilters: {},
      gteFilters: {},
      ltFilters: {},
    };
    queries.push(current);

    const builder: any = {
      select: (columns: string) => {
        current.select = columns;
        return builder;
      },
      eq: (col: string, val: any) => {
        current.eqFilters[col] = val;
        return builder;
      },
      in: (col: string, vals: any[]) => {
        current.inFilters[col] = vals;
        return builder;
      },
      gte: (col: string, val: any) => {
        current.gteFilters[col] = val;
        return builder;
      },
      lt: (col: string, val: any) => {
        current.ltFilters[col] = val;
        return builder;
      },
      order: (col: string, _opts?: any) => {
        current.orderField = col;
        return builder;
      },
      range: (from: number, to: number) => {
        current.range = [from, to];
        // fetchAllPages stops when returned batch is less than PAGE_SIZE (1,000)
        return Promise.resolve({ data: [], error: null });
      },
    };

    return builder;
  };

  const client = {
    from: (table: string) => createQueryBuilder(table),
  } as unknown as SupabaseClient;

  return { client, queries };
}

describe('payment reporting query contracts (PostgreSQL enum integrity)', () => {
  it('does not contain references to the invalid partially_refunded enum value in source code', () => {
    const srcDir = join(process.cwd(), 'src', 'lib');
    const revenueAnalyticsSrc = readFileSync(join(srcDir, 'revenue-analytics-data.ts'), 'utf-8');
    const taxReportsSrc = readFileSync(join(srcDir, 'tax-reports.ts'), 'utf-8');

    expect(revenueAnalyticsSrc).not.toContain('partially_refunded');
    expect(taxReportsSrc).not.toContain('partially_refunded');
  });

  it('loadRevenueAnalyticsData only queries valid database payment_status enum values', async () => {
    const { client, queries } = createMockSupabase();
    await loadRevenueAnalyticsData(client, 'acc_test_contract_123');

    const paymentQueries = queries.filter((q) => q.table === 'payments');
    expect(paymentQueries.length).toBeGreaterThan(0);

    for (const q of paymentQueries) {
      expect(q.eqFilters.account_id).toBe('acc_test_contract_123');
      expect(q.inFilters.status).toBeDefined();
      expect(q.inFilters.status).toEqual(['paid', 'refunded']);

      // Assert that every status value queried is a valid database enum value
      for (const status of q.inFilters.status) {
        expect(
          VALID_PAYMENT_STATUS_ENUM_VALUES.has(status),
          `Status '${status}' is not a valid PostgreSQL payment_status enum value`,
        ).toBe(true);
      }

      // Assert that invalid status is never included
      expect(q.inFilters.status).not.toContain('partially_refunded');
    }
  });

  it('buildProfitAndLoss only queries valid database payment_status enum values', async () => {
    const { client, queries } = createMockSupabase();
    await buildProfitAndLoss(client, 'acc_test_contract_123', 2026);

    const paymentQueries = queries.filter((q) => q.table === 'payments');
    expect(paymentQueries.length).toBeGreaterThan(0);

    for (const q of paymentQueries) {
      expect(q.eqFilters.account_id).toBe('acc_test_contract_123');
      expect(q.inFilters.status).toBeDefined();
      expect(q.inFilters.status).toEqual(['paid', 'refunded']);

      // Assert that every status value queried is a valid database enum value
      for (const status of q.inFilters.status) {
        expect(
          VALID_PAYMENT_STATUS_ENUM_VALUES.has(status),
          `Status '${status}' is not a valid PostgreSQL payment_status enum value`,
        ).toBe(true);
      }

      // Assert that invalid status is never included
      expect(q.inFilters.status).not.toContain('partially_refunded');
    }
  });
});
