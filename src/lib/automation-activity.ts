import type { SupabaseClient } from '@supabase/supabase-js';

// Surfaces what the account's automations have been doing lately, so an owner
// can see the review-request / follow-up / deposit machinery actually working.

export type AutomationActivityItem = {
  kind: 'review_requested' | 'quote_followup' | 'appointment_reminder' | 'deposit';
  label: string;
  at: string;
  jobId: string | null;
  amount: number | null;
};

export type AutomationActivity = {
  windowDays: number;
  reviewCount: number;
  followupCount: number;
  reminderCount: number;
  depositCount: number;
  depositTotal: number;
  recent: AutomationActivityItem[];
  total: number;
};

export async function getAutomationActivity(supabase: SupabaseClient, accountId: string, windowDays = 30): Promise<AutomationActivity> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: feedRows }, { data: depositRows }] = await Promise.all([
    supabase
      .from('job_feed')
      .select('kind, title, job_id, created_at')
      .eq('account_id', accountId)
      .in('kind', ['review_requested', 'quote_followup', 'appointment_reminder'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('job_id, amount, created_at')
      .eq('account_id', accountId)
      .eq('kind', 'deposit')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
  ]);

  const feed = feedRows ?? [];
  const deposits = depositRows ?? [];

  const reviewCount = feed.filter((row) => row.kind === 'review_requested').length;
  const followupCount = feed.filter((row) => row.kind === 'quote_followup').length;
  const reminderCount = feed.filter((row) => row.kind === 'appointment_reminder').length;
  const depositCount = deposits.length;
  const depositTotal = deposits.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const feedLabel = (kind: string): string => {
    if (kind === 'review_requested') return 'Review request sent';
    if (kind === 'quote_followup') return 'Quote follow-up sent';
    return 'Appointment reminder sent';
  };

  const items: AutomationActivityItem[] = [
    ...feed.map((row) => ({
      kind: row.kind as 'review_requested' | 'quote_followup' | 'appointment_reminder',
      label: row.title || feedLabel(row.kind as string),
      at: row.created_at as string,
      jobId: (row.job_id as string) ?? null,
      amount: null,
    })),
    ...deposits.map((row) => ({
      kind: 'deposit' as const,
      label: 'Deposit requested on approval',
      at: row.created_at as string,
      jobId: (row.job_id as string) ?? null,
      amount: Number(row.amount) || 0,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return {
    windowDays,
    reviewCount,
    followupCount,
    reminderCount,
    depositCount,
    depositTotal,
    recent: items,
    total: reviewCount + followupCount + reminderCount + depositCount,
  };
}
