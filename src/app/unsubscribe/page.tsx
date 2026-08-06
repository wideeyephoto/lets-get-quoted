import { createAdminClient } from '@/lib/auth';
import { parseUnsubscribeToken, isEmailSuppressed } from '@/lib/email-suppression';
import SaveButton from '@/components/save-button';
import { unsubscribeAction } from './actions';

export const dynamic = 'force-dynamic';

// Public, no-login page reached from the "Unsubscribe" link in a marketing email
// footer. A GET only shows a confirm button (so a mail-scanner prefetch can't
// unsubscribe someone by accident); the actual opt-out happens on the POST from
// that button, or via the one-click List-Unsubscribe header (the API route).
async function resolveBusinessName(accountId: string): Promise<string> {
  const admin = createAdminClient();
  const [{ data: site }, { data: account }] = await Promise.all([
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return site?.company_name || account?.business_name || 'this business';
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string; done?: string; error?: string };
}) {
  const decoded = parseUnsubscribeToken(searchParams.token);

  if (searchParams.error || !decoded) {
    return (
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <p className="eyebrow">Unsubscribe</p>
          <h1 className="workspace-title">This unsubscribe link isn&apos;t valid</h1>
          <p className="workspace-lead">
            The link may have been truncated by your email app. Reply to the email and ask to be removed,
            and they&apos;ll take care of it.
          </p>
        </section>
      </main>
    );
  }

  const businessName = await resolveBusinessName(decoded.accountId);

  if (searchParams.done) {
    return (
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card success">
          <p className="eyebrow">Unsubscribed</p>
          <h1 className="workspace-title">You&apos;re unsubscribed</h1>
          <p className="workspace-lead">
            <strong>{decoded.email}</strong> won&apos;t receive any more marketing emails from {businessName}.
            You&apos;ll still get messages about your own jobs, quotes, and payments.
          </p>
        </section>
      </main>
    );
  }

  // If they've already opted out, say so instead of showing the button again.
  const admin = createAdminClient();
  const already = await isEmailSuppressed(admin, decoded.accountId, decoded.email);
  if (already) {
    return (
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card success">
          <p className="eyebrow">Unsubscribed</p>
          <h1 className="workspace-title">You&apos;re already unsubscribed</h1>
          <p className="workspace-lead">
            <strong>{decoded.email}</strong> is not receiving marketing emails from {businessName}.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <p className="eyebrow">Unsubscribe</p>
        <h1 className="workspace-title">Unsubscribe from {businessName}?</h1>
        <p className="workspace-lead">
          Confirm below and <strong>{decoded.email}</strong> will stop receiving marketing emails
          (special offers, &ldquo;book again&rdquo; reminders, and review requests) from {businessName}.
          You&apos;ll still get messages about your own jobs, quotes, and payments.
        </p>
        <form action={unsubscribeAction} style={{ marginTop: '1rem' }}>
          <input type="hidden" name="token" value={searchParams.token} />
          <SaveButton className="btn danger" pendingLabel="Unsubscribing..." savedLabel="Unsubscribed">
            Unsubscribe me
          </SaveButton>
        </form>
      </section>
    </main>
  );
}
