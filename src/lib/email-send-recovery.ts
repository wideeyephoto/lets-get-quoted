import type { SupabaseClient } from '@supabase/supabase-js';

export type EmailSendRecoveryRow = {
  source: 'lifecycle' | 'document'; send_id: string; account_id: string; kind: string;
  state: string; phase: string; attempts: number; first_attempt_at: string; retry_before: string;
  reason: 'manual_review' | 'retry_window_expired' | 'attempt_limit' | 'worker_stalled' | 'retry_overdue';
};
export const EMAIL_RECOVERY_REASONS: Record<EmailSendRecoveryRow['reason'], string> = {
  manual_review: 'Delivery needs review', retry_window_expired: 'Retry window closed',
  attempt_limit: 'Attempt limit reached', worker_stalled: 'Send interrupted', retry_overdue: 'Retry overdue',
};
export type EmailSendRecovery = { available: boolean; rows: EmailSendRecoveryRow[]; more: boolean };
export async function loadEmailSendRecovery(admin: SupabaseClient): Promise<EmailSendRecovery> {
  try {
    const { data, error } = await admin.rpc('email_send_recovery_queue').limit(51);
    if (error || !Array.isArray(data)) throw new Error('Email recovery query unavailable');
    return { available: true, rows: data.slice(0,50), more: data.length>50 };
  } catch {
    console.error('Email recovery checks unavailable; verify the migration and database access.');
    return { available: false, rows: [], more: false };
  }
}
