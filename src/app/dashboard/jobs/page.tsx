import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import PastClientsPicker, { type PastClientOption } from '@/components/past-clients-picker';
import { listJobs, formatMoney, type Job } from '@/lib/jobs';
import { listLeads, type Lead } from '@/lib/leads';
import type { JobStatus } from '@/lib/jobs';
import { createJobAction } from './actions';

const STATUS_FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new_lead', label: 'New request' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

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
            {jobs.map((job) => (
              <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="job-row">
                <div className="job-row-header">
                  <span className="job-ref">{job.ref}</span>
                  <span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
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
            ))}
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
            <label htmlFor="clientName">Client name</label>
            <input id="clientName" name="clientName" required placeholder="Sarah Whitfield" />
          </div>
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
          <div className="field full">
            <label htmlFor="scope">Job Description</label>
            <textarea id="scope" name="scope" placeholder="Full roof tear-off & re-shingle..." />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue="new_lead">
              <option value="new_lead">New request</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="scheduledFor">Scheduled for</label>
            <ScheduledDatePicker id="scheduledFor" name="scheduledFor" />
          </div>
          <div className="field">
            <label htmlFor="scheduledTime">Time of day</label>
            <TimeSlotSelect id="scheduledTime" name="scheduledTime" />
          </div>
          <div className="field">
            <label htmlFor="estimatedHours">Estimated hours</label>
            <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" placeholder="16" />
          </div>
          <div className="field">
            <label htmlFor="quotedAmount">Quoted amount ($)</label>
            <input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" placeholder="12840" />
          </div>
          <div className="field full workspace-section-divider">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Quick booking</p>
              <h2>Suggest 3 service options with the quote</h2>
            </div>
            <p className="workspace-card-copy">Add three dates that work for your crew and the client will get a text link to choose one or ask for different times.</p>
          </div>
          {[1, 2, 3].map((optionNumber) => (
            <div className="schedule-option-grid field full" key={optionNumber}>
              <div>
                <label htmlFor={`quoteScheduleDate${optionNumber}`}>Option {optionNumber} date</label>
                <ScheduledDatePicker id={`quoteScheduleDate${optionNumber}`} name={`quoteScheduleDate${optionNumber}`} />
              </div>
              <div>
                <label htmlFor={`quoteScheduleTime${optionNumber}`}>Option {optionNumber} time</label>
                <TimeSlotSelect id={`quoteScheduleTime${optionNumber}`} name={`quoteScheduleTime${optionNumber}`} />
              </div>
            </div>
          ))}
          <div className="field full">
            <label className="sms-consent-check">
              <input name="quoteScheduleSmsConsent" type="checkbox" />
              <span>The client agreed to receive transactional scheduling texts. Required only when sending quick booking options. Reply STOP to opt out.</span>
            </label>
          </div>
          <div className="field full">
            <label htmlFor="photos">Photos</label>
            <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
          </div>
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
