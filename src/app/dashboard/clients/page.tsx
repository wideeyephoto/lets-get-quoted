import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listClientsWithStats } from '@/lib/clients';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ClientsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const clients = await listClientsWithStats(supabase, accountId);
  const repeatCount = clients.filter((client) => client.jobCount > 1).length;

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
            No clients yet. As you create jobs, each customer gets a profile here automatically.
          </p>
        </section>
      ) : (
        <section className="panel workspace-section-card">
          <div className="client-list">
            {clients.map((client) => (
              <Link href={`/dashboard/clients/${client.id}`} className="client-row" key={client.id}>
                <div className="client-row-main">
                  <div className="client-row-name">
                    <strong>{client.name}</strong>
                    {client.jobCount > 1 ? <span className="client-repeat-badge">Repeat</span> : null}
                  </div>
                  <span className="client-row-contact">
                    {[client.phone ? formatPhoneDashes(client.phone) : null, client.email].filter(Boolean).join(' · ') || 'No contact on file'}
                  </span>
                </div>
                <div className="client-row-stats">
                  <span><strong>{client.jobCount}</strong> job{client.jobCount === 1 ? '' : 's'}</span>
                  <span><strong>{formatMoney(client.totalValue)}</strong> total</span>
                  <span className="client-row-last">Last: {formatDate(client.lastJobAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
