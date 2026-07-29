export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account suspended' };

// Where a suspended owner lands (see requireOwnerContext). Deliberately plain and
// self-contained; no dashboard data is loaded.
export default function AccountSuspendedPage() {
  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Account on hold</p>
          <h1 className="workspace-title">Your account is temporarily suspended</h1>
          <p className="workspace-lead">
            Access to your dashboard is paused while our team reviews your account. Your data is safe. Please reach out to
            support and we&rsquo;ll help get you back up and running.
          </p>
          <p className="workspace-lead" style={{ marginTop: '.75rem' }}>
            Email <a href="mailto:support@letsgetquoted.com"><strong>support@letsgetquoted.com</strong></a>.
          </p>
        </div>
      </section>
    </main>
  );
}
