import { SupabaseClient } from '@supabase/supabase-js';

export async function generateJobFinancialSnapshot(supabase: SupabaseClient, accountId: string, jobId: string) {
  // TODO: Fetch invoices, payments, refunds and generate a locked snapshot JSON
  return { generated_at: new Date().toISOString(), job_id: jobId, total_billed: 0, total_paid: 0 };
}
