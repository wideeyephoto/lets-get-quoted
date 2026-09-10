import { describe, expect, it, vi } from 'vitest';
import { sendMonitorFailureSms } from '../src/lib/operational-sms-paging.mjs';
import { sendMonitorFailure } from '../src/lib/operational-monitor.mjs';

const env = { ONCALL_PRIMARY_PHONE: '+15555550123', OPERATIONAL_SMS_FROM_NUMBER: '+15555550124',
  SIGNALWIRE_SPACE_URL: 'ops.signalwire.com', SIGNALWIRE_PROJECT_ID: 'project', SIGNALWIRE_API_TOKEN: 'token',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'email' };
const now = new Date('2026-09-09T20:00:00Z');
function harness(options: { loseResponse?: boolean; failInsert?: boolean; failEvidence?: boolean; status?: string; wrongIdentity?: boolean } = {}) {
  let row: any;
  let sends = 0;
  const fetcher = vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    if (url.startsWith('https://api.resend.com/')) return new Response('', { status: 503 });
    if (url.includes('/rest/v1/operational_sms_pages')) {
      if (init.method === 'POST') {
        if (options.failInsert) return new Response('', { status: 503 });
        if (row) return Response.json({ code: '23505' }, { status: 409 });
        row = { ...JSON.parse(init.body), state: 'submitting' }; return Response.json([row], { status: 201 });
      }
      if (init.method === 'PATCH') {
        const patch = JSON.parse(init.body);
        if (options.failEvidence && patch.provider_id) return new Response('', { status: 503 });
        Object.assign(row, patch); return new Response(null, { status: 204 });
      }
      return Response.json([row]);
    }
    if (url.endsWith('/Messages.json')) {
      sends++;
      if (options.loseResponse) throw new Error('response lost after provider accepted');
      return Response.json({ sid: 'provider-one', status: 'queued' });
    }
    return Response.json({ sid: 'provider-one', status: options.status || 'delivered',
      to: options.wrongIdentity ? '+15555550999' : env.ONCALL_PRIMARY_PHONE,
      from: env.OPERATIONAL_SMS_FROM_NUMBER, account_sid: env.SIGNALWIRE_PROJECT_ID, error_code: '30005' });
  });
  return { fetcher, row: () => row, sends: () => sends };
}
describe('independent operational SMS paging', () => {
  it('pages through the real orchestrator while Resend is unavailable', async () => {
    const h = harness();
    expect(await sendMonitorFailure({ env, now, fetcher: h.fetcher, drill: true })).toBe('provider-one');
    expect(h.sends()).toBe(1); expect(h.row().state).toBe('delivered');
    expect(h.row().body).toContain('DRILL'); expect(h.row().body).toContain('/admin/health');
  });
  it('sequential and concurrent invocations never resubmit a claimed page', async () => {
    const h = harness();
    await Promise.allSettled(Array.from({ length: 8 }, () => sendMonitorFailureSms({ env, now, fetcher: h.fetcher })));
    expect((await sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).repeated).toBe(true);
    expect(h.sends()).toBe(1);
  });
  it.each([{ loseResponse: true }, { failEvidence: true }])('preserves uncertain submission for manual review: %o', async options => {
    const h = harness(options);
    await expect(sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).rejects.toThrow('requires_review');
    await expect(sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).rejects.toThrow('requires_review');
    expect(h.sends()).toBe(1); expect(h.row().state).toBe('manual_review');
  });
  it('does not submit when the durable database claim is unavailable', async () => {
    const h = harness({ failInsert: true });
    await expect(sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).rejects.toThrow('claim_failed');
    expect(h.sends()).toBe(0);
  });
  it('does not equate acceptance with handset delivery', async () => {
    const h = harness({ status: 'sent' });
    expect((await sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).status).toBe('accepted');
    expect(h.row().delivered_at).toBeUndefined();
  });
  it('fails visibly on terminal carrier failure without resending', async () => {
    const h = harness({ status: 'undelivered' });
    await expect(sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).rejects.toThrow('delivery_failed');
    await expect(sendMonitorFailureSms({ env, now, fetcher: h.fetcher })).rejects.toThrow('delivery_failed');
    expect(h.sends()).toBe(1);
  });
  it('rejects changed recipients and wrong provider identity', async () => {
    const h = harness(); await sendMonitorFailureSms({ env, now, fetcher: h.fetcher });
    await expect(sendMonitorFailureSms({ env: { ...env, ONCALL_PRIMARY_PHONE: '+15555550999' }, now, fetcher: h.fetcher })).rejects.toThrow('identity_conflict');
    const wrong = harness({ wrongIdentity: true });
    await expect(sendMonitorFailureSms({ env, now, fetcher: wrong.fetcher })).rejects.toThrow('identity_mismatch');
    expect(h.sends()).toBe(1);
  });
});
