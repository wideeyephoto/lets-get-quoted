import type { ConnectionStatus } from '@/lib/quickbooks/connection';

// The QuickBooks connection, in Settings under Finances.
//
// Server component: the status comes from a table only the service role can
// read, and nothing on this page ever holds a token — see the migration.
//
// The `quickbooks` query parameter is how the OAuth callback reports back, since
// it lands here after a full-page redirect out of Intuit and has no other way to
// say what happened.

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  connected: { tone: 'ok', text: 'QuickBooks is linked.' },
  disconnected: { tone: 'ok', text: 'QuickBooks has been disconnected, and we’ve told Intuit to revoke our access.' },
  cancelled: { tone: 'warn', text: 'Connection cancelled — nothing changed.' },
  // Deliberately vague about the cause: the state check failing usually means a
  // stale tab or a slow return, and naming CSRF at a contractor helps nobody.
  state: { tone: 'warn', text: 'That connection attempt expired. Please try again from this page.' },
  failed: { tone: 'warn', text: 'QuickBooks couldn’t complete the connection. Please try again.' },
  unconfigured: { tone: 'warn', text: 'QuickBooks isn’t set up on this deployment yet.' },
};

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QuickBooksSection({ status, notice }: { status: ConnectionStatus; notice?: string }) {
  const message = notice ? NOTICES[notice] : undefined;

  return (
    <section className="panel workspace-section-card" id="quickbooks">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Accounting</p>
        <h2>QuickBooks Online</h2>
      </div>

      {message ? (
        <p className={message.tone === 'ok' ? 'form-success' : 'form-error'}>{message.text}</p>
      ) : null}

      {/* Says what it does, not what it is for.
          This read "connect your QuickBooks company so your invoices and
          payments land in your books without re-typing them" while the only
          QuickBooks API call in the app was the one that reads the company
          name. A contractor would connect, see their company named back at
          them, believe the books were filling themselves and stop exporting.
          Update this the day the sync ships, not before. */}
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Linking your QuickBooks company is the first half of getting your invoices and payments into
        your books. Sending them across automatically is being built — until it lands, the CSV export
        below is how the numbers get there, and it works whether or not you connect.
      </p>

      {status.state === 'unconfigured' ? (
        <p className="empty-state">
          QuickBooks isn&rsquo;t configured on this deployment. Once the credentials are in place this
          is where you&rsquo;ll connect.
        </p>
      ) : null}

      {status.state === 'not_connected' ? (
        <div className="workspace-inline-row">
          {/* A plain link, not a form: this is a redirect out to Intuit, and it
              is also the Connect/Reconnect URL registered on the Intuit app, so
              it has to be reachable as a GET from outside. */}
          <a href="/api/quickbooks/connect" className="btn primary">Connect to QuickBooks</a>
        </div>
      ) : null}

      {status.state === 'needs_reconnect' ? (
        <>
          <p className="form-error">
            {status.companyName ? <><strong>{status.companyName}</strong> — </> : null}
            {status.reason}
          </p>
          <div className="workspace-inline-row">
            <a href="/api/quickbooks/connect" className="btn primary">Reconnect</a>
            <form action="/api/quickbooks/disconnect" method="post">
              <button type="submit" className="btn secondary">Remove the connection</button>
            </form>
          </div>
        </>
      ) : null}

      {status.state === 'connected' ? (
        <>
          <p className="workspace-details-copy">
            Linked to <strong>{status.companyName || `company ${status.realmId}`}</strong> since{' '}
            {dayLabel(status.connectedAt)}. Nothing is being sent across yet — use the export below.
            {status.environment === 'sandbox' ? (
              // Said plainly, because a sandbox connection looks exactly like a
              // real one until somebody goes looking for the invoices.
              <> This is a <strong>sandbox</strong> company — a test book, not your real one.</>
            ) : null}
          </p>
          <div className="workspace-inline-row">
            {/* POST, so no link a browser or mail client might prefetch can
                disconnect a contractor's accounting. */}
            <form action="/api/quickbooks/disconnect" method="post">
              <button type="submit" className="btn secondary">Disconnect QuickBooks</button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
