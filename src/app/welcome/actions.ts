'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { recordAccountEvent } from '@/lib/account-events';
import { requireOwnerContext } from '@/lib/auth';
import { BILLING_PLANS } from '@/lib/billing/catalog';
import { basePlanSubscriptionCheckoutEnabled } from '@/lib/billing/base-plan-subscription-entrypoint';
import { planUsageDashboardEnabled } from '@/lib/billing/plan-usage';
import { parsePlanIntent, planCheckoutPath } from '@/lib/plan-intent';
import { getTrade } from '@/lib/trades';
import {
  TERMS_VERSION,
  businessNameProblem,
  normalizeBusinessName,
  normalizePostalCode,
  postalCodeProblem,
} from '@/lib/terms';

import { resolveDestination, type SignupGoal, type SignupFeature } from '@/lib/signup-intent';
import { sendFounderSignupAlert } from '@/lib/founder-alerts';
import { sendContractorWelcomeEmail } from '@/lib/contractor-lifecycle-emails';

export type FirstRunResult =
  | {
      ok: true;
      destinationPath: string;
      planCheckoutPath: string | null;
      signupConversionTransactionId: string | null;
    }
  | { ok: false; error: string };

function initialSignupConversionTransactionId(
  accountId: string,
  account: Record<string, unknown> | null,
): string | null {
  const hasTermsAcceptance = account
    && Object.prototype.hasOwnProperty.call(account, 'terms_accepted_at');

  if (!hasTermsAcceptance || account.terms_accepted_at !== null) {
    return null;
  }

  // Google Ads uses transaction_id to deduplicate repeat delivery. Hash the
  // internal account ID so the browser and Google never receive the raw ID.
  const digest = createHash('sha256')
    .update(`lgq-signup:${accountId}`)
    .digest('hex')
    .slice(0, 32);
  return `signup_${digest}`;
}

/**
 * The plan a visitor picked on /pricing, if it survived to first run.
 *
 * Re-parsed from the raw strings for the same reason `accepted` is re-checked
 * below: a server action is a public endpoint, so nothing arriving here is
 * trusted to already be a plan code. parsePlanIntent returns null for anything
 * that is not one of the three paid plans, Flex included.
 */
function resolvePlanIntent(input: { plan?: string | null; billing?: string | null }) {
  return parsePlanIntent(input.plan ?? null, input.billing ?? null);
}

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
  plan?: string | null;
  billing?: string | null;
  goal?: string | null;
  feature?: string | null;
  next?: string | null;
}): Promise<FirstRunResult> {
  const { supabase, accountId, userId, account } = await requireOwnerContext({ skipFirstRunGate: true });
  const signupConversionTransactionId = initialSignupConversionTransactionId(accountId, account);

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

  const { data: updatedAccount, error } = await supabase
    .from('accounts')
    .update({
      business_name: normalizeBusinessName(input.businessName),
      trade: requested || null,
      postal_code: normalizePostalCode(input.postalCode),
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      terms_accepted_by: userId,
    })
    .eq('id', accountId)
    .select('id')
    .maybeSingle();

  if (error || !updatedAccount) {
    console.error('completeFirstRunAction update failed:', error?.message || 'No account row was updated.');
    return { ok: false, error: 'Something went wrong saving that. Try again.' };
  }

  revalidatePath('/dashboard');

  if (signupConversionTransactionId) {
    // These notifications describe a new activation, not an existing owner
    // accepting a newer Terms version.
    void sendFounderSignupAlert({
      accountId,
      businessName: input.businessName,
      trade: requested || 'General',
      postalCode: input.postalCode,
      plan: input.plan || null,
      billing: input.billing || null,
    });

    void sendContractorWelcomeEmail({
      accountId,
      businessName: input.businessName,
      trade: requested || 'General',
      postalCode: input.postalCode,
    });
  }

  const intent = resolvePlanIntent(input);
  const destinationPath = resolveDestination({
    goal: (input.goal as SignupGoal) || (input.plan ? 'choose_plan' : 'build_site'),
    feature: (input.feature as SignupFeature) || null,
    next: input.next || null,
  }, 'active');

  if (!intent) {
    return {
      ok: true,
      destinationPath,
      planCheckoutPath: null,
      signupConversionTransactionId,
    };
  }

  // Best-effort and deliberately after the update above: a failure to record
  // what someone wanted must never cost them the account they just created.
  const plan = BILLING_PLANS[intent.planCode];
  await recordAccountEvent({
    accountId,
    kind: 'plan_intent_recorded',
    summary: `Chose ${plan.name} (${intent.billingInterval}) on the pricing page before signing up`,
    meta: { plan_code: intent.planCode, billing_interval: intent.billingInterval, source: 'pricing' },
  });

  const surfaceIsLive = planUsageDashboardEnabled() && basePlanSubscriptionCheckoutEnabled();
  return {
    ok: true,
    destinationPath,
    planCheckoutPath: surfaceIsLive ? planCheckoutPath(intent) : null,
    signupConversionTransactionId,
  };
}
