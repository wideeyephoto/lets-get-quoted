import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

// Audit trail for account-level settings changes.
//
// Flipping Online booking, Quick Stop or missed-call text-back off stops money
// arriving, and until now those changes were silent and unattributable — "our
// bookings dried up last Tuesday" had nothing to check. Jobs get job_feed, staff
// actions get admin_actions; this is the equivalent for settings.
//
// Recording is ALWAYS best-effort and never blocks the change the contractor
// asked for: an audit write that fails must not stop someone turning an
// automation off. That also means this degrades quietly on a database where the
// account_events migration hasn't been applied yet, the same way the settings page
// already tolerates missing columns.

/**
 * 'automation_toggled' is a switch flipped; 'automation_settings_changed' is the
 * automation left on but told to behave differently — a new send schedule, or
 * different wording going out under the contractor's name. Worth telling apart:
 * "who turned this off" and "who changed what it says" are different questions,
 * and the second one used to leave no trace at all.
 *
 * The column is free text with no check constraint, so adding a kind needs no
 * migration. The history page renders `summary` as written.
 */
/**
 * `kind` is free text in the database, so this union is the only thing keeping
 * the audit trail's vocabulary closed. Widen it deliberately; a typo'd kind
 * writes happily and then never matches anything anybody filters on.
 */
export type AccountEventKind =
  | 'automation_toggled'
  | 'automation_settings_changed'
  | 'ai_voice_settings_updated'
  | 'ai_voice_recording_changed'
  | 'office_invitation_sent'
  | 'office_invitation_revoked';

export async function recordAccountEvent(input: {
  accountId: string;
  kind: AccountEventKind;
  summary: string;
  actorEmail?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Service-role: the table is owner-readable but never owner-writable, so a
    // contractor can't edit or delete their own audit trail.
    const admin = createAdminClient();
    const { error } = await admin.from('account_events').insert({
      account_id: input.accountId,
      kind: input.kind,
      summary: input.summary,
      actor_email: input.actorEmail ?? null,
      meta: input.meta ?? {},
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('recordAccountEvent failed:', error instanceof Error ? error.message : error);
  }
}

export type AccountEvent = {
  id: string;
  kind: string;
  summary: string;
  actor_email: string | null;
  created_at: string;
};

// Most recent settings changes for an account. Returns [] rather than throwing so
// a missing table or a read error can't take the settings page down with it.
export async function listAccountEvents(
  supabase: SupabaseClient,
  accountId: string,
  limit = 10,
): Promise<AccountEvent[]> {
  try {
    const { data, error } = await supabase
      .from('account_events')
      .select('id, kind, summary, actor_email, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as AccountEvent[];
  } catch {
    return [];
  }
}
