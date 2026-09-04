import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sms = readFileSync('src/lib/sms.ts', 'utf8');
const settlement = readFileSync('src/lib/billing/direct-payment-settlement-worker.ts', 'utf8');
const deliveryWorker = readFileSync('src/lib/sms-delivery-worker.ts', 'utf8');
const voiceStaffStepUp = readFileSync('src/lib/voice/staff-step-up.ts', 'utf8');
const durabilityFollowups = readFileSync(
  'migrations/20260821210000_sms_durability_followups.sql',
  'utf8',
);
const verificationRoute = readFileSync('src/app/api/public/leads/verify-phone/route.ts', 'utf8');
const subcontractors = readFileSync('src/lib/subcontractor-dispatch-data.ts', 'utf8');
const rebook = readFileSync('src/lib/rebook.ts', 'utf8');
const scheduling = readFileSync('src/lib/scheduling.ts', 'utf8');
const estimateOffers = readFileSync('src/app/dashboard/schedule/plan/offer-actions.ts', 'utf8');
const rescheduleOffers = readFileSync('src/app/dashboard/schedule/plan/reschedule-actions.ts', 'utf8');
const publicLeads = readFileSync('src/app/api/public/leads/route.ts', 'utf8');
const scheduleActions = readFileSync('src/app/dashboard/schedule/actions.ts', 'utf8');
const quickStopActions = readFileSync('src/app/dashboard/quick-stops/actions.ts', 'utf8');
const quickStopPayments = readFileSync('src/lib/quick-stop-payments.ts', 'utf8');
const quickStopRefunds = readFileSync('src/lib/quick-stop-refunds.ts', 'utf8');
const jobsActions = readFileSync('src/app/dashboard/jobs/actions.ts', 'utf8');
const leadsActions = readFileSync('src/app/dashboard/leads/actions.ts', 'utf8');
const arrivalSend = readFileSync('src/lib/arrival-send.ts', 'utf8');
const arrivalPlan = readFileSync('src/app/dashboard/schedule/plan/actions.ts', 'utf8');
const campaigns = readFileSync('src/lib/campaigns.ts', 'utf8');
const estimateReplies = readFileSync('src/lib/estimate-offers-data.ts', 'utf8');
const rescheduleReplies = readFileSync('src/lib/reschedule-offers-data.ts', 'utf8');
const selectionNotify = readFileSync('src/lib/selection-notify.ts', 'utf8');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(name) ? [path.replace(/\\/g, '/')] : [];
  });
}

function executableSource(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('outbound SMS producer boundary', () => {
  it('allows only the durable worker and the audited in-call OTP exception to reach provider egress', () => {
    const files = sourceFiles('src');
    const callers = files.filter((path) => {
      if (path === 'src/lib/sms-provider.ts') return false;
      return /\bsendProviderMessage\s*\(/.test(executableSource(path));
    });
    expect(callers.sort()).toEqual([
      'src/lib/sms-delivery-worker.ts',
      'src/lib/voice/staff-step-up.ts',
    ]);
    expect(executableSource('src/lib/sms.ts')).not.toContain('sendProviderMessage');
    expect(executableSource('src/lib/billing/direct-payment-settlement-worker.ts'))
      .not.toContain('sendProviderMessage');

    // Voice staff OTPs deliberately do not use the generic queue: persisting
    // the body there would store the plaintext code and could retry it after
    // the live call or challenge generation is stale. This synchronous path is
    // permitted only while all of its fail-closed activation invariants remain.
    const request = voiceStaffStepUp.slice(
      voiceStaffStepUp.indexOf('export async function requestVoiceStaffStepUp'),
    );
    const issueAt = request.indexOf("'issue_voice_staff_step_up_challenge'");
    const sendAt = request.indexOf('providerMessageId = await (runtime.sendSms ?? sendStepUpSms)');
    const providerIdAt = request.indexOf('definitiveProviderId(providerMessageId)');
    const acceptanceAt = request.indexOf("'mark_voice_staff_step_up_provider_accepted'");

    expect(voiceStaffStepUp).toContain("outboundSmsLaneSuppression(input.accountId, 'lgq_shared')");
    expect(voiceStaffStepUp).toContain("{ accountId: input.accountId, category: 'verification' }");
    expect(request).toContain('messageKey: `voice-step-up:${issued.challengeId}:${issued.sendCount}`');
    expect(request).toContain("reason: 'sms_delivery_failed'");
    expect(voiceStaffStepUp).not.toContain('enqueueSmsDelivery');
    expect(voiceStaffStepUp).not.toContain('enqueue_sms_delivery');
    expect(voiceStaffStepUp).not.toMatch(/\.from\(['"]sms_events['"]\)/);
    expect(request).toContain('p_account_id: context.accountId');
    expect(request).toContain('p_provider_call_id: context.providerCallId');
    expect(request).toContain('p_caller_number: context.callerPhone');
    expect(request).toContain('p_challenge_id: issued.challengeId');
    expect(request).toContain('p_code_hmac: digest.codeHmac');
    expect(request).toContain('p_code_key_id: digest.codeKeyId');
    expect(request).toContain('p_send_count: issued.sendCount');
    expect(request).toContain('p_provider_message_id: providerMessageId');
    expect(request.match(/runtime\.sendSms \?\? sendStepUpSms/g)).toHaveLength(1);
    expect(issueAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(issueAt);
    expect(providerIdAt).toBeGreaterThan(sendAt);
    expect(acceptanceAt).toBeGreaterThan(providerIdAt);
  });

  it('treats public lead verification as contractor traffic, not accountless LGQ traffic', () => {
    const verification = sms.slice(sms.indexOf('export async function sendVerificationCodeSms'));
    expect(verification).toContain("senderPurpose: 'contractor_dedicated'");
    expect(verification).toContain('senderNumberId: params.senderNumberId');
    expect(verification).toContain('idempotencyKey: params.idempotencyKey');
    expect(verification).toContain("await recordSmsConsent(params.accountId, params.phone, 'lead_verification_request')");
    expect(verificationRoute).toContain(".select('id, account_id, company_name, content')");
    expect(verificationRoute).toContain('loadLeadPhoneVerificationReadiness(accountId, admin)');
    const readiness = readFileSync('src/lib/lead-phone-verification-readiness.ts', 'utf8');
    expect(readiness).toContain("process.env.LGQ_SMS_DELIVERY_WORKER_ENABLED !== '1'");
    expect(readiness).toContain("process.env.LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED !== '1'");
    expect(readiness).toContain('outboundSmsSuppression()');
    expect(readiness).toContain('sender.provider !== provider.id');
    expect(readiness).toContain("reason: 'outside_canary'");
  });

  it('does not mirror an optimistic outbound inbox row before provider acceptance', () => {
    expect(sms).not.toContain('logOutboundToInbox');
    expect(sms).not.toMatch(/from\(['"]sms_messages['"]\)\.insert/);
  });

  it('never creates an sms_events row without the atomic delivery task', () => {
    expect(executableSource('src/lib/sms.ts')).not.toMatch(
      /from\(['"]sms_events['"]\)[\s\S]{0,120}\.(?:insert|upsert)\s*\(/,
    );
  });

  it('requires account-scoped customer sends to choose the dedicated-number purpose', () => {
    expect(sms).toContain("senderPurpose: 'contractor_dedicated'");
    expect(sms).toContain("senderPurpose: 'lgq_dispatch'");
    expect(sms).toContain("context: 'automation'");
  });

  it('hands payment settlement to the generic queue before shared inventory and rollout gates', () => {
    const enqueueStart = durabilityFollowups.indexOf(
      'create or replace function public.enqueue_direct_payment_settlement_sms',
    );
    const enqueueEnd = durabilityFollowups.indexOf('\n$$;', enqueueStart);
    const settlementEnqueue = durabilityFollowups.slice(enqueueStart, enqueueEnd);
    const stageStart = durabilityFollowups.indexOf(
      'create or replace function public.stage_sms_delivery',
    );
    const stageEnd = durabilityFollowups.indexOf('\n$$;', stageStart);
    const finalEgressStage = durabilityFollowups.slice(stageStart, stageEnd);

    expect(settlement).toContain("'enqueue_direct_payment_settlement_sms'");
    expect(settlement).toContain('const stage = await store.stageSms(claim, envelope)');
    expect(settlement).toContain("if (stage.status === 'already_sent')");
    expect(settlement).not.toContain(".from('sms_sender_numbers')");
    expect(settlement).not.toContain('messenger.send(');

    expect(enqueueStart).toBeGreaterThan(-1);
    expect(enqueueEnd).toBeGreaterThan(enqueueStart);
    expect(settlementEnqueue).toContain('from public.enqueue_sms_delivery(');
    expect(settlementEnqueue).toContain("'contractor_dedicated'");
    expect(settlementEnqueue).toContain(
      "'payment:' || v_task.payment_id::text || ':payment_paid'",
    );

    expect(stageStart).toBeGreaterThan(-1);
    expect(stageEnd).toBeGreaterThan(stageStart);
    expect(finalEgressStage).toContain('from public.sms_sender_numbers s');
    expect(finalEgressStage).toContain('and s.purpose = v_event.sender_purpose');
    expect(finalEgressStage).toContain("and s.assignment_state = 'assigned'");
    expect(finalEgressStage).toContain('and s.inbound_ready');

    expect(deliveryWorker).toContain('canaryAccounts: smsCanaryAccounts');
    expect(deliveryWorker).toContain('runtime.purposeEnabled(claim.senderPurpose)');
    expect(deliveryWorker).toContain(
      "await store.defer(claim, 'sms_canary_account_not_enabled', 3600)",
    );
    expect(deliveryWorker.indexOf('const stage = await store.stage(claim, provider)'))
      .toBeLessThan(deliveryWorker.indexOf('const providerId = await messenger.send('));
  });

  it('gives every retryable subcontractor notification a domain-stable queue key', () => {
    for (const suffix of ['offer', 'cancelled', 'won', 'covered']) {
      expect(subcontractors).toContain(`:${suffix}\``);
    }
    expect(sms).toContain('idempotencyKey: params.idempotencyKey');
  });

  it('keys other retryable domain asks before reporting queue acceptance', () => {
    expect(rebook).toContain('idempotencyKey: `rebook:${client.id}:');
    expect(scheduling).toContain('idempotencyKey: `schedule-options:${request.id}`');
    expect(estimateOffers).toContain('idempotencyKey: `estimate-offer:${offerId}`');
    expect(estimateOffers).toContain('message: `Queued.');
    expect(rescheduleOffers).toContain('idempotencyKey: `reschedule-offer:${offerId}`');
    expect(rescheduleOffers).toContain('message: `Queued.');
  });

  it('gives the remaining operational producers stable domain identities', () => {
    expect(publicLeads).toContain('idempotencyKey: `owner-high-value-lead:${lead.id}`');
    expect(scheduleActions).toContain('idempotencyKey: `booking-decision:${jobId}:confirmed`');
    expect(scheduleActions).toContain('idempotencyKey: `booking-decision:${jobId}:declined`');
    expect(quickStopActions).toContain('idempotencyKey: `quick-stop:${requestId}:en-route`');
    expect(quickStopActions).toContain('idempotencyKey: `quick-stop:${requestId}:arrived`');
    expect(quickStopPayments).toContain('idempotencyKey: `quick-stop:${requestId}:offer:${payment.id}`');
    expect(quickStopPayments).toContain('idempotencyKey: `quick-stop:${confirmed.id}:confirmed:${paymentId}`');
    expect(quickStopRefunds).toContain('idempotencyKey: `quick-stop:${requestId}:refund:${status}`');
    expect(jobsActions).toContain('idempotencyKey: `client-job-dashboard:${job.id}:job-create`');
    expect(jobsActions).toContain('idempotencyKey: `job-update:${feedEvent.id}`');
    expect(jobsActions).toContain('idempotencyKey: `quote-updated:${jobId}:${token}`');
    expect(leadsActions).toContain('idempotencyKey: `client-job-dashboard:${job.id}:lead-conversion`');
    expect(leadsActions).toContain('idempotencyKey: `lead-decline:${leadId}:${reasonKey}`');
    expect(leadsActions).toContain('idempotencyKey: `lead-quote-visit:${leadId}:${scheduledFor}:${scheduledTime}`');
    expect(arrivalSend).toContain('idempotencyKey: `arrival:${trackingId}`');
    expect(arrivalSend).toContain('idempotencyKey: `arrival:${active.id}:${input.status}`');
    expect(arrivalPlan).toContain('idempotencyKey: `arrival-window:${job.id}:${job.scheduled_for}:${job.scheduled_time');
    expect(campaigns).toContain('idempotencyKey: `campaign:${runId}:${recipient.id}:sms`');
    expect(estimateReplies).toContain('idempotencyKey: `estimate-offer-owner:${offer.id}:reply`');
    expect(rescheduleReplies).toContain('idempotencyKey: `reschedule-offer-owner:${offer.id}:reply`');
    expect(selectionNotify).toContain('idempotencyKey: `selection-request:${jobId}:${token}`');
  });
});
