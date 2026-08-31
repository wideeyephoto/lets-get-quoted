import Link from 'next/link';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { deleteConnection } from '@/lib/quickbooks/connection';
import { cleanupVerdict, realmFromQuery } from '@/lib/quickbooks/disconnect-landing';

/**
 * The Disconnect URL registered on the Intuit app.
 *
 * Intuit sends the browser here with a GET when somebody disconnects us from
 * inside QuickBooks Online (My Apps → Disconnect). It has to render for a
 * signed-OUT visitor: disconnecting happens in QuickBooks, on whatever machine
 * they had QuickBooks open on, which is frequently not one they are signed into
 * us on. So this never calls requireOwnerContext — that redirects to /login, and
 * a login wall is a terrible answer to "I just disconnected your app".
 *
 * What it is allowed to change is decided by cleanupVerdict, which is where the
 * reasoning lives and where it is tested.
 */

// The realm arrives in the query, and the answer depends on the caller's
// session. Nothing here is cacheable.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'QuickBooks disconnected',
  // A bare landing page with no content of its own worth indexing, reachable
  // with arbitrary query strings.
  robots: { index: false, follow: false },
};

export default async function QuickBooksDisconnectedPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const claimedRealmId = realmFromQuery(searchParams);

  // Soft read of the session. A visitor with no cookie is the expected case, not
  // an error, so this must not redirect the way requireOwnerContext would.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const accountId = user ? (await getCurrentMembership(user.id)).accountId : null;

  let storedRealmId: string | null = null;
  if (accountId) {
    // Admin client: quickbooks_connections has RLS on with no policy, so a
    // session-scoped read returns nothing at all. Only the realm is read — this
    // page never touches a token.
    const { data } = await createAdminClient()
      .from('quickbooks_connections')
      .select('realm_id')
      .eq('account_id', accountId)
      .maybeSingle();
    storedRealmId = (data as { realm_id?: string } | null)?.realm_id ?? null;
  }

  const verdict = cleanupVerdict({ accountId, storedRealmId, claimedRealmId });
  if (verdict.cleanup && accountId) {
    // Intuit has already revoked its side — that is what brought them here — so
    // there is no token to revoke back. This just removes what we hold.
    await deleteConnection(accountId);
  }

  const tidied = verdict.cleanup;
  const signedOut = !verdict.cleanup && verdict.reason === 'signed-out';
  const wasNotConnected = !verdict.cleanup && verdict.reason === 'not-connected';

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel workspace-hero-solo">
        <div className="workspace-hero-copy">
          <p className="eyebrow">QuickBooks</p>
          <h1 className="workspace-title">
            {wasNotConnected ? 'Nothing was connected' : 'QuickBooks is disconnected'}
          </h1>
          <p className="workspace-lead">
            {wasNotConnected
              ? 'This account has no QuickBooks connection, so there was nothing to remove.'
              : 'Let’s Get Quoted has been disconnected from QuickBooks. New invoices will stop being sent across from now on.'}
          </p>
        </div>
      </section>

      {!wasNotConnected ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">What this means</p>
            <h2>Nothing was deleted</h2>
          </div>
          <ul className="portal-job-list">
            <li className="portal-job">
              <div className="portal-job-main">
                <strong>Your books are untouched</strong>
                <span className="portal-job-meta">
                  Every invoice already sent to QuickBooks stays in QuickBooks, exactly as it is.
                </span>
              </div>
            </li>
            <li className="portal-job">
              <div className="portal-job-main">
                <strong>Your jobs and invoices here are untouched</strong>
                <span className="portal-job-meta">
                  Disconnecting only stops the two systems talking. Nothing in Let’s Get Quoted is removed.
                </span>
              </div>
            </li>
            <li className="portal-job">
              <div className="portal-job-main">
                <strong>New invoices stop flowing</strong>
                <span className="portal-job-meta">
                  Anything invoiced from now on stays here until you reconnect. Reconnecting starts from that
                  day — it won’t push the gap across on its own.
                </span>
              </div>
            </li>
          </ul>

          {/* Said plainly rather than left for them to wonder about. Somebody who
              has just disconnected something wants to know whether it actually
              took, and on this page the honest answer depends on whether we could
              tell who they were. */}
          <p className="portal-note">
            {tidied
              ? 'We’ve removed the connection on our side too, so this account is fully clear.'
              : signedOut
                ? 'You’re not signed in here, so we couldn’t tidy our side automatically — it clears itself the next time we try to send anything. Sign in if you’d rather it happen now.'
                : 'We couldn’t match this to a connection on our side. If Settings still shows QuickBooks as linked, disconnect it there too.'}
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Next</p>
          <h2>{wasNotConnected ? 'Connect QuickBooks' : 'Changed your mind?'}</h2>
        </div>
        <p className="workspace-lead">
          You can reconnect at any time from Settings. It takes one click and picks up from that day forward.
        </p>
        <div className="actions workspace-actions">
          <Link className="btn primary" href="/dashboard/settings#quickbooks">
            {wasNotConnected ? 'Go to Settings' : 'Reconnect QuickBooks'}
          </Link>
          <Link className="btn secondary" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
