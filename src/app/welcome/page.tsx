import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { BILLING_PLANS } from '@/lib/billing/catalog';
import { basePlanSubscriptionCheckoutEnabled } from '@/lib/billing/base-plan-subscription-entrypoint';
import { planUsageDashboardEnabled } from '@/lib/billing/plan-usage';
import { parsePlanIntent, planCheckoutPath } from '@/lib/plan-intent';
import { TRADES } from '@/lib/trades';
import { initialBusinessName, needsFirstRun, TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import WelcomeForm from './WelcomeForm';

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
};

// First run. Two questions and the Terms — one screen, because the agreement has
// to be collected before anyone stores a customer's phone number, and making
// that a separate interstitial on top of a separate setup step would be two
// walls in a row.
//
// skipFirstRunGate: requireOwnerContext sends un-accepted owners here, so this
// page must not be gated by it or it would redirect to itself forever.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { plan?: string; billing?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext({ skipFirstRunGate: true });

  // Carried here from /pricing via /login's `next`. Parsed on the server so the
  // form is handed a value that is already known to name a paid plan.
  // Only acknowledged when the checkout that would honour it actually exists.
  // The redirect was already gated; the SENTENCE was not, so a visitor who
  // clicked "Choose Scale" was told "we'll set you up on Scale" and then landed
  // in the site builder with no way to buy anything. The intent is still
  // recorded either way -- see completeFirstRunAction.
  const canSellPlans = planUsageDashboardEnabled() && basePlanSubscriptionCheckoutEnabled();
  const planIntent = parsePlanIntent(searchParams.plan ?? null, searchParams.billing ?? null);
  const acknowledgePlan = canSellPlans ? planIntent : null;

  const { data: account } = await supabase
    .from('accounts')
    .select('business_name, trade, postal_code, terms_accepted_at, terms_version')
    .eq('id', accountId)
    .maybeSingle();

  // Already done — nothing to ask. Reachable by typing the URL or by going Back,
  // and also by an existing owner who clicked a plan on /pricing: they have no
  // first run left to do, so carry them the last hop rather than dropping the
  // choice at the door. Only when the checkout is actually rendered, though.
  if (!needsFirstRun(account)) {
    redirect(acknowledgePlan ? planCheckoutPath(acknowledgePlan) : '/dashboard');
  }

  // The name an existing owner actually recognizes — see initialBusinessName.
  // Read separately (not joined) so a site that doesn't exist yet, which is the
  // normal case at first run, is simply an empty field rather than an error.
  const { data: site } = await supabase
    .from('sites')
    .select('company_name')
    .eq('account_id', accountId)
    .maybeSingle();

  const trades = TRADES.map((trade) => ({ slug: trade.slug, name: trade.name }));
  const returning = Boolean(account?.terms_accepted_at);

  return (
    <main className="page-shell">
      <div className="hero-card auth-card">
        <p className="eyebrow">{returning ? 'Updated terms' : 'Welcome'}</p>
        <h1>{returning ? 'We\'ve updated our terms' : 'Let\'s set up your business'}</h1>
        <p className="welcome-lead">
          {returning
            ? `Our Terms of Service changed, effective ${TERMS_EFFECTIVE_DATE}. Have a read and accept them to carry on where you left off.`
            : 'Three quick things and we can build your whole website from them. You can change any of it later in Settings.'}
        </p>

        {acknowledgePlan ? (
          <p className="welcome-lead">
            We&apos;ll set you up on <strong>{BILLING_PLANS[acknowledgePlan.planCode].name}</strong>
            {acknowledgePlan.billingInterval === 'annual' ? ', billed annually' : ', billed monthly'}. Nothing is charged
            while you finish setting up, and you can change plan any time.
          </p>
        ) : null}

        <WelcomeForm
          initialBusinessName={initialBusinessName(account, site?.company_name)}
          initialPostalCode={(account as { postal_code?: string | null } | null)?.postal_code ?? ''}
          trades={trades}
          planCode={planIntent?.planCode ?? null}
          billingInterval={planIntent?.billingInterval ?? null}
        />
      </div>
    </main>
  );
}
