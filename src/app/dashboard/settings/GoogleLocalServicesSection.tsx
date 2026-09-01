import SaveButton from '@/components/save-button';
import type { GoogleLsaConnectionStatus } from '@/lib/google-lsa/connection';

const NOTICES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  connected: { tone: 'ok', text: 'Google Local Services Ads is linked.' },
  disconnected: { tone: 'ok', text: 'Google Local Services Ads has been disconnected and Google access was revoked.' },
  'disconnected-local': { tone: 'warn', text: 'Imports are disconnected and the local credential was removed. Google did not confirm remote revocation; you can also remove access from your Google account.' },
  'disconnect-failed': { tone: 'warn', text: 'The connection could not be removed, so imports may still run. Please try disconnecting again.' },
  cancelled: { tone: 'warn', text: 'Connection cancelled — nothing changed.' },
  state: { tone: 'warn', text: 'That connection attempt expired. Start again from this page.' },
  failed: { tone: 'warn', text: 'Google could not complete the connection. Please try again.' },
  unconfigured: { tone: 'warn', text: 'Google Local Services Ads is not configured on this deployment yet.' },
  selected: { tone: 'ok', text: 'That Local Services account is now selected.' },
  'invalid-customer': { tone: 'warn', text: 'That Google Ads account was not one of the eligible accounts returned by Google.' },
  synced: { tone: 'ok', text: 'Google Local Services data is up to date.' },
  'sync-failed': { tone: 'warn', text: 'The import did not finish. The latest reason is shown below.' },
  busy: { tone: 'warn', text: 'An import is already running. Its result will appear here when it finishes.' },
};

function dayTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function GoogleLocalServicesSection({
  status,
  notice,
  chooseCustomerAction,
  syncAction,
}: {
  status: GoogleLsaConnectionStatus;
  notice?: string;
  chooseCustomerAction: (formData: FormData) => Promise<void>;
  syncAction: () => Promise<void>;
}) {
  const message = notice ? NOTICES[notice] : undefined;

  return (
    <section className="panel workspace-section-card" id="google-local-services">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Lead source</p>
        <h2>Google Local Services Ads</h2>
      </div>

      {message ? <p className={message.tone === 'ok' ? 'form-success' : 'form-error'}>{message.text}</p> : null}

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Import Local Services leads and their call, message, booking, charge, credit, and lead-feedback facts.
        When an imported lead becomes a signed quote here, Marketing performance connects the exact signed amount
        back to the Google spend. This is reporting only: Google bills the ad account directly, and this connection
        never draws from your managed-ads wallet.
      </p>
      <p className="workspace-details-copy" style={{ marginBottom: '1rem' }}>
        Google reports whether an individual lead was charged or credited, but not that lead&rsquo;s dollar amount.
        Its current booking feed identifies a booking lead without giving us the appointment time, so imported
        bookings are never placed on your schedule automatically.
      </p>

      {status.state === 'unconfigured' ? (
        <p className="empty-state">Add the Google OAuth credentials and developer token to enable this connection.</p>
      ) : null}

      {status.state === 'not_connected' ? (
        <div className="workspace-inline-row">
          <a href="/api/google-lsa/connect" className="btn primary">Connect Google Local Services</a>
        </div>
      ) : null}

      {status.state === 'choose_customer' ? (
        <>
          {status.candidates.length ? (
            <form action={chooseCustomerAction} className="form-grid">
              <div className="field full">
                <label htmlFor="googleLsaCustomer">Local Services account</label>
                <select id="googleLsaCustomer" name="customerId" required defaultValue="">
                  <option value="" disabled>Choose an account</option>
                  {status.candidates.map((candidate) => (
                    <option key={`${candidate.customerId}-${candidate.campaignId ?? candidate.campaignMode}`} value={`${candidate.customerId}:${candidate.campaignId ?? ''}`}>
                      {candidate.customerName || 'Google Ads account'} · {candidate.customerId} · {candidate.campaignMode === 'pmax' ? 'Performance Max' : 'Legacy Local Services'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <SaveButton pendingLabel="Selecting…" savedLabel="Selected ✓">Use this account</SaveButton>
              </div>
            </form>
          ) : (
            <p className="form-error">
              {status.reason || 'Google did not return an eligible Local Services campaign for this login.'}
            </p>
          )}
          <div className="workspace-inline-row">
            <a href="/api/google-lsa/connect" className="btn secondary">Try another Google login</a>
            <form action="/api/google-lsa/disconnect" method="post">
              <button type="submit" className="btn secondary">Remove the connection</button>
            </form>
          </div>
        </>
      ) : null}

      {status.state === 'needs_reconnect' ? (
        <>
          <p className="form-error">
            {status.customerName ? <><strong>{status.customerName}</strong> — </> : null}{status.reason}
          </p>
          <div className="workspace-inline-row">
            <a href="/api/google-lsa/connect" className="btn primary">Reconnect Google</a>
            <form action="/api/google-lsa/disconnect" method="post">
              <button type="submit" className="btn secondary">Remove the connection</button>
            </form>
          </div>
        </>
      ) : null}

      {status.state === 'connected' ? (
        <>
          <p className="workspace-details-copy">
            Linked to <strong>{status.customerName || `Google Ads account ${status.customerId}`}</strong>
            {' '}({status.campaignMode === 'pmax' ? 'Local Services on Performance Max' : 'legacy Local Services'}).
          </p>
          <p className="workspace-details-copy">
            {status.lastSyncAt ? (
              <>Last successful import {dayTime(status.lastSyncAt)}{status.lastSyncSummary ? <> — {status.lastSyncSummary}.</> : '.'}</>
            ) : (
              <>Nothing imported yet. Run the first import now; later imports run automatically every 15 minutes.</>
            )}
          </p>
          {status.lastError ? (
            <p className="form-error">
              Latest import attempt{status.lastSyncAttemptAt ? ` (${dayTime(status.lastSyncAttemptAt)})` : ''} failed: {status.lastError}
            </p>
          ) : null}
          <div className="workspace-inline-row">
            <form action={syncAction}>
              <SaveButton className="btn primary" pendingLabel="Importing…" savedLabel="Imported ✓">
                Import from Google now
              </SaveButton>
            </form>
          </div>
          <div className="qb-danger">
            <span>
              <strong>Disconnect Google Local Services</strong>
              <small>Imports stop. Existing leads and historical reporting stay here.</small>
            </span>
            <form action="/api/google-lsa/disconnect" method="post">
              <button type="submit" className="linklike danger">Disconnect</button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
