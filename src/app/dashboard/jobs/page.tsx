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
import { cookies } from 'next/headers';
import { createJobAction } from './actions';
import { shouldAutoOpenCreate } from '@/lib/nav-helpers';
import PinMap from '@/components/pin-map';
import { getMapPins } from '@/lib/map-pins';
import { JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeJobsView, normalizeMapTheme, normalizeMapView } from '@/lib/dashboard-views';
import JobsWorkspace, { type JobViewItem } from './JobsWorkspace';

// Compact "Aug 3" / "Aug 3 · 9:00 AM" label for a job's scheduled date, parsed
// off the date parts so a date-only value never shifts a day by timezone.
function formatScheduledLabel(dateIso: string, time: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateIso);
  const label = Number.isNaN(d.getTime()) ? dateIso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return time ? `${label} · ${time}` : label;
}

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
  searchParams: { status?: string; new?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [allJobs, leads] = await Promise.all([
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
  ]);
  const pastClients = buildPastClients(allJobs, leads);
  const jobIds = allJobs.map((job) => job.id);
  const [{ data: invoiceRows, error: invoiceError }, { data: paymentRows, error: paymentError }, { data: clientAccessRows, error: clientAccessError }] =
    jobIds.length > 0
      ? await Promise.all([
          supabase.from('invoices').select('*').eq('account_id', accountId).in('job_id', jobIds).order('created_at', { ascending: false }),
          supabase.from('payments').select('*').eq('account_id', accountId).in('job_id', jobIds).order('requested_at', { ascending: false }),
          supabase.from('client_job_access').select('job_id').eq('account_id', accountId).in('job_id', jobIds).is('revoked_at', null),
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

  // Serialize every job (with its live badge) for the client view switcher.
  const jobItems: JobViewItem[] = allJobs.map((job) => {
    const badge = deriveJobListBadge(job, paymentsByJob[job.id] ?? [], invoicesByJob[job.id] ?? [], clientAccessCountByJob[job.id] ?? 0);
    return {
      id: job.id,
      ref: job.ref,
      clientName: job.client_name,
      address: job.address,
      status: job.status,
      badgeLabel: badge.label,
      badgeTone: badge.tone,
      badgeTitle: badge.title ?? '',
      scheduledLabel: job.scheduled_for ? formatScheduledLabel(job.scheduled_for, job.scheduled_time) : null,
      quotedAmount: job.quoted_amount,
      quotedLabel: formatMoney(job.quoted_amount),
      estimatedHours: job.estimated_hours,
      createdAt: job.created_at,
    };
  });

  const totalQuoted = allJobs.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = allJobs.filter((job) => job.status === 'in_progress').length;
  const mapView = normalizeMapView(cookies().get(mapViewCookie('jobs'))?.value);
  const mapTheme = normalizeMapTheme(cookies().get(MAP_THEME_COOKIE)?.value);
  const jobsView = normalizeJobsView(cookies().get(JOBS_VIEW_COOKIE)?.value);
  const mapPins = mapView !== 'off' ? await getMapPins(supabase, accountId) : [];

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current jobs</h2>
        </div>
        {mapView === 'large' && (
          <div className="workspace-embedded-map">
            <PinMap pins={mapPins} theme={mapTheme} />
          </div>
        )}
        {allJobs.length === 0 ? (
          <p className="empty-state">No jobs yet. Create your first job below.</p>
        ) : (
          <JobsWorkspace jobs={jobItems} initialView={jobsView} mapView={mapView} mapTheme={mapTheme} />
        )}
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{allJobs.length}</span>
          <span className="stat-ticker-label">Total jobs</span>
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

      <details id="new-job" className="panel workspace-section-card workspace-details" open={shouldAutoOpenCreate(allJobs.length, searchParams.new)}>
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

      {/* Bring-your-data tools live at the bottom, out of the way of the daily
          job list — you reach for these once when setting up, not every visit. */}
      <details className="panel workspace-section-card workspace-details">
        <summary className="workspace-details-summary">
          <span className="btn secondary">Import &amp; migrate</span>
          <span className="workspace-details-copy">Bring jobs, invoices, or your whole book from another app.</span>
        </summary>
        <div className="workspace-inline-row" style={{ marginTop: '0.85rem' }}>
          <Link href="/dashboard/import" className="btn secondary">Migrate from another app</Link>
          <Link href="/dashboard/jobs/import" className="btn secondary">Import jobs</Link>
          <Link href="/dashboard/jobs/import-invoices" className="btn secondary">Import invoices</Link>
        </div>
      </details>
    </main>
  );
}
