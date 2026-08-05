import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { listClientsWithStats } from '@/lib/clients';
import { clientPins } from '@/lib/client-map';
import { CLIENTS_VIEW_COOKIE, normalizeClientsView } from '@/lib/dashboard-views';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import ClientsWorkspace, { type ClientRow } from './ClientsWorkspace';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initialsFor(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

export default async function ClientsPage({ searchParams }: { searchParams: { created?: string; existing?: string; add?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  // One query for the whole book's coordinates, not one per customer.
  const [clients, pinsByClient] = await Promise.all([
    listClientsWithStats(supabase, accountId),
    clientPins(supabase, accountId),
  ]);
  const repeatCount = clients.filter((client) => client.jobCount > 1).length;
  const pins = [...pinsByClient.values()].map((pin) => ({ clientId: pin.clientId, lat: pin.lat, lng: pin.lng }));
  // 'YYYY-MM-DD' in the server's own zone. Decided here rather than in the
  // browser so the follow-up bands cannot differ between two views on the same
  // screen across a midnight.
  const todayKey = new Date().toLocaleDateString('en-CA');
  const view = normalizeClientsView(cookies().get(CLIENTS_VIEW_COOKIE)?.value);

  const rows: ClientRow[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    initials: initialsFor(client.name),
    isRepeat: client.jobCount > 1,
    phone: client.phone,
    phoneLabel: client.phone ? formatPhoneDashes(client.phone) : null,
    email: client.email,
    address: client.address,
    contactLine:
      [client.phone ? formatPhoneDashes(client.phone) : null, client.email].filter(Boolean).join(' · ') ||
      'No contact on file',
    jobCount: client.jobCount,
    jobsLabel: `${client.jobCount} job${client.jobCount === 1 ? '' : 's'}`,
    totalValue: client.totalValue,
    totalLabel: formatMoney(client.totalValue),
    lastJobAt: client.lastJobAt,
    lastLabel: formatDate(client.lastJobAt),
    search: [client.name, client.phone, client.email, client.address].filter(Boolean).join(' ').toLowerCase(),
    nextJobAt: client.nextJobAt,
    lastVisitAt: client.lastVisitAt,
    unscheduledJobs: client.unscheduledJobs,
  }));

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
            <span className="status-badge status-in_progress">{clients.length} client{clients.length === 1 ? '' : 's'}</span>
            {repeatCount > 0 ? <span className="status-badge status-complete">{repeatCount} repeat</span> : null}
          </div>
        </div>
      </section>

      {searchParams.existing ? (
        <p className="flash flash-info">That phone or email is already on a customer — here they are, rather than a second copy.</p>
      ) : null}

      <section className="panel workspace-section-card">
        {clients.length === 0 ? (
          <p className="empty-state">
            No clients yet. Add your first customer below, or{' '}
            <Link href="/dashboard/clients/import">import your existing customer list</Link>. Every job you create adds
            its customer here automatically too.
          </p>
        ) : null}
        {/* Rendered even with an empty book: the Add button lives in here, and a
            list you can't add to is the problem this page had. */}
        <ClientsWorkspace clients={rows} pins={pins} todayKey={todayKey} initialView={view} openAdd={searchParams.add === '1'} />
      </section>

      <div className="actions" style={{ marginTop: '1.25rem' }}>
        <Link href="/dashboard/clients/import" className="btn secondary">Import customers</Link>
      </div>
    </main>
  );
}
