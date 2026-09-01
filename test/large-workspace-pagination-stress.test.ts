import { describe, it, expect } from 'vitest';
import { fetchAllPages, processPages, DEFAULT_PAGE_SIZE } from '../src/lib/pagination';
import { listJobs } from '../src/lib/jobs';
import { listClientsWithStats } from '../src/lib/clients';

describe('Large Workspace & Pagination Stress Test', () => {
  it('proves fetchAllPages seamlessly iterates across multiple 1,000-row pages to recover 2,500 rows', async () => {
    const TOTAL_ROWS = 2500;
    const generatedRows = Array.from({ length: TOTAL_ROWS }, (_, i) => ({
      id: `row-${i + 1}`,
      ref: `J-${1000 + i}`,
      amount: 150 + (i % 50),
    }));

    // Mock range query runner simulating PostgREST range ceiling
    const mockQueryRunner = async (from: number, to: number) => {
      const slice = generatedRows.slice(from, to + 1);
      return { data: slice, error: null };
    };

    const results = await fetchAllPages(mockQueryRunner, DEFAULT_PAGE_SIZE);
    expect(results.length).toBe(TOTAL_ROWS);
    expect(results[0].id).toBe('row-1');
    expect(results[TOTAL_ROWS - 1].id).toBe(`row-${TOTAL_ROWS}`);
  });

  it('proves processPages iterates batches without holding all items in memory simultaneously', async () => {
    const TOTAL_ROWS = 3000;
    const batchSizes: number[] = [];

    const mockQueryRunner = async (from: number, to: number) => {
      const length = Math.min(to - from + 1, Math.max(0, TOTAL_ROWS - from));
      const slice = Array.from({ length }, (_, i) => ({ id: `row-${from + i}` }));
      return { data: slice, error: null };
    };

    const totalProcessed = await processPages(
      mockQueryRunner,
      (batch) => {
        batchSizes.push(batch.length);
      },
      1000,
    );

    expect(totalProcessed).toBe(TOTAL_ROWS);
    expect(batchSizes).toEqual([1000, 1000, 1000]);
  });

  it('proves listJobs with fetchAll option traverses all pages', async () => {
    const mockJobs = Array.from({ length: 1500 }, (_, i) => ({
      id: `job-${i + 1}`,
      account_id: 'acc-large-tenant',
      title: `Job ${i + 1}`,
      status: 'in_progress',
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const createQueryBuilder = (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        order: () => q,
        range: (from: number, to: number) => ({
          data: table === 'jobs' ? mockJobs.slice(from, to + 1) : [],
          error: null,
        }),
      };
      return q;
    };

    const mockSupabase = {
      from: (table: string) => createQueryBuilder(table),
    };

    const jobs = await listJobs(mockSupabase as any, 'acc-large-tenant', undefined, { fetchAll: true });
    expect(jobs.length).toBe(1500);
  });

  it('proves listClientsWithStats with fetchAll option loads all clients and job stats', async () => {
    const mockClients = Array.from({ length: 1200 }, (_, i) => ({
      id: `client-${i + 1}`,
      account_id: 'acc-large-tenant',
      name: `Client ${i + 1}`,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const mockJobs = Array.from({ length: 1400 }, (_, i) => ({
      client_id: `client-${(i % 1200) + 1}`,
      quoted_amount: 500,
      created_at: new Date(Date.now() - i * 60000).toISOString(),
      scheduled_for: '2026-09-10',
    }));

    const createQueryBuilder = (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        in: () => q,
        not: () => q,
        range: (from: number, to: number) => ({
          data: table === 'clients' ? mockClients.slice(from, to + 1) : mockJobs.slice(from, to + 1),
          error: null,
        }),
      };
      return q;
    };

    const mockSupabase = {
      from: (table: string) => createQueryBuilder(table),
    };

    const clientsWithStats = await listClientsWithStats(mockSupabase as any, 'acc-large-tenant', { fetchAll: true });
    expect(clientsWithStats.length).toBe(1200);
    expect(clientsWithStats[0].jobCount).toBeGreaterThanOrEqual(1);
  });
});
