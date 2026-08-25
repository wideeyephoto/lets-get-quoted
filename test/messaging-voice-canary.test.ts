import { describe, expect, it } from 'vitest';
import {
  runMessagingCanary,
  runPlatformCanarySuite,
  runVoiceCanary,
} from '@/lib/messaging-voice-canary';

describe('messaging and voice canary test suite', () => {
  const sampleAccount = '88888888-8888-4888-8888-888888888888';
  const sampleDedicatedNumber = '+12485550199';
  const sampleRecipient = '+12485550101';

  it('passes all messaging canary checks when account is allowlisted and format is valid', () => {
    const report = runMessagingCanary({
      accountId: sampleAccount,
      dedicatedNumber: sampleDedicatedNumber,
      recipientPhone: sampleRecipient,
      canaryAllowlist: new Set([sampleAccount]),
      suppressOutbound: false,
    });

    expect(report.overallStatus).toBe('passed');
    expect(report.targetNumber).toBe(sampleDedicatedNumber);
    expect(report.accountId).toBe(sampleAccount);
    expect(report.checks.length).toBeGreaterThanOrEqual(6);

    const allowlistCheck = report.checks.find((c) => c.name.includes('Canary Allowlist'));
    expect(allowlistCheck?.status).toBe('passed');

    const stopCheck = report.checks.find((c) => c.name.includes('STOP'));
    expect(stopCheck?.status).toBe('passed');

    const helpCheck = report.checks.find((c) => c.name.includes('HELP'));
    expect(helpCheck?.status).toBe('passed');
  });

  it('fails messaging canary when account is outside the canary allowlist', () => {
    const report = runMessagingCanary({
      accountId: 'unknown-outside-account',
      dedicatedNumber: sampleDedicatedNumber,
      recipientPhone: sampleRecipient,
      canaryAllowlist: new Set(['only-allowed-account']),
    });

    expect(report.overallStatus).toBe('failed');
    const allowlistCheck = report.checks.find((c) => c.name.includes('Canary Allowlist'));
    expect(allowlistCheck?.status).toBe('failed');
  });

  it('fails messaging canary when dedicated number is not a valid E.164 string', () => {
    const report = runMessagingCanary({
      accountId: sampleAccount,
      dedicatedNumber: 'invalid-number-format',
      recipientPhone: sampleRecipient,
    });

    expect(report.overallStatus).toBe('failed');
    const numberCheck = report.checks.find((c) => c.name.includes('Dedicated Sender DID'));
    expect(numberCheck?.status).toBe('failed');
  });

  it('passes all AI voice canary checks with active minute allowance', () => {
    const report = runVoiceCanary({
      accountId: sampleAccount,
      dedicatedNumber: sampleDedicatedNumber,
      hasVoiceAllowance: true,
    });

    expect(report.overallStatus).toBe('passed');
    expect(report.targetNumber).toBe(sampleDedicatedNumber);
    expect(report.checks.length).toBeGreaterThanOrEqual(4);

    const admissionCheck = report.checks.find((c) => c.name.includes('Admission'));
    expect(admissionCheck?.status).toBe('passed');

    const settlementCheck = report.checks.find((c) => c.name.includes('Settlement'));
    expect(settlementCheck?.status).toBe('passed');
  });

  it('fails AI voice canary when account minute allowance is exhausted', () => {
    const report = runVoiceCanary({
      accountId: sampleAccount,
      dedicatedNumber: sampleDedicatedNumber,
      hasVoiceAllowance: false,
    });

    expect(report.overallStatus).toBe('failed');
    const admissionCheck = report.checks.find((c) => c.name.includes('Admission'));
    expect(admissionCheck?.status).toBe('failed');
  });

  it('executes the unified platform canary suite across both messaging and voice', () => {
    const suite = runPlatformCanarySuite({
      accountId: sampleAccount,
      dedicatedNumber: sampleDedicatedNumber,
      recipientPhone: sampleRecipient,
      suppressOutbound: false,
    });

    expect(suite.allPassed).toBe(true);
    expect(suite.messagingReport.overallStatus).toBe('passed');
    expect(suite.voiceReport.overallStatus).toBe('passed');
    expect(suite.messagingReport.checks.length).toBeGreaterThanOrEqual(6);
    expect(suite.voiceReport.checks.length).toBeGreaterThanOrEqual(4);
  });
});
