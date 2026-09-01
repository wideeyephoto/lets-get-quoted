import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit } from './audit';
import type {
  ContractorBlockerAnalysis,
  OnboardingBlockerDetail,
  SupportCaseTriageResult,
} from './types';

export type { ContractorBlockerAnalysis, SupportCaseTriageResult };

/**
 * Diagnoses onboarding blockers for a contractor (Stripe Connect setup, SMS hotline provisioning, first quote creation)
 * and generates structured remediation guidance.
 */
export async function diagnoseContractorOnboarding(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ContractorBlockerAnalysis> {
  let stripeRes: { data: { id: string; charges_enabled?: boolean; payouts_enabled?: boolean } | null } = { data: null };
  try {
    const res = await supabase
      .from('stripe_connected_accounts')
      .select('id, charges_enabled, payouts_enabled')
      .eq('account_id', accountId)
      .maybeSingle();
    stripeRes = res;
  } catch {
    stripeRes = { data: null };
  }

  const [accountRes, senderRes, quotesRes, jobsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, business_name, connect_onboarded, connect_disabled_at, stripe_connect_id, created_at')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sms_sender_numbers')
      .select('id, status, phone_number')
      .eq('account_id', accountId)
      .limit(5),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'in_progress'),
  ]);

  const account = accountRes.data;
  const name = account?.business_name || account?.name || 'Contractor';
  
  // Stripe connection check: either stripe_connected_accounts row has charges enabled OR account has connect_onboarded = true
  const isStripe = Boolean(
    stripeRes.data?.charges_enabled ||
    (account?.connect_onboarded && !account?.connect_disabled_at)
  );

  const hasSms = (senderRes.data?.length ?? 0) > 0;
  const quotesCount = quotesRes.count ?? 0;
  const jobsCount = jobsRes.count ?? 0;

  const blockerDetails: OnboardingBlockerDetail[] = [];
  const blockers: string[] = [];

  // 1. Stripe Connect KYC & Payout Check
  if (!isStripe) {
    blockers.push('Stripe payouts not fully connected');
    blockerDetails.push({
      code: 'stripe_connect_missing',
      title: 'Stripe Connect Payout Setup Incomplete',
      description:
        'Customer card processing and direct deposit payouts are locked until Stripe Connect KYC verification is finalized.',
      remediationSteps: [
        'Navigate to Settings > Payments & Payouts (/dashboard/settings/payments).',
        'Click "Connect Stripe Account" to submit required business entity and bank account details.',
        'Ensure charges_enabled status is active to begin accepting credit card deposits on proposals.',
      ],
      severity: 'high',
    });
  }

  // 2. Dedicated SMS Hotline Provisioning Check
  if (!hasSms) {
    blockers.push('Field Hotline SMS number not assigned');
    blockerDetails.push({
      code: 'sms_hotline_missing',
      title: 'Dedicated SMS Hotline Not Provisioned',
      description:
        'Contractor lacks an active 10DLC registered SMS number to auto-dispatch quote approvals, booking confirmations, and arrival alerts.',
      remediationSteps: [
        'Open Settings > Field Hotline (/dashboard/settings/phone).',
        'Choose a local area code and claim a dedicated business phone number.',
        'Complete 10DLC brand registration for 100% white-labeled deliverability to customer mobile devices.',
      ],
      severity: 'high',
    });
  }

  // 3. First Quote Creation Check
  if (quotesCount === 0) {
    blockers.push('No quotes created yet');
    blockerDetails.push({
      code: 'first_quote_missing',
      title: 'First Quote Not Yet Created',
      description:
        'Contractor has not drafted or dispatched their first proposal with itemized line items and payment milestones.',
      remediationSteps: [
        'Go to Jobs & Quotes (/dashboard/jobs) and tap "New Quote".',
        'Use the AI Copilot to automatically populate trade-specific scope of work, labor, and materials.',
        'Send the quote link directly via SMS to the client for 1-click digital approval and deposit collection.',
      ],
      severity: 'medium',
    });
  }

  let status: ContractorBlockerAnalysis['status'] = 'fully_activated';
  let suggestedNudge: ContractorBlockerAnalysis['suggestedNudgeCampaign'] = undefined;

  if (blockerDetails.length >= 2 || !isStripe) {
    status = 'critically_blocked';
    suggestedNudge = !isStripe ? 'stripe_connect_reminder' : 'phone_setup_help';
  } else if (blockerDetails.length > 0) {
    status = 'partially_blocked';
    suggestedNudge = quotesCount === 0 ? 'first_quote_reminder' : 'phone_setup_help';
  }

  let recommendedAction = 'Contractor workspace is fully operational and healthy.';
  if (blockerDetails.length > 0) {
    recommendedAction = `Guide contractor through onboarding resolution: ${blockers.join('; ')}.`;
  }

  const analysis: ContractorBlockerAnalysis = {
    accountId,
    accountName: name,
    isStripeConnected: isStripe,
    hasSmsSenderNumber: hasSms,
    quotesCount,
    jobsCount,
    status,
    blockers,
    blockerDetails,
    recommendedAction,
    automatedNudgeSent: false,
    suggestedNudgeCampaign: suggestedNudge,
  };

  return analysis;
}

/**
 * Triages an incoming contractor support case and drafts an intelligent, contextual response
 */
export async function triageSupportCase(
  supabase: SupabaseClient,
  caseItem: { id: string; subject: string; body?: string; account_id?: string | null },
): Promise<SupportCaseTriageResult> {
  const text = `${caseItem.subject} ${caseItem.body || ''}`.toLowerCase();

  let topic: SupportCaseTriageResult['identifiedTopic'] = 'general';
  let urgency: SupportCaseTriageResult['urgency'] = 'normal';
  let reply = '';
  let internalAction = 'Review ticket and follow up.';


  // Topic classification & diagnostic drafting
  if (
    (text.includes('stripe') && (text.includes('connect') || text.includes('setup') || text.includes('onboard') || text.includes('identity') || text.includes('kyc') || text.includes('bank'))) ||
    text.includes('connect stripe') ||
    text.includes('connect my stripe') ||
    text.includes('connect bank') ||
    text.includes('identity verification') ||
    text.includes('bank setup') ||
    text.includes('charges not enabled') ||
    text.includes('connect account')
  ) {
    topic = 'stripe_connect_onboarding';
    urgency = 'high';
    reply = `Hi there! Thank you for contacting Let's Get Quoted support. To complete your Stripe Connect setup and unlock instant card payments, please navigate to Settings > Payments & Payouts (under your dashboard). From there, click "Complete Stripe Verification" to confirm your bank account and tax details. Once verified, deposits will route straight to your account automatically!`;
    internalAction = 'Check Stripe Connect onboarding status in /admin/accounts and verify charges_enabled.';
  } else if (
    text.includes('payout') ||
    text.includes('when do i get paid') ||
    text.includes('where is my money') ||
    text.includes('deposit timing') ||
    text.includes('payout ledger') ||
    (text.includes('deposit') && !text.includes('setup'))
  ) {
    topic = 'stripe_payouts';
    urgency = 'high';
    reply = `Hi there! For Stripe payouts, customer card payments deposit automatically into your connected bank account according to your standard payout cadence (typically 1–2 business days for established accounts). You can review your real-time payout ledger and upcoming settlement batches directly in Settings > Payments. If you need any assistance updating payout schedules, please let us know!`;
    internalAction = 'Inspect payout schedule and recent charge settlement batches in /admin/payments.';
  } else if (
    text.includes('sms') ||
    text.includes('text') ||
    text.includes('phone') ||
    text.includes('10dlc') ||
    text.includes('hotline') ||
    text.includes('area code') ||
    text.includes('carrier')
  ) {
    topic = 'sms_phone';
    urgency = 'normal';
    reply = `Hello! Your LGQ Field Hotline gives your business a dedicated local SMS number for sending client quotes, appointment reminders, and receiving incoming leads. All messages are 100% white-labeled under your company name. To manage or select your active number, head over to Settings > Field Hotline. Let us know if you would like us to assign a specific area code!`;
    internalAction = 'Verify 10DLC brand registration and active carrier status in /admin/messaging.';
  } else if (
    text.includes('first quote') ||
    text.includes('create quote') ||
    text.includes('send estimate') ||
    text.includes('proposal') ||
    text.includes('line item') ||
    text.includes('quote builder')
  ) {
    topic = 'quote_creation';
    urgency = 'normal';
    reply = `Hi there! Creating and sending your first quote is quick and simple: open your Jobs board (/dashboard/jobs), click "New Quote", and use the AI Estimator or trade presets to add your scope of work. You can add optional upsell tiers and request a deposit. Once saved, click "Send to Client" to dispatch a secure mobile-friendly approval link!`;
    internalAction = 'Review contractor quote activity in /admin/accounts.';
  } else if (
    text.includes('refund') ||
    text.includes('dispute') ||
    text.includes('chargeback') ||
    text.includes('invoice error') ||
    text.includes('overcharge') ||
    text.includes('dunning') ||
    text.includes('cancel subscription') ||
    text.includes('subscription') ||
    text.includes('tier') ||
    text.includes('scale plan') ||
    text.includes('upgrade') ||
    text.includes('bill')
  ) {
    topic = 'billing';
    urgency = (text.includes('dispute') || text.includes('chargeback')) ? 'urgent' : 'high';
    reply = `Hello! We have received your billing inquiry. Our finance and operations team is reviewing your account invoices right away. You can view all billing history and manage active plan add-ons under Settings > Billing.`;
    internalAction = 'Review subscription and transaction ledger in /admin/billing.';
  } else if (
    text.includes('first quote') ||
    text.includes('create quote') ||
    text.includes('send estimate') ||
    text.includes('proposal') ||
    text.includes('line item') ||
    text.includes('quote builder') ||
    text.includes('quote') ||
    text.includes('estimate') ||
    text.includes('invoice') ||
    text.includes('change order') ||
    text.includes('e-sign') ||
    text.includes('signature')
  ) {
    topic = 'quote_creation';
    urgency = 'normal';
    reply = `Hi there! Creating and sending quotes is quick and simple: open your Jobs board (/dashboard/jobs), click "New Quote", and use the AI Estimator or trade presets to add your scope of work. You can add optional upsell tiers and request a deposit. Once saved, click "Send to Client" to dispatch a secure mobile-friendly approval link!`;
    internalAction = 'Review contractor quote activity in /admin/accounts.';
  } else if (
    text.includes('crew') ||
    text.includes('schedule') ||
    text.includes('dispatch') ||
    text.includes('calendar') ||
    text.includes('timeclock') ||
    text.includes('truck') ||
    text.includes('route')
  ) {
    topic = 'crew_scheduling';
    urgency = 'normal';
    reply = `Hello! Crew members can view their daily dispatch, equipment loadouts, and turn-by-turn route maps directly on their mobile view. You can manage assignments and timeclock hours under Schedule and Crew in your workspace.`;
    internalAction = 'Review crew permissions and dispatch route optimization settings.';
  } else if (
    text.includes('custom domain') ||
    text.includes('cname') ||
    text.includes('domain') ||
    text.includes('website') ||
    text.includes('subdomain') ||
    text.includes('dns') ||
    text.includes('ssl') ||
    text.includes('template')
  ) {
    topic = 'website_domain';
    urgency = 'normal';
    reply = `Hello! Your hosted marketing website is live with instant quote intake forms. To connect a custom domain (e.g. yourcompany.com), configure it under Settings > Custom Domain. SSL certificates are issued automatically.`;
    internalAction = 'Verify custom domain DNS propagation and SSL status in /admin.';
  } else if (text.includes('error') || text.includes('bug') || text.includes('crash') || text.includes('500') || text.includes('broken') || text.includes('failed')) {
    topic = 'bug';
    urgency = 'high';
    reply = `Hello! Thank you for reporting this issue. Our SRE team has logged the error details and is investigating immediately to ensure your workflow is uninterrupted. We will update you as soon as a fix is deployed.`;
    internalAction = 'Inspect recent server error logs and SRE alerts in /admin/failures.';
  } else if (text.includes('feature') || text.includes('how do i') || text.includes('can i')) {
    topic = 'features';
    reply = `Hi there! Let's Get Quoted is designed to streamline your entire contractor lifecycle from lead intake to paid invoices. Check out our in-app feature guides or let us know what workflow you would like help configuring!`;
    internalAction = 'Standard product feature guidance.';
  } else {
    reply = `Hello! Thank you for contacting Let's Get Quoted support. We are reviewing your inquiry and will follow up shortly to help you keep your jobs moving forward.`;
  }


  const requiresFounder = urgency === 'urgent' || topic === 'billing';

  const result: SupportCaseTriageResult = {
    caseId: caseItem.id,
    subject: caseItem.subject,
    urgency,
    identifiedTopic: topic,
    suggestedCustomerReply: reply,
    suggestedInternalAction: internalAction,
    requiresFounderReview: requiresFounder,
  };

  recordOperatorAudit({
    category: 'customer_support',
    actionName: `Support Case Triaged: #${caseItem.id}`,
    severity: 'safe_auto',
    toolName: 'triageSupportCase',
    reasoningSummary: `Triaged case "${caseItem.subject}" as topic=${topic}, urgency=${urgency}. Requires founder=${requiresFounder}.`,
    outputResult: result,
    status: 'success',
  });

  return result;
}

