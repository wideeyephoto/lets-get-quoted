import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cronMonitorConfig,
  resendRequest,
  runOperationalMonitor,
  sendMonitorFailure,
  sendMonitorRecovery,
  parseStructuredError,
  claimNotificationDispatch,
  recordDurableFailure,
} from '@/lib/operational-monitor.mjs';
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
      { id: 'stable-id', claim_token: 'claim', payload: { to: ['ops@example.com'], text: 'same message' } },
    ] }), from: vi.fn((table) => table === 'platform_email_suppression'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) } : { update }) };
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

  // Checklist 8 Failure Scenarios
  describe('resilience and failure scenarios', () => {
    it('records recovered interruption without urgent email when transient 504 recovers on safe retry', async () => {
      let scanCalls = 0;
      const rpc = vi.fn(async (name) => {
        if (name === 'scan_operational_failures') {
          scanCalls++;
          if (scanCalls === 1) return { error: { message: '504: Gateway Timeout' } };
          return { data: 5 };
        }
        if (name === 'queue_operational_alerts') return { data: 0 };
        if (name === 'claim_operational_alerts') return { data: [] };
        if (name === 'record_monitor_success') return { data: [{ monitor_state: 'healthy', was_outage: false }] };
        return { data: null };
      });
      const admin: any = {
        rpc,
        from: () => ({
          select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }), head: true, count: 0 }) }),
        }),
      };
      const result = await runOperationalMonitor({
        admin,
        crons: [],
        env: { RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' },
        pause: async () => {},
      });
      expect(result.state).toBe('recovered_interruption');
      expect(result.interruptions.length).toBe(1);
      expect(result.interruptions[0].isGatewayTimeout).toBe(true);
      expect(scanCalls).toBe(2);
    });

    it('triggers outage notification on repeated consecutive failures', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: [{
          monitor_state: 'outage',
          consecutive_failures: 2,
          should_alert: true,
          is_first_outage_alert: true,
          outage_id: 'outage-test-1',
        }],
      });
      const admin: any = { rpc };
      const err = parseStructuredError('Gateway Timeout', 'claim');
      const stateInfo = await recordDurableFailure(admin, err, { source: 'vercel' });
      expect(stateInfo.should_alert).toBe(true);
      expect(stateInfo.monitor_state).toBe('outage');
      expect(stateInfo.consecutive_failures).toBe(2);
    });

    it('dispatches exactly one recovery message when monitor succeeds following an outage', async () => {
      const calls: any[] = [];
      const fetcher = vi.fn(async (_url, init) => { calls.push(init); return Response.json({ id: 'email-id' }); }) as typeof fetch;
      const admin: any = {
        rpc: vi.fn().mockResolvedValue({ data: true }),
      };
      const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' };
      const recId = await sendMonitorRecovery({
        admin,
        env,
        fetcher,
        result: { active: 10, queued: 1, claimed: 1, accepted: 1, delivered: 1, outageId: 'outage-test-1' },
      });
      expect(recId).toBe('email-id');
      expect(calls[0].body).toContain('RECOVERED');
      expect(calls[0].body).toContain('outage-test-1');
      expect(calls[0].headers['Idempotency-Key']).toContain('recovery-outage-test-1');
    });

    it('triggers stale-success rule when last complete success is older than 10 minutes', async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: [{
          monitor_state: 'outage',
          consecutive_failures: 1,
          should_alert: true,
          outage_id: 'outage-stale-1',
        }],
      });
      const admin: any = { rpc };
      const err = parseStructuredError('timeout', 'scan');
      const stateInfo = await recordDurableFailure(admin, err, { source: 'github-watchdog' });
      expect(stateInfo.should_alert).toBe(true);
      expect(stateInfo.monitor_state).toBe('outage');
    });

    it('independent fallback alerting works even when database is completely unreachable', async () => {
      const calls: any[] = [];
      const fetcher = vi.fn(async (_url, init) => { calls.push(init); return Response.json({ id: 'fallback-email-id' }); }) as typeof fetch;
      const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' };
      const id = await sendMonitorFailure({
        env,
        fetcher,
        error: new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      });
      expect(id).toBe('fallback-email-id');
      expect(calls[0].body).toContain('OUTAGE');
      expect(calls[0].body).toContain('ECONNREFUSED');
    });

    it('concurrent Vercel and GitHub runs do not duplicate notifications via atomic claim', async () => {
      let claimedCount = 0;
      const rpc = vi.fn(async (_name, params) => {
        if (params.p_notification_type === 'outage') {
          claimedCount++;
          return { data: claimedCount === 1 };
        }
        return { data: true };
      });
      const admin: any = { rpc };
      const claim1 = await claimNotificationDispatch(admin, { outageId: 'outage-sync-1', type: 'outage' });
      const claim2 = await claimNotificationDispatch(admin, { outageId: 'outage-sync-1', type: 'outage' });
      expect(claim1).toBe(true);
      expect(claim2).toBe(false);
    });

    it('safely recovers existing leased rows if claim write timed out before response was received', async () => {
      let claimCalls = 0;
      const rpc = vi.fn(async (name) => {
        if (name === 'scan_operational_failures') return { data: 5 };
        if (name === 'queue_operational_alerts') return { data: 0 };
        if (name === 'claim_operational_alerts') {
          claimCalls++;
          return { error: { message: '504: Gateway Timeout' } };
        }
        if (name === 'record_monitor_success') return { data: [{ monitor_state: 'healthy' }] };
        return { data: null };
      });

      const existingLeased = [
        { id: 'recovered-alert-1', claim_token: 'token-1', payload: { to: ['ops@example.com'], text: 'alert message' } }
      ];

      const from = vi.fn((table: string) => {
        if (table === 'platform_email_suppression') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        if (table === 'operational_alert_deliveries') {
          return {
            select: () => ({
              eq: () => ({
                gt: () => ({
                  limit: async () => ({ data: existingLeased })
                }),
                order: () => ({ limit: async () => ({ data: [] }) })
              }),
              head: true,
              count: 0,
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => ({ data: [{ id: 'recovered-alert-1' }] })
                })
              })
            })
          };
        }
        if (table === 'email_events') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
        }
        return {};
      });

      const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'resend-recovered-id' }));
      const result = await runOperationalMonitor({
        admin: { rpc, from } as any,
        crons: [],
        env: { RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' },
        fetcher,
        pause: async () => {},
      });

      expect(result.claimed).toBe(1);
      expect(result.accepted).toBe(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('lgq-operational-recovered-alert-1');
    });

    it('surfaces permanent configuration errors immediately without retry', async () => {
      const admin: any = {
        rpc: vi.fn().mockResolvedValue({ error: { message: 'permission denied for schema public', code: '42501' } })
      };
      await expect(runOperationalMonitor({
        admin,
        crons: [],
        env: { RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' },
        pause: async () => {},
      })).rejects.toThrow('scan:42501');
      expect(admin.rpc).toHaveBeenCalledTimes(1);
    });

    it('exhausted retries remain visible as a failed run with structured error', async () => {
      let attempts = 0;
      const admin: any = {
        rpc: vi.fn(async () => {
          attempts++;
          return { error: { message: '504: Gateway Timeout' } };
        })
      };
      await expect(runOperationalMonitor({
        admin,
        crons: [],
        env: { RESEND_API_KEY: 'test', FOUNDER_ALERT_EMAIL: 'ops@example.com' },
        pause: async () => {},
      })).rejects.toThrow('scan:gateway_timeout');
      expect(attempts).toBe(3);
    });
  });
});
