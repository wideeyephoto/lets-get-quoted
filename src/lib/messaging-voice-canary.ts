/** Local input checks only. Carrier delivery and call behavior require live evidence. */
export type CanaryCheckStatus = 'passed' | 'failed' | 'skipped' | 'warn';
export type CanaryCheckResult = Readonly<{
  name: string;
  category: 'messaging_outbound' | 'messaging_inbound' | 'compliance_opt_out' | 'voice_admission' | 'voice_settlement';
  status: CanaryCheckStatus;
  detail: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}>;
export type MessagingCanaryReport = Readonly<{
  targetNumber: string; accountId: string; checks: readonly CanaryCheckResult[];
  overallStatus: CanaryCheckStatus; executedAt: string;
}>;
export type VoiceCanaryReport = MessagingCanaryReport;
export type PlatformCanarySuiteReport = Readonly<{
  messagingReport: MessagingCanaryReport; voiceReport: VoiceCanaryReport;
  allPassed: boolean; executedAt: string;
}>;

function report(accountId: string, number: string, checks: CanaryCheckResult[]): MessagingCanaryReport {
  return {
    accountId, targetNumber: number, checks, executedAt: new Date().toISOString(),
    overallStatus: checks.some(c => c.status === 'failed') ? 'failed'
      : checks.every(c => c.status === 'passed') ? 'passed' : 'skipped',
  };
}
function numberCheck(number: string, category: CanaryCheckResult['category']): CanaryCheckResult {
  return { name: 'Phone number format', category,
    status: /^\+[1-9][0-9]{7,14}$/.test(number) ? 'passed' : 'failed',
    detail: 'Checks E.164 syntax only; does not prove ownership, capability or delivery.' };
}
const pending = (name: string, category: CanaryCheckResult['category']): CanaryCheckResult => ({
  name, category, status: 'skipped', detail: 'Not exercised. Requires correlated live provider and application evidence.',
});

export function runMessagingCanary(input: {
  accountId: string; dedicatedNumber: string; recipientPhone: string;
  canaryAllowlist?: ReadonlySet<string>; suppressOutbound?: boolean;
  providerType?: 'signalwire' | 'twilio';
}): MessagingCanaryReport {
  return report(input.accountId, input.dedicatedNumber, [
    { name: 'Account Canary Allowlist Gate', category: 'messaging_outbound',
      status: !input.canaryAllowlist ? 'skipped'
        : input.canaryAllowlist.size === 0 || input.canaryAllowlist.has(input.accountId) ? 'passed' : 'failed',
      detail: 'Evaluates only the supplied allowlist; missing configuration is unverified.' },
    { name: 'Global Outbound Suppression Gate', category: 'messaging_outbound',
      status: input.suppressOutbound === undefined ? 'skipped' : input.suppressOutbound ? 'failed' : 'passed',
      detail: 'Evaluates only the supplied LGQ_DISABLE_OUTBOUND_SMS setting; lane flags still need verification.' },
    numberCheck(input.dedicatedNumber, 'messaging_outbound'),
    { ...numberCheck(input.recipientPhone, 'messaging_outbound'), name: 'Recipient phone number format' },
    pending('Campaign, assignment, lane readiness and outbound delivery', 'messaging_outbound'),
    pending('Inbound webhook authentication and ordinary reply', 'messaging_inbound'),
    pending('STOP, blocked-after-STOP, START and HELP', 'compliance_opt_out'),
    pending('Quiet hours, rejection, retries, callbacks and usage reconciliation', 'messaging_outbound'),
  ]);
}

export function runVoiceCanary(input: {
  accountId: string; dedicatedNumber: string; hasVoiceAllowance?: boolean;
}): VoiceCanaryReport {
  return report(input.accountId, input.dedicatedNumber, [
    numberCheck(input.dedicatedNumber, 'voice_admission'),
    { name: 'Supplied voice allowance', category: 'voice_admission',
      status: input.hasVoiceAllowance === undefined ? 'skipped' : input.hasVoiceAllowance ? 'passed' : 'failed',
      detail: 'Evaluates the supplied allowance only; does not invoke admission or verify metering.' },
    pending('Live call admission and routing', 'voice_admission'),
    pending('Voice Event Inbox Settlement and replay', 'voice_settlement'),
    pending('AI lead attribution and record mutation', 'voice_settlement'),
  ]);
}

export function runPlatformCanarySuite(input: {
  accountId: string; dedicatedNumber: string; recipientPhone: string; suppressOutbound?: boolean;
}): PlatformCanarySuiteReport {
  const messagingReport = runMessagingCanary(input);
  const voiceReport = runVoiceCanary(input);
  return { messagingReport, voiceReport,
    allPassed: messagingReport.overallStatus === 'passed' && voiceReport.overallStatus === 'passed',
    executedAt: new Date().toISOString() };
}
