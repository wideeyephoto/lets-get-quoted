'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireOwnerContext } from '@/lib/auth';

/** Ids as the form posted them: comma-separated, and evidence of nothing. */
function postedIds(formData: FormData, field: string): string[] {
  return String(formData.get(field) ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Stamp both rails.
 *
 * One referred person can arrive down both — an ordinary booking AND a Quick
 * Stop — and that is ONE debt. Stamping only the table the button happened to
 * be rendered beside is how the other half reappears tomorrow as a fresh one.
 */
async function stampReferral(
  supabase: SupabaseClient,
  accountId: string,
  formData: FormData,
  settledAt: string | null,
  failure: string,
): Promise<void> {
  const leadIds = postedIds(formData, 'leadIds');
  const stopIds = postedIds(formData, 'stopIds');
  if (leadIds.length === 0 && stopIds.length === 0) return;

  // Scoped by account_id as well as id: the ids come from a form the browser
  // posted, so they are not evidence of anything on their own.
  const writes = [];
  if (leadIds.length > 0) {
    writes.push(supabase.from('leads').update({ referral_settled_at: settledAt }).eq('account_id', accountId).in('id', leadIds));
  }
  if (stopIds.length > 0) {
    writes.push(
      supabase.from('extra_stop_requests').update({ referral_settled_at: settledAt }).eq('account_id', accountId).in('id', stopIds),
    );
  }
  const results = await Promise.all(writes);
  if (results.some((result) => result.error)) throw new Error(failure);

  revalidatePath('/dashboard/marketing/referrals');
}

/** As long as a promise needs to be, and short enough to sit in an email. */
const REWARD_MAX = 120;

/**
 * The owner's referral promise, in their own words.
 *
 * Saving a non-empty value is what switches the feature on for this account:
 * nothing renders a referral link into outbound copy until there is something
 * to promise. Clearing it is therefore the off-switch, and it takes effect on
 * the next send with no deploy.
 */
export async function setReferralRewardAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const reward = String(formData.get('reward') ?? '')
    .trim()
    .slice(0, REWARD_MAX);

  const { error } = await supabase
    .from('accounts')
    .update({ referral_reward: reward || null })
    .eq('id', accountId);
  // Names the likely cause. The house convention (see @/lib/crew-auth,
  // @/lib/time-clock-data) is to say so rather than let a missing column read
  // as an ordinary failure the owner will retry forever.
  if (error) throw new Error('Could not save your referral offer. The referrals migration may not have been run yet.');

  revalidatePath('/dashboard/marketing/referrals');
}

/**
 * "I have thanked this person."
 *
 * Stamps EVERY lead in the group, not just the one the button was rendered
 * beside — a homeowner who inquired twice is one debt, and leaving the second
 * lead unstamped is how the same referrer gets paid twice.
 *
 * Scoped by account_id as well as id: the ids come from a form the browser
 * posted, so they are not evidence of anything on their own.
 */
export async function settleReferralAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await stampReferral(
    supabase,
    accountId,
    formData,
    new Date().toISOString(),
    'Could not mark that referral as thanked. The referrals migration may not have been run yet.',
  );
}

/** Undo — the button above is one click, and one click needs a way back. */
export async function unsettleReferralAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  await stampReferral(supabase, accountId, formData, null, 'Could not reopen that referral.');
}
