import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireMfaPermission: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireMfaPermission: mocks.requireMfaPermission }));
vi.mock('@/lib/admin', () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock('@/lib/on-call-paging', () => ({ dispatchOnCallPage: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));

import { deleteIncidentAction, logIncidentAction, updateIncidentDescriptionAction } from '@/app/admin/incidents/actions';

const ID = '11111111-1111-4111-8111-111111111111';
const row = { id: ID, title: '[REHEARSAL] Operator cycle', description: 'Updated public text', root_cause: 'Private cause', owner: 'owner@example.invalid', published: false };
const query = {
  insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn(), maybeSingle: vi.fn(),
};
const admin = { from: vi.fn(() => query) };
const actor = { admin, adminEmail: 'operator@example.invalid', staff: { id: 'staff-1' }, permission: 'ops.manage' };
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('incident operator actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMfaPermission.mockResolvedValue(actor);
    query.single.mockResolvedValue({ data: row, error: null });
    query.maybeSingle.mockResolvedValue({ data: row, error: null });
  });

  it.each(['log', 'edit', 'delete'] as const)('rejects %s before database access when ops/MFA authorization fails', async (action) => {
    mocks.requireMfaPermission.mockRejectedValue(new Error('MFA or permission required'));
    const operation = action === 'log' ? logIncidentAction(form())
      : action === 'edit' ? updateIncidentDescriptionAction(ID, form()) : deleteIncidentAction(ID, form({ confirm_delete: 'yes' }));
    await expect(operation).rejects.toThrow('MFA or permission required');
    expect(mocks.requireMfaPermission).toHaveBeenCalledWith('ops.manage');
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it('stores a root cause with a new unpublished incident', async () => {
    await expect(logIncidentAction(form({ title: row.title, kind: 'incident', severity: 'warning', root_cause: ' Private cause ' })))
      .rejects.toThrow('done=logged');
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ root_cause: 'Private cause', published: false, created_by: actor.adminEmail }));
  });

  it('edits only the description and records the acting staff member without publishing a draft', async () => {
    await expect(updateIncidentDescriptionAction(ID, form({ description: row.description, published: 'true', owner: 'forged' })))
      .rejects.toThrow('done=updated');
    expect(query.update).toHaveBeenCalledWith({ description: row.description });
    expect(query.eq).toHaveBeenCalledWith('id', ID);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(admin, actor, expect.objectContaining({ action: 'platform_incident_update', targetId: ID, meta: expect.objectContaining({ published: false }) }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/status');
  });

  it('requires explicit confirmation before deletion', async () => {
    await expect(deleteIncidentAction(ID, form())).rejects.toThrow('error=delete_confirmation');
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('refuses deletion when the incident was published or removed after the page loaded', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(deleteIncidentAction(ID, form({ confirm_delete: 'yes' }))).rejects.toThrow('error=delete_unavailable');
    expect(query.eq).toHaveBeenCalledWith('id', ID);
    expect(query.eq).toHaveBeenCalledWith('published', false);
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not claim a successful deletion on database failure', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(deleteIncidentAction(ID, form({ confirm_delete: 'yes' }))).rejects.toThrow('error=failed');
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
  });

  it('deletes only the selected unpublished row and retains an attributed audit record', async () => {
    await expect(deleteIncidentAction(ID, form({ confirm_delete: 'yes' }))).rejects.toThrow('done=deleted');
    expect(query.eq.mock.calls).toEqual([['id', ID], ['published', false]]);
    expect(mocks.logAdminAction).toHaveBeenCalledWith(admin, actor, expect.objectContaining({ action: 'platform_incident_delete', targetId: ID, before: row }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/status');
  });
});
