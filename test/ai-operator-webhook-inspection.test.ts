import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { runWebhookAutoHealer } from '@/lib/ai-operator/webhook-healer';
import { clearOperatorMemory, createHitlAction, flushOperatorWrites, listPendingHitlActions, listPendingHitlActionsAsync } from '@/lib/ai-operator/audit';
import { executeOperatorTool } from '@/lib/ai-operator/tools';

vi.mock('@/lib/auth', () => ({ createAdminClient: () => { throw new Error('Use the supplied test client'); } }));

type Row = Record<string, any>;

// Exercise the real Supabase client's REST requests against a persistent fake
// store, including filters and conflict-ignore semantics across worker restarts.
function database(failures: Row[] = [], actions: Row[] = []) {
  const rows: Record<string, Row[]> = { webhook_failures: failures, ai_operator_action_requests: actions, ai_operator_logs: [] };
  const failWrites = new Set<string>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').pop()!;
    const method = init?.method ?? 'GET';
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (method !== 'GET' && failWrites.has(table)) return reply({ message: 'Storage unavailable', code: 'XX000' }, 500);
    const matches = (row: Row) => [...url.searchParams].every(([column, filter]) => {
      if (['select', 'order', 'limit', 'on_conflict'].includes(column)) return true;
      if (filter === 'is.null') return row[column] == null;
      if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
      throw new Error(`Unexpected filter: ${column}=${filter}`);
    });
    if (method === 'GET') return reply(rows[table].filter(matches));
    const body = JSON.parse(String(init?.body));
    if (method === 'PATCH') {
      const changed = rows[table].filter(matches);
      changed.forEach((row) => Object.assign(row, body));
      return reply(changed);
    }
    if (method === 'POST') {
      const duplicate = rows[table].some((row) => row.id === body.id);
      if (duplicate) {
        expect(new Headers(init?.headers).get('Prefer')).toContain('resolution=ignore-duplicates');
        return reply([]);
      }
      rows[table].push(body);
      return reply([body]);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  const client = createClient('http://localhost:54321', 'test-key', { global: { fetch: fetchMock }, auth: { persistSession: false } });
  return { client, rows, fetchMock, failWrites };
}

function inspection(id: string, extra: Row = {}): Row {
  return { id, action_type: 'sre.inspect_webhook_failure', category: 'sre_platform', title: 'Inspect webhook', description: 'Read-only inspection', payload: { failureId: 'wh-1' }, status: 'pending', is_financial_mutation: false, created_at: '2026-09-14T12:00:00Z', ...extra };
}

describe('Durable webhook inspections and approval queue', () => {
  beforeEach(() => clearOperatorMemory());

  it('logs each failure once across repeated, cold and concurrent scans without approval or replay', async () => {
    const failure = { id: 'wh-1', source: 'ai_voice', error_message: 'Receipt failed', resolved_at: null };
    const db = database([failure]);
    const first = await runWebhookAutoHealer(db.client);
    expect(first).toMatchObject({ totalUnresolved: 1, inspectionActionsLogged: 1, escalatedToHitlCount: 0, replayedCount: 0, autoResolvedCount: 0 });
    clearOperatorMemory();
    const repeats = await Promise.all([runWebhookAutoHealer(db.client), runWebhookAutoHealer(db.client)]);
    expect(repeats.map((r) => r.inspectionActionsLogged)).toEqual([0, 0]);
    expect(db.rows.ai_operator_logs).toHaveLength(1);
    expect(db.rows.ai_operator_logs[0]).toMatchObject({ severity: 'info', input_payload: { failureId: 'wh-1' } });
    expect(db.rows.ai_operator_action_requests).toEqual([]);
    expect(failure.resolved_at).toBeNull();
    expect(db.fetchMock.mock.calls.every(([url, init]) => !String(url).includes('/webhook_failures') || init?.method === 'GET')).toBe(true);
  });

  it('retires only pending nonfinancial legacy inspection cards even when no failures remain', async () => {
    const db = database([], [
      inspection('old-1'), inspection('old-2'),
      inspection('replay', { action_type: 'replay_failed_webhook' }),
      inspection('refund', { action_type: 'issue_subscription_refund', is_financial_mutation: true }),
      inspection('decided', { status: 'approved' }),
      inspection('financial', { is_financial_mutation: true }),
      inspection('other-category', { category: 'billing_revops' }),
    ]);
    const report = await runWebhookAutoHealer(db.client);
    expect(report.retiredInspectionApprovals).toBe(2);
    expect(db.rows.ai_operator_action_requests.slice(0, 2).every((row) => row.status === 'expired' && row.resolution_reason.includes('no recovery was executed'))).toBe(true);
    expect(db.rows.ai_operator_action_requests.slice(2).map((row) => row.status)).toEqual(['pending', 'pending', 'approved', 'pending', 'pending']);
    expect(db.rows.ai_operator_logs).toHaveLength(1);
    expect((await runWebhookAutoHealer(db.client)).retiredInspectionApprovals).toBe(0);
    expect(db.rows.ai_operator_logs).toHaveLength(1);
  });

  it('makes no writes in a dry run, including no card cleanup', async () => {
    const db = database([{ id: 'wh-1', source: 'ai_voice' }], [inspection('pending')]);
    const report = await runWebhookAutoHealer(db.client, { dryRun: true });
    expect(report).toMatchObject({ inspectionActionsLogged: 0, retiredInspectionApprovals: 0, escalatedToHitlCount: 0 });
    expect(db.fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    expect(db.rows.ai_operator_action_requests[0].status).toBe('pending');
  });

  it.each(['ai_operator_logs', 'ai_operator_action_requests'])('surfaces %s persistence failures instead of reporting a healthy scan', async (table) => {
    const db = database([{ id: 'wh-1', source: 'ai_voice' }]);
    db.failWrites.add(table);
    await expect(runWebhookAutoHealer(db.client)).rejects.toThrow('Storage unavailable');
  });

  it('does not resurrect cached cards after the database queue becomes empty', async () => {
    const db = database();
    const card = createHitlAction({ category: 'sre_platform', title: 'Recovery', description: 'Prepared recovery', actionType: 'replay_failed_webhook', payload: {} }, db.client);
    await flushOperatorWrites();
    expect(listPendingHitlActions()).toHaveLength(1);
    await db.client.from('ai_operator_action_requests').update({ status: 'expired' }).eq('id', card.id);
    expect(await listPendingHitlActionsAsync(new Date(), db.client)).toEqual([]);
    expect(listPendingHitlActions()).toEqual([]);
  });

  it('lists persisted approvals after a cold start and refuses new inspection approval cards', async () => {
    const db = database([], [inspection('real-recovery', { action_type: 'replay_failed_webhook' })]);
    const ctx = { supabase: db.client, source: 'admin_dashboard' as const };
    const result = await executeOperatorTool('list_pending_action_requests', {}, ctx);
    expect(result.data).toMatchObject({ count: 1, actions: [{ id: 'real-recovery' }] });
    const blocked = await executeOperatorTool('create_hitl_action_request', { actionType: 'sre.inspect_webhook_failure' }, ctx);
    expect(blocked.data).toMatchObject({ error: expect.stringContaining('does not require approval') });
    expect(db.rows.ai_operator_action_requests).toHaveLength(1);
  });
});
