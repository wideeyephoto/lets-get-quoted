import { describe, it, expect, vi } from 'vitest';
import {
  searchWorkspaceEverything,
  QUICK_ACTIONS,
  type WorkspaceSearchResults,
} from '@/lib/workspace-search';

describe('Workspace Smart Search', () => {
  it('returns default quick actions when query is empty', async () => {
    const mockSupabase = {} as any;
    const results = await searchWorkspaceEverything(mockSupabase, 'acc-123', '');

    expect(results.query).toBe('');
    expect(results.totalMatches).toBe(QUICK_ACTIONS.length);
    expect(results.sections.actions).toEqual(QUICK_ACTIONS);
    expect(results.sections.jobs).toHaveLength(0);
    expect(results.sections.clients).toHaveLength(0);
  });

  it('filters quick actions when search query matches action keywords', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    } as any;

    const results = await searchWorkspaceEverything(mockSupabase, 'acc-123', 'job');
    const matchedAction = results.sections.actions.find((a) => a.title === 'New Job');
    expect(matchedAction).toBeDefined();
  });

  it('queries Supabase and categorizes jobs, clients, crew, leads, and addresses', async () => {
    const mockJobs = [
      {
        id: 'job-1',
        ref: '1042',
        client_name: 'John Miller',
        client_phone: '5551234567',
        client_email: 'john@example.com',
        address: '142 Elm Street, Maplewood',
        scope: 'Broke Pipe Repair',
        status: 'in_progress',
        quoted_amount: 1250,
        scheduled_for: '2026-08-25',
      },
    ];

    const mockClients = [
      {
        id: 'client-1',
        name: 'John Miller',
        phone: '555-123-4567',
        email: 'john@example.com',
        address: '142 Elm Street, Maplewood',
        notes: 'VIP customer',
      },
    ];

    const mockCrew = [
      {
        id: 'crew-1',
        name: 'Mike Johnson',
        phone: '555-987-6543',
        email: 'mike@crew.com',
        role_label: 'Lead Tech',
        active: true,
        pay_type: 'hourly',
      },
    ];

    const mockLeads = [
      {
        id: 'lead-1',
        name: 'Johnny Appleseed',
        phone: '555-444-3333',
        email: 'appleseed@example.com',
        address: '88 Orchard Ln',
        project_type: 'Plumbing Inspection',
        message: 'Need an estimate asap',
        status: 'new',
        created_at: '2026-08-24T10:00:00Z',
      },
    ];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        let returnData: any[] = [];
        if (table === 'jobs') returnData = mockJobs;
        if (table === 'clients') returnData = mockClients;
        if (table === 'crew_members') returnData = mockCrew;
        if (table === 'leads') returnData = mockLeads;

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: returnData, error: null }),
        };
      }),
    } as any;

    const results: WorkspaceSearchResults = await searchWorkspaceEverything(
      mockSupabase,
      'acc-123',
      'John',
    );

    expect(results.query).toBe('John');
    expect(results.sections.jobs.length).toBeGreaterThan(0);
    expect(results.sections.jobs[0].title).toContain('1042');
    expect(results.sections.jobs[0].href).toBe('/dashboard/jobs/job-1');

    expect(results.sections.clients.length).toBeGreaterThan(0);
    expect(results.sections.clients[0].title).toBe('John Miller');
    expect(results.sections.clients[0].href).toBe('/dashboard/clients/client-1');

    expect(results.sections.crew.length).toBeGreaterThan(0);
    expect(results.sections.crew[0].title).toBe('Mike Johnson');
    expect(results.sections.crew[0].href).toBe('/dashboard/crew?tab=people&highlight=crew-1');

    expect(results.sections.leads.length).toBeGreaterThan(0);
    expect(results.sections.leads[0].title).toBe('Johnny Appleseed');
    expect(results.sections.leads[0].href).toBe('/dashboard/leads/lead-1');

    expect(results.unavailable).toEqual([]);
  });

  it('handles partial query failures gracefully without breaking other sections', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            limit: vi.fn().mockRejectedValue(new Error('Jobs table temporary error')),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'c-1', name: 'Alice Smith', phone: '555-111-2222', email: null, address: null, notes: null }],
            error: null,
          }),
        };
      }),
    } as any;

    const results = await searchWorkspaceEverything(mockSupabase, 'acc-123', 'Alice');

    // Jobs section gracefully fails and is marked unavailable
    expect(results.sections.jobs).toHaveLength(0);
    expect(results.unavailable).toContain('jobs');

    // Clients section still succeeds
    expect(results.sections.clients).toHaveLength(1);
    expect(results.sections.clients[0].title).toBe('Alice Smith');
  });
});
