import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import PastClientsPicker, { type PastClientOption } from '@/components/past-clients-picker';
import QuickFillButtons from '@/components/quick-fill-buttons';
import FormattedCurrencyInput from '@/components/formatted-currency-input';
import { deriveJobListBadge } from '@/lib/job-badges';
import type { Invoice } from '@/lib/invoices';
import { listJobs, formatMoney, type Job } from '@/lib/jobs';
import { listLeads, type Lead } from '@/lib/leads';
import type { Payment } from '@/lib/payments';
import type { JobStatus } from '@/lib/jobs';
import { createJobAction } from './actions';

const STATUS_FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new_lead', label: 'New request' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '');
  return digits ? digits.slice(-10) : null;
}

function buildPastClients(jobs: Job[], leads: Lead[]): PastClientOption[] {
  const clients: PastClientOption[] = [];

  function findExisting(input: { name: string | null; phone: string | null; email: string | null }) {
    const email = normalizeKey(input.email);
    if (email) {
      const match = clients.find((client) => normalizeKey(client.email) === email);
      if (match) return match;
    }

    const phone = normalizePhone(input.phone);
    if (phone) {
      const match = clients.find((client) => normalizePhone(client.phone) === phone);
      if (match) return match;
    }

    const name = normalizeKey(input.name);
    return name ? clients.find((client) => normalizeKey(client.name) === name) : undefined;
  }

  function addClient(client: PastClientOption) {
    const existing = findExisting(client);
    if (!existing) {
      clients.push(client);
      return;
    }

    existing.phone = existing.phone ?? client.phone;
    existing.email = existing.email ?? client.email;
    existing.address = existing.address ?? client.address;
    if (existing.source !== client.source) {
      existing.source = 'both';
      existing.sourceLabel = existing.sourceLabel.includes('Lead') ? existing.sourceLabel : `${existing.sourceLabel} + lead`;
    }
  }

  for (const job of jobs) {
    addClient({
      id: `job-${job.id}`,
      name: job.client_name,
      phone: job.client_phone,
      email: job.client_email,
      address: job.address,
      source: 'job',
      sourceLabel: `Job ${job.ref}`,
    });
  }

  for (const lead of leads) {
    if (!lead.name) continue;
    addClient({
      id: `lead-${lead.id}`,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      source: 'lead',
      sourceLabel: 'Lead',
    });
  }

  return clients;
}

function groupByJobId<T extends { job_id: string }>(rows: T[]): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((groups, row) => {
    groups[row.job_id] = [...(groups[row.job_id] ?? []), row];
    return groups;
  }, {});
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const statusParam = searchParams.status as JobStatus | undefined;
  const [jobs, allJobs, leads] = await Promise.all([
    listJobs(supabase, accountId, statusParam),
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
  ]);
  const pastClients = buildPastClients(allJobs, leads);
  const visibleJobIds = jobs.map((job) => job.id);
  const [{ data: invoiceRows, error: invoiceError }, { data: paymentRows, error: paymentError }, { data: clientAccessRows, error: clientAccessError }] =
    visibleJobIds.length > 0
      ? await Promise.all([
          supabase
            .from('invoices')
            .select('*')
            .eq('account_id', accountId)
            .in('job_id', visibleJobIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('*')
            .eq('account_id', accountId)
            .in('job_id', visibleJobIds)
            .order('requested_at', { ascending: false }),
          supabase
            .from('client_job_access')
            .select('job_id')
            .eq('account_id', accountId)
            .in('job_id', visibleJobIds)
            .is('revoked_at', null),
        ])
      : [
          { data: [] as Invoice[] | null, error: null },
          { data: [] as Payment[] | null, error: null },
          { data: [] as Array<{ job_id: string }> | null, error: null },
        ];

  if (invoiceError) throw invoiceError;
  if (paymentError) throw paymentError;
  if (clientAccessError) throw clientAccessError;

  const invoicesByJob = groupByJobId((invoiceRows ?? []) as Invoice[]);
  const paymentsByJob = groupByJobId((paymentRows ?? []) as Payment[]);
  const clientAccessCountByJob = (clientAccessRows ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.job_id] = (counts[row.job_id] ?? 0) + 1;
    return counts;
  }, {});
  const totalQuoted = jobs.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = jobs.filter((job) => job.status === 'in_progress').length;

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current jobs</h2>
        </div>
        <div className="status-tabs workspace-status-tabs">
          {STATUS_FILTERS.map((filter) => {
            const isActive = (filter.value === 'all' && !statusParam) || filter.value === statusParam;
            const href = filter.value === 'all' ? '/dashboard/jobs' : `/dashboard/jobs?status=${filter.value}`;
            return (
              <Link key={filter.value} href={href} className={`status-tab${isActive ? ' active' : ''}`}>
                {filter.label}
              </Link>
            );
          })}
        </div>
        {jobs.length === 0 ? (
          <p className="empty-state">No jobs yet. Create your first job below.</p>
        ) : (
          <div className="job-list">
            {jobs.map((job) => {
              const badge = deriveJobListBadge(job, paymentsByJob[job.id] ?? [], invoicesByJob[job.id] ?? [], clientAccessCountByJob[job.id] ?? 0);
              return (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="job-row">
                  <div className="job-row-header">
                    <span className="job-ref">{job.ref}</span>
                    <span className={`status-badge status-${badge.tone}`} title={badge.title}>{badge.label}</span>
                  </div>
                  <div className="job-client">{job.client_name}</div>
                  <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                    <span className="job-meta">
                      {job.address || 'No address on file'}
                      {' · '}Estimated hours: {job.estimated_hours ? `${job.estimated_hours} hrs` : 'Not set'}
                    </span>
                    {job.quoted_amount > 0 ? (
                      <span className="job-quoted">{formatMoney(job.quoted_amount)}</span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{jobs.length}</span>
          <span className="stat-ticker-label">Visible jobs</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{activeJobs}</span>
          <span className="stat-ticker-label">In progress</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{formatMoney(totalQuoted)}</span>
          <span className="stat-ticker-label">Quoted value</span>
        </div>
      </div>

      <details className="panel workspace-section-card workspace-details" open={jobs.length === 0}>
        <summary className="workspace-details-summary">
          <span className="btn primary">+ New job</span>
          <span className="workspace-details-copy">Capture the next signed opportunity.</span>
        </summary>
        <form action={createJobAction} className="form-grid">
          <PastClientsPicker clients={pastClients} />
          <div className="field">
            <label htmlFor="clientPhone">Client phone</label>
            <input id="clientPhone" name="clientPhone" placeholder="(248) 555-0117" />
          </div>
          <div className="field">
            <label htmlFor="clientEmail">Client email</label>
            <input id="clientEmail" name="clientEmail" type="email" placeholder="sarah@example.com" />
          </div>
          <div className="field full">
            <label htmlFor="address">Address</label>
            <AddressAutocomplete id="address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
          </div>
          <div className="field job-intake-description">
            <label htmlFor="scope">Job Description</label>
            <textarea id="scope" name="scope" placeholder="Full roof tear-off & re-shingle..." />
          </div>
          <div className="field job-intake-photos">
            <label htmlFor="photos">Photos</label>
            <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
          </div>
          <div className="full job-intake-schedule-grid">
            <div className="job-intake-schedule-stack">
              <div className="field">
                <label htmlFor="scheduledFor">Scheduled for</label>
                <ScheduledDatePicker id="scheduledFor" name="scheduledFor" />
              </div>
              <div className="field">
                <label htmlFor="scheduledTime">Time of day</label>
                <TimeSlotSelect id="scheduledTime" name="scheduledTime" />
              </div>
            </div>
            <div className="field job-intake-metric hours-metric">
              <label htmlFor="estimatedHours">Estimated hours</label>
              <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" placeholder="16" />
              <QuickFillButtons
                label="Quick add:"
                targetId="estimatedHours"
                values={[
                  { label: '2 hrs', value: '2' },
                  { label: '4 hrs', value: '4' },
                  { label: '8 hrs', value: '8' },
                  { label: '16 hrs', value: '16' },
                ]}
              />
            </div>
          </div>
          <div className="field full job-intake-metric quote-metric">
            <label htmlFor="quotedAmount">Quoted amount ($)</label>
            <FormattedCurrencyInput id="quotedAmount" name="quotedAmount" placeholder="$12,840" />
          </div>
          <label className="field full sms-consent-check job-intake-client-text">
            <input name="sendClientText" type="checkbox" defaultChecked />
            <span>
              <strong>Send Client Text</strong>
              <small>Text the client their dashboard link after this job is created.</small>
            </span>
          </label>
          <div className="field full">
            <button type="submit" className="btn primary">
              Create job
            </button>
          </div>
        </form>
      </details>
    </main>
  );
}
