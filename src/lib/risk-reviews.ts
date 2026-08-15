import type { SupabaseClient } from '@supabase/supabase-js';

export const RISK_DISPOSITIONS = ['open', 'monitor', 'cleared', 'escalated'] as const;
export type RiskDisposition = (typeof RISK_DISPOSITIONS)[number];
export type RiskReview = { id: string; account_id: string; disposition: RiskDisposition; note: string; review_on: string | null; created_by: string; created_at: string };

export function isRiskDisposition(value: unknown): value is RiskDisposition {
  return typeof value === 'string' && (RISK_DISPOSITIONS as readonly string[]).includes(value);
}

export async function latestRiskReviews(admin: SupabaseClient, accountIds: string[]): Promise<{ reviews: Map<string, RiskReview>; available: boolean }> {
  const reviews = new Map<string, RiskReview>();
  if (!accountIds.length) return { reviews, available: true };
  const { data, error } = await admin.from('risk_reviews').select('id, account_id, disposition, note, review_on, created_by, created_at').in('account_id', accountIds).order('created_at', { ascending: false }).limit(2000);
  if (error) {
    console.error('latestRiskReviews failed:', error);
    return { reviews, available: false };
  }
  for (const row of (data ?? []) as RiskReview[]) if (!reviews.has(row.account_id)) reviews.set(row.account_id, row);
  return { reviews, available: true };
}
