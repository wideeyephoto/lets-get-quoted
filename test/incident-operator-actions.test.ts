import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { logIncidentAction, resolveIncidentAction, togglePublishIncidentAction, updatePublicIncidentAction } from '@/app/admin/incidents/actions';

const guard = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const pageOnCall = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ requireMfaPermission: guard }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: refresh }));
vi.mock('@/lib/on-call-paging', () => ({ dispatchOnCallPage: pageOnCall }));

const id = 'cc3ed4c8-a9e8-4c62-97b1-40c517ca5cda';
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

function database(failPatch = false) {
  let row: Record<string, unknown> | null = null;
  const audit: Record<string, unknown>[] = [];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname.endsWith('/admin_actions')) { audit.push(body); return response(null, 200); }
    if (method === 'POST') { row = { id, resolved_at: null, ...body }; return response(row); }
    if (method === 'PATCH') {
      if (failPatch) return response({ code: '42501', message: 'denied' }, 403);
      if (url.searchParams.get('resolved_at') === 'is.null' && row?.resolved_at) return response(null);
      row = { ...row, ...body };
    }
    return response(row);
  });
  const admin = createClient('http://localhost:54321', 'test-admin', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: request } });
  guard.mockResolvedValue({ admin, adminEmail: 'operator@example.invalid', staff: { id: 'staff-id' }, ip: '127.0.0.1', requestId: 'request-id', permission: 'ops.manage' });
  return { audit, request, current: () => row };
}

beforeEach(() => { guard.mockReset(); refresh.mockReset(); pageOnCall.mockReset(); });

describe('incident operator actions', () => {
  it('writes draft, publish, update and resolve audit entries with the operator context', async () => {
    const db = database();
    await expect(logIncidentAction(form({ title: '[REHEARSAL] Public drill', kind: 'incident', severity: 'warning', description: 'No customer outage' }))).rejects.toThrow('done=logged');
    expect(db.current()?.published).toBe(false);
    await expect(togglePublishIncidentAction(form({ incident_id: id, published: 'true' }))).rejects.toThrow('done=published');
    expect(db.current()?.published).toBe(true);
    await expect(updatePublicIncidentAction(id, form({ title: '[REHEARSAL] Public drill', description: 'Monitoring recovery', impact_summary: 'No customer impact', affected_services: 'Booking, SMS' }))).rejects.toThrow('done=updated');
    expect(db.current()?.description).toBe('Monitoring recovery');
    expect(db.current()?.affected_services).toEqual(['Booking', 'SMS']);
    await expect(resolveIncidentAction(id, form({ resolution_summary: 'Rehearsal complete', root_cause: 'Internal test notes' }))).rejects.toThrow('done=resolved');
    expect(db.current()?.resolution_summary).toBe('Rehearsal complete');
    expect(db.current()?.resolved_at).toBeTruthy();
    expect(db.audit.map((entry) => entry.action)).toEqual(['platform_incident_log', 'platform_incident_update', 'platform_incident_update', 'platform_incident_resolve']);
    for (const entry of db.audit) {
      expect(entry).toMatchObject({ admin_email: 'operator@example.invalid', permission: 'ops.manage', target_type: 'platform_incident', target_id: id, request_id: 'request-id' });
    }
    expect(refresh.mock.calls.filter(([path]) => path === '/status')).toHaveLength(4);
    expect(guard.mock.calls.every(([permission]) => permission === 'ops.manage')).toBe(true);
    expect(pageOnCall).not.toHaveBeenCalled();
    await expect(resolveIncidentAction(id, form({ resolution_summary: 'Second resolution' }))).rejects.toThrow('error=already_resolved');
    expect(db.audit).toHaveLength(4);
  });

  it('cannot reach the database when the MFA/permission gate rejects an operator', async () => {
    const db = database();
    guard.mockRejectedValue(new Error('MFA required'));
    for (const action of [
      () => logIncidentAction(form({})),
      () => togglePublishIncidentAction(form({ incident_id: id, published: 'true' })),
      () => updatePublicIncidentAction(id, form({})),
      () => resolveIncidentAction(id, form({ resolution_summary: 'Resolved' })),
    ]) await expect(action()).rejects.toThrow('MFA required');
    expect(db.request).not.toHaveBeenCalled();
  });

  it('does not publish an incident without customer-facing copy', async () => {
    const db = database();
    await expect(logIncidentAction(form({ title: 'Empty public report', kind: 'incident', published: 'true' }))).rejects.toThrow('error=public_copy');
    expect(db.request).not.toHaveBeenCalled();
  });

  it('rejects a malformed publish request before database access', async () => {
    const db = database();
    await expect(togglePublishIncidentAction(form({ incident_id: 'null', published: 'true' }))).rejects.toThrow('error=failed');
    expect(db.request).not.toHaveBeenCalled();
  });

  it('failed mutations cannot write a success audit entry', async () => {
    const db = database(true);
    await expect(updatePublicIncidentAction(id, form({ title: 'Update', description: 'No customer outage' }))).rejects.toThrow('error=failed');
    expect(db.audit).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});
