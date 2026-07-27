import Link from 'next/link';
import type { ClientWithStats } from '@/lib/clients';
import { formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { DEMO_ACCOUNT_ID, DEMO_JOBS, DEMO_LEADS } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Emails aren't stored on jobs in the demo dataset, so borrow them from any lead
// with the same contact — that's how a real customer profile gets an email on
// file (the lead that became the job). Keyed by name to keep this display-only.
const EMAIL_BY_NAME = new Map(
  DEMO_LEADS.filter((lead) => lead.name && lead.email).map((lead) => [lead.name as string, lead.email as string]),
);

// Build one display row per customer from the demo job history — the same
// "one profile per customer" rollup the real page derives from Supabase, just
// computed inline from the static dataset. Shaped as ClientWithStats so the row
// markup below stays type-correct against the real Client type.
function buildDemoClients(): ClientWithStats[] {
  const byName = new Map<string, ClientWithStats>();

  for (const job of DEMO_JOBS) {
    const name = job.client_name || 'Client';
    const existing = byName.get(name);
    if (existing) {
      existing.jobCount += 1;
      existing.totalValue += job.quoted_amount;
      if (!existing.lastJobAt || job.created_at > existing.lastJobAt) existing.lastJobAt = job.created_at;
      if (!existing.phone && job.client_phone) existing.phone = job.client_phone;
      if (!existing.address && job.address) existing.address = job.address;
    } else {
      byName.set(name, {
        id: `demo-client-${byName.size + 1}`,
        account_id: DEMO_ACCOUNT_ID,
        name,
        phone: job.client_phone || null,
        email: EMAIL_BY_NAME.get(name) ?? null,
        address: job.address || null,
        notes: null,
        last_rebook_invite_at: null,
        created_at: job.created_at,
        updated_at: job.created_at,
        jobCount: 1,
        totalValue: job.quoted_amount,
        lastJobAt: job.created_at,
      });
    }
  }

  // Most recently active first — mirrors listClientsWithStats' ordering.
  return [...byName.values()].sort((a, b) => {
    const aKey = a.lastJobAt ?? a.created_at;
    const bKey = b.lastJobAt ?? b.created_at;
    return bKey.localeCompare(aKey);
  });
}

export default function DemoClientsPage() {
  const clients = buildDemoClients();
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
            <span className="btn secondary" aria-disabled="true" style={{ opacity: 0.55, pointerEvents: 'none' }}>Import customers</span>
          </div>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="client-list">
          {clients.map((client) => (
            <div className="client-row" key={client.id}>
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
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Import your customer list</h2>
        </div>
        <p className="workspace-card-copy">
          Every job you create files itself under the right customer automatically — no double entry.
          You can also import your existing customer list in one step. This demo account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
