import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockRow = Record<string, unknown>;

const mockDb: {
  office_capabilities: MockRow[];
  office_member_capabilities: MockRow[];
} = {
  office_capabilities: [],
  office_member_capabilities: [],
};

function table(name: string) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    filters[col] = val;
    return chain;
  };
  (chain as { then: unknown }).then = (
    onfulfilled: (res: { data: MockRow[]; error: null }) => unknown,
  ) => {
    let rows = (mockDb as Record<string, MockRow[]>)[name] || [];
    for (const [k, v] of Object.entries(filters)) {
      rows = rows.filter((r) => r[k] === v);
    }
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
  };
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (name: string) => table(name),
  }),
}));

const { loadHeldCapabilities } = await import('@/lib/auth');

describe('Office Member Capabilities Security & Isolation', () => {
  const ACCOUNT_A = 'acc-1111-1111';
  const USER_BOOKKEEPER = 'user-bookkeeper';
  const USER_SCHEDULER = 'user-scheduler';

  beforeEach(() => {
    mockDb.office_capabilities = [
      { capability: 'leads.read', enabled: true },
      { capability: 'jobs.read', enabled: true },
      { capability: 'schedule.write', enabled: true },
      { capability: 'invoices.read', enabled: true },
      { capability: 'crew.read', enabled: true },
      { capability: 'crew_pay.read', enabled: false }, // Globally disabled by default
    ];

    mockDb.office_member_capabilities = [
      // Bookkeeper has invoices.read and crew.read
      { account_id: ACCOUNT_A, user_id: USER_BOOKKEEPER, capability: 'invoices.read' },
      { account_id: ACCOUNT_A, user_id: USER_BOOKKEEPER, capability: 'crew.read' },
      { account_id: ACCOUNT_A, user_id: USER_BOOKKEEPER, capability: 'crew_pay.read' }, // Granted locally, but disabled globally

      // Scheduler has leads.read, jobs.read, schedule.write
      { account_id: ACCOUNT_A, user_id: USER_SCHEDULER, capability: 'leads.read' },
      { account_id: ACCOUNT_A, user_id: USER_SCHEDULER, capability: 'jobs.read' },
      { account_id: ACCOUNT_A, user_id: USER_SCHEDULER, capability: 'schedule.write' },
    ];
  });

  it('grants an owner ALL capabilities unconditionally', async () => {
    const caps = await loadHeldCapabilities('owner', ACCOUNT_A, 'user-owner');
    expect(caps.has('any.capability.at.all')).toBe(true);
    expect(caps.has('crew_pay.read')).toBe(true);
  });

  it('grants a crew member no office capabilities', async () => {
    const caps = await loadHeldCapabilities('crew', ACCOUNT_A, 'user-crew');
    expect(caps.size).toBe(0);
  });

  it('isolates different office users within the same account based on explicit grants', async () => {
    const bookkeeperCaps = await loadHeldCapabilities('office', ACCOUNT_A, USER_BOOKKEEPER);
    const schedulerCaps = await loadHeldCapabilities('office', ACCOUNT_A, USER_SCHEDULER);

    // Bookkeeper checks
    expect(bookkeeperCaps.has('invoices.read')).toBe(true);
    expect(bookkeeperCaps.has('crew.read')).toBe(true);
    expect(bookkeeperCaps.has('schedule.write')).toBe(false);
    expect(bookkeeperCaps.has('jobs.read')).toBe(false);

    // Scheduler checks
    expect(schedulerCaps.has('schedule.write')).toBe(true);
    expect(schedulerCaps.has('jobs.read')).toBe(true);
    expect(schedulerCaps.has('invoices.read')).toBe(false);
    expect(schedulerCaps.has('crew.read')).toBe(false);
  });

  it('refuses capability if locally granted but globally disabled in office_capabilities', async () => {
    const bookkeeperCaps = await loadHeldCapabilities('office', ACCOUNT_A, USER_BOOKKEEPER);
    // crew_pay.read was granted in office_member_capabilities, but enabled=false in office_capabilities
    expect(bookkeeperCaps.has('crew_pay.read')).toBe(false);
  });

  it('returns empty capability set for an un-granted office user in an account', async () => {
    const ungrantedCaps = await loadHeldCapabilities('office', ACCOUNT_A, 'user-ungranted');
    expect(ungrantedCaps.size).toBe(0);
  });
});
