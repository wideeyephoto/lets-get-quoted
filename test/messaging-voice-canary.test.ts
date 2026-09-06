import { describe, expect, it } from 'vitest';
import { runMessagingCanary, runPlatformCanarySuite, runVoiceCanary } from '@/lib/messaging-voice-canary';

const input = { accountId: '11111111-1111-4111-8111-111111111111',
  dedicatedNumber: '+12485550199', recipientPhone: '+12485550100' };

describe('canary reports require real evidence', () => {
  it('never treats valid sample phone numbers as live delivery proof', () => {
    const result = runMessagingCanary({ ...input, suppressOutbound: false, canaryAllowlist: new Set([input.accountId]) });
    expect(result.overallStatus).toBe('skipped');
    for (const category of ['messaging_inbound', 'compliance_opt_out']) {
      expect(result.checks.filter(c => c.category === category).every(c => c.status === 'skipped')).toBe(true);
    }
  });
  it('does not default missing production configuration to enabled', () => {
    const result = runMessagingCanary(input);
    expect(result.checks.filter(c => c.name.includes('Gate')).every(c => c.status === 'skipped')).toBe(true);
  });
  it('fails when explicitly suppressed or excluded from the allowlist', () => {
    expect(runMessagingCanary({ ...input, suppressOutbound: true }).overallStatus).toBe('failed');
    expect(runMessagingCanary({ ...input, canaryAllowlist: new Set(['another-account']) }).overallStatus).toBe('failed');
  });
  it('rejects malformed recipient and sender inputs', () => {
    expect(runMessagingCanary({ ...input, recipientPhone: '' }).overallStatus).toBe('failed');
    expect(runMessagingCanary({ ...input, dedicatedNumber: 'invalid' }).overallStatus).toBe('failed');
  });
  it('does not invent voice settlement or admission evidence', () => {
    const result = runVoiceCanary({ ...input, hasVoiceAllowance: true });
    expect(result.overallStatus).toBe('skipped');
    expect(result.checks.filter(c => c.category === 'voice_settlement').every(c => c.status === 'skipped')).toBe(true);
    expect(runVoiceCanary({ ...input, hasVoiceAllowance: false }).overallStatus).toBe('failed');
  });
  it('cannot report the complete platform verified from local inputs', () => {
    expect(runPlatformCanarySuite(input).allPassed).toBe(false);
  });
});
