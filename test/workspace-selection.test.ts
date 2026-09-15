import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cookie: '', set: vi.fn(), eq: vi.fn(), member: null as null | { account_id: string; role: string; deactivated_at: string | null },
  user: { id: 'brett', email: 'brett@example.com' } as { id: string; email: string } | null,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: state.cookie }), set: state.set }) }));
vi.mock('next/navigation', () => ({ unstable_rethrow: (t: unknown) => { const d = (t as { digest?: unknown })?.digest; if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) throw t; }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => {
  const query = { select: () => query, eq: (key: string, value: string) => { state.eq(key, value); return query; }, maybeSingle: async () => ({ data: state.member, error: null }) };
  return { from: () => query };
} }));

import { preferredWorkspace, selectWorkspaceMembership } from '@/lib/workspace-selection';
import { selectWorkspaceAction } from '@/app/workspaces/actions';

const owner = { account_id: 'brokepipes', role: 'owner', deactivated_at: null };
const office = { account_id: 'midwest', role: 'office', deactivated_at: null };
beforeEach(() => { vi.clearAllMocks(); state.cookie = ''; state.member = office; state.user = { id: 'brett', email: 'brett@example.com' }; });

describe('workspace selection', () => {
  it('honors an office selection even when the same person owns another business', () => {
    expect(selectWorkspaceMembership([owner, office], 'midwest')).toBe(office);
    expect(selectWorkspaceMembership([owner, office], 'brokepipes')).toBe(owner);
  });
  it('keeps the owner default when no preference exists', () => {
    expect(selectWorkspaceMembership([office, owner], null)).toBe(owner);
  });
  it('does not grant a forged or deactivated membership', () => {
    expect(selectWorkspaceMembership([owner, office], 'outsider')).toBe(owner);
    expect(selectWorkspaceMembership([owner, { ...office, deactivated_at: '2026-09-08' }], 'midwest')).toBe(owner);
    expect(selectWorkspaceMembership([{ ...office, deactivated_at: '2026-09-08' }], 'midwest')).toBeNull();
  });
  it('binds the preference to the signed-in user', async () => {
    state.cookie = 'brett:midwest';
    expect(await preferredWorkspace('brett')).toBe('midwest');
    expect(await preferredWorkspace('someone-else')).toBeNull();
  });
  it('validates the selected membership before setting the cookie and preserves office role', async () => {
    const form = new FormData(); form.set('accountId', 'midwest');
    await expect(selectWorkspaceAction(form)).rejects.toThrow('redirect:/office-access');
    expect(state.eq).toHaveBeenCalledWith('user_id', 'brett');
    expect(state.eq).toHaveBeenCalledWith('account_id', 'midwest');
    expect(state.set).toHaveBeenCalledWith('lgq_workspace', 'brett:midwest', expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
  });
  it.each([null, { ...office, deactivated_at: '2026-09-08' }, { ...office, role: 'crew' }])('refuses unavailable membership %j', async (member) => {
    state.member = member;
    const form = new FormData(); form.set('accountId', 'midwest');
    await expect(selectWorkspaceAction(form)).rejects.toThrow('not available');
    expect(state.set).not.toHaveBeenCalled();
  });
  it('requires sign-in before reading or selecting memberships', async () => {
    state.user = null;
    await expect(selectWorkspaceAction(new FormData())).rejects.toThrow('redirect:/login');
    expect(state.eq).not.toHaveBeenCalled(); expect(state.set).not.toHaveBeenCalled();
  });
});
