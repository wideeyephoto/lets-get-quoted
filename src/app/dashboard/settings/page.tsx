import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction } from '../stripe-actions';
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

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, availableYears] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUserIdentities(),
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded').eq('id', accountId).single(),
      supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
      getAvailableTaxYears(supabase, accountId),
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
    </main>
  );
}
