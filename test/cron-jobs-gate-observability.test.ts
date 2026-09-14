import { describe, it, expect } from 'vitest';
import {
  CRON_JOBS,
  cronGateStatus,
  cronJob,
  type CronJobSpec,
} from '@/lib/cron-jobs';

describe('cron jobs gate observability (Item 18)', () => {
  it('identifies ungated cron jobs as active and always-on', () => {
    const voiceRetention = cronJob('voice-retention');
    expect(voiceRetention).toBeDefined();
    const status = cronGateStatus(voiceRetention!);
    expect(status.isGated).toBe(false);
    expect(status.isEnabled).toBe(true);
    expect(status.envVar).toBeUndefined();
  });

  it('correctly evaluates gated cron jobs with active vs dark env settings', () => {
    const topUp = cronJob('top-up-projection');
    expect(topUp).toBeDefined();
    expect(topUp?.gateEnvVar).toBe('LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED');

    // Test with missing/unset env
    const darkStatus = cronGateStatus(topUp!, {});
    expect(darkStatus.isGated).toBe(true);
    expect(darkStatus.isEnabled).toBe(false);
    expect(darkStatus.envVar).toBe('LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED');

    // Test with non-1 string
    const zeroStatus = cronGateStatus(topUp!, {
      LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED: '0',
    });
    expect(zeroStatus.isEnabled).toBe(false);

    // Test with 'true' (exact string '1' required)
    const trueStatus = cronGateStatus(topUp!, {
      LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED: 'true',
    });
    expect(trueStatus.isEnabled).toBe(false);

    // Test with exact string '1'
    const liveStatus = cronGateStatus(topUp!, {
      LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED: '1',
    });
    expect(liveStatus.isEnabled).toBe(true);
  });

  it('maps all dark billing and communication workers to their controlling flags', () => {
    const expectedGatedWorkers: Record<string, string> = {
      'overage-period-close': 'LGQ_OVERAGE_PERIOD_CLOSE_ENABLED',
      'overage-settlement': 'LGQ_OVERAGE_SETTLEMENT_ENABLED',
      'sms-inbound-actions': 'LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED',
      'sms-delivery': 'LGQ_SMS_DELIVERY_WORKER_ENABLED',
      'legacy-quick-stop-late-refunds': 'LGQ_LEGACY_QUICK_STOP_LATE_REFUND_WORKER_ENABLED',
      'connected-payment-projection': 'LGQ_STRIPE_CONNECTED_PAYMENT_PROJECTION_WORKER_ENABLED',
      'top-up-projection': 'LGQ_STRIPE_TOP_UP_PROJECTION_WORKER_ENABLED',
      'direct-payment-settlement': 'LGQ_DIRECT_PAYMENT_SETTLEMENT_WORKER_ENABLED',
      'billing-subscription-projection': 'LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED',
      'billing-allowance-resets': 'LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED',
      'refund-reconciliation': 'LGQ_REFUND_RECONCILIATION_ENABLED',
      'voice-allowance': 'LGQ_VOICE_ALLOWANCE_WORKER_ENABLED',
      'capacity-lifecycle': 'LGQ_PURCHASED_CAPACITY_LIFECYCLE_ENABLED',
      'storage-usage-sweep': 'LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED',
      'usage-reservation-expiry': 'LGQ_USAGE_RESERVATION_EXPIRY_ENABLED',
    };

    for (const [job, expectedFlag] of Object.entries(expectedGatedWorkers)) {
      const spec = cronJob(job);
      expect(spec, `Job ${job} should exist in CRON_JOBS`).toBeDefined();
      expect(
        spec?.gateEnvVar,
        `Job ${job} should be gated by ${expectedFlag}`,
      ).toBe(expectedFlag);
    }
  });
});
