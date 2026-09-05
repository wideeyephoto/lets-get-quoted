import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockRow = Record<string, unknown>;

const mockDb: {
  memberships: MockRow[];
  office_capabilities: MockRow[];
  office_member_capabilities: MockRow[];
  office_invitations: MockRow[];
  workspace_entitlements: MockRow[];
  account_events: MockRow[];
} = {
  memberships: [],
  office_capabilities: [],
  office_member_capabilities: [],
  office_invitations: [],
  workspace_entitlements: [],
  account_events: [],
};

const ACCOUNT_ID = 'acc-test-1234';
const OWNER_USER_ID = 'user-owner-1';
const OFFICE_USER_ID = 'user-office-1';
const CREW_USER_ID = 'user-crew-1';

function createMockChain(tableName: string) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};

  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    filters[col] = val;
    return chain;
  };
  chain.in = (col: string, vals: unknown[]) => {
    (filters as Record<string, unknown[]>)[`${col}:in`] = vals;
    return chain;
  };
  chain.is = () => chain;
  chain.order = () => chain;
  chain.maybeSingle = () => {
    let rows = (mockDb as Record<string, MockRow[]>)[tableName] || [];
    for (const [k, v] of Object.entries(filters)) {
      if (k.endsWith(':in')) {
        const col = k.slice(0, -3);
        rows = rows.filter((r) => (v as unknown[]).includes(r[col]));
      } else {
        rows = rows.filter((r) => r[k] === v);
      }
    }
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  };
  chain.delete = () => {
    const p = Promise.resolve().then(() => {
      let rows = (mockDb as Record<string, MockRow[]>)[tableName] || [];
      const beforeCount = rows.length;
      rows = rows.filter((r) => {
        for (const [k, v] of Object.entries(filters)) {
          if (r[k] === v) return false;
        }
        return true;
      });
      (mockDb as Record<string, MockRow[]>)[tableName] = rows;
      return { data: null, error: null, count: beforeCount - rows.length };
    });
    return Object.assign(p, chain);
  };
  chain.insert = (newRows: MockRow | MockRow[]) => {
    const list = Array.isArray(newRows) ? newRows : [newRows];
    (mockDb as Record<string, MockRow[]>)[tableName].push(...list);
    return Promise.resolve({ data: list, error: null });
  };

  (chain as { then: unknown }).then = (
    onfulfilled: (res: { data: MockRow[]; error: null }) => unknown,
  ) => {
    let rows = (mockDb as Record<string, MockRow[]>)[tableName] || [];
    for (const [k, v] of Object.entries(filters)) {
      if (k.endsWith(':in')) {
        const col = k.slice(0, -3);
        rows = rows.filter((r) => (v as unknown[]).includes(r[col]));
      } else {
        rows = rows.filter((r) => r[k] === v);
      }
    }
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
  };

  return chain;
}

const mockSupabase = {
  from: (name: string) => createMockChain(name),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: OWNER_USER_ID, email: 'owner@acme.test' } },
      error: null,
    }),
    admin: {
      getUserById: vi.fn().mockImplementation((uid: string) =>
        Promise.resolve({
          data: { user: { id: uid, email: `${uid}@acme.test` } },
          error: null,
        }),
      ),
    },
  },
  rpc: vi.fn().mockImplementation((fn: string) => {
    if (fn === 'office_seat_usage') {
      return { maybeSingle: () => Promise.resolve({ data: { office_limit: 5 }, error: null }) };
    }
    return Promise.resolve({ data: true, error: null });
  }),
};

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockSupabase,
  requireOfficeContext: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    accountId: ACCOUNT_ID,
    userId: OWNER_USER_ID,
    userEmail: 'owner@acme.test',
    role: 'owner',
  }),
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn().mockImplementation((event: MockRow) => {
    mockDb.account_events.push(event);
    return Promise.resolve();
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const { updateOfficeMemberCapabilitiesAction } = await import(
  '@/app/dashboard/settings/office-team-actions'
);
const { loadOfficeTeam } = await import('@/lib/office-team');

describe('Office Permissions Assignment', () => {
  beforeEach(() => {
    mockDb.memberships = [
      { id: 'm-owner', account_id: ACCOUNT_ID, user_id: OWNER_USER_ID, role: 'owner', created_at: '2026-01-01' },
      { id: 'm-office', account_id: ACCOUNT_ID, user_id: OFFICE_USER_ID, role: 'office', created_at: '2026-02-01' },
      { id: 'm-crew', account_id: ACCOUNT_ID, user_id: CREW_USER_ID, role: 'crew', created_at: '2026-03-01' },
    ];
    mockDb.office_member_capabilities = [
      { account_id: ACCOUNT_ID, user_id: OFFICE_USER_ID, capability: 'leads.read' },
    ];
    mockDb.account_events = [];
  });

  it('refuses updating when targetUserId is missing', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: '',
      capabilities: ['leads.read'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Select a team member');
    }
  });

  it('refuses updating an owner', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: OWNER_USER_ID,
      capabilities: ['leads.read'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Account owners hold all workspace permissions');
    }
  });

  it('refuses updating a crew member', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: CREW_USER_ID,
      capabilities: ['leads.read'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('only be customized for office');
    }
  });

  it('refuses updating an unknown user', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: 'user-nonexistent',
      capabilities: ['leads.read'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('not a member');
    }
  });

  it('updates capabilities for an office member, filtering invalid keys', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: OFFICE_USER_ID,
      capabilities: ['leads.read', 'leads.write', 'schedule.write', 'invalid.capability', 'hacker.root'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capabilities).toEqual(['leads.read', 'leads.write', 'schedule.write']);
    }

    const rows = mockDb.office_member_capabilities.filter(
      (r) => r.account_id === ACCOUNT_ID && r.user_id === OFFICE_USER_ID,
    );
    expect(rows.map((r) => r.capability).sort()).toEqual([
      'leads.read',
      'leads.write',
      'schedule.write',
    ]);

    expect(mockDb.account_events).toHaveLength(1);
    expect(mockDb.account_events[0].kind).toBe('office_permissions_updated');
  });

  it('allows clearing all capabilities', async () => {
    const result = await updateOfficeMemberCapabilitiesAction({
      targetUserId: OFFICE_USER_ID,
      capabilities: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capabilities).toEqual([]);
    }

    const rows = mockDb.office_member_capabilities.filter(
      (r) => r.account_id === ACCOUNT_ID && r.user_id === OFFICE_USER_ID,
    );
    expect(rows).toHaveLength(0);
  });

  it('loadOfficeTeam loads member capabilities accurately', async () => {
    mockDb.office_member_capabilities = [
      { account_id: ACCOUNT_ID, user_id: OFFICE_USER_ID, capability: 'leads.read' },
      { account_id: ACCOUNT_ID, user_id: OFFICE_USER_ID, capability: 'schedule.write' },
      { account_id: ACCOUNT_ID, user_id: OFFICE_USER_ID, capability: 'invoices.read' },
    ];

    const team = await loadOfficeTeam(mockSupabase as any, ACCOUNT_ID);
    const officeMember = team.members.find((m) => m.userId === OFFICE_USER_ID);

    expect(officeMember).toBeDefined();
    expect(officeMember?.capabilities).toEqual(['leads.read', 'schedule.write', 'invoices.read']);
  });
});
