'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { getTrade } from '@/lib/trades';
import {
  TERMS_VERSION,
  businessNameProblem,
  normalizeBusinessName,
  normalizePostalCode,
  postalCodeProblem,
} from '@/lib/terms';

export type FirstRunResult = { ok: true } | { ok: false; error: string };

/**
 * Record first-run answers and Terms acceptance.
 *
 * A server action is a public endpoint, so every check the form makes is made
 * again here. In particular:
 *
 *  - `accepted` is re-checked. The checkbox in the browser is a courtesy; this
 *    is the thing that decides whether an agreement exists, and an agreement
 *    nobody actually assented to is worse than no record at all.
 *  - The version written is the SERVER's TERMS_VERSION. It is never taken from
 *    the caller — otherwise anyone could claim to have accepted a document that
 *    does not exist, and the record would look complete while meaning nothing.
 *  - The trade is only stored if it resolves to a real trade, so the column
 *    can't be used as free-text storage from outside.
 *
 * skipFirstRunGate is set because requireOwnerContext otherwise redirects
 * un-accepted owners straight back to /welcome — which is where this call comes
 * from, and would be an infinite loop.
 */
export async function completeFirstRunAction(input: {
  businessName: string;
  trade: string;
  postalCode: string;
  accepted: boolean;
}): Promise<FirstRunResult> {
  const { supabase, accountId, userId } = await requireOwnerContext({ skipFirstRunGate: true });

  if (input.accepted !== true) {
    return { ok: false, error: 'Please accept the Terms of Service to continue.' };
  }

  const nameProblem = businessNameProblem(input.businessName);
  if (nameProblem) return { ok: false, error: nameProblem };

  const zipProblem = postalCodeProblem(input.postalCode);
  if (zipProblem) return { ok: false, error: zipProblem };

  // '' is a real answer — "my trade isn't listed" — and stores as null rather
  // than as an unrecognised string.
  const requested = String(input.trade ?? '').trim();
  if (requested && !getTrade(requested)) {
    return { ok: false, error: 'Pick a trade from the list, or choose "Something else".' };
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      business_name: normalizeBusinessName(input.businessName),
      trade: requested || null,
      postal_code: normalizePostalCode(input.postalCode),
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      terms_accepted_by: userId,
    })
    .eq('id', accountId);

  if (error) {
    console.error('completeFirstRunAction update failed:', error.message);
    return { ok: false, error: 'Something went wrong saving that. Try again.' };
  }

  revalidatePath('/dashboard');
  return { ok: true };
}
