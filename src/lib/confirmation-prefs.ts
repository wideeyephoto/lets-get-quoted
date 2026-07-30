import type { SupabaseClient } from '@supabase/supabase-js';

// Whether the contractor wants a receipt when something goes out to a customer.
//
// One reader for all of them so every send site degrades the same way: a database
// without the column yet falls back to the column's intended default rather than
// throwing, and a read failure never stops the thing the contractor actually
// asked for. A confirmation is a courtesy — it must not be able to break a quote,
// a payment request or a review ask.

export type ConfirmationColumn =
  | 'quote_confirmation_email'
  | 'payment_confirmation_email'
  | 'review_confirmation_email'
  | 'reminder_confirmation_email';

// Matches the column defaults in schema.sql. Reminders default OFF because they
// fire for every job booked the next day — see sendReminderRunSummaryEmail.
export const CONFIRMATION_DEFAULTS: Record<ConfirmationColumn, boolean> = {
  quote_confirmation_email: true,
  payment_confirmation_email: true,
  review_confirmation_email: true,
  reminder_confirmation_email: false,
};

export async function wantsConfirmation(
  supabase: SupabaseClient,
  accountId: string,
  column: ConfirmationColumn,
): Promise<boolean> {
  const fallback = CONFIRMATION_DEFAULTS[column];
  try {
    const { data, error } = await supabase.from('accounts').select(column).eq('id', accountId).maybeSingle();
    if (error || !data) return fallback;
    const value = (data as Record<string, unknown>)[column];
    return typeof value === 'boolean' ? value : fallback;
  } catch {
    return fallback;
  }
}
