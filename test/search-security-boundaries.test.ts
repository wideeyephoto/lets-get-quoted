import { describe, it, expect } from 'vitest';
import { searchWorkspaceEverything } from '@/lib/workspace-search';

describe('Search Workspace Capability Boundaries', () => {
  const createFluentMock = () => {
    const mockData = [
      { id: 'item-1', title: 'Test Item', client_name: 'Test Client', name: 'Test Name', ref: '101', address: '123 Main St' },
    ];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      ilike: () => builder,
      or: () => builder,
      limit: () => Promise.resolve({ data: mockData, error: null }),
      then: (onfulfilled: any, onrejected: any) =>
        Promise.resolve({ data: mockData, error: null }).then(onfulfilled, onrejected),
    };
    return {
      from: () => builder,
    };
  };

  it('omits unauthorized sections when permissions are restricted', async () => {
    const mockSupabase = createFluentMock() as any;

    const results = await searchWorkspaceEverything(mockSupabase, 'acc-1', 'test query', {
      permissions: {
        canReadJobs: true,
        canReadClients: false, // Office worker without clients.read
        canReadCrew: false,    // Office worker without crew.read
        canReadLeads: true,
      },
    });

    expect(results.unavailable).toContain('clients');
    expect(results.unavailable).toContain('crew');
    expect(results.unavailable).not.toContain('jobs');
    expect(results.unavailable).not.toContain('leads');

    expect(results.sections.clients).toHaveLength(0);
    expect(results.sections.crew).toHaveLength(0);
    expect(results.sections.jobs.length).toBeGreaterThan(0);
  });
});
