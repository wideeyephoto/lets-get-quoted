import Link from 'next/link';
import ClientsWorkspace, { type ClientRow } from './ClientsWorkspace';
import type { ClientMapPin } from './ClientsMap';
import type { ClientsView } from '@/lib/dashboard-views';

/**
 * The customer book, given its rows.
 *
 * Split out of page.tsx so the demo renders the same screen — see the note on
 * CampaignsScreen. Everything that writes (Add a client, Import) is withheld
 * under readOnly rather than shown and then failing on submit.
 */
export default function ClientsScreen({
  rows,
  pins,
  todayKey,
  view,
  repeatCount,
  showExistingFlash = false,
  openAdd = false,
  basePath = '/dashboard',
  readOnly = false,
}: {
  rows: ClientRow[];
  pins: ClientMapPin[];
  todayKey: string;
  view: ClientsView;
  repeatCount: number;
  showExistingFlash?: boolean;
  openAdd?: boolean;
  basePath?: string;
  readOnly?: boolean;
}) {
  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Clients</p>
          <h1 className="workspace-title">Your customers</h1>
          <p className="workspace-lead">
            One profile per customer — their whole job history in a place, so repeat business is easy to spot.
          </p>
          <div className="workspace-inline-row">
            <span className="status-badge status-in_progress">{rows.length} client{rows.length === 1 ? '' : 's'}</span>
            {repeatCount > 0 ? <span className="status-badge status-complete">{repeatCount} repeat</span> : null}
          </div>
        </div>
      </section>

      {showExistingFlash ? (
        <p className="flash flash-info">That phone or email is already on a customer — here they are, rather than a second copy.</p>
      ) : null}

      <section className="panel workspace-section-card">
        {rows.length === 0 ? (
          <p className="empty-state">
            No clients yet. Add your first customer below, or{' '}
            <Link href={`${basePath}/clients/import`}>import your existing customer list</Link>. Every job you create adds
            its customer here automatically too.
          </p>
        ) : null}
        {/* Rendered even with an empty book: the Add button lives in here, and a
            list you can't add to is the problem this page had. */}
        <ClientsWorkspace
          clients={rows}
          pins={pins}
          todayKey={todayKey}
          initialView={view}
          openAdd={openAdd}
          basePath={basePath}
          readOnly={readOnly}
        />
      </section>

      {readOnly ? null : (
        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <Link href={`${basePath}/clients/import`} className="btn secondary">Import customers</Link>
        </div>
      )}
    </main>
  );
}
