import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { notifyEmergencyCall, notifyOrdinaryCall } from '@/lib/voice/triage';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const emergency = { isEmergency: true, hazardType: 'water_leak_flooding', severity: 'critical' as const, reason: 'Flooding' };

// Exercise the actual PostgREST request. The former mocks ignored select(),
// allowing nonexistent company_name/phone columns to pass every unit test.
function fixture(options: {
  account?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  failedTable?: string;
  errorCode?: string;
  queueError?: boolean;
} = {}) {
  const account = options.account === undefined
    ? { business_name: 'Test Plumbing', alert_phone: '+12485550100', call_forward_number: '+12485550102' }
    : options.account;
  const settings = options.settings === undefined
    ? { transfer_number: '+12485550101', contractor_notifications_enabled: true, contractor_notification_channel: 'sms' }
    : options.settings;
  const schemas: Record<string, Set<string>> = {
    accounts: new Set(['business_name', 'alert_phone', 'call_forward_number']),
    voice_settings: new Set(['transfer_number', 'contractor_notifications_enabled', 'contractor_notification_channel']),
  };
  const deliveries: Record<string, unknown>[] = [];
  const reads: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    if (table === 'enqueue_sms_delivery') {
      deliveries.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(options.queueError
        ? { code: 'XX000', message: 'Queue unavailable' }
        : [{ sms_event_id: EVENT, task_state: 'queued', created: deliveries.length === 1 }]), {
        status: options.queueError ? 500 : 200,
      });
    }
    reads.push(table);
    expect(url.searchParams.get(table === 'accounts' ? 'id' : 'account_id')).toBe(`eq.${ACCOUNT}`);
    const invalid = (url.searchParams.get('select') ?? '').split(',').find((column) => !schemas[table]?.has(column));
    if (invalid || options.failedTable === table) {
      return new Response(JSON.stringify({
        code: invalid ? '42703' : options.errorCode ?? '57014',
        message: 'private database error with +12485550999',
      }), { status: 400 });
    }
    return new Response(JSON.stringify(table === 'accounts' ? account : settings), { status: 200 });
  });
  const admin = createClient('https://fixture.invalid', 'fixture-service-key', {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin, deliveries, reads };
}

const invoke = {
  ordinary: (admin: ReturnType<typeof fixture>['admin']) => notifyOrdinaryCall(admin, ACCOUNT, '+12485550199', 'Routine inquiry', 'Test Caller', CALL),
  emergency: (admin: ReturnType<typeof fixture>['admin']) => notifyEmergencyCall(admin, ACCOUNT, '+12485550199', 'Flooding', emergency, CALL),
};

describe.each(['ordinary', 'emergency'] as const)('%s notification schema and destination', (kind) => {
  it('uses existing scoped columns and the owner-alert queue with a stable replay key', async () => {
    const f = fixture();
    await expect(invoke[kind](f.admin)).resolves.toBe(true);
    await expect(invoke[kind](f.admin)).resolves.toBe(true);
    expect(f.deliveries).toHaveLength(2);
    expect(f.deliveries[0]).toMatchObject({ p_account_id: ACCOUNT, p_phone_number: '+12485550100', p_sender_purpose: 'lgq_shared', p_billing_category: 'owner_alert' });
    expect(f.deliveries[0].p_idempotency_key).toBe(f.deliveries[1].p_idempotency_key);
    expect(f.deliveries[0].p_idempotency_key).toContain(CALL);
    expect(f.deliveries[0].p_body).toContain('Test Plumbing');
  });

  it.each([
    [{ business_name: 'Test', alert_phone: 'invalid', call_forward_number: '+12485550102' }, { transfer_number: '+12485550101' }, '+12485550101'],
    [{ business_name: 'Test', alert_phone: null, call_forward_number: '+12485550102' }, { transfer_number: null }, '+12485550102'],
    [{ business_name: 'Test', alert_phone: '+12485550100', call_forward_number: null }, null, '+12485550100'],
  ])('uses the first valid configured destination', async (account, settings, destination) => {
    const f = fixture({ account, settings });
    await expect(invoke[kind](f.admin)).resolves.toBe(true);
    expect(f.deliveries[0].p_phone_number).toBe(destination);
  });

  it('does not notify an orphaned account using a settings-only number', async () => {
    const f = fixture({ account: null });
    await expect(invoke[kind](f.admin)).resolves.toBe(false);
    expect(f.deliveries).toHaveLength(0);
  });

  it('does not queue without a valid destination', async () => {
    const f = fixture({ account: { business_name: 'Test', alert_phone: 'invalid' }, settings: null });
    await expect(invoke[kind](f.admin)).resolves.toBe(false);
    expect(f.deliveries).toHaveLength(0);
  });

  it.each(['accounts', 'voice_settings'])('keeps %s failures retryable without leaking database messages', async (failedTable) => {
    const f = fixture({ failedTable });
    await expect(invoke[kind](f.admin)).rejects.toThrow(`Voice notification ${failedTable === 'accounts' ? 'account' : 'settings'} read failed (57014).`);
    expect(f.deliveries).toHaveLength(0);
  });

  it('does not include unexpected error-code text in the error', async () => {
    const f = fixture({ failedTable: 'accounts', errorCode: 'private +12485550999' });
    await expect(invoke[kind](f.admin)).rejects.toThrow('Voice notification account read failed (unknown).');
  });

  it('does not mark a failed enqueue as delivered', async () => {
    const f = fixture({ queueError: true });
    await expect(invoke[kind](f.admin)).rejects.toThrow();
  });
});

describe('ordinary notification preferences', () => {
  it.each([
    { contractor_notifications_enabled: false, contractor_notification_channel: 'sms' },
    { contractor_notifications_enabled: true, contractor_notification_channel: 'none' },
    { contractor_notifications_enabled: true, contractor_notification_channel: 'email' },
  ])('does not send SMS for an ineligible preference: %j', async (settings) => {
    const f = fixture({ settings });
    await expect(invoke.ordinary(f.admin)).resolves.toBe(false);
    expect(f.deliveries).toHaveLength(0);
    expect(f.reads).toEqual(['voice_settings']);
  });
  it('allows SMS when both channels are selected', async () => {
    const f = fixture({ settings: { contractor_notifications_enabled: true, contractor_notification_channel: 'both' } });
    await expect(invoke.ordinary(f.admin)).resolves.toBe(true);
  });
});
