import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { BILLING_PLANS } from '@/lib/billing/catalog';
import { basePlanSubscriptionCheckoutEnabled } from '@/lib/billing/base-plan-subscription-entrypoint';
import { planUsageDashboardEnabled } from '@/lib/billing/plan-usage';
import { parsePlanIntent, planCheckoutPath } from '@/lib/plan-intent';
import { TRADES } from '@/lib/trades';
import { initialBusinessName, needsFirstRun, TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import GoogleTagConversion from '@/components/google-tag-conversion';
import WelcomeForm from './WelcomeForm';

import { parseSignupIntent, resolveDestination } from '@/lib/signup-intent';

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { supabase, accountId } = await requireOwnerContext({ skipFirstRunGate: true });

  const flatParams: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      flatParams[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      flatParams[key] = value[0];
    }
  }

  const intent = parseSignupIntent(flatParams);
  const canSellPlans = planUsageDashboardEnabled() && basePlanSubscriptionCheckoutEnabled();
  const planIntent = parsePlanIntent(intent.plan ?? null, intent.billing ?? null);
  const tradeParam = (typeof searchParams?.trade === 'string' ? searchParams.trade : null) || intent.trade;
  const cityParam = (typeof searchParams?.city === 'string' ? searchParams.city : null) || intent.city;
  const matchedTrade = tradeParam ? (TRADES.find((t) => t.slug === tradeParam) ?? null) : null;

  const { data: account } = await supabase
    .from('accounts')
    .select('business_name, trade, postal_code, terms_accepted_at, terms_version')
    .eq('id', accountId)
    .maybeSingle();

  // Already done — send directly to intended destination
  if (!needsFirstRun(account)) {
    redirect(canSellPlans && planIntent ? planCheckoutPath(planIntent) : resolveDestination(intent, 'active'));
  }

  const { data: site } = await supabase
    .from('sites')
    .select('company_name')
    .eq('account_id', accountId)
    .maybeSingle();

  const trades = TRADES.map((trade) => ({ slug: trade.slug, name: trade.name }));
  const returning = Boolean(account?.terms_accepted_at);

  const cityNameClean = cityParam ? cityParam.split(',')[0].trim() : '';
  const suggestedBusinessName =
    intent.businessName ||
    (!initialBusinessName(account, site?.company_name) && matchedTrade && cityNameClean
      ? `${cityNameClean} ${matchedTrade.name.replace(/s$/, '')} Co.`
      : initialBusinessName(account, site?.company_name));

  const acknowledgePlan = planIntent;

  return (
    <main className="page-shell">
      {!returning ? <GoogleTagConversion /> : null}
      <div className="hero-card auth-card">
        <p className="eyebrow">{returning ? 'Updated terms' : 'Welcome'}</p>
        <h1>{returning ? 'We\'ve updated our terms' : 'Let\'s set up your business'}</h1>
        <p className="welcome-lead">
          {returning
            ? `Our Terms of Service changed, effective ${TERMS_EFFECTIVE_DATE}. Have a read and accept them to carry on where you left off.`
            : matchedTrade && cityParam
              ? `We're setting up your ${matchedTrade.name} website for ${cityParam}. Three quick things and we can build your whole website from them.`
              : matchedTrade
                ? `We're setting up your ${matchedTrade.name} website. Three quick things and we can build your whole website from them.`
                : 'Three quick things and we can build your whole website from them. You can change any of it later in Settings.'}
        </p>

        {acknowledgePlan ? (
          <p className="welcome-lead">
            {canSellPlans ? (
              <>
                We&apos;ll set you up on <strong>{BILLING_PLANS[acknowledgePlan.planCode].name}</strong>
                {acknowledgePlan.billingInterval === 'annual' ? ', billed annually' : ', billed monthly'}. Nothing is charged
                while you finish setting up, and you can change plan any time.
              </>
            ) : (
              <>
                You selected <strong>{BILLING_PLANS[acknowledgePlan.planCode].name}</strong>
                {acknowledgePlan.billingInterval === 'annual' ? ' (billed annually)' : ' (billed monthly)'}. Your preference is saved, and your account begins on the free <strong>Flex</strong> plan ($0/mo). You can upgrade anytime from Settings.
              </>
            )}
          </p>
        ) : null}

        <WelcomeForm
          initialBusinessName={suggestedBusinessName}
          initialPostalCode={(account as { postal_code?: string | null } | null)?.postal_code ?? ''}
          initialTrade={account?.trade || matchedTrade?.slug || ''}
          trades={trades}
          planCode={planIntent?.planCode ?? null}
          billingInterval={planIntent?.billingInterval ?? null}
          goal={intent.goal}
          feature={intent.feature}
          city={cityParam}
          next={intent.next}
        />
      </div>
    </main>
  );
}
