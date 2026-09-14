import { describe, it, expect } from 'vitest';
import { cronJob, cronGateStatus } from '@/lib/cron-jobs';
import { textCreditMode } from '@/lib/billing/text-credit-usage';
import { marketingEmailMode } from '@/lib/billing/marketing-email-usage';
import { aiWritingMode } from '@/lib/billing/ai-writing-usage';
import { voiceMinuteMode } from '@/lib/billing/voice-minute-usage';
import { storageCapEnforcementEnabled } from '@/lib/billing/storage-usage';

/**
 * Tier 2 — Metering Prerequisites (Items 7 & 8 in docs/hardening-backlog-2026-09-14.md)
 *
 * 7. LGQ_USAGE_RESERVATION_EXPIRY_ENABLED is the prerequisite nobody sees:
 *    Releases usage reservations whose work never finished.
 * 8. LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED before LGQ_STORAGE_CAP_ENFORCED:
 *    Enforcing cap against unmeasured usage fails open, and public lead-photo
 *    uploads stay ungated on purpose.
 */

describe('Tier 2 — metering prerequisites and fail-open guarantees', () => {
  it('identifies usage-reservation-expiry as gated by LGQ_USAGE_RESERVATION_EXPIRY_ENABLED', () => {
    const job = cronJob('usage-reservation-expiry');
    expect(job).toBeDefined();
    expect(job?.gateEnvVar).toBe('LGQ_USAGE_RESERVATION_EXPIRY_ENABLED');

    // Missing env: disabled / dark
    expect(cronGateStatus(job!, {}).isEnabled).toBe(false);
    // Explicit 1: live
    expect(cronGateStatus(job!, { LGQ_USAGE_RESERVATION_EXPIRY_ENABLED: '1' }).isEnabled).toBe(true);
  });

  it('separates storage sweep from storage cap enforcement', () => {
    const sweepJob = cronJob('storage-usage-sweep');
    expect(sweepJob).toBeDefined();
    expect(sweepJob?.gateEnvVar).toBe('LGQ_WORKSPACE_STORAGE_USAGE_SWEEP_ENABLED');

    // Cap enforcement flag is independent
    expect(storageCapEnforcementEnabled({})).toBe(false);
    expect(storageCapEnforcementEnabled({ LGQ_STORAGE_CAP_ENFORCED: '0' })).toBe(false);
    expect(storageCapEnforcementEnabled({ LGQ_STORAGE_CAP_ENFORCED: '1' })).toBe(true);
  });

  describe('meter vs gate separation: fail-open / measure-only when gate is off', () => {
    it('handles text credits mode progression (off -> measure -> enforce)', () => {
      // Both off
      expect(textCreditMode({})).toBe('off');

      // Meter on, gate off -> measure only (fails open)
      expect(
        textCreditMode({
          LGQ_TEXT_CREDIT_METER_ENABLED: '1',
          LGQ_TEXT_CREDIT_GATE_ENABLED: '0',
        }),
      ).toBe('measure');

      // Both on -> enforce
      expect(
        textCreditMode({
          LGQ_TEXT_CREDIT_METER_ENABLED: '1',
          LGQ_TEXT_CREDIT_GATE_ENABLED: '1',
        }),
      ).toBe('enforce');
    });

    it('handles marketing email mode progression (off -> measure -> enforce)', () => {
      expect(marketingEmailMode({})).toBe('off');
      expect(
        marketingEmailMode({
          LGQ_MARKETING_EMAIL_METER_ENABLED: '1',
          LGQ_MARKETING_EMAIL_GATE_ENABLED: '0',
        }),
      ).toBe('measure');
      expect(
        marketingEmailMode({
          LGQ_MARKETING_EMAIL_METER_ENABLED: '1',
          LGQ_MARKETING_EMAIL_GATE_ENABLED: '1',
        }),
      ).toBe('enforce');
    });

    it('handles AI writing mode progression (off -> measure -> enforce)', () => {
      expect(aiWritingMode({})).toBe('off');
      expect(
        aiWritingMode({
          LGQ_AI_WRITING_METER_ENABLED: '1',
          LGQ_AI_WRITING_GATE_ENABLED: '0',
        }),
      ).toBe('measure');
      expect(
        aiWritingMode({
          LGQ_AI_WRITING_METER_ENABLED: '1',
          LGQ_AI_WRITING_GATE_ENABLED: '1',
        }),
      ).toBe('enforce');
    });

    it('handles voice minute mode progression (off -> measure -> enforce)', () => {
      expect(voiceMinuteMode({})).toBe('off');
      expect(
        voiceMinuteMode({
          LGQ_VOICE_MINUTE_METER_ENABLED: '1',
          LGQ_VOICE_MINUTE_GATE_ENABLED: '0',
        }),
      ).toBe('measure');
      expect(
        voiceMinuteMode({
          LGQ_VOICE_MINUTE_METER_ENABLED: '1',
          LGQ_VOICE_MINUTE_GATE_ENABLED: '1',
        }),
      ).toBe('enforce');
    });
  });
});
