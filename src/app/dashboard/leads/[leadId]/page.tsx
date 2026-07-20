import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import { expireStaleLeads, formatElapsedTime, formatLeadSource, getLead, listLeads, type Lead, type LeadQuoteVisit } from '@/lib/leads';
import { expandScheduledJobs, formatJobSchedule, formatJobTime, listJobs, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import { clearLeadQuoteVisitAction, convertLeadAction, scheduleLeadQuoteVisitAction, sendLeadQuoteVisitOptionsAction, updateLeadDetailsAction } from '../actions';
import LeadAvailabilityScheduler from './LeadAvailabilityScheduler';
import SaveButton from '@/components/save-button';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

function mapEmbedSrc(address: string | null) {
  if (!address) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=9&output=embed`;
}

function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const normalized = address.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const statePattern = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const deriveTrailingCity = (value: string) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    if (/^\d/.test(tokens[0] || '')) {
      if (tokens.length >= 4) return tokens.slice(-2).join(' ');
      if (tokens.length >= 2) return tokens.slice(1).join(' ');
    }
    if (tokens.length >= 2) return tokens.slice(-2).join(' ');
    return value;
  };
  const cityPart = parts.find((part, index) => index > 0 && !statePattern.test(part));
  if (cityPart) return cityPart;

  const stateIndex = parts.findIndex((part) => statePattern.test(part));
  const fallback = stateIndex > 0 ? parts[stateIndex - 1] : parts[0];
  const inferredCity = fallback.match(/(?:\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Circle|Cir)\b\.?\s+)(.+)$/i)?.[1];
  if (inferredCity) return inferredCity;
  if (stateIndex > 0) return deriveTrailingCity(fallback);

  if (!normalized.includes(',')) {
    return deriveTrailingCity(normalized);
  }

  return fallback || normalized || 'No address on file';
}

function formatVisit(visit: LeadQuoteVisit | null) {
  return visit ? formatJobSchedule(visit.scheduledFor, visit.scheduledTime) : null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function buildAvailability(jobs: Job[], leads: Lead[], scheduleDayHours: number, startDate: Date) {
  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const occurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours);
  const quoteVisits = leads.filter((lead) => lead.quote_visit?.scheduledFor);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    const key = dateKey(date);
    const dayJobs = occurrences.filter((job) => job.scheduled_for === key);
    const dayVisits = quoteVisits.filter((lead) => lead.quote_visit?.scheduledFor === key);
    const hours = dayJobs.reduce((sum, job) => sum + (Number(job.estimated_hours) || 0), 0);
    return { key, label: dayLabel(date), jobs: dayJobs, visits: dayVisits, hours };
  });
}

function nextScheduledJobLabel(jobs: ScheduledJobOccurrence<Job>[]) {
  const nextJob = jobs[0];
  if (!nextJob) return 'No jobs scheduled';
  const time = formatJobTime(nextJob.scheduled_time);
  return `${nextJob.client_name}${time ? ` at ${time}` : ''}`;
}

export default async function LeadDetailPage({ params, searchParams }: { params: { leadId: string }; searchParams: { edit?: string; availabilityStart?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  await expireStaleLeads(supabase, accountId);
  const [lead, jobs, leads, { data: account }] = await Promise.all([
    getLead(supabase, accountId, params.leadId),
    listJobs(supabase, accountId, undefined, { includeLeadQuotes: true }),
    listLeads(supabase, accountId),
    supabase.from('accounts').select('schedule_day_hours').eq('id', accountId).maybeSingle(),
  ]);
  if (!lead) notFound();

  const photoUrls = await createLeadPhotoUrls(accountId, lead.photo_paths || []);
  const photos = (lead.photo_paths || []).map((path, index) => ({ path, url: photoUrls[index] })).filter((photo) => photo.url);
  const updateLeadDetails = updateLeadDetailsAction.bind(null, lead.id);
  const convertLead = convertLeadAction.bind(null, lead.id);
  const rescheduleLater = clearLeadQuoteVisitAction.bind(null, lead.id);
  const scheduleVisit = scheduleLeadQuoteVisitAction.bind(null, lead.id);
  const sendQuoteVisitOptions = sendLeadQuoteVisitOptionsAction.bind(null, lead.id);
  const convertedJobLabel = lead.status === 'won' ? 'Open job' : 'Open quote';
  const visitLabel = formatVisit(lead.quote_visit);
  const mapSrc = mapEmbedSrc(lead.address);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const today = new Date();
  const availabilityStart = parseDateKey(searchParams.availabilityStart) ?? today;
  const previousAvailabilityStart = dateKey(addDays(availabilityStart, -7));
  const nextAvailabilityStart = dateKey(addDays(availabilityStart, 7));
  const canViewPreviousAvailability = dateKey(availabilityStart) > dateKey(today);
  const availability = buildAvailability(jobs, leads, scheduleDayHours, availabilityStart);
  const availabilityCards = availability.map((day) => ({
    key: day.key,
    label: day.label,
    summary: day.jobs.length + day.visits.length > 0
      ? `${day.jobs.length} job${day.jobs.length === 1 ? '' : 's'} / ${day.visits.length} quote visit${day.visits.length === 1 ? '' : 's'}`
      : 'Open',
    detail: day.hours ? `${day.hours} est hrs` : nextScheduledJobLabel(day.jobs),
    bookingLabel: day.jobs.length + day.visits.length > 0 ? 'Book anyway' : 'Book visit',
    busy: day.jobs.length + day.visits.length > 0,
    isToday: day.key === dateKey(today),
    jobHints: day.jobs.slice(0, 3).map((job) => ({
      id: `${job.id}-${job.scheduled_for}-${job.scheduled_time ?? 'anytime'}`,
      clientName: job.client_name,
      time: formatJobTime(job.scheduled_time) || 'Time TBD',
      city: extractCity(job.address),
    })),
  }));
  const availabilityHref = (startKey: string) => {
    const query = new URLSearchParams();
    if (searchParams.edit) query.set('edit', searchParams.edit);
    query.set('availabilityStart', startKey);
    return `/dashboard/leads/${lead.id}?${query.toString()}#availability-snapshot`;
  };
  return (
    <main className={`wide-shell workspace-shell ${styles.leadCommandShell}`}>
      <section className={`workspace-hero panel ${styles.leadHero}`}>
        <div className={styles.leadHeroMain}>
          <p className="eyebrow">Lead details</p>
          <div className={styles.leadTitleRow}>
            <h1 className="workspace-title">{lead.name || 'Unnamed lead'}</h1>
            <Link href={`/dashboard/leads/${lead.id}?edit=client#lead-details`} className="job-title-edit-link">
              (edit)
            </Link>
          </div>
          <div className={styles.detailBadges}>
            <span className={styles.source}>{formatLeadSource(lead.source)}</span>
            <span className={styles.receivedBadge}>Received {formatElapsedTime(lead.created_at)} ago</span>
            <span className={styles.statusPill}>{lead.status}</span>
            {visitLabel ? <span className={styles.visitPill}>Quote visit {visitLabel}</span> : null}
          </div>
          <div className={styles.leadQuickActions}>
            {!lead.converted_job ? <Link className="btn primary" href="#availability-snapshot">Schedule quote</Link> : null}
            {!lead.converted_job ? <Link className="btn secondary" href="#lead-estimate">Provide estimate</Link> : null}
            {!lead.converted_job ? <Link className="btn secondary" href="#lead-estimate">Convert to job &amp; Schedule Start Date</Link> : null}
            {lead.converted_job ? <Link className="btn primary" href={`/dashboard/jobs/${lead.converted_job}`}>{convertedJobLabel}</Link> : null}
          </div>
        </div>
        <div className={styles.leadStageCard}>
          <strong>Lead path</strong>
          <Link className={lead.quote_visit ? styles.stageComplete : undefined} href="#availability-snapshot">Schedule quote</Link>
          <Link className={['quoted', 'won'].includes(lead.status) ? styles.stageComplete : undefined} href="#lead-estimate">Provide estimate</Link>
          {lead.converted_job ? <Link className={styles.stageComplete} href={`/dashboard/jobs/${lead.converted_job}`}>Schedule start date</Link> : <Link href="#lead-estimate">Schedule start date</Link>}
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.leadContextStack}>
          <section id="lead-details" className={`panel workspace-section-card ${styles.detailSection}`}>
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Client & request</p>
              <h2>{lead.project_type || 'Project request'}</h2>
            </div>
            <div className={styles.contactGrid}>
              <div className={styles.dataBlock}><span>Phone</span>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <p>Not provided</p>}</div>
              <div className={styles.dataBlock}><span>Email</span>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <p>Not provided</p>}</div>
            </div>
            <div className={styles.dataBlock}><span>Project address</span><p>{lead.address || 'Not provided'}</p></div>
            {mapSrc ? (
              <div className={styles.leadMapCard}>
                <div><span>Job Location</span><strong>{lead.address}</strong></div>
                <iframe title={`Map showing ${lead.address}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            ) : null}
            <div className={styles.dataBlock}><span>Project details</span><p>{lead.message || 'Not provided'}</p></div>
            <details className={styles.inlineEditDetails} open={searchParams.edit === 'client'}>
              <summary className="btn secondary">Edit client/request details</summary>
              <form action={updateLeadDetails} className={`form-grid ${styles.leadEditForm}`}>
                <input type="hidden" name="projectType" value={lead.project_type ?? ''} />
                <input type="hidden" name="estimatedHours" value={lead.estimated_hours ?? ''} />
                <div className="field">
                  <label htmlFor="leadName">Client name</label>
                  <input id="leadName" name="name" defaultValue={lead.name ?? ''} required />
                </div>
                <div className="field">
                  <label htmlFor="leadPhone">Phone</label>
                  <input id="leadPhone" name="phone" type="tel" defaultValue={lead.phone ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="leadEmail">Email</label>
                  <input id="leadEmail" name="email" type="email" defaultValue={lead.email ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="leadAddress">Project address</label>
                  <input id="leadAddress" name="address" defaultValue={lead.address ?? ''} />
                </div>
                <div className="field full">
                  <label htmlFor="leadMessage">Project details</label>
                  <textarea id="leadMessage" name="message" rows={4} defaultValue={lead.message ?? ''} />
                </div>
                <div className="field full">
                  <SaveButton>Save lead details</SaveButton>
                </div>
              </form>
            </details>
          </section>

          <section className={`panel workspace-section-card ${styles.detailSection}`}>
            <div className="section-heading workspace-section-heading"><p className="eyebrow">Attachments</p><h2>Project photos</h2></div>
            <PhotoGallery
              entityId={lead.id}
              entityField="leadId"
              uploadUrl="/api/lead-photos"
              initialPhotos={photos}
              emptyLabel="No photos yet. Add some from the field or from the client."
              deleteConfirmMessage="Remove this photo from the lead? This cannot be undone."
            />
          </section>

          <section className={`panel workspace-section-card ${styles.detailSection}`}>
            <div className="section-heading workspace-section-heading"><p className="eyebrow">Activity</p><h2>Lead timeline</h2></div>
            <div className={styles.timelineList}>
              <div><span /> <p><strong>Website request received</strong><small>{new Date(lead.created_at).toLocaleString()}</small></p></div>
              {photos.length > 0 ? <div><span /> <p><strong>{photos.length} project photo{photos.length === 1 ? '' : 's'} attached</strong><small>Use these to qualify the visit or quote faster.</small></p></div> : null}
              {lead.quote_visit ? <div><span /> <p><strong>Quote visit scheduled</strong><small>{visitLabel}{lead.quote_visit.confirmationTextSentAt ? ' - confirmation text sent' : ''}</small></p></div> : null}
              {lead.converted_job ? <div><span /> <p><strong>Converted to job</strong><small>Opened as an active quote/job.</small></p></div> : null}
            </div>
          </section>
        </section>

        <aside className={styles.actionPanel}>
          {!lead.converted_job ? (
            <LeadAvailabilityScheduler
              availability={availabilityCards}
              leadPhone={lead.phone ?? ''}
              previousHref={availabilityHref(previousAvailabilityStart)}
              nextHref={availabilityHref(nextAvailabilityStart)}
              canViewPrevious={canViewPreviousAvailability}
              scheduleVisitAction={scheduleVisit}
              sendQuoteVisitOptionsAction={sendQuoteVisitOptions}
              clearVisitAction={rescheduleLater}
              visitSummary={visitLabel ? {
                label: visitLabel,
                detail: `${lead.quote_visit?.durationMinutes ?? 60} min visit${lead.quote_visit?.confirmationTextSentAt ? ' - text sent' : ''}`,
              } : null}
            />
          ) : null}

          {!lead.converted_job ? (
            <section id="lead-estimate" className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Step 2</p><h2>Send quote / estimate</h2></div>
              <p>Enter the amount and send the initial quote. Job start options can stay tucked away until you need them.</p>
              <form action={convertLead} className={styles.actionForm}>
                <div className={styles.quoteAmountField}>
                  <label htmlFor="quotedAmount">Quoted amount</label>
                  <div className={`currency-input ${styles.quoteAmountInput}`}>
                    <span aria-hidden="true">$</span>
                    <input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" />
                  </div>
                </div>
                <label htmlFor="estimatedHours">Estimated hours</label>
                <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" />
                <label className={`sms-consent-check ${styles.quoteTextCheck}`}>
                  <input name="sendClientText" type="checkbox" defaultChecked />
                  <span>
                    <strong>Text quote and sign-off link</strong>
                    <small>Send the client their quote dashboard link. Reply STOP to opt out.</small>
                  </span>
                </label>
                <details className={styles.optionalScheduleDetails}>
                  <summary>Suggest 3 job start times</summary>
                  <p>Optional. Text three service options with the quote so the client can book quickly.</p>
                  {[1, 2, 3].map((optionNumber) => (
                    <div className="schedule-option-grid" key={optionNumber}>
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
                  <label className="sms-consent-check">
                    <input name="quoteScheduleSmsConsent" type="checkbox" />
                    <span>The client agreed to receive transactional scheduling texts. Required only when sending quick booking options. Reply STOP to opt out.</span>
                  </label>
                </details>
                <SaveButton>Send Quote and Request Sign Off</SaveButton>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}