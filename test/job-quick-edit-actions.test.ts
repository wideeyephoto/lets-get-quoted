import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  updateJobAddressAction,
  updateJobClientNameAction,
  updateJobContactAction,
} from '@/app/dashboard/jobs/actions';

const mocks = vi.hoisted(() => ({ owner: vi.fn(), feed: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.owner,
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: mocks.feed }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

describe('job quick edits against the hosted jobs contract', () => {
  let saved: Record<string, unknown>;
  let databaseError: { code: string; message: string } | null;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    databaseError = null;
    saved = { id: 'job-a', account_id: 'workspace-a', client_name: 'Test client', client_email: null, client_phone: null, address: null };
    from = vi.fn((table: string) => {
      expect(table).toBe('jobs');
      let patch: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const query = {
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        select: () => query,
        single: async () => {
          if (databaseError) return { data: null, error: databaseError };
          // Production rejects the entire update for an unknown column. The
          // actual jobs schema has these editable fields and no updated_at.
          const unknown = Object.keys(patch).find(key => !['client_name', 'client_email', 'client_phone', 'address'].includes(key));
          if (unknown) return { data: null, error: { code: 'PGRST204', message: `Unknown jobs column: ${unknown}` } };
          if (filters.account_id !== saved.account_id || filters.id !== saved.id) {
            return { data: null, error: { code: 'PGRST116', message: 'No job in this workspace' } };
          }
          saved = { ...saved, ...patch };
          return { data: saved, error: null };
        },
      };
      return query;
    });
    mocks.owner.mockResolvedValue({ supabase: { from }, accountId: 'workspace-a' });
    mocks.feed.mockResolvedValue(undefined);
  });

  it.each([
    { label: 'name', run: () => updateJobClientNameAction('job-a', '  Updated client  '), expected: { client_name: 'Updated client' } },
    { label: 'contact', run: () => updateJobContactAction('job-a', '  ', '  TEST@EXAMPLE.COM  '), expected: { client_phone: null, client_email: 'test@example.com' } },
    { label: 'address', run: () => updateJobAddressAction('job-a', '  123 Test Street  '), expected: { address: '123 Test Street' } },
  ])('saves the $label through the real scoped patch helper', async ({ run, expected }) => {
    await expect(run()).resolves.toMatchObject(expected);
    expect(saved).toMatchObject(expected);
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.feed).toHaveBeenCalledWith(expect.anything(), 'workspace-a', 'job-a', expect.objectContaining({ visibility: 'internal' }));
    expect(mocks.revalidate).toHaveBeenCalledWith('/dashboard/jobs/job-a');
  });

  it('refuses a blank client name before writing', async () => {
    await expect(updateJobClientNameAction('job-a', '  ')).rejects.toThrow('Client name cannot be blank');
    expect(from).not.toHaveBeenCalled();
    expect(mocks.feed).not.toHaveBeenCalled();
  });

  it('cannot update another workspace job', async () => {
    saved.account_id = 'workspace-b';
    await expect(updateJobContactAction('job-a', null, 'test@example.com')).rejects.toMatchObject({ code: 'PGRST116' });
    expect(saved.client_email).toBeNull();
    expect(mocks.feed).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('requires the owner context before any write', async () => {
    mocks.owner.mockRejectedValueOnce(new Error('Owner required'));
    await expect(updateJobContactAction('job-a', null, 'test@example.com')).rejects.toThrow('Owner required');
    expect(from).not.toHaveBeenCalled();
    expect(mocks.feed).not.toHaveBeenCalled();
  });

  it('preserves database failures without a success event or retry', async () => {
    databaseError = { code: '42501', message: 'Permission denied' };
    await expect(updateJobAddressAction('job-a', '123 Test Street')).rejects.toMatchObject(databaseError);
    expect(from).toHaveBeenCalledTimes(1);
    expect(saved.address).toBeNull();
    expect(mocks.feed).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
