import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import PastClientsPicker, { type PastClientOption } from '@/components/past-clients-picker';
import QuickFillButtons from '@/components/quick-fill-buttons';
import FormattedCurrencyInput from '@/components/formatted-currency-input';
import { deriveJobListBadge } from '@/lib/job-badges';
import { selectPrimaryInvoice, type Invoice } from '@/lib/invoices';
import { INVOICE_STATUS_LABEL } from '@/lib/job-detail-labels';
import { listJobs, formatJobTime, formatMoney, type Job } from '@/lib/jobs';
import { listLeads, type Lead } from '@/lib/leads';
import type { Payment } from '@/lib/payments';
import { cookies } from 'next/headers';
import { createJobAction } from './actions';
import { shouldAutoOpenCreate } from '@/lib/nav-helpers';
import { getMapPins } from '@/lib/map-pins';
import { JOBS_VIEW_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeJobsView, normalizeMapTheme, normalizeMapView } from '@/lib/dashboard-views';
import JobsWorkspace, { type JobViewItem } from './JobsWorkspace';
import AutomationLink from '@/components/automation-link';

// Compact "Aug 3" / "Aug 3 · 9:00 AM" label for a job's scheduled date, parsed
// off the date parts so a date-only value never shifts a day by timezone.
function formatScheduledLabel(dateIso: string, time: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateIso);
  const label = Number.isNaN(d.getTime()) ? dateIso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // formatJobTime, not the raw column — scheduled_time is '08:14:00' in the
  // database and was being printed verbatim.
  const clock = formatJobTime(time);
  return clock ? `${label} · ${clock}` : label;
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
  //
  // The invoice and payment rows above are already loaded for every job, used
  // once for the badge, and then thrown away. Spending them here costs nothing
  // and is what lets the Focus pane paint a job's money the instant you click
  // it, with no network round trip.
  const jobItems: JobViewItem[] = allJobs.map((job) => {
    const jobInvoices = invoicesByJob[job.id] ?? [];
    const jobPayments = paymentsByJob[job.id] ?? [];
    const badge = deriveJobListBadge(job, jobPayments, jobInvoices, clientAccessCountByJob[job.id] ?? 0);

    const primaryInvoice = selectPrimaryInvoice(jobInvoices);
    // An invoice can be raised for more than the quote, so the larger of the
    // two is what's actually owed — same rule as the full job page.
    const displayTotal = primaryInvoice
      ? Math.max(Number(primaryInvoice.total), Number(job.quoted_amount))
      : Number(job.quoted_amount);
    const paidTotal = (primaryInvoice
      ? jobPayments.filter((p) => p.invoice_id === primaryInvoice.id && p.status === 'paid')
      : jobPayments.filter((p) => p.status === 'paid')
    ).reduce((sum, p) => sum + Number(p.amount), 0);

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
      outstandingLabel: formatMoney(Math.max(0, displayTotal - paidTotal)),
      paidLabel: formatMoney(paidTotal),
      invoiceRef: primaryInvoice?.ref ?? null,
      invoiceStatusLabel: primaryInvoice ? INVOICE_STATUS_LABEL[primaryInvoice.status] ?? primaryInvoice.status : null,
      scope: job.scope ?? null,
      photoCount: (job.photo_paths ?? []).length,
    };
  });

  const totalQuoted = allJobs.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = allJobs.filter((job) => job.status === 'in_progress').length;
  const mapView = normalizeMapView(cookies().get(mapViewCookie('jobs'))?.value);
  const mapTheme = normalizeMapTheme(cookies().get(MAP_THEME_COOKIE)?.value);
  const jobsView = normalizeJobsView(cookies().get(JOBS_VIEW_COOKIE)?.value);
  const mapPins = mapView !== 'off' ? await getMapPins(supabase, accountId) : [];
  const { data: jobsAcct } = await supabase.from('accounts').select('quote_followups_enabled').eq('id', accountId).maybeSingle();
  const followupsOn = Boolean(jobsAcct?.quote_followups_enabled);

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h1>Current jobs</h1>
        </div>
        {/* The map lives inside the workspace so the view gear can sit on its
            legend row (same as leads); the workspace also owns the empty state.
            Quote follow-ups rides along so it sits beside the View gear rather
            than floating under the title on its own line. */}
        <JobsWorkspace
          jobs={jobItems}
          initialView={jobsView}
          mapView={mapView}
          mapTheme={mapTheme}
          mapPins={mapPins}
          toolbarAccessory={<AutomationLink id="followups" label="Quote follow-ups" on={followupsOn} />}
        />
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

      {/* The Import & migrate accordion used to sit here. It moved to
          Settings → Business → Import & data, where every other importer
          already lives — you reach for these once when setting up, and having
          two of them on the page you open twenty times a day was the wrong
          trade. Both job importers are linked from there. */}
    </main>
  );
}
