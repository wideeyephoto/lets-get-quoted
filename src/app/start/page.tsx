import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { needsFirstRun } from '@/lib/terms';
import {
  parseSignupIntent,
  serializeSignupIntent,
  resolveDestination,
} from '@/lib/signup-intent';
import { basePlanSubscriptionCheckoutEnabled } from '@/lib/billing/base-plan-subscription-entrypoint';
import { planUsageDashboardEnabled } from '@/lib/billing/plan-usage';
import { parsePlanIntent, planCheckoutPath } from '@/lib/plan-intent';

export const dynamic = 'force-dynamic';

/**
 * Canonical App Entry Point `/start`.
 *
 * Validates signup/acquisition intent and routes based on live account state:
 * - Signed out → contextual signup at /login?intent=signup&... with safe next destination
 * - Signed in (Unfinished Onboarding) → /welcome with prefilled trade/city/business name
 * - Signed in (Established Account) → intended dashboard area (/dashboard/sites, /dashboard/quick-stops, etc.)
 * - Paid Plan Selection → checkout (when live) or dashboard settings
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Normalize searchParams into Record<string, string | null>
  const flatParams: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      flatParams[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      flatParams[key] = value[0];
    }
  }

  const intent = parseSignupIntent(flatParams);
  const supabase = createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 1. Authenticated User Flow
  if (session?.user) {
    const { data: account } = await supabase
      .from('accounts')
      .select('id, terms_accepted_at, terms_version, business_name, trade, postal_code')
      .eq('owner_user_id', session.user.id)
      .maybeSingle();

    // If account has not finished first-run terms or profile setup, send to /welcome
    if (!account || needsFirstRun(account)) {
      const welcomeQuery = serializeSignupIntent(intent).toString();
      redirect(`/welcome${welcomeQuery ? `?${welcomeQuery}` : ''}`);
    }

    // Established account: Check if plan checkout is intended and live
    const canSellPlans = planUsageDashboardEnabled() && basePlanSubscriptionCheckoutEnabled();
    const planIntent = parsePlanIntent(intent.plan ?? null, intent.billing ?? null);
    if (intent.goal === 'choose_plan' && planIntent && canSellPlans) {
      redirect(planCheckoutPath(planIntent));
    }

    // Established account: Route directly to promised feature/builder destination
    const destination = resolveDestination(intent, 'active');
    redirect(destination);
  }

  // 2. Unauthenticated User Flow -> Route to login with preserved signup intent
  const serialized = serializeSignupIntent(intent);
  serialized.set('intent', 'signup');

  // Pre-calculate target next path for after authentication
  const nextTarget = intent.next || (intent.goal === 'build_site' ? '/dashboard/sites' : resolveDestination(intent, 'active'));
  if (!serialized.has('next') && nextTarget) {
    serialized.set('next', nextTarget);
  }

  redirect(`/login?${serialized.toString()}`);
}
