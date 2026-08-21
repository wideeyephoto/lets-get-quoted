'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';

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
  const leadIds = String(formData.get('leadIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (leadIds.length === 0) return;

  const { error } = await supabase
    .from('leads')
    .update({ referral_settled_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .in('id', leadIds);
  if (error) throw new Error('Could not mark that referral as thanked. The referrals migration may not have been run yet.');

  revalidatePath('/dashboard/marketing/referrals');
}

/** Undo — the button above is one click, and one click needs a way back. */
export async function unsettleReferralAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const leadIds = String(formData.get('leadIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (leadIds.length === 0) return;

  const { error } = await supabase
    .from('leads')
    .update({ referral_settled_at: null })
    .eq('account_id', accountId)
    .in('id', leadIds);
  if (error) throw new Error('Could not reopen that referral. The referrals migration may not have been run yet.');

  revalidatePath('/dashboard/marketing/referrals');
}
