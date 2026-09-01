import type { SupabaseClient } from '@supabase/supabase-js';

export type FollowupCadenceStep = 'day_2_sms' | 'day_5_email' | 'day_7_call_reminder';

export interface QuoteFollowupCandidate {
  quoteId: string;
  accountId: string;
  businessName: string;
  homeownerName: string;
  homeownerPhone?: string | null;
  homeownerEmail?: string | null;
  quoteTotalDollars: number;
  sentAt: string;
  ageDays: number;
  suggestedAction: FollowupCadenceStep;
  messageDraft: string;
}

/**
 * Calculates which follow-up step is appropriate based on quote age (in days) and approval state.
 */
export function determineFollowupStep(sentAtIso: string, now = new Date()): { step: FollowupCadenceStep | null; ageDays: number } {
  const sentMs = new Date(sentAtIso).getTime();
  const diffDays = Math.floor((now.getTime() - sentMs) / (24 * 60 * 60 * 1000));

  if (diffDays >= 7) {
    return { step: 'day_7_call_reminder', ageDays: diffDays };
  }
  if (diffDays >= 4 && diffDays < 7) {
    return { step: 'day_5_email', ageDays: diffDays };
  }
  if (diffDays >= 2 && diffDays < 4) {
    return { step: 'day_2_sms', ageDays: diffDays };
  }
  return { step: null, ageDays: diffDays };
}

/**
 * Generates tailored follow-up copy for homeowners who haven't approved their quote yet.
 */
export function generateFollowupCopy(params: {
  businessName: string;
  homeownerName: string;
  quoteTotalDollars: number;
  step: FollowupCadenceStep;
  quoteUrl?: string;
}): string {
  const { businessName, homeownerName, quoteTotalDollars, step, quoteUrl = 'https://app.letsgetquoted.com/q/view' } = params;
  const firstName = homeownerName.split(' ')[0] || 'there';

  switch (step) {
    case 'day_2_sms':
      return `Hi ${firstName}, this is ${businessName}. Just checking if you had any questions on the $${quoteTotalDollars.toLocaleString()} estimate we prepared for you? You can review & approve here: ${quoteUrl}`;
    case 'day_5_email':
      return `Subject: Following up on your estimate from ${businessName}\n\nHi ${firstName},\n\nWe wanted to see if you had any questions or needed adjustments on the project scope ($${quoteTotalDollars.toLocaleString()}). We have availability next week and would love to reserve your spot on our schedule.\n\nReview quote: ${quoteUrl}\n\nBest,\n${businessName}`;
    case 'day_7_call_reminder':
      return `[Contractor Alert]: Quote for ${homeownerName} ($${quoteTotalDollars.toLocaleString()}) has been pending 7 days. Recommended: Quick 2-minute phone call to address any lingering questions.`;
  }
}

/**
 * Scans pending quotes and generates smart follow-up batches for the contractor or automated sender.
 */
export async function scanPendingQuotesForFollowups(
  supabase: SupabaseClient,
  accountId?: string,
): Promise<QuoteFollowupCandidate[]> {
  try {
    let query = supabase
      .from('quotes')
      .select('id, account_id, customer_name, customer_phone, customer_email, total_amount_cents, created_at, status')
      .eq('status', 'sent');

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: quotes } = await query.limit(50);
    if (!quotes || quotes.length === 0) return [];

    const candidates: QuoteFollowupCandidate[] = [];
    const now = new Date();

    for (const q of quotes) {
      const { step, ageDays } = determineFollowupStep(q.created_at, now);
      if (!step) continue;

      const totalDollars = Math.round((q.total_amount_cents || 0) / 100);
      const draft = generateFollowupCopy({
        businessName: 'Our Team',
        homeownerName: q.customer_name || 'Homeowner',
        quoteTotalDollars: totalDollars,
        step,
      });

      candidates.push({
        quoteId: q.id,
        accountId: q.account_id,
        businessName: 'Our Team',
        homeownerName: q.customer_name || 'Homeowner',
        homeownerPhone: q.customer_phone,
        homeownerEmail: q.customer_email,
        quoteTotalDollars: totalDollars,
        sentAt: q.created_at,
        ageDays,
        suggestedAction: step,
        messageDraft: draft,
      });
    }

    return candidates;
  } catch (err) {
    console.error('Failed to scan pending quotes for followups:', err);
    return [];
  }
}
