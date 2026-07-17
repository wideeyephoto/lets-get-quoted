import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction, disconnectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';
import FinanceReports from './FinanceReports';
import { getAvailableTaxYears, buildProfitAndLoss, buildScheduleCWorksheet, build1099PrepList } from '@/lib/tax-reports';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, availableYears, { count: pendingPaymentsCount }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUserIdentities(),
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded').eq('id', accountId).single(),
      supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
      getAvailableTaxYears(supabase, accountId),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['requested', 'processing']),
    ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);
  const businessName = site?.company_name || account?.business_name || 'My Business';

  const requestedYear = searchParams.year ? parseInt(searchParams.year, 10) : NaN;
  const selectedYear = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

  const [pl, subPrep] = await Promise.all([
    buildProfitAndLoss(supabase, accountId, selectedYear),
    build1099PrepList(supabase, accountId, selectedYear),
  ]);
  const scheduleC = buildScheduleCWorksheet(pl);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <div className="workspace-eyebrow-row">
            <p className="eyebrow">Account</p>
            {account ? (
              <span className="account-tag">
                {businessName} · Account #{account.account_number}
              </span>
            ) : null}
          </div>
          <h1 className="workspace-title">Account settings</h1>
          <p className="workspace-lead">
            Manage how you get paid and how you sign in, so you&apos;re never locked out of your
            business or stuck waiting on a payout.
          </p>
          {account?.created_at ? (
            <p className="account-created-note">Account created {formatDate(account.created_at)}</p>
          ) : null}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <SignInMethods
          email={userData.user?.email ?? null}
          phone={userData.user?.phone ?? null}
          providers={providers}
          stripeOnboarded={account?.connect_onboarded ?? false}
          connectStripeAction={connectStripeAction}
          disconnectStripeAction={disconnectStripeAction}
          pendingPaymentsCount={pendingPaymentsCount ?? 0}
        />
      </section>

      <section className="panel workspace-section-card" id="finances">
        <FinanceReports
          year={selectedYear}
          availableYears={availableYears}
          pl={pl}
          scheduleC={scheduleC}
          subPrep={subPrep}
        />
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Session</p>
          <h2>Log out</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Sign out of this device. You&apos;ll need to sign back in to access your dashboard.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn danger">
            Log out
          </button>
        </form>
      </section>
    </main>
  );
}
