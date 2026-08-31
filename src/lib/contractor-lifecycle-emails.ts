import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  escapeHtml,
  normalizeEmailTheme,
  renderBrandedEmail,
  renderRichCampaignBodyHtml,
  themePaint,
  type EmailBrand,
  type EmailThemeId,
} from '@/emails/brand';
import { buildUnsubscribePageUrl, buildUnsubscribeOneClickUrl } from '@/lib/email-suppression';
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

export type ContractorLifecycleStepId =
  | 'welcome_day0'
  | 'quote_speed_day2'
  | 'stripe_payout_day4'
  | 'crew_arrival_day7'
  | 'reviews_reputation_day10'
  | 'ai_voice_intake_day14'
  | 'growth_scale_day21'
  | 'founder_checkin_day30'
  | 'nudge_incomplete_stripe'
  | 'nudge_zero_quotes';

export type ContractorLifecycleStep = {
  id: ContractorLifecycleStepId;
  minAgeDays: number;
  maxAgeDays?: number;
  eyebrow: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  theme: EmailThemeId;
  senderName: string;
  replyTo: string;
};

export const CONTRACTOR_LIFECYCLE_STEPS: ContractorLifecycleStep[] = [
  {
    id: 'welcome_day0',
    minAgeDays: 0,
    maxAgeDays: 1,
    eyebrow: 'Welcome Guide',
    subject: "🎉 Welcome to Let's Get Quoted — your website is live!",
    preheader: 'Here is your quick-start checklist to booking your first job.',
    heading: 'Welcome to Let’s Get Quoted, {{business_name}}!',
    body: `Hi {{first_name}},\n\nCongratulations on launching {{business_name}} on Let's Get Quoted! Your high-converting website has been created and is ready to take customer estimate requests.\n\nHere is your 3-step quick start checklist for this week:\n\n• 1. Preview & Customize Your Website: Your trade services, service area, and Google SEO tags are already filled in. Add your company photos and logo in your dashboard.\n• 2. Build Your First 60-Second Quote: Test our fast quote builder with Good / Better / Best pricing tiers and instant one-click customer signatures.\n• 3. Connect Stripe for Next-Day Payouts: Link your bank account in 2 minutes so customers can pay deposits and invoices directly from their phone.\n\nIf you ever need help configuring your trade presets or setting up your team, hit reply directly to this email — our team is here for you.`,
    ctaLabel: 'Open your dashboard & get started',
    ctaPath: '/dashboard',
    theme: 'spotlight',
    senderName: "Let's Get Quoted Team",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'quote_speed_day2',
    minAgeDays: 2,
    maxAgeDays: 4,
    eyebrow: 'Speed to Lead',
    subject: 'How top contractors close 30% more jobs (in 2 minutes)',
    preheader: 'Send professional estimates that homeowners can approve from their phone.',
    heading: 'Win more high-margin estimates in less time',
    body: `Hi {{first_name}},\n\nDid you know that quotes sent within 2 hours of a site visit are 2.8x more likely to be approved on the spot?\n\nHomeowners don't want to wait days for a PDF attachment in an email. With Let's Get Quoted, you can send an interactive estimate via SMS and email before you even leave their driveway:\n\n• Tiered Options: Give customers Good, Better, and Best choices to increase average invoice size by 22%.\n• One-Click E-Signatures: Clients approve terms and sign right from their mobile browser with zero logins required.\n• Automatic Follow-Ups: Our system gently reminds undecided homeowners so quotes don't go cold.\n\nTry creating your first test estimate today and see how seamless the customer experience feels.`,
    ctaLabel: 'Create an estimate now',
    ctaPath: '/dashboard/jobs/new',
    theme: 'blueprint',
    senderName: "Let's Get Quoted Advisor",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'stripe_payout_day4',
    minAgeDays: 4,
    maxAgeDays: 6,
    eyebrow: 'Instant Payouts',
    subject: 'Collect deposits & get paid next-day with zero chasing',
    preheader: 'Unlock credit card, Apple Pay, and ACH payments for your business.',
    heading: 'Stop chasing unpaid invoices forever',
    body: `Hi {{first_name}},\n\nOne of the biggest headaches for trade businesses is waiting 30+ days for customer checks or driving across town to collect payment.\n\nBy connecting your Stripe account in Let's Get Quoted, you unlock complete payment automation:\n\n• Upfront Deposits: Collect a 25–50% card deposit automatically when the homeowner approves the quote before you schedule the work.\n• Card & Mobile Pay: Customers pay in seconds from any smartphone via Card, Apple Pay, or Bank ACH.\n• Automatic Next-Day Payouts: Funds transfer directly into your business bank account with automated fee reconciliation.\n• Branded PDF Receipts: Instant, clean tax receipts sent to your client as soon as a payment clears.\n\nSetup takes less than 3 minutes through Stripe Connect.`,
    ctaLabel: 'Set up instant payouts',
    ctaPath: '/dashboard/settings?tab=payouts',
    theme: 'studio',
    senderName: "Let's Get Quoted Financial Ops",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'crew_arrival_day7',
    minAgeDays: 7,
    maxAgeDays: 10,
    eyebrow: 'Field Operations',
    subject: 'Put your field operations on autopilot: Live arrival alerts & crew app',
    preheader: 'Keep homeowners informed and your crew in sync without phone tag.',
    heading: 'Run stress-free job sites with live dispatch',
    body: `Hi {{first_name}},\n\nHomeowners love communication, but calling or texting every customer while navigating traffic is exhausting.\n\nLet's Get Quoted automates field communication so your team looks ultra-professional on every job:\n\n• "On Our Way" Arrival Alerts: Send automated SMS texts with crew arrival windows and live map tracking with a single tap.\n• Field Crew App: Dispatch jobs to your technicians or subcontractors with exact task lists, entry notes, and customer phone numbers.\n• Before & After Photos: Crew members can snap photos on-site that save directly to the job file and invoice for bulletproof work documentation.\n\nInvite your crew members or subcontractors in your workspace to get started.`,
    ctaLabel: 'Explore crew dispatch & tracking',
    ctaPath: '/dashboard/crew',
    theme: 'blueprint',
    senderName: "Let's Get Quoted Operations",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'reviews_reputation_day10',
    minAgeDays: 10,
    maxAgeDays: 13,
    eyebrow: 'Google Reviews',
    subject: 'Turn every happy customer into a 5-star Google review',
    preheader: 'How automated post-job review requests build unstoppable local SEO.',
    heading: 'Build a 5-star local reputation on autopilot',
    body: `Hi {{first_name}},\n\n92% of homeowners check Google reviews before hiring a trade contractor. But asking for reviews manually often gets forgotten when you’re busy wrapping up a job.\n\nLet's Get Quoted includes a built-in reputation flywheel:\n\n• Automated Review Requests: When an invoice is marked paid or completed, our system automatically sends a friendly SMS review invite.\n• Direct Google Business Sync: Satisfied customers are routed straight to your Google review submission box in 1 tap.\n• Negative Feedback Firewall: If a customer has a concern, they are given a private feedback form directly to you first so you can resolve it before it becomes a public review.\n\nConnect your Google review link in Settings to start collecting reviews automatically this week.`,
    ctaLabel: 'Configure review settings',
    ctaPath: '/dashboard/reviews',
    theme: 'neighborly',
    senderName: "Let's Get Quoted Growth Team",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'ai_voice_intake_day14',
    minAgeDays: 14,
    maxAgeDays: 18,
    eyebrow: 'AI Voice Assistant',
    subject: 'Never lose another job to voicemail: Meet AI Voice Intake',
    preheader: '24/7 intelligent call answering that turns missed calls into quotes.',
    heading: 'Answer every customer call 24/7 with AI Voice Intake',
    body: `Hi {{first_name}},\n\nWhen you are on a roof, under a sink, or running power tools, picking up the phone is nearly impossible. But 80% of homeowners who hit voicemail simply hang up and call the next contractor on Google.\n\nWith AI Voice Intake on Let's Get Quoted, you never lose a job to voicemail again:\n\n• Natural 24/7 Call Answering: Our trained AI voice assistant answers after-hours and overflow calls using your business name.\n• Structured Job Details: It asks for the caller’s address, requested service, urgency, and contact info.\n• Instant Quote Draft: All call transcripts and recordings land in your dashboard instantly drafted as a new estimate ready for your review.\n\nForward your business phone or get a dedicated local line in your workspace.`,
    ctaLabel: 'See AI Voice Intake in action',
    ctaPath: '/dashboard/settings?tab=voice',
    theme: 'spotlight',
    senderName: "Let's Get Quoted Product Team",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'growth_scale_day21',
    minAgeDays: 21,
    maxAgeDays: 28,
    eyebrow: 'Growth Playbook',
    subject: 'Ready to scale {{business_name}}? Compare Solo vs Growth',
    preheader: 'Unlock unlimited estimates, multi-crew access, and custom domains.',
    heading: 'Supercharge your business with premium contractor tools',
    body: `Hi {{first_name}},\n\nAs {{business_name}} takes on more jobs and expands operations, having software that scales with your crew makes all the difference.\n\nHere is a quick look at what our Growth & Solo plans unlock:\n\n• Unlimited Monthly Estimates & Invoices with reduced platform processing fees (down to 0.25%).\n• Up to 10 Crew Seats with individual permissions and GPS arrival tracking.\n• 1,500 Monthly SMS Credits & automated customer review generation.\n• QuickBooks Online 2-Way Accounting Sync for automated bookkeeping.\n• Custom Domain Setup for your website (e.g. yourbusiness.com).\n\nUpgrade your workspace at any time to unlock full capabilities.`,
    ctaLabel: 'View plan options & pricing',
    ctaPath: '/dashboard/billing',
    theme: 'studio',
    senderName: "Let's Get Quoted",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'founder_checkin_day30',
    minAgeDays: 30,
    maxAgeDays: 45,
    eyebrow: 'Founder Note',
    subject: 'How is everything running at {{business_name}}? (Founder check-in)',
    preheader: 'A quick personal note from Brett at Let’s Get Quoted.',
    heading: 'Checking in on {{business_name}}',
    body: `Hi {{first_name}},\n\nI wanted to personally check in and see how everything is going with {{business_name}} and your Let's Get Quoted workspace.\n\nWe built this platform specifically for trade contractors to eliminate administrative friction, get quotes approved in minutes, and help you get paid without hassle.\n\nI’d love to know:\n\n1. What feature has helped your business the most so far?\n2. Is there anything frustrating or missing that you would like us to build next?\n\nJust hit reply to this email. I read and personally respond to every contractor message.\n\nThank you for being part of our community!`,
    ctaLabel: 'Visit your dashboard',
    ctaPath: '/dashboard',
    theme: 'letterhead',
    senderName: "Brett at Let's Get Quoted",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'nudge_incomplete_stripe',
    minAgeDays: 3,
    maxAgeDays: 14,
    eyebrow: 'Setup Assistance',
    subject: 'Quick reminder: Finish setting up your payouts to accept card deposits',
    preheader: 'Enable instant card payments and deposits for {{business_name}}.',
    heading: 'Unlock customer card payments for {{business_name}}',
    body: `Hi {{first_name}},\n\nWe noticed you haven't finished setting up Stripe Connect for {{business_name}} yet.\n\nWithout an active payout connection, your customers won't be able to pay deposits or invoices online with credit card, debit, or Apple Pay.\n\nConnecting takes just 2 minutes:\n1. Click the button below to open your Payout Settings.\n2. Complete the secure Stripe verification with your business bank details.\n3. Start accepting instant deposits on every quote you send.\n\nIf you have any questions during setup, simply reply to this email.`,
    ctaLabel: 'Finish payout setup now',
    ctaPath: '/dashboard/settings?tab=payouts',
    theme: 'studio',
    senderName: "Let's Get Quoted Support",
    replyTo: 'hello@letsgetquoted.com',
  },
  {
    id: 'nudge_zero_quotes',
    minAgeDays: 5,
    maxAgeDays: 15,
    eyebrow: 'Estimate Assistant',
    subject: 'Need a hand creating your first quote on Let’s Get Quoted?',
    preheader: 'We can help you set up your trade pricing and quote templates.',
    heading: 'Let’s build your first estimate together',
    body: `Hi {{first_name}},\n\nWe noticed you haven't sent an estimate from your {{business_name}} workspace yet.\n\nGetting your first quote out the door is the fastest way to experience how quickly homeowners approve work when they can sign and accept on their phone.\n\nHere are a few quick tips to create one in under 2 minutes:\n• Use our pre-built trade item templates to quickly add labor and materials.\n• Set up a 3-tier Good / Better / Best quote so homeowners can pick their budget.\n• Send the quote link directly via SMS for fastest response time.\n\nIf you'd like us to help load your standard services or price list, reply to this email and our support team will assist you directly.`,
    ctaLabel: 'Build your first quote',
    ctaPath: '/dashboard/jobs/new',
    theme: 'blueprint',
    senderName: "Let's Get Quoted Support",
    replyTo: 'hello@letsgetquoted.com',
  },
];

function campaignParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const isBulletList = lines.every((line) => line.trim().startsWith('•') || line.trim().startsWith('-') || /^\d+\./.test(line.trim()));
      if (isBulletList) {
        const items = lines
          .map((line) => line.replace(/^[•\-]\s*/, '').replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean)
          .map((item) => `<li style="margin-bottom:8px;line-height:1.6">${escapeHtml(item)}</li>`)
          .join('');
        return `<ul style="margin:0 0 16px;padding-left:22px;color:#1c2230;font-size:15px;line-height:1.6">${items}</ul>`;
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1c2230">${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('');
}

function marketingFooter(businessName: string, mailingAddress: string | null, unsubscribeUrl: string): string {
  const addressLine = mailingAddress
    ? `<br/><span style="color:#9099a6">${escapeHtml(mailingAddress)}</span>`
    : '<br/><span style="color:#9099a6">Let’s Get Quoted Inc. · Austin, TX</span>';
  return `<p style="margin-top:28px;color:#6b7280;font-size:12px;line-height:1.6">${escapeHtml(businessName)}${addressLine}<br/><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline">Unsubscribe from platform onboarding emails</a></p>`;
}

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
  const theme = normalizeEmailTheme(step.theme);
  const mailingAddress = process.env.COMPANY_MAILING_ADDRESS || 'Let’s Get Quoted Inc. · Austin, TX';
  const replyTo = step.replyTo || 'hello@letsgetquoted.com';
  const senderName = step.senderName || "Let's Get Quoted";

  const brand: EmailBrand = {
    businessName: senderName,
    accent: '#ff7a21',
    logoUrl: null,
    phone: null,
    siteUrl: 'https://letsgetquoted.com',
    replyTo,
    theme,
    mailingAddress,
    senderName,
  };

  const interpolatedHeading = interpolateTokens(step.heading, recipient);
  const interpolatedBody = interpolateTokens(step.body, recipient);
  const interpolatedEyebrow = interpolateTokens(step.eyebrow, recipient);
  const interpolatedPreheader = interpolateTokens(step.preheader, recipient);

  const accountId = recipient.accountId || 'platform';
  const targetEmail = recipient.email || 'contractor@example.com';
  const unsubscribeUrl = buildUnsubscribePageUrl(accountId, targetEmail);
  const appOrigin = (APP_ORIGIN || 'https://letsgetquoted.com').replace(/\/$/, '');
  const fullCtaUrl = `${appOrigin}${step.ctaPath.startsWith('/') ? step.ctaPath : `/${step.ctaPath}`}`;

  return renderBrandedEmail({
    brand,
    audience: 'account',
    preheader: interpolatedPreheader,
    eyebrow: interpolatedEyebrow,
    heading: interpolatedHeading,
    bodyHtml: renderRichCampaignBodyHtml(interpolatedBody, themePaint(theme, '#ff7a21')),
    cta: {
      label: interpolateTokens(step.ctaLabel, recipient),
      url: fullCtaUrl,
    },
    footerHtml: marketingFooter("Let's Get Quoted", mailingAddress, unsubscribeUrl),
    accountReplyText: `Reply directly to this email to reach our team (${replyTo}).`,
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

    if (!targetEmail) {
      const { data: account } = await admin
        .from('accounts')
        .select('reply_to_email, business_name')
        .eq('id', input.accountId)
        .maybeSingle();
      targetEmail = account?.reply_to_email?.trim() || undefined;
    }

    if (!targetEmail || !isMailable(targetEmail)) {
      console.warn(`[contractor-lifecycle] No valid mailable email found for account ${input.accountId}; skipping welcome email.`);
      return { ok: false, error: 'no_mailable_email' };
    }

    const { data: suppression } = await admin
      .from('email_suppression')
      .select('email')
      .eq('account_id', input.accountId)
      .eq('email', targetEmail.toLowerCase())
      .maybeSingle();

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

    const sendRes = await resend.emails.send({
      from: fromAddress,
      to: recipient.email,
      reply_to: welcomeStep.replyTo,
      subject,
      html,
      headers: listUnsubscribeHeaders(oneClickUrl),
      tags: [
        { name: 'kind', value: 'contractor_lifecycle' },
        { name: 'step', value: 'welcome_day0' },
        { name: 'account_id', value: input.accountId.replace(/[^a-zA-Z0-9_-]/g, '_') },
      ],
    });

    if (sendRes.error) {
      console.error('[contractor-lifecycle] Failed to send welcome email:', sendRes.error);
      return { ok: false, error: sendRes.error.message };
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
export async function runContractorLifecycleSweep(adminClient?: SupabaseClient): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ accountId: string; stepId: string; status: 'sent' | 'skipped' | 'error'; note?: string }>;
}> {
  const admin = adminClient ?? createAdminClient();
  const result = {
    checked: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<{ accountId: string; stepId: string; status: 'sent' | 'skipped' | 'error'; note?: string }>,
  };

  const resend = getResendClient();
  if (!resend) {
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
  const { data: sentEvents } = await admin
    .from('account_events')
    .select('account_id, meta')
    .in('account_id', accountIds)
    .eq('kind', 'contractor_lifecycle_email_sent');

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
  const { data: jobCounts } = await admin
    .from('jobs')
    .select('account_id')
    .in('account_id', accountIds);

  const quoteCountMap = new Map<string, number>();
  for (const j of jobCounts ?? []) {
    if (j.account_id) {
      quoteCountMap.set(j.account_id, (quoteCountMap.get(j.account_id) || 0) + 1);
    }
  }

  // Load suppressions
  const { data: suppressions } = await admin
    .from('email_suppression')
    .select('account_id, email')
    .in('account_id', accountIds);

  const suppressedSet = new Set<string>();
  for (const s of suppressions ?? []) {
    if (s.email) suppressedSet.add(`${s.account_id}:${String(s.email).toLowerCase().trim()}`);
  }

  const now = Date.now();

  for (const account of accounts) {
    const rawEmail = account.reply_to_email || ownerEmailMap.get(account.id);
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
      for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
        if (step.id === 'nudge_incomplete_stripe' || step.id === 'nudge_zero_quotes') continue;
        if (alreadySent.has(step.id)) continue;

        if (accountAgeDays >= step.minAgeDays && (step.maxAgeDays === undefined || accountAgeDays <= step.maxAgeDays)) {
          stepToSend = step;
          break;
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

      const sendRes = await resend.emails.send({
        from: fromAddress,
        to: recipient.email,
        reply_to: stepToSend.replyTo,
        subject,
        html,
        headers: listUnsubscribeHeaders(oneClickUrl),
        tags: [
          { name: 'kind', value: 'contractor_lifecycle' },
          { name: 'step', value: stepToSend.id },
          { name: 'account_id', value: account.id.replace(/[^a-zA-Z0-9_-]/g, '_') },
        ],
      });

      if (sendRes.error) {
        result.errors++;
        result.details.push({
          accountId: account.id,
          stepId: stepToSend.id,
          status: 'error',
          note: sendRes.error.message,
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
