import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';

export default async function SettingsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }, { data: account }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getUserIdentities(),
    supabase.from('accounts').select('connect_onboarded').eq('id', accountId).single(),
  ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Account</p>
          <h1 className="workspace-title">Account settings</h1>
          <p className="workspace-lead">
            Manage how you get paid and how you sign in, so you&apos;re never locked out of your
            business or stuck waiting on a payout.
          </p>
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
    </main>
  );
}
