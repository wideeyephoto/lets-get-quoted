import { Resend, type CreateEmailOptions } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { renderPlatformEmail, renderPlatformEmailText } from '@/emails/platform';
import { buildUnsubscribeOneClickUrl } from '@/lib/email-suppression';
import { isMailable } from '@/lib/email-quality';
import { recordAccountEvent } from '@/lib/account-events';
import { ownerEmailsForAccounts } from '@/lib/admin-accounts';
import { interpolateTokens, type PlatformCampaignRecipient } from '@/lib/admin-campaign-types';
import { APP_ORIGIN } from '@/lib/app-origin';

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export { CONTRACTOR_LIFECYCLE_STEPS } from '@/lib/contractor-lifecycle-content';
export type { ContractorLifecycleStep, ContractorLifecycleStepId } from '@/lib/contractor-lifecycle-content';
import { CONTRACTOR_LIFECYCLE_STEPS, type ContractorLifecycleStep, type ContractorLifecycleStepId } from '@/lib/contractor-lifecycle-content';

function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Render the exact HTML for a contractor lifecycle onboarding email.
 */
export function renderContractorLifecycleEmailHtml(
  step: ContractorLifecycleStep,
  recipient: Partial<PlatformCampaignRecipient>,
): string {
  return renderPlatformEmail({ ...step, ctaUrl: lifecycleCtaUrl(step) }, recipient);
}

function lifecycleCtaUrl(step: ContractorLifecycleStep): string {
  return `${APP_ORIGIN.replace(/\/$/, '')}${step.ctaPath}`;
}

function lifecycleText(step: ContractorLifecycleStep, recipient: PlatformCampaignRecipient): string {
  return renderPlatformEmailText({ ...step, ctaUrl: lifecycleCtaUrl(step) }, recipient);
}

// This repository's Resend SDK predates send({ idempotencyKey }). Its public
// request method lets us set the HTTP header without changing the shared SDK.
function sendLifecycleMessage(resend: Resend, message: CreateEmailOptions, key: string) {
  return resend.fetchRequest<{ id: string }>('/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resend.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(message),
  });
}

/**
 * Send the immediate Day 0 Welcome Email when a contractor finishes /welcome first-run.
 * Resilient: never throws and never blocks account creation or redirects.
 */
export async function sendContractorWelcomeEmail(input: {
  accountId: string;
  businessName?: string;
  trade?: string;
  postalCode?: string;
  ownerEmail?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const admin = createAdminClient();
    let targetEmail = input.ownerEmail;

    if (!targetEmail) {
      const ownerMap = await ownerEmailsForAccounts(admin, [input.accountId]);
      targetEmail = ownerMap.get(input.accountId);
    }

    if (!targetEmail || !isMailable(targetEmail)) {
      console.warn(`[contractor-lifecycle] No valid mailable email found for account ${input.accountId}; skipping welcome email.`);
      return { ok: false, error: 'no_mailable_email' };
    }

    targetEmail = targetEmail.trim().toLowerCase();
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id, test_marker, suspended_at').eq('id', input.accountId).maybeSingle();
    if (accountError) return { ok: false, error: 'account_lookup_failed' };
    if (!account || account.test_marker != null || account.suspended_at != null) return { ok: false, error: 'account_ineligible' };

    const { data: suppression, error: suppressionError } = await admin
      .from('email_suppression')
      .select('email')
      .eq('account_id', input.accountId)
      .eq('email', targetEmail.toLowerCase())
      .maybeSingle();

    if (suppressionError) return { ok: false, error: 'suppression_lookup_failed' };

    const { data: history, error: historyError } = await admin.from('account_events')
      .select('id').eq('account_id', input.accountId)
      .eq('kind', 'contractor_lifecycle_email_sent').contains('meta', { step_id: 'welcome_day0' }).limit(1);
    if (historyError) return { ok: false, error: 'history_lookup_failed' };
    if (history?.length) return { ok: false, error: 'already_sent' };

    if (suppression) {
      console.info(`[contractor-lifecycle] Email ${targetEmail} suppressed; skipping welcome email.`);
      return { ok: false, error: 'suppressed' };
    }

    const welcomeStep = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === 'welcome_day0');
    if (!welcomeStep) {
      return { ok: false, error: 'welcome_step_missing' };
    }

    const recipient: PlatformCampaignRecipient = {
      email: targetEmail.toLowerCase().trim(),
      name: null,
      businessName: input.businessName || 'Your Business',
      accountId: input.accountId,
    };

    const resend = getResendClient();
    if (!resend) {
      console.info('[contractor-lifecycle] RESEND_API_KEY not configured; skipping email dispatch.');
      return { ok: false, error: 'missing_resend_api_key' };
    }

    const html = renderContractorLifecycleEmailHtml(welcomeStep, recipient);
    const subject = interpolateTokens(welcomeStep.subject, recipient);
    const oneClickUrl = buildUnsubscribeOneClickUrl(input.accountId, recipient.email);

    const fromAddress = process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <hello@letsgetquoted.com>";

    const sendRes = await sendLifecycleMessage(resend, {
      from: fromAddress,
      to: recipient.email,
      reply_to: welcomeStep.replyTo,
      subject,
      html,
      text: lifecycleText(welcomeStep, recipient),
      headers: listUnsubscribeHeaders(oneClickUrl),
      tags: [
        { name: 'kind', value: 'contractor_lifecycle' },
        { name: 'step', value: 'welcome_day0' },
        { name: 'account_id', value: input.accountId.replace(/[^a-zA-Z0-9_-]/g, '_') },
      ],
    }, `contractor-lifecycle/${input.accountId}/welcome_day0`);

    if (sendRes.error || !sendRes.data?.id) {
      console.error('[contractor-lifecycle] Failed to send welcome email:', sendRes.error);
      return { ok: false, error: sendRes.error?.message || 'Provider did not confirm an email ID' };
    }

    await recordAccountEvent({
      accountId: input.accountId,
      kind: 'contractor_lifecycle_email_sent',
      summary: `Sent Day 0 Welcome Email: "${subject}" to ${recipient.email}`,
      meta: {
        step_id: 'welcome_day0',
        recipient_email: recipient.email,
        message_id: sendRes.data?.id,
        sent_at: new Date().toISOString(),
      },
    });

    return { ok: true, messageId: sendRes.data?.id };
  } catch (err) {
    console.error('[contractor-lifecycle] Error sending contractor welcome email:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sweep active accounts and dispatch the appropriate onboarding lifecycle step.
 * Designed to be run daily via the cron job `/api/cron/contractor-lifecycle`.
 */
export async function runContractorLifecycleSweep(
  adminClient?: SupabaseClient,
  options?: { dryRun?: boolean },
): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ accountId: string; stepId: string; status: 'sent' | 'skipped' | 'error'; note?: string }>;
}> {
  const admin = adminClient ?? createAdminClient();
  const isDryRun = options?.dryRun ?? false;
  const result = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<{ accountId: string; stepId: string; status: 'sent' | 'skipped' | 'error'; note?: string }>,
  };

  const resend = getResendClient();
  if (!resend && !isDryRun) {
    console.warn('[contractor-lifecycle-sweep] No Resend API key; sweep skipped.');
    return result;
  }

  // Fetch accounts created in the last 45 days that are not test accounts
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const { data: accounts, error: accountsErr } = await admin
    .from('accounts')
    .select('id, business_name, plan, connect_onboarded, created_at, reply_to_email, test_marker')
    .gte('created_at', fortyFiveDaysAgo)
    .is('test_marker', null)
    .is('suspended_at', null)
    .order('created_at', { ascending: true })
    .limit(500);

  if (accountsErr || !accounts) {
    console.error('[contractor-lifecycle-sweep] Failed to fetch accounts:', accountsErr);
    return result;
  }

  result.checked = accounts.length;
  if (!accounts.length) return result;

  const accountIds = accounts.map((a) => a.id);

  // Load owner login emails
  const ownerEmailMap = await ownerEmailsForAccounts(admin, accountIds);

  // Load existing lifecycle sent history from account_events
  const { data: sentEvents, error: historyError } = await admin
    .from('account_events')
    .select('account_id, meta')
    .in('account_id', accountIds)
    .eq('kind', 'contractor_lifecycle_email_sent');

  if (historyError || (sentEvents?.length ?? 0) >= 1000) {
    throw new Error('Lifecycle history unavailable or truncated; no emails sent.');
  }

  const sentStepMap = new Map<string, Set<string>>();
  for (const ev of sentEvents ?? []) {
    if (!sentStepMap.has(ev.account_id)) {
      sentStepMap.set(ev.account_id, new Set());
    }
    const meta = ev.meta as Record<string, unknown> | null;
    const stepId = typeof meta?.step_id === 'string' ? meta.step_id : null;
    if (stepId) {
      sentStepMap.get(ev.account_id)?.add(stepId);
    }
  }

  // Load quote counts to determine zero_quote nudges
  const { data: jobCounts, error: jobsError } = await admin
    .from('jobs')
    .select('account_id')
    .in('account_id', accountIds)
    .gt('quoted_amount', 0);

  if (jobsError || (jobCounts?.length ?? 0) >= 1000) {
    throw new Error('Quote eligibility unavailable or truncated; no emails sent.');
  }

  const quoteCountMap = new Map<string, number>();
  for (const j of jobCounts ?? []) {
    if (j.account_id) {
      quoteCountMap.set(j.account_id, (quoteCountMap.get(j.account_id) || 0) + 1);
    }
  }

  // Load suppressions (fail-closed on error)
  const { data: suppressions, error: suppressionError } = await admin
    .from('email_suppression')
    .select('account_id, email')
    .in('account_id', accountIds);

  if (suppressionError) {
    console.error('Failed to load email suppression list for contractor lifecycle sweep (failing closed):', suppressionError.message);
    throw new Error(`Email suppression lookup failed: ${suppressionError.message}`);
  }

  const suppressedSet = new Set<string>();
  for (const s of suppressions ?? []) {
    if (s.email) suppressedSet.add(`${s.account_id}:${String(s.email).toLowerCase().trim()}`);
  }

  const now = Date.now();

  for (const account of accounts) {
    const rawEmail = ownerEmailMap.get(account.id);
    if (!rawEmail || !isMailable(rawEmail)) {
      result.skipped++;
      continue;
    }

    const email = rawEmail.trim().toLowerCase();
    if (suppressedSet.has(`${account.id}:${email}`)) {
      result.skipped++;
      continue;
    }

    const accountAgeDays = Math.floor((now - new Date(account.created_at).getTime()) / (24 * 60 * 60 * 1000));
    const alreadySent = sentStepMap.get(account.id) || new Set<string>();

    // The immediate welcome, cron, and approved batch share a 48-hour cadence.
    if (sentEvents?.some((event) => event.account_id === account.id && isRecentLifecycleSend(event.meta, now))) {
      result.skipped++;
      continue;
    }

    // Determine the single next step to send for this account
    let stepToSend: ContractorLifecycleStep | null = null;

    // Check state-aware nudges first if conditions apply
    if (
      accountAgeDays >= 3 &&
      accountAgeDays <= 14 &&
      account.connect_onboarded === false &&
      !alreadySent.has('nudge_incomplete_stripe') &&
      alreadySent.has('welcome_day0')
    ) {
      stepToSend = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === 'nudge_incomplete_stripe') || null;
    } else if (
      accountAgeDays >= 5 &&
      accountAgeDays <= 15 &&
      (quoteCountMap.get(account.id) || 0) === 0 &&
      !alreadySent.has('nudge_zero_quotes') &&
      alreadySent.has('welcome_day0')
    ) {
      stepToSend = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === 'nudge_zero_quotes') || null;
    } else {
      // Sequence drip evaluation by age
      // Guarantee that accounts always receive welcome_day0 first before advancing
      if (!alreadySent.has('welcome_day0')) {
        stepToSend = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === 'welcome_day0') || null;
      } else {
        for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
          if (step.id === 'welcome_day0' || step.id === 'nudge_incomplete_stripe' || step.id === 'nudge_zero_quotes') continue;
          if (alreadySent.has(step.id)) continue;
          if (step.id === 'stripe_payout_day4' && (account.connect_onboarded === true || alreadySent.has('nudge_incomplete_stripe'))) continue;
          if (step.id === 'quote_speed_day2' && alreadySent.has('nudge_zero_quotes')) continue;

          if (accountAgeDays >= step.minAgeDays && (step.maxAgeDays === undefined || accountAgeDays <= step.maxAgeDays)) {
            stepToSend = step;
            break;
          }
        }
      }
    }

    if (!stepToSend) {
      result.skipped++;
      continue;
    }

    const recipient: PlatformCampaignRecipient = {
      email,
      name: null,
      businessName: account.business_name || 'Your Business',
      accountId: account.id,
    };

    try {
      const html = renderContractorLifecycleEmailHtml(stepToSend, recipient);
      const subject = interpolateTokens(stepToSend.subject, recipient);
      const oneClickUrl = buildUnsubscribeOneClickUrl(account.id, recipient.email);
      const fromAddress = process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <hello@letsgetquoted.com>";

      if (isDryRun) {
        result.sent++;
        result.details.push({
          accountId: account.id,
          stepId: stepToSend.id,
          status: 'sent',
          note: `[DRY-RUN] Subject: "${subject}" to ${recipient.email}`,
        });
        continue;
      }

      if (!resend) {
        result.skipped++;
        continue;
      }

      const sendRes = await sendLifecycleMessage(resend, {
        from: fromAddress,
        to: recipient.email,
        reply_to: stepToSend.replyTo,
        subject,
        html,
        text: lifecycleText(stepToSend, recipient),
        headers: listUnsubscribeHeaders(oneClickUrl),
        tags: [
          { name: 'kind', value: 'contractor_lifecycle' },
          { name: 'step', value: stepToSend.id },
          { name: 'account_id', value: account.id.replace(/[^a-zA-Z0-9_-]/g, '_') },
        ],
      }, `contractor-lifecycle/${account.id}/${stepToSend.id}`);

      if (sendRes.error || !sendRes.data?.id) {
        result.errors++;
        result.details.push({
          accountId: account.id,
          stepId: stepToSend.id,
          status: 'error',
          note: sendRes.error?.message || 'Provider did not confirm an email ID',
        });
        continue;
      }

      await recordAccountEvent({
        accountId: account.id,
        kind: 'contractor_lifecycle_email_sent',
        summary: `Sent Onboarding Step (${stepToSend.id}): "${subject}" to ${recipient.email}`,
        meta: {
          step_id: stepToSend.id,
          recipient_email: recipient.email,
          message_id: sendRes.data?.id,
          account_age_days: accountAgeDays,
          sent_at: new Date().toISOString(),
        },
      });

      result.sent++;
      result.details.push({
        accountId: account.id,
        stepId: stepToSend.id,
        status: 'sent',
      });
    } catch (err) {
      result.errors++;
      result.details.push({
        accountId: account.id,
        stepId: stepToSend.id,
        status: 'error',
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export interface ActivationNudgeBatchRecipient {
  accountId: string;
  businessName: string;
  email: string;
  ageDays?: number;
  quotedJobs?: number;
}

export interface ActivationNudgeBatchResult {
  sent: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  details: Array<{
    accountId: string;
    stepId: string;
    status: 'sent' | 'skipped' | 'error';
    note?: string;
  }>;
}

/**
 * Executes a targeted batch of contractor activation nudges (e.g., from HITL approval).
 * Supports safe dry-run mode and re-evaluates mailable/suppression/sent status at execution time.
 */
export async function sendActivationNudgeBatch(
  admin: SupabaseClient,
  input: {
    stepId?: ContractorLifecycleStepId;
    recipients?: ActivationNudgeBatchRecipient[];
    dryRun?: boolean;
  },
): Promise<ActivationNudgeBatchResult> {
  const stepId = input.stepId || 'nudge_zero_quotes';
  const step = CONTRACTOR_LIFECYCLE_STEPS.find((s) => s.id === stepId);
  if (!step) {
    throw new Error(`Unknown contractor lifecycle step: "${stepId}"`);
  }

  const recipients = input.recipients ?? [];
  const isDryRun = Boolean(input.dryRun);

  const result: ActivationNudgeBatchResult = {
    sent: 0,
    skipped: 0,
    errors: 0,
    dryRun: isDryRun,
    details: [],
  };

  if (!recipients.length) {
    return result;
  }

  const accountIds = [...new Set(recipients.map((r) => r.accountId))];

  // 1. Re-check suppressions fail-closed
  const { data: suppressions, error: suppressionError } = await admin
    .from('email_suppression')
    .select('account_id, email')
    .in('account_id', accountIds);

  if (suppressionError) {
    console.error('[activation-nudges] Failed to check suppression list:', suppressionError.message);
    throw new Error(`Email suppression lookup failed: ${suppressionError.message}`);
  }

  const suppressedSet = new Set<string>();
  for (const s of suppressions ?? []) {
    if (s.email) {
      suppressedSet.add(`${s.account_id}:${String(s.email).toLowerCase().trim()}`);
    }
  }

  // 2. Re-check already-sent ledger
  const { data: sentEvents, error: eventsError } = await admin
    .from('account_events')
    .select('account_id, meta')
    .in('account_id', accountIds)
    .eq('kind', 'contractor_lifecycle_email_sent');

  if (eventsError || (sentEvents?.length ?? 0) >= 1000) {
    throw new Error('Lifecycle history unavailable or truncated; no nudges sent.');
  }

  const alreadySentMap = new Map<string, Set<string>>();
  for (const ev of sentEvents ?? []) {
    if (!alreadySentMap.has(ev.account_id)) {
      alreadySentMap.set(ev.account_id, new Set());
    }
    const meta = ev.meta as Record<string, unknown> | null;
    const sId = typeof meta?.step_id === 'string' ? meta.step_id : null;
    if (sId) {
      alreadySentMap.get(ev.account_id)?.add(sId);
    }
  }

  const resend = isDryRun ? null : getResendClient();
  const visited = new Set<string>();

  for (const r of recipients) {
    const cleanEmail = (r.email || '').trim().toLowerCase();
    if (visited.has(r.accountId)) {
      result.skipped++;
      result.details.push({ accountId: r.accountId, stepId, status: 'skipped', note: 'Duplicate account in batch' });
      continue;
    }
    visited.add(r.accountId);

    // Quality gate: is deliverable & not junk
    if (!cleanEmail || !isMailable(cleanEmail)) {
      result.skipped++;
      result.details.push({
        accountId: r.accountId,
        stepId: step.id,
        status: 'skipped',
        note: `Address "${cleanEmail}" failed deliverability/quality checks`,
      });
      continue;
    }

    // Suppression gate
    if (suppressedSet.has(`${r.accountId}:${cleanEmail}`)) {
      result.skipped++;
      result.details.push({
        accountId: r.accountId,
        stepId: step.id,
        status: 'skipped',
        note: `Address "${cleanEmail}" is suppressed`,
      });
      continue;
    }

    // Already-sent gate
    if (alreadySentMap.get(r.accountId)?.has(step.id)) {
      result.skipped++;
      result.details.push({
        accountId: r.accountId,
        stepId: step.id,
        status: 'skipped',
        note: `Step "${step.id}" already sent to account ${r.accountId}`,
      });
      continue;
    }

    if (sentEvents?.some((event) => event.account_id === r.accountId && isRecentLifecycleSend(event.meta))) {
      result.skipped++;
      result.details.push({ accountId: r.accountId, stepId, status: 'skipped', note: 'Onboarding email sent in the last 48 hours' });
      continue;
    }

    // Approval payloads are snapshots. Confirm account, owner and milestone again.
    const { data: account, error: accountError } = await admin.from('accounts')
      .select('id, business_name, created_at, test_marker, suspended_at, connect_onboarded')
      .eq('id', r.accountId).maybeSingle();
    if (accountError) throw new Error(`Account eligibility lookup failed: ${accountError.message}`);
    const ageDays = account ? Math.floor((Date.now() - new Date(account.created_at).getTime()) / 86400000) : -1;
    let eligible = Boolean(account && !account.test_marker && !account.suspended_at
      && ageDays >= step.minAgeDays && (step.maxAgeDays === undefined || ageDays <= step.maxAgeDays));
    if (eligible && step.id === 'nudge_zero_quotes') {
      const { data: quotes, error: quotesError } = await admin.from('jobs').select('id')
        .eq('account_id', r.accountId).gt('quoted_amount', 0).limit(1);
      if (quotesError) throw new Error(`Quote eligibility lookup failed: ${quotesError.message}`);
      eligible = !quotes?.length;
    }
    if (step.id === 'nudge_incomplete_stripe' && account?.connect_onboarded !== false) eligible = false;
    if (eligible) {
      const ownerMap = await ownerEmailsForAccounts(admin, [r.accountId]);
      if (ownerMap.get(r.accountId)?.trim().toLowerCase() !== cleanEmail) eligible = false;
    }
    if (!eligible) {
      result.skipped++;
      result.details.push({ accountId: r.accountId, stepId, status: 'skipped', note: 'Account or owner no longer eligible; refresh the preview' });
      continue;
    }

    const recipientPayload: PlatformCampaignRecipient = {
      email: cleanEmail,
      name: null,
      businessName: account?.business_name || 'your business',
      accountId: r.accountId,
    };

    try {
      const html = renderContractorLifecycleEmailHtml(step, recipientPayload);
      const subject = interpolateTokens(step.subject, recipientPayload);
      const oneClickUrl = buildUnsubscribeOneClickUrl(r.accountId, cleanEmail);
      const fromAddress = process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <hello@letsgetquoted.com>";

      if (isDryRun) {
        result.sent++;
        result.details.push({
          accountId: r.accountId,
          stepId: step.id,
          status: 'sent',
          note: `[DRY-RUN] Subject: "${subject}" to ${cleanEmail}`,
        });
        continue;
      }

      if (!resend) {
        result.skipped++;
        result.details.push({
          accountId: r.accountId,
          stepId: step.id,
          status: 'skipped',
          note: 'No Resend API key configured',
        });
        continue;
      }

      const sendRes = await sendLifecycleMessage(resend, {
        from: fromAddress,
        to: cleanEmail,
        reply_to: step.replyTo,
        subject,
        html,
        text: lifecycleText(step, recipientPayload),
        headers: listUnsubscribeHeaders(oneClickUrl),
        tags: [
          { name: 'kind', value: 'contractor_lifecycle' },
          { name: 'step', value: step.id },
          { name: 'account_id', value: r.accountId.replace(/[^a-zA-Z0-9_-]/g, '_') },
        ],
      }, `contractor-lifecycle/${r.accountId}/${step.id}`);

      if (sendRes.error || !sendRes.data?.id) {
        result.errors++;
        result.details.push({
          accountId: r.accountId,
          stepId: step.id,
          status: 'error',
          note: sendRes.error?.message || 'Provider did not confirm an email ID',
        });
        continue;
      }

      await recordAccountEvent({
        accountId: r.accountId,
        kind: 'contractor_lifecycle_email_sent',
        summary: `Sent Activation Nudge (${step.id}): "${subject}" to ${cleanEmail}`,
        meta: {
          step_id: step.id,
          recipient_email: cleanEmail,
          message_id: sendRes.data?.id,
          sent_at: new Date().toISOString(),
        },
      });

      result.sent++;
      result.details.push({
        accountId: r.accountId,
        stepId: step.id,
        status: 'sent',
      });
    } catch (err) {
      result.errors++;
      result.details.push({
        accountId: r.accountId,
        stepId: step.id,
        status: 'error',
        note: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function isRecentLifecycleSend(meta: unknown, now = Date.now()): boolean {
  const sentAt = (meta as { sent_at?: string } | null)?.sent_at;
  if (!sentAt) return false;
  const timestamp = new Date(sentAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp < 48 * 60 * 60 * 1000;
}
