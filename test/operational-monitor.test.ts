import { afterEach, describe, expect, it, vi } from 'vitest';
import { cronMonitorConfig, resendRequest, runOperationalMonitor, sendMonitorFailure } from '@/lib/operational-monitor.mjs';
import { runSreSelfHealingSweep } from '@/lib/sre-self-healing-daemon';

afterEach(() => vi.unstubAllEnvs());
describe('operational failure delivery', () => {
  it('rejects HTTP and body errors rather than reporting successful notification', async () => {
    await expect(resendRequest('/emails', { key: 'test', fetcher: vi.fn().mockResolvedValue(new Response('{}', { status: 429 })) })).rejects.toThrow('resend_http_429');
    await expect(resendRequest('/emails', { key: 'test', fetcher: vi.fn().mockResolvedValue(Response.json({ error: 'rejected' })) })).rejects.toThrow('resend_provider_rejected');
  });
  it('uses exactly the same payload and key for repeated outage alerts in the same hour', async () => {
    const calls: any[] = [];
    const fetcher = vi.fn(async (_url, init) => { calls.push(init); return Response.json({ id: 'email-id' }); }) as typeof fetch;
    const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', FOUNDER_ALERT_EMAIL: 'ops@example.com', RESEND_API_KEY: 'test' };
    await sendMonitorFailure({ env, fetcher, now: new Date('2026-09-09T12:01:00Z') });
    await sendMonitorFailure({ env, fetcher, now: new Date('2026-09-09T12:59:00Z') });
    expect(calls[0].body).toBe(calls[1].body);
    expect(calls[0].headers['Idempotency-Key']).toBe(calls[1].headers['Idempotency-Key']);
  });
  it('allows frequent workers a short grace and detects daily jobs within fifteen minutes of a full missed interval', () => {
    expect(cronMonitorConfig([{ path: '/api/cron/sms-delivery', schedule: '* * * * *' }, { path: '/api/cron/dunning', schedule: '0 15 * * *' }]))
      .toMatchObject([{ max_gap_minutes: 2 }, { max_gap_minutes: 1455 }]);
  });
  it('never queues an alert or clears a finding after a failed source scan', async () => {
    const admin: any = { rpc: vi.fn().mockResolvedValue({ error: { code: '57014' } }) };
    await expect(runOperationalMonitor({ admin, crons: [], env: { FOUNDER_ALERT_EMAIL: 'ops@example.com', RESEND_API_KEY: 'test' } })).rejects.toThrow('scan:57014');
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves a leased send on database failure after provider acceptance for an idempotent retry', async () => {
    const update = vi.fn().mockReturnValue({ eq: () => ({ eq: () => ({ select: async () => ({ error: { code: '08006' } }) }) }) });
    const admin: any = { rpc: vi.fn().mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: [
      { id: 'stable-id', claim_token: 'claim', payload: { text: 'same message' } },
    ] }), from: vi.fn().mockReturnValue({ update }) };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'provider-id' }));
    await expect(runOperationalMonitor({ admin, crons: [], env: { FOUNDER_ALERT_EMAIL: 'ops@example.com', RESEND_API_KEY: 'test' }, fetcher, pause: async () => {} })).rejects.toThrow('accept_record:08006');
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('lgq-operational-stable-id');
    expect(update).toHaveBeenCalledTimes(1);
    expect(admin.from).toHaveBeenCalledWith('operational_alert_deliveries');
  });
  it('detects webhook failures without falsely resolving or replaying them', async () => {
    const update = vi.fn();
    const admin: any = { from: () => ({ update, select: () => ({ is: () => ({ limit: async () => ({ data: [{ id: 'failure', source: 'stripe', event_type: 'invoice.paid' }], error: null }) }) }) }) };
    const result = await runSreSelfHealingSweep(admin, { autoHeal: true });
    expect(update).not.toHaveBeenCalled();
    expect(result.anomaliesHealed).toBe(0);
    expect(result.escalatedIncidents).toBe(1);
    expect(result.actionsTaken[0].status).toBe('escalated');
  });
  it('does not report health when the recovery inspection cannot read its queue', async () => {
    const admin: any = { from: () => ({ select: () => ({ is: () => ({ limit: async () => ({ error: { code: 'permission_denied' } }) }) }) }) };
    await expect(runSreSelfHealingSweep(admin)).rejects.toThrow('inspection unavailable');
  });
  it('uses signed callback evidence for mailbox delivery without requesting a broader provider API key', async () => {
    const written: any[]=[];
    const delivery: any = {
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ id: 'alert', provider_id: 'email', accepted_at: new Date().toISOString() }], error: null }) }), then: (resolve: any) => resolve({ data: null, count: 0, error: null }) }) }),
      update: (value: any) => { written.push(value); return { eq: () => ({ eq: async () => ({ data: null, error: null }) }) }; },
    };
    const admin: any={rpc:vi.fn().mockResolvedValueOnce({data:1}).mockResolvedValueOnce({data:0}).mockResolvedValueOnce({data:[]}),
      from:(table:string)=>table==='email_events'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'delivered',occurred_at:new Date().toISOString()},error:null})})})}:delivery};
    const fetcher=vi.fn();
    const result=await runOperationalMonitor({admin,crons:[],env:{RESEND_API_KEY:'sending-only'},fetcher,pause:async()=>{}});
    expect(result.delivered).toBe(1); expect(fetcher).not.toHaveBeenCalled();
    expect(written[0].state).toBe('delivered');
  });
});
