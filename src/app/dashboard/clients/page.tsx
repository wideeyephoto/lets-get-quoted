import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listClientsWithStats } from '@/lib/clients';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import ClientsSearchList, { type ClientSearchRow } from './ClientsSearchList';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ClientsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const clients = await listClientsWithStats(supabase, accountId);
  const repeatCount = clients.filter((client) => client.jobCount > 1).length;

  const searchRows: ClientSearchRow[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    isRepeat: client.jobCount > 1,
    contactLine: [client.phone ? formatPhoneDashes(client.phone) : null, client.email].filter(Boolean).join(' · ') || 'No contact on file',
    jobsLabel: `${client.jobCount} job${client.jobCount === 1 ? '' : 's'}`,
    totalLabel: formatMoney(client.totalValue),
    lastLabel: formatDate(client.lastJobAt),
    search: [client.name, client.phone, client.email, client.address].filter(Boolean).join(' ').toLowerCase(),
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

      {clients.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No clients yet. As you create jobs, each customer gets a profile here automatically — or{' '}
            <Link href="/dashboard/clients/import">import your existing customer list</Link>.
          </p>
        </section>
      ) : (
        <section className="panel workspace-section-card">
          <ClientsSearchList clients={searchRows} />
        </section>
      )}

      <div className="actions" style={{ marginTop: '1.25rem' }}>
        <Link href="/dashboard/clients/import" className="btn secondary">Import customers</Link>
      </div>
    </main>
  );
}
