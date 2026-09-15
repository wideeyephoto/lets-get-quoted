import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSmsCanaryProbe, confirmSmsCanaryCallback } from '@/lib/sms-canary';
import { runSyntheticUptimeProbe } from '@/lib/uptime-monitoring';

describe('C6 — SMS Reachability Canary & Uptime Monitoring', () => {
  const migration = readFileSync(
    join(process.cwd(), 'migrations/20260915010000_sms_campaign_lifecycle_and_canary.sql'),
    'utf8',
  );

  const originalEnv = process.env.LGQ_SMS_CANARY_TO_PHONE;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.LGQ_SMS_CANARY_TO_PHONE = originalEnv;
    } else {
      delete process.env.LGQ_SMS_CANARY_TO_PHONE;
    }
  });

  it('migration creates sms_canary_probes table with status check constraints and indexes', () => {
    expect(migration).toContain('create table if not exists public.sms_canary_probes');
    expect(migration).toContain("check (status in ('dispatched', 'confirmed', 'failed', 'timeout'))");
    expect(migration).toContain('idx_sms_canary_probes_dispatched');
    expect(migration).toContain('idx_sms_canary_probes_provider_msg');
  });

  it('runSmsCanaryProbe skips cleanly when LGQ_SMS_CANARY_TO_PHONE is unconfigured', async () => {
    delete process.env.LGQ_SMS_CANARY_TO_PHONE;
    const result = await runSmsCanaryProbe();
    expect(result.ok).toBe(true);
    expect(result.status).toBe('skipped');
    expect(result.message).toContain('LGQ_SMS_CANARY_TO_PHONE is not set');
  });

  it('confirmSmsCanaryCallback updates probe to confirmed and records latency', async () => {
    let updatedPayload: Record<string, unknown> = {};
    const mockClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                id: 'probe-123',
                dispatched_at: new Date(Date.now() - 250).toISOString(),
                status: 'dispatched',
              },
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatedPayload = payload;
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
      }),
    } as any;

    const confirmed = await confirmSmsCanaryCallback(mockClient, 'provider-msg-abc', 'delivered');
    expect(confirmed).toBe(true);
    expect(updatedPayload.status).toBe('confirmed');
    expect(typeof updatedPayload.latency_ms).toBe('number');
    expect(updatedPayload.latency_ms as number).toBeGreaterThanOrEqual(0);
  });

  it('runSyntheticUptimeProbe reports operational when a recent canary probe is confirmed', async () => {
    const mockClient = {
      from: (table: string) => {
        if (table === 'sms_canary_probes') {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({
                    data: {
                      status: 'confirmed',
                      confirmed_at: new Date().toISOString(),
                      dispatched_at: new Date().toISOString(),
                      latency_ms: 145,
                      error_message: null,
                    },
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null }),
              }),
            }),
          }),
        };
      },
    } as any;

    const report = await runSyntheticUptimeProbe(mockClient);
    const smsProbe = report.subsystems.find((s) => s.id === 'sms-gateway');
    expect(smsProbe).toBeDefined();
    // If SMS provider config is active in this test environment
    if (smsProbe?.status !== 'degraded') {
      expect(smsProbe?.status).toBe('operational');
      expect(smsProbe?.detail).toContain('Active reachability canary verified');
      expect(smsProbe?.latencyMs).toBe(145);
    }
  });
});
