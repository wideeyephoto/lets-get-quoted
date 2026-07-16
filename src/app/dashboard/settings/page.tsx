import { requireOwnerContext } from '@/lib/auth';
import SignInMethods from './SignInMethods';

export default async function SettingsPage() {
  const { supabase } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getUserIdentities(),
  ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Account</p>
          <h1 className="workspace-title">Sign-in methods</h1>
          <p className="workspace-lead">
            Add a backup way to sign in so you&apos;re never locked out of your business if you lose
            access to your phone or a single email address.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <SignInMethods
          email={userData.user?.email ?? null}
          phone={userData.user?.phone ?? null}
          providers={providers}
        />
      </section>
    </main>
  );
}
