import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
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
  // Deliberately vague about the result, because the line under the company
  // name says exactly what the run did and repeating a count here would let the
  // two disagree the moment one of them changes.
  synced: { tone: 'ok', text: 'Finished syncing with QuickBooks.' },
  'sync-failed': { tone: 'warn', text: 'Couldn’t sync with QuickBooks. The reason is below.' },
};

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QuickBooksSection({
  status,
  notice,
  syncAction,
  backfillAction,
}: {
  status: ConnectionStatus;
  notice?: string;
  /** Bound server action — a manual run of the same sweep the cron does. */
  syncAction: () => Promise<void>;
  /** Drops the cutoff and sends the history too. One way. */
  backfillAction: () => Promise<void>;
}) {
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

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Link your QuickBooks company for seamless two-way synchronization. Invoices, customers, and payments created in Let’s Get Quoted are automatically pushed to QuickBooks Online, while customers and payment reconciliations in QuickBooks are pulled back into Let’s Get Quoted overnight. Anything it can&rsquo;t send exactly it leaves alone and tells you why. You can disconnect at any time, and the CSV exports below keep working either way.
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
            {dayLabel(status.connectedAt)}.
            {status.environment === 'sandbox' ? (
              // Said plainly, because a sandbox connection looks exactly like a
              // real one until somebody goes looking for the invoices.
              <> This is a <strong>sandbox</strong> company — a test book, not your real one.</>
            ) : null}
          </p>
          {/* What the last run actually did, in the words the run used. An
              integration that says "connected" and nothing else gives somebody
              no way to tell working from silently broken. */}
          <p className="workspace-details-copy">
            {status.lastSyncAt ? (
              <>
                Last synced {dayLabel(status.lastSyncAt)}
                {status.lastSyncSummary ? <> — {status.lastSyncSummary}.</> : '.'} It runs again
                overnight.
              </>
            ) : (
              <>Nothing synced across yet — the first 2-way run happens overnight, or sync it now.</>
            )}
          </p>

          {/* The cutoff, said out loud.
              Linking only sends work from that day forward, because a
              contractor who has been doing their books by hand already has the
              older invoices in QuickBooks and a second copy of each is theirs
              to clean up, not ours. Silently sending them would be the single
              most expensive thing this feature could do. */}
          {status.syncFrom ? (
            <p className="workspace-details-copy">
              Sending invoices dated {dayLabel(status.syncFrom)} onwards.
              {status.backlog > 0 ? (
                <> {status.backlog} older one{status.backlog === 1 ? '' : 's'} {status.backlog === 1 ? 'is' : 'are'} being left alone in case {status.backlog === 1 ? 'it is' : 'they are'} already in your books.</>
              ) : null}
            </p>
          ) : null}

          <div className="workspace-inline-row">
            <form action={syncAction}>
              <SaveButton className="btn primary" pendingLabel="Syncing…" savedLabel="Synced ✓">
                Sync with QuickBooks now
              </SaveButton>
            </form>

            {status.backlog > 0 ? (
              <ConfirmActionButton
                action={backfillAction}
                confirmMessage={`Also send the ${status.backlog} invoice${status.backlog === 1 ? '' : 's'} from before ${dayLabel(status.syncFrom as string)}? If any of them are already in QuickBooks you will end up with two copies, and only you can remove the extras. This can't be undone from here.`}
                className="btn secondary"
                pendingLabel="Sending…"
                savedLabel="Sent ✓"
              >
                Send the {status.backlog} older one{status.backlog === 1 ? '' : 's'} too
              </ConfirmActionButton>
            ) : null}
          </div>

          {/* Below a rule and on its own, not beside "Send now". They were the
              same button in the same row — one posts your invoices, the other
              cuts your accounting off, and a misfire between the two is not
              symmetrical.
              Still a POST, so no link a browser or mail client might prefetch
              can disconnect a contractor's accounting. */}
          <div className="qb-danger">
            <span>
              <strong>Disconnect QuickBooks</strong>
              <small>Nothing more gets sent. What is already in your books stays there.</small>
            </span>
            <form action="/api/quickbooks/disconnect" method="post">
              <button type="submit" className="linklike danger">Disconnect</button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
