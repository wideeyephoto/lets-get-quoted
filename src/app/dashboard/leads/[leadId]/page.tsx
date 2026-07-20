import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import { expireStaleLeads, formatElapsedTime, formatLeadSource, getLead, listLeads, type Lead, type LeadQuoteVisit } from '@/lib/leads';
import { expandScheduledJobs, formatJobSchedule, formatJobTime, listJobs, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import { clearLeadQuoteVisitAction, convertLeadAction, scheduleLeadQuoteVisitAction, sendLeadQuoteVisitOptionsAction, updateLeadDetailsAction } from '../actions';
import SaveButton from '@/components/save-button';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

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

function nextWeekday(date: Date, weekday: number): Date {
  const next = new Date(date);
  const distance = (weekday + 7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + distance);
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

export default async function LeadDetailPage({ params, searchParams }: { params: { leadId: string }; searchParams: { edit?: string } }) {
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
  const availability = buildAvailability(jobs, leads, scheduleDayHours);
  const today = new Date();
  const quickQuoteVisitPresets = [
    { label: 'Today 9 AM', date: dateKey(today), time: '09:00' },
    { label: 'Tomorrow 9 AM', date: dateKey(addDays(today, 1)), time: '09:00' },
    { label: 'Next Mon 9 AM', date: dateKey(nextWeekday(today, 1)), time: '09:00' },
    { label: 'Next Fri 9 AM', date: dateKey(nextWeekday(today, 5)), time: '09:00' },
  ];

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
            {!lead.converted_job ? <Link className="btn primary" href="#lead-quote-scheduling">Schedule quote</Link> : null}
            {!lead.converted_job ? <Link className="btn secondary" href="#lead-estimate">Provide estimate</Link> : null}
            {!lead.converted_job ? (
              <form action={convertLead}>
                <input type="hidden" name="quotedAmount" value="0" />
                <input type="hidden" name="estimatedHours" value={lead.estimated_hours ?? ''} />
                <button className="btn secondary" type="submit">Convert to job</button>
              </form>
            ) : null}
            {lead.converted_job ? <Link className="btn primary" href={`/dashboard/jobs/${lead.converted_job}`}>{convertedJobLabel}</Link> : null}
          </div>
        </div>
        <div className={styles.leadStageCard}>
          <strong>Lead path</strong>
          <Link className={lead.quote_visit ? styles.stageComplete : undefined} href="#lead-quote-scheduling">Schedule quote</Link>
          <Link className={['quoted', 'won'].includes(lead.status) ? styles.stageComplete : undefined} href="#lead-estimate">Provide estimate</Link>
          {lead.converted_job ? <Link className={styles.stageComplete} href={`/dashboard/jobs/${lead.converted_job}`}>Convert to job</Link> : <Link href="#lead-estimate">Convert to job</Link>}
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
            <div className={styles.dataBlock}><span>Estimated hours</span><p>{lead.estimated_hours ? `${lead.estimated_hours} hrs` : 'Not estimated yet'}</p></div>
            <div className={styles.dataBlock}><span>Project details</span><p>{lead.message || 'Not provided'}</p></div>
            <details className={styles.inlineEditDetails} open={searchParams.edit === 'client'}>
              <summary className="btn secondary">Edit client/request details</summary>
              <form action={updateLeadDetails} className={`form-grid ${styles.leadEditForm}`}>
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
                <div className="field">
                  <label htmlFor="leadProjectType">Project type</label>
                  <input id="leadProjectType" name="projectType" defaultValue={lead.project_type ?? ''} />
                </div>
                <div className="field">
                  <label htmlFor="leadEstimatedHours">Estimated hours</label>
                  <input id="leadEstimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} />
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
            <section id="lead-quote-scheduling" className={`panel workspace-section-card ${styles.primaryActionCard}`}>
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Step 1</p><h2>Schedule quote</h2></div>
              <p>Set the quote visit now or text three openings so the client can choose.</p>
              {visitLabel ? <div className={styles.scheduledVisitSummary}><strong>Scheduled</strong><span>{visitLabel}</span><small>{lead.quote_visit?.durationMinutes} min visit{lead.quote_visit?.confirmationTextSentAt ? ' - text sent' : ''}</small></div> : null}
              <div className={`schedule-action-buttons ${styles.quoteVisitActions}`}>
                <details className="schedule-popover" open>
                  <summary className="btn secondary">{visitLabel ? 'Reschedule' : 'Add Quote Date'}</summary>
                  <div className="schedule-popover-panel schedule-start-panel">
                    <form action={scheduleVisit} className="schedule-inline-form schedule-start-form">
                      <div className="schedule-inline-field schedule-inline-date">
                        <ScheduledDatePicker id="quoteVisitDate" name="quoteVisitDate" defaultValue={lead.quote_visit?.scheduledFor ?? ''} required />
                      </div>
                      <div className="schedule-inline-field schedule-inline-time">
                        <TimeSlotSelect id="quoteVisitTime" name="quoteVisitTime" defaultValue={lead.quote_visit?.scheduledTime ?? ''} />
                      </div>
                      <input type="hidden" name="quoteVisitDuration" value={lead.quote_visit?.durationMinutes ?? 60} />
                      <input type="hidden" name="quoteVisitNotes" value={lead.quote_visit?.notes ?? ''} />
                      <button type="submit" className="btn primary schedule-save-button">Save Quote Date</button>
                    </form>
                    <div className="schedule-preset-grid" aria-label={`Quick quote visit presets for ${lead.name || 'this lead'}`}>
                      {quickQuoteVisitPresets.map((preset) => (
                        <form action={scheduleVisit} key={`${lead.id}-${preset.label}`}>
                          <input type="hidden" name="quoteVisitDate" value={preset.date} />
                          <input type="hidden" name="quoteVisitTime" value={preset.time} />
                          <input type="hidden" name="quoteVisitDuration" value="60" />
                          <input type="hidden" name="quoteVisitNotes" value="Booked from quick quote visit presets." />
                          <button type="submit" className="schedule-preset-button">{preset.label}</button>
                        </form>
                      ))}
                    </div>
                  </div>
                </details>
                <details className="schedule-popover" name={`lead-quote-visit-${lead.id}`}>
                  <summary className="btn secondary">Let the client choose</summary>
                  <div className="schedule-popover-panel">
                    <form action={sendQuoteVisitOptions} className="schedule-inline-form schedule-client-options-form">
                      <div className="schedule-client-options-intro">
                        <strong>Send 3 quote visit times to the client.</strong>
                        <span>They can reply with 1, 2, or 3, then you can book the selected visit.</span>
                      </div>
                      <div className="schedule-inline-field schedule-inline-date">
                        <label htmlFor={`quoteVisitClientPhone-${lead.id}`}>Client mobile</label>
                        <input id={`quoteVisitClientPhone-${lead.id}`} name="quoteVisitClientPhone" type="tel" defaultValue={lead.phone ?? ''} placeholder="(248) 555-0117" />
                      </div>
                      {[1, 2, 3].map((optionNumber) => (
                        <div className={`schedule-option-grid schedule-option-${optionNumber}`} key={`${lead.id}-quote-option-${optionNumber}`}>
                          <div>
                            <label htmlFor={`quoteVisitOptionDate${optionNumber}-${lead.id}`}>Option {optionNumber} date</label>
                            <ScheduledDatePicker id={`quoteVisitOptionDate${optionNumber}-${lead.id}`} name={`quoteVisitOptionDate${optionNumber}`} scrollIntoViewOnOpen={optionNumber === 3} />
                          </div>
                          <div>
                            <label htmlFor={`quoteVisitOptionTime${optionNumber}-${lead.id}`}>Option {optionNumber} time</label>
                            <TimeSlotSelect id={`quoteVisitOptionTime${optionNumber}-${lead.id}`} name={`quoteVisitOptionTime${optionNumber}`} scrollIntoViewOnOpen={optionNumber === 3} />
                          </div>
                        </div>
                      ))}
                      <label className="sms-consent-check">
                        <input name="quoteVisitOptionsSmsConsent" type="checkbox" required />
                        <span>The client agreed to receive transactional scheduling texts. Reply STOP to opt out.</span>
                      </label>
                      <button type="submit" className="btn primary schedule-save-button">Send Dates to Client</button>
                    </form>
                  </div>
                </details>
                {visitLabel ? (
                  <form action={rescheduleLater} className={styles.rescheduleLaterForm}>
                    <button type="submit" className="btn ghost">Reschedule later</button>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          <details className={`panel workspace-section-card workspace-details ${styles.calendarCard}`}>
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Calendar</p><h2>Availability snapshot</h2></div>
              <span className="workspace-details-copy">Check nearby openings and quick-book a 9:00 AM quote visit.</span>
            </summary>
            <p className={styles.calendarHint}>Click a day to immediately book a 9:00 AM in-person quote visit.</p>
            <div className={styles.availabilityGrid}>
              {availability.map((day) => {
                const busy = day.jobs.length + day.visits.length > 0;
                return (
                  <form action={scheduleVisit} className={styles.availabilityForm} key={day.key}>
                    <input type="hidden" name="quoteVisitDate" value={day.key} />
                    <input type="hidden" name="quoteVisitTime" value="09:00" />
                    <input type="hidden" name="quoteVisitDuration" value="60" />
                    <input type="hidden" name="quoteVisitNotes" value="Booked from the lead availability snapshot." />
                    <button className={`${styles.availabilityDay}${busy ? ` ${styles.busyDay}` : ''}`} type="submit">
                      <strong>{day.label}</strong>
                      <span>{busy ? `${day.jobs.length} job${day.jobs.length === 1 ? '' : 's'} / ${day.visits.length} quote visit${day.visits.length === 1 ? '' : 's'}` : 'Open'}</span>
                      <small>{day.hours ? `${day.hours} est hrs` : nextScheduledJobLabel(day.jobs)}</small>
                      <em>{busy ? 'Book anyway at 9:00 AM' : 'Book 9:00 AM'}</em>
                    </button>
                  </form>
                );
              })}
            </div>
          </details>

          {!lead.converted_job ? (
            <section id="lead-estimate" className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Step 2</p><h2>Send quote / estimate</h2></div>
              <p>Enter the amount and send the initial quote. Job start options can stay tucked away until you need them.</p>
              <form action={convertLead} className={styles.actionForm}>
                <label htmlFor="quotedAmount">Quoted amount ($)</label>
                <input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" placeholder="0.00" />
                <label htmlFor="estimatedHours">Estimated hours</label>
                <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" />
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
                <SaveButton>Send quote</SaveButton>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}