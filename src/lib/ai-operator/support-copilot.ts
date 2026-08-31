import type { SupabaseClient } from '@supabase/supabase-js';
import { recordOperatorAudit } from './audit';

export interface ContractorBlockerAnalysis {
  accountId: string;
  accountName: string;
  isStripeConnected: boolean;
  hasSmsSenderNumber: boolean;
  quotesCount: number;
  jobsCount: number;
  blockers: string[];
  recommendedAction: string;
  automatedNudgeSent: boolean;
}

export interface SupportCaseTriageResult {
  caseId: string;
  subject: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  identifiedTopic: 'billing' | 'sms_phone' | 'stripe_payouts' | 'features' | 'bug' | 'general';
  suggestedCustomerReply: string;
  suggestedInternalAction: string;
  requiresFounderReview: boolean;
}

/**
 * Diagnoses onboarding blockers for a contractor (Stripe, SMS hotline, first quote)
 */
export async function diagnoseContractorOnboarding(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ContractorBlockerAnalysis> {
  let stripeRes: { data: { id: string; charges_enabled: boolean } | null } = { data: null };
  try {
    const res = await supabase
      .from('stripe_connected_accounts')
      .select('id, charges_enabled')
      .eq('account_id', accountId)
      .maybeSingle();
    stripeRes = res;
  } catch {
    stripeRes = { data: null };
  }

  const [accountRes, senderRes, quotesRes, jobsRes] = await Promise.all([
    supabase.from('accounts').select('id, name, business_name, created_at').eq('id', accountId).maybeSingle(),
    supabase.from('sms_sender_numbers').select('id, status').eq('account_id', accountId).limit(1),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('status', 'in_progress'),
  ]);

  const account = accountRes.data;
  const name = account?.business_name || account?.name || 'Contractor';
  const hasSms = (senderRes.data?.length ?? 0) > 0;
  const quotesCount = quotesRes.count ?? 0;
  const jobsCount = jobsRes.count ?? 0;
  const isStripe = !!stripeRes.data?.charges_enabled;

  const blockers: string[] = [];
  if (!isStripe) blockers.push('Stripe payouts not fully connected');
  if (!hasSms) blockers.push('Field Hotline SMS number not assigned');
  if (quotesCount === 0) blockers.push('No quotes created yet');

  let recommendedAction = 'Account is fully active and healthy.';
  if (blockers.length > 0) {
    recommendedAction = `Guide contractor to resolve: ${blockers.join(', ')}.`;
  }

  return {
    accountId,
    accountName: name,
    isStripeConnected: isStripe,
    hasSmsSenderNumber: hasSms,
    quotesCount,
    jobsCount,
    blockers,
    recommendedAction,
    automatedNudgeSent: false,
  };
}

/**
 * Triages an incoming contractor support case and drafts an intelligent response
 */
export async function triageSupportCase(
  _supabase: SupabaseClient,
  caseItem: { id: string; subject: string; body?: string; account_id?: string | null },
): Promise<SupportCaseTriageResult> {
  const text = `${caseItem.subject} ${caseItem.body || ''}`.toLowerCase();

  let topic: SupportCaseTriageResult['identifiedTopic'] = 'general';
  let urgency: SupportCaseTriageResult['urgency'] = 'normal';
  let reply = '';
  let internalAction = 'Review ticket and follow up.';

  if (text.includes('payout') || text.includes('stripe') || text.includes('bank') || text.includes('deposit')) {
    topic = 'stripe_payouts';
    urgency = 'high';
    reply = `Hi there! Thank you for reaching out. For Stripe payouts, direct customer payments deposit automatically into your connected bank account according to your Stripe transfer schedule (typically 1-2 business days). You can review your live payout dashboard under Settings > Payments. If you need any assistance updating bank details, let us know!`;
    internalAction = 'Check Stripe connect account verification status in /admin/payments.';
  } else if (text.includes('sms') || text.includes('text') || text.includes('phone') || text.includes('number')) {
    topic = 'sms_phone';
    reply = `Hello! Your LGQ Field Hotline allows clients and crew to text quotes, updates, and photos directly to your workspace. All outbound SMS traffic is fully 100% white-labeled under your business name. You can verify your active sender status in Settings > Field Hotline.`;
    internalAction = 'Verify 10DLC campaign registration status in /admin/messaging.';
  } else if (text.includes('refund') || text.includes('charge') || text.includes('invoice') || text.includes('bill')) {
    topic = 'billing';
    urgency = 'high';
    reply = `Hello! We have received your billing inquiry. Our team is reviewing your account invoices right away. You can view all billing history and manage active plan add-ons under Settings > Billing.`;
    internalAction = 'Review subscription and transaction ledger in /admin/billing.';
  } else if (text.includes('quote') || text.includes('change order') || text.includes('punch list')) {
    topic = 'features';
    reply = `Hi there! To create a quote with itemized add-on upsells, open your Job view and tap "Add Line Item" or simply use your in-app Copilot to draft it instantly. Once sent, clients can approve and pay directly through their private portal!`;
    internalAction = 'Standard product feature guidance.';
  } else {
    reply = `Hello! Thank you for contacting Let's Get Quoted support. We are reviewing your inquiry and will follow up shortly to help you keep your jobs moving forward.`;
  }

  const result: SupportCaseTriageResult = {
    caseId: caseItem.id,
    subject: caseItem.subject,
    urgency,
    identifiedTopic: topic,
    suggestedCustomerReply: reply,
    suggestedInternalAction: internalAction,
    requiresFounderReview: urgency === 'high',
  };

  recordOperatorAudit({
    category: 'customer_support',
    actionName: `Support Case Triaged: #${caseItem.id}`,
    severity: 'safe_auto',
    toolName: 'triageSupportCase',
    reasoningSummary: `Triaged case "${caseItem.subject}" as topic=${topic}, urgency=${urgency}.`,
    outputResult: result,
    status: 'success',
  });

  return result;
}
