import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import { expireStaleLeads, formatElapsedTime, formatLeadSource, getLead, listLeads, type Lead, type LeadQuoteVisit } from '@/lib/leads';
import { expandScheduledJobs, formatJobSchedule, formatJobTime, listJobs, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import { convertLeadAction, scheduleLeadQuoteVisitAction, updateLeadStatusAction } from '../actions';
import SaveButton from '@/components/save-button';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

function smsHref(phone: string | null, name: string | null) {
  if (!phone) return null;
  const firstName = name?.split(' ')[0] || 'there';
  return `sms:${phone}?&body=${encodeURIComponent(`Hi ${firstName}, this is your contractor from Let's Get Quoted. I received your project request and wanted to follow up.`)}`;
}

function mapEmbedSrc(address: string | null) {
  if (!address) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=9&output=embed`;
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

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function buildAvailability(jobs: Job[], leads: Lead[], scheduleDayHours: number) {
  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const occurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours);
  const quoteVisits = leads.filter((lead) => lead.quote_visit?.scheduledFor);
  const today = new Date();

  return Array.from({ length: 10 }, (_, index) => {
    const date = addDays(today, index);
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

export default async function LeadDetailPage({ params }: { params: { leadId: string } }) {
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
  const convertLead = convertLeadAction.bind(null, lead.id);
  const scheduleVisit = scheduleLeadQuoteVisitAction.bind(null, lead.id);
  const markContacted = updateLeadStatusAction.bind(null, lead.id, 'contacted');
  const unmarkContacted = updateLeadStatusAction.bind(null, lead.id, 'new');
  const markLost = updateLeadStatusAction.bind(null, lead.id, 'lost');
  const convertedJobLabel = lead.status === 'won' ? 'Open job' : 'Open quote';
  const visitLabel = formatVisit(lead.quote_visit);
  const textLink = smsHref(lead.phone, lead.name);
  const mapSrc = mapEmbedSrc(lead.address);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const availability = buildAvailability(jobs, leads, scheduleDayHours);

  return (
    <main className={`wide-shell workspace-shell ${styles.leadCommandShell}`}>
      <section className={`workspace-hero panel ${styles.leadHero}`}>
        <div className={styles.leadHeroMain}>
          <p className="eyebrow">Lead details</p>
          <div className={styles.leadTitleRow}>
            <h1 className="workspace-title">{lead.name || 'Unnamed lead'}</h1>
          </div>
          <div className={styles.detailBadges}>
            <span className={styles.source}>{formatLeadSource(lead.source)}</span>
            <span className={styles.receivedBadge}>Received {formatElapsedTime(lead.created_at)} ago</span>
            <span className={styles.statusPill}>{lead.status}</span>
            {visitLabel ? <span className={styles.visitPill}>Free quote {visitLabel}</span> : null}
          </div>
          <div className={styles.leadQuickActions}>
            <form action={lead.status === 'contacted' ? unmarkContacted : markContacted}>
              <button className={`btn ${lead.status === 'contacted' ? 'primary' : 'secondary'}`} type="submit" aria-pressed={lead.status === 'contacted'} disabled={lead.converted_job !== null || ['quoted', 'won', 'lost'].includes(lead.status)} title={lead.status === 'contacted' ? 'Click to unmark contacted' : 'Mark this lead as contacted'}>
                Client has been contacted
              </button>
            </form>
            <Link className="btn secondary" href="/dashboard/leads">Back to leads</Link>
            {lead.phone ? <a className="btn secondary" href={`tel:${lead.phone}`}>Call</a> : null}
            {textLink ? <a className="btn secondary" href={textLink}>Text client</a> : null}
            {lead.email ? <a className="btn secondary" href={`mailto:${lead.email}`}>Email</a> : null}
            {lead.converted_job ? <Link className="btn primary" href={`/dashboard/jobs/${lead.converted_job}`}>{convertedJobLabel}</Link> : null}
          </div>
        </div>
        <div className={styles.leadStageCard}>
          <strong>Lead path</strong>
          {[
            { label: 'Contact lead', active: lead.status !== 'new' },
            { label: 'Schedule free quote', active: Boolean(lead.quote_visit) },
            { label: 'Send estimate', active: ['quoted', 'won'].includes(lead.status) },
            { label: 'Convert to job', active: Boolean(lead.converted_job) || lead.status === 'won' },
          ].map((step) => <span className={step.active ? styles.stageComplete : undefined} key={step.label}>{step.label}</span>)}
        </div>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.leadContextStack}>
          <section className={`panel workspace-section-card ${styles.detailSection}`}>
            <div className="section-heading workspace-section-heading"><p className="eyebrow">Request</p><h2>{lead.project_type || 'Project request'}</h2></div>
            <div className={styles.contactGrid}>
              <div className={styles.dataBlock}><span>Phone</span>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <p>Not provided</p>}</div>
              <div className={styles.dataBlock}><span>Email</span>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <p>Not provided</p>}</div>
            </div>
            <div className={styles.dataBlock}><span>Project address</span><p>{lead.address || 'Not provided'}</p></div>
            {mapSrc ? (
              <div className={styles.leadMapCard}>
                <div><span>Location radius</span><strong>25-mile area around the job</strong></div>
                <iframe title={`Map showing a 25-mile area around ${lead.address}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            ) : null}
            <div className={styles.dataBlock}><span>Estimated hours</span><p>{lead.estimated_hours ? `${lead.estimated_hours} hrs` : 'Not estimated yet'}</p></div>
            <div className={styles.dataBlock}><span>Project details</span><p>{lead.message || 'Not provided'}</p></div>
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
              {lead.quote_visit ? <div><span /> <p><strong>Free quote visit scheduled</strong><small>{visitLabel}{lead.quote_visit.confirmationTextSentAt ? ' - confirmation text sent' : ''}</small></p></div> : null}
              {lead.converted_job ? <div><span /> <p><strong>Converted to job</strong><small>Opened as an active quote/job.</small></p></div> : null}
            </div>
          </section>
        </section>

        <aside className={styles.actionPanel}>
          {!lead.converted_job ? (
            <section className={`panel workspace-section-card ${styles.primaryActionCard}`}>
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Step 1</p><h2>Schedule free in-person quote</h2></div>
              <p>Pick an available opening from your calendar, then optionally text the client a confirmation.</p>
              {visitLabel ? <div className={styles.scheduledVisitSummary}><strong>Scheduled</strong><span>{visitLabel}</span><small>{lead.quote_visit?.durationMinutes} min visit{lead.quote_visit?.confirmationTextSentAt ? ' - text sent' : ''}</small></div> : null}
              <form action={scheduleVisit} className={styles.actionForm}>
                <label htmlFor="quoteVisitDate">Visit date</label>
                <ScheduledDatePicker id="quoteVisitDate" name="quoteVisitDate" defaultValue={lead.quote_visit?.scheduledFor ?? ''} required scrollIntoViewOnOpen />
                <label htmlFor="quoteVisitTime">Visit time</label>
                <TimeSlotSelect id="quoteVisitTime" name="quoteVisitTime" defaultValue={lead.quote_visit?.scheduledTime ?? ''} scrollIntoViewOnOpen />
                <label htmlFor="quoteVisitDuration">Visit length</label>
                <select id="quoteVisitDuration" name="quoteVisitDuration" defaultValue={lead.quote_visit?.durationMinutes ?? 60}>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
                <label htmlFor="quoteVisitNotes">Visit notes</label>
                <textarea id="quoteVisitNotes" name="quoteVisitNotes" rows={3} defaultValue={lead.quote_visit?.notes ?? ''} placeholder="Gate code, parking, who will be home..." />
                {lead.phone ? <label className="sms-consent-check"><input name="quoteVisitSmsConsent" type="checkbox" defaultChecked /><span>Send confirmation text to the client. Reply STOP to opt out.</span></label> : <p className={styles.empty}>Add a mobile number to send confirmation texts.</p>}
                <SaveButton>{visitLabel ? 'Update visit' : 'Schedule quote visit'}</SaveButton>
              </form>
            </section>
          ) : null}

          <section className={`panel workspace-section-card ${styles.calendarCard}`}>
            <div className="section-heading workspace-section-heading"><p className="eyebrow">Calendar</p><h2>Availability snapshot</h2></div>
            <div className={styles.availabilityGrid}>
              {availability.map((day) => {
                const busy = day.jobs.length + day.visits.length > 0;
                return <div className={`${styles.availabilityDay}${busy ? ` ${styles.busyDay}` : ''}`} key={day.key}><strong>{day.label}</strong><span>{busy ? `${day.jobs.length} job${day.jobs.length === 1 ? '' : 's'} / ${day.visits.length} quote visit${day.visits.length === 1 ? '' : 's'}` : 'Open'}</span><small>{day.hours ? `${day.hours} est hrs` : nextScheduledJobLabel(day.jobs)}</small></div>;
              })}
            </div>
          </section>

          {!lead.converted_job ? <section className="panel workspace-section-card"><div className="section-heading workspace-section-heading"><p className="eyebrow">Step 2</p><h2>Send quote / estimate</h2></div><p>Send the initial quote from this lead. It stays in Leads as Quoted, then becomes an active job when the homeowner signs off.</p><form action={convertLead} className={styles.actionForm}><label htmlFor="quotedAmount">Quoted amount ($)</label><input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" placeholder="0.00" /><label htmlFor="estimatedHours">Estimated hours</label><input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" /><div className="workspace-section-divider"><div className="section-heading workspace-section-heading"><p className="eyebrow">Client scheduling</p><h2>Suggest 3 Job Start Times</h2></div><span className="recommended-note">Optional, recommended</span><p className="workspace-card-copy">Text three service options with the initial quote so the client can book quickly. Leave these blank to send only the quote.</p></div>{[1, 2, 3].map((optionNumber) => (<div className="schedule-option-grid" key={optionNumber}><div><label htmlFor={`quoteScheduleDate${optionNumber}`}>Option {optionNumber} date</label><ScheduledDatePicker id={`quoteScheduleDate${optionNumber}`} name={`quoteScheduleDate${optionNumber}`} /></div><div><label htmlFor={`quoteScheduleTime${optionNumber}`}>Option {optionNumber} time</label><TimeSlotSelect id={`quoteScheduleTime${optionNumber}`} name={`quoteScheduleTime${optionNumber}`} /></div></div>))}<label className="sms-consent-check"><input name="quoteScheduleSmsConsent" type="checkbox" /><span>The client agreed to receive transactional scheduling texts. Required only when sending quick booking options. Reply STOP to opt out.</span></label><SaveButton>Send quote</SaveButton></form></section> : null}

          {!lead.converted_job ? <section className={`panel workspace-section-card ${styles.quickLeadActions}`}><div className="section-heading workspace-section-heading"><p className="eyebrow">Lead actions</p><h2>Follow up</h2></div><div className={styles.statusQuickActions}>{textLink ? <a className="btn secondary" href={textLink}>Text client</a> : null}{lead.email ? <a className="btn secondary" href={`mailto:${lead.email}`}>Email client</a> : null}<form action={markContacted}><button className="btn secondary" type="submit">Mark contacted</button></form><form action={convertLead}><input type="hidden" name="quotedAmount" value="0" /><input type="hidden" name="estimatedHours" value={lead.estimated_hours ?? ''} /><button className="btn secondary" type="submit">Convert to job</button></form><form action={markLost}><button className="btn ghost" type="submit">Mark lost</button></form></div></section> : null}
        </aside>
      </div>
    </main>
  );
}