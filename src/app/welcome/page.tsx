import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { TRADES } from '@/lib/trades';
import { initialBusinessName, needsFirstRun, TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import WelcomeForm from './WelcomeForm';

export const metadata: Metadata = {
  title: 'Welcome | Let\'s Get Quoted',
  robots: { index: false, follow: false },
};

// First run. Two questions and the Terms — one screen, because the agreement has
// to be collected before anyone stores a customer's phone number, and making
// that a separate interstitial on top of a separate setup step would be two
// walls in a row.
//
// skipFirstRunGate: requireOwnerContext sends un-accepted owners here, so this
// page must not be gated by it or it would redirect to itself forever.
export default async function WelcomePage() {
  const { supabase, accountId } = await requireOwnerContext({ skipFirstRunGate: true });

  const { data: account } = await supabase
    .from('accounts')
    .select('business_name, trade, postal_code, terms_accepted_at, terms_version')
    .eq('id', accountId)
    .maybeSingle();

  // Already done — nothing to ask. Reachable by typing the URL or by going Back.
  if (!needsFirstRun(account)) redirect('/dashboard');

  // The name an existing owner actually recognises — see initialBusinessName.
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

        <WelcomeForm
          initialBusinessName={initialBusinessName(account, site?.company_name)}
          initialPostalCode={(account as { postal_code?: string | null } | null)?.postal_code ?? ''}
          trades={trades}
        />
      </div>
    </main>
  );
}
