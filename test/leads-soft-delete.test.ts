import { describe, it, expect, vi } from 'vitest';
import {
  listLeads,
  getLead,
  getLeadByConvertedJob,
  expireStaleLeads,
  type Lead,
} from '@/lib/leads';
import { getMapPins } from '@/lib/map-pins';

function createMockLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    account_id: 'acct-1',
    source: 'website_form',
    status: 'new',
    name: 'Jane Doe',
    phone: '555-0100',
    email: 'jane@example.com',
    address: '123 Main St',
    project_type: 'Kitchen Remodel',
    estimated_hours: 10,
    quote_visit: null,
    message: 'Need estimate',
    photo_paths: [],
    source_page: null,
    converted_job: null,
    client_id: null,
    triage: { score: 'hot', flags: [] },
    lat: 42.123,
    lng: -71.456,
    geocoded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Lead Soft-Deletion Filtering & Map Pin Deduplication', () => {
  describe('listLeads', () => {
    it('applies .is("deleted_at", null) filter to exclude soft-deleted leads', async () => {
      const isCalls: Array<[string, any]> = [];
      const mockQuery: any = {
        select: vi.fn(() => mockQuery),
        eq: vi.fn(() => mockQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockQuery;
        }),
        order: vi.fn(() => mockQuery),
        then: vi.fn((resolve) =>
          resolve({
            data: [
              createMockLead({ id: 'lead-active', deleted_at: null }),
            ],
            error: null,
          })
        ),
      };

      const mockSupabase: any = {
        from: vi.fn(() => mockQuery),
      };

      const leads = await listLeads(mockSupabase, 'acct-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('leads');
      expect(mockQuery.eq).toHaveBeenCalledWith('account_id', 'acct-1');
      expect(isCalls).toContainEqual(['deleted_at', null]);
      expect(leads).toHaveLength(1);
      expect(leads[0].id).toBe('lead-active');
    });
  });

  describe('getLead', () => {
    it('filters out soft-deleted lead by default (.is("deleted_at", null))', async () => {
      const isCalls: Array<[string, any]> = [];
      const mockQuery: any = {
        select: vi.fn(() => mockQuery),
        eq: vi.fn(() => mockQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockQuery;
        }),
        maybeSingle: vi.fn(async () => ({
          data: null, // filtered out by deleted_at is null
          error: null,
        })),
      };

      const mockSupabase: any = {
        from: vi.fn(() => mockQuery),
      };

      const lead = await getLead(mockSupabase, 'acct-1', 'lead-trashed');
      expect(isCalls).toContainEqual(['deleted_at', null]);
      expect(lead).toBeNull();
    });

    it('allows includeDeleted: true for admin recovery and audit queries', async () => {
      const isCalls: Array<[string, any]> = [];
      const mockLead = createMockLead({ id: 'lead-trashed', deleted_at: '2026-09-05T00:00:00Z' });
      const mockQuery: any = {
        select: vi.fn(() => mockQuery),
        eq: vi.fn(() => mockQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockQuery;
        }),
        maybeSingle: vi.fn(async () => ({
          data: mockLead,
          error: null,
        })),
      };

      const mockSupabase: any = {
        from: vi.fn(() => mockQuery),
      };

      const lead = await getLead(mockSupabase, 'acct-1', 'lead-trashed', { includeDeleted: true });
      expect(isCalls).not.toContainEqual(['deleted_at', null]);
      expect(lead).toEqual(mockLead);
    });
  });

  describe('getLeadByConvertedJob', () => {
    it('applies .is("deleted_at", null) filter', async () => {
      const isCalls: Array<[string, any]> = [];
      const mockQuery: any = {
        select: vi.fn(() => mockQuery),
        eq: vi.fn(() => mockQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockQuery;
        }),
        maybeSingle: vi.fn(async () => ({
          data: createMockLead({ id: 'lead-active', converted_job: 'job-1', deleted_at: null }),
          error: null,
        })),
      };

      const mockSupabase: any = {
        from: vi.fn(() => mockQuery),
      };

      const lead = await getLeadByConvertedJob(mockSupabase, 'acct-1', 'job-1');
      expect(isCalls).toContainEqual(['deleted_at', null]);
      expect(lead?.id).toBe('lead-active');
    });
  });

  describe('expireStaleLeads', () => {
    it('does not issue an UPDATE when no stale candidates exist (avoids write-on-GET)', async () => {
      const updateFn = vi.fn();
      const mockSelectQuery: any = {
        select: vi.fn(() => mockSelectQuery),
        eq: vi.fn(() => mockSelectQuery),
        in: vi.fn(() => mockSelectQuery),
        is: vi.fn(() => mockSelectQuery),
        lt: vi.fn(() => mockSelectQuery),
        limit: vi.fn(async () => ({
          data: [], // No candidates found!
          error: null,
        })),
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { lead_lost_after_days: 30 },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: mockSelectQuery.select,
            update: updateFn,
          };
        }),
      };

      await expireStaleLeads(mockSupabase, 'acct-1', 30);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('filters .is("deleted_at", null) and issues UPDATE only when candidates exist', async () => {
      const isCalls: Array<[string, any]> = [];
      const updatePayloads: any[] = [];
      const mockUpdateQuery: any = {
        eq: vi.fn(() => mockUpdateQuery),
        in: vi.fn(() => mockUpdateQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockUpdateQuery;
        }),
        lt: vi.fn(async () => ({ error: null })),
      };

      const mockSelectQuery: any = {
        select: vi.fn(() => mockSelectQuery),
        eq: vi.fn(() => mockSelectQuery),
        in: vi.fn(() => mockSelectQuery),
        is: vi.fn((col, val) => {
          isCalls.push([col, val]);
          return mockSelectQuery;
        }),
        lt: vi.fn(() => mockSelectQuery),
        limit: vi.fn(async () => ({
          data: [{ id: 'stale-lead-1' }],
          error: null,
        })),
      };

      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: { lead_lost_after_days: 30 },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: mockSelectQuery.select,
            update: vi.fn((payload) => {
              updatePayloads.push(payload);
              return mockUpdateQuery;
            }),
          };
        }),
      };

      await expireStaleLeads(mockSupabase, 'acct-1', 30);
      expect(isCalls).toContainEqual(['deleted_at', null]);
      expect(updatePayloads).toHaveLength(1);
      expect(updatePayloads[0].status).toBe('lost');
    });
  });

  describe('getMapPins deduplication', () => {
    it('uses preloaded leads and jobs without issuing duplicate network queries', async () => {
      const activeLead = createMockLead({ id: 'lead-mapped', lat: 42.0, lng: -71.0 });
      const fromSpy = vi.fn();

      const mockSupabase: any = {
        from: fromSpy,
      };

      const preloadedLeads = [activeLead];
      const preloadedJobs: any[] = [];

      const pins = await getMapPins(mockSupabase, 'acct-1', {
        leads: preloadedLeads,
        jobs: preloadedJobs,
      });

      // fromSpy should not have been called for 'leads' or 'jobs' table
      const queriedTables = fromSpy.mock.calls.map((call) => call[0]);
      expect(queriedTables).not.toContain('leads');
      expect(queriedTables).not.toContain('jobs');

      expect(pins).toHaveLength(1);
      expect(pins[0].id).toBe('lead-lead-mapped');
      expect(pins[0].lat).toBe(42.0);
      expect(pins[0].lng).toBe(-71.0);
    });
  });
});
