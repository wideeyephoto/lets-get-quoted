import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import LeadRadiusMap from '@/components/lead-radius-map';
import { createLeadPhotoLinks } from '@/lib/lead-photo-storage';
import { expireStaleLeads, formatElapsedTime, formatLeadSource, getLead, getLeadTriage, isLeadSnoozed, LEAD_FLAG_LABELS, LEAD_LAYOUT_COOKIE, listLeads, type Lead, type LeadQuoteVisit } from '@/lib/leads';
import { expandScheduledJobs, formatJobSchedule, formatJobTime, listJobs, type Job, type QuoteItem, type ScheduledJobOccurrence } from '@/lib/jobs';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';
import { LEAD_STATUS_LABEL } from '@/lib/lead-detail-labels';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import { clearLeadQuoteVisitAction, convertLeadAction, reopenLeadAction, scheduleLeadQuoteVisitAction, sendLeadQuoteVisitOptionsAction, setLeadLayoutAction, undoConvertLeadAction, updateLeadDetailsAction, updateLeadStatusAction } from '../actions';
import DepositField from './DepositField';
import LeadActionDeck from './LeadActionDeck';
import LeadQuoteFields from './LeadQuoteFields';
import QuotePreviewButton from './QuotePreviewButton';
import LeadAvailabilityScheduler from './LeadAvailabilityScheduler';
import QuoteStartDateCalendar from './QuoteStartDateCalendar';
import SaveButton, { ScrollTopOnSaveProvider } from '@/components/save-button';
import QuickFillButtons from '@/components/quick-fill-buttons';
import styles from '../leads.module.css';

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

function buildAvailability(jobs: Job[], leads: Lead[], scheduleDayHours: number, startDate: Date, length = 7, workingWeekdays?: number[]) {
  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const occurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours, workingWeekdays);
  const quoteVisits = leads.filter((lead) => lead.quote_visit?.scheduledFor);

  return Array.from({ length }, (_, index) => {
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

export default async function LeadDetailPage({ params, searchParams }: { params: { leadId: string }; searchParams: { edit?: string; details?: string; availabilityStart?: string; quoteStartStart?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  await expireStaleLeads(supabase, accountId);
  const [lead, jobs, leads, { data: account }, { data: site }] = await Promise.all([
    getLead(supabase, accountId, params.leadId),
    listJobs(supabase, accountId, undefined, { includeLeadQuotes: true }),
    listLeads(supabase, accountId),
    supabase.from('accounts').select('schedule_day_hours, business_name, stripe_connect_id, connect_onboarded, booking_weekdays').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  if (!lead) notFound();

  const quoteBusinessName = site?.company_name || account?.business_name || 'Your company';
  // Quotes collect payment through Stripe, so sending is gated on a finished
  // Stripe Connect onboarding (server enforces this too, in convertLeadAction).
  const stripeConnected = Boolean(account?.stripe_connect_id && account?.connect_onboarded);
  const quoteSeedItems: QuoteItem[] = [{ id: 'seed-base', label: lead.project_type || '', amount: 0, kind: 'base', selected: true, recommended: false }];

  // Paired path+url, never zipped by index: a photo belonging to another account
  // or one the storage API declines to sign shortens the URL list, which would
  // put every later photo under the wrong path.
  const photos = await createLeadPhotoLinks(accountId, lead.photo_paths || []);
  const defaultPhoto = photos[0];
  const updateLeadDetails = updateLeadDetailsAction.bind(null, lead.id);
  const convertLead = convertLeadAction.bind(null, lead.id);
  const undoConvertLead = undoConvertLeadAction.bind(null, lead.id);
  const rescheduleLater = clearLeadQuoteVisitAction.bind(null, lead.id);
  const scheduleVisit = scheduleLeadQuoteVisitAction.bind(null, lead.id);
  const sendQuoteVisitOptions = sendLeadQuoteVisitOptionsAction.bind(null, lead.id);
  const triage = getLeadTriage(lead);
  const markLeadContacted = reopenLeadAction.bind(null, lead.id);
  const markLeadWon = updateLeadStatusAction.bind(null, lead.id, 'won');
  const markLeadLost = updateLeadStatusAction.bind(null, lead.id, 'lost');
  const leadLayout = cookies().get(LEAD_LAYOUT_COOKIE)?.value === 'primary' ? 'primary' : 'guided';
  const convertedJobLabel = lead.status === 'won' ? 'Open job' : 'Open quote';
  const visitLabel = formatVisit(lead.quote_visit);
  // Mirror convertLeadAction's channel logic exactly (normalizable phone -> text,
  // else email, else no contact) so the preview never claims a text that a
  // malformed number won't actually receive.
  const quotePreviewPhone = normalizeUsPhone(lead.phone ?? '');
  const quotePreviewEmail = lead.email?.trim() || null;
  const hasScheduledEstimate = Boolean(lead.quote_visit);
  const workflowState = lead.converted_job ? 'converted' : hasScheduledEstimate ? 'estimateScheduled' : 'newLead';
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const today = new Date();
  const availabilityStart = parseDateKey(searchParams.availabilityStart) ?? today;
  const quoteStartStart = parseDateKey(searchParams.quoteStartStart) ?? today;
  const previousAvailabilityStart = dateKey(addDays(availabilityStart, -7));
  const nextAvailabilityStart = dateKey(addDays(availabilityStart, 7));
  const canViewPreviousAvailability = dateKey(availabilityStart) > dateKey(today);
  const previousQuoteStart = dateKey(addDays(quoteStartStart, -30));
  const nextQuoteStart = dateKey(addDays(quoteStartStart, 30));
  const canViewPreviousQuoteStart = dateKey(quoteStartStart) > dateKey(today);
  const workingWeekdays = normalizeBookingWeekdays((account as { booking_weekdays?: unknown } | null)?.booking_weekdays);
  const availability = buildAvailability(jobs, leads, scheduleDayHours, availabilityStart, 7, workingWeekdays);
  const quoteStartAvailability = buildAvailability(jobs, leads, scheduleDayHours, quoteStartStart, 30, workingWeekdays);
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
  const quoteStartAvailabilityCards = quoteStartAvailability.map((day) => ({
    key: day.key,
    label: day.label,
    summary: day.jobs.length + day.visits.length > 0
      ? `${day.jobs.length} job${day.jobs.length === 1 ? '' : 's'} / ${day.visits.length} quote visit${day.visits.length === 1 ? '' : 's'}`
      : 'Open',
    detail: day.hours ? `${day.hours} est hrs` : nextScheduledJobLabel(day.jobs),
    busy: day.jobs.length + day.visits.length > 0,
    isToday: day.key === dateKey(today),
    jobHints: day.jobs.slice(0, 2).map((job) => ({
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
    if (searchParams.quoteStartStart) query.set('quoteStartStart', searchParams.quoteStartStart);
    return `/dashboard/leads/${lead.id}?${query.toString()}#availability-snapshot`;
  };
  const quoteStartHref = (startKey: string) => {
    const query = new URLSearchParams();
    if (searchParams.edit) query.set('edit', searchParams.edit);
    if (searchParams.availabilityStart) query.set('availabilityStart', searchParams.availabilityStart);
    query.set('quoteStartStart', startKey);
    return `/dashboard/leads/${lead.id}?${query.toString()}#lead-estimate`;
  };
  const editLeadHref = `/dashboard/leads/${lead.id}?edit=client#lead-edit-modal`;
  const closeEditHref = `/dashboard/leads/${lead.id}#availability-snapshot`;
  const photoGalleryHref = `/dashboard/leads/${lead.id}?details=photos#lead-photos-modal`;
  const closePhotoGalleryHref = `/dashboard/leads/${lead.id}#availability-snapshot`;
  return (
    <ScrollTopOnSaveProvider>
    <main className={`wide-shell workspace-shell ${styles.leadCommandShell}`}>
      <section className={`workspace-hero panel ${styles.leadHero}`}>
        <div className={styles.leadHeroMain}>
          <p className="eyebrow">Lead details</p>
          <div className={styles.leadTitleRow}>
            <h1 className="workspace-title">{lead.name || 'Unnamed lead'}</h1>
            <Link href={editLeadHref} className="job-title-edit-link">
              (edit)
            </Link>
          </div>
          <div className={styles.detailBadges}>
            <span className={styles.source}>{formatLeadSource(lead.source)}</span>
            <span className={styles.receivedBadge}>Received {formatElapsedTime(lead.created_at)} ago</span>
            <span className={styles.statusPill}>{LEAD_STATUS_LABEL[lead.status] ?? lead.status}</span>
            {visitLabel ? <span className={styles.visitPill}>Quote visit {visitLabel}</span> : null}
            {lead.triage && <span className={styles.scoreChip} data-score={triage.score}>{triage.score === 'hot' ? '🔥 Hot lead' : triage.score === 'low' ? 'Low priority' : 'Warm'}</span>}
            {triage.contactPreference === 'text_only' && <span className={styles.textOnlyChip}>💬 Text only — asked not to be called</span>}
            {triage.flags.filter((flag) => flag !== 'phone_verified').map((flag) => <span className={styles.flagChip} key={flag}>{LEAD_FLAG_LABELS[flag] || flag}</span>)}
            {triage.flags.includes('phone_verified') && <span className={styles.verifiedChip}>✓ Phone verified</span>}
            {isLeadSnoozed(triage) && <span className={styles.flagChip}>Snoozed</span>}
            {triage.archived && <span className={styles.flagChip}>Archived</span>}
          </div>
          <LeadActionDeck
            initialLayout={leadLayout}
            leadId={lead.id}
            status={lead.status}
            workflowState={workflowState}
            convertedJobId={lead.converted_job}
            convertedJobLabel={convertedJobLabel}
            hasPhone={Boolean(normalizeUsPhone(lead.phone ?? ''))}
            snoozed={isLeadSnoozed(triage)}
            archived={triage.archived === true}
            declinedReason={triage.declinedReason ?? null}
            leadName={lead.name ?? ''}
            businessName={quoteBusinessName}
            markWon={markLeadWon}
            markLost={markLeadLost}
            markContacted={markLeadContacted}
            undoConvert={undoConvertLead}
            setLayoutAction={setLeadLayoutAction}
          />
          <div className={styles.heroContactSummary}>
            <div className={styles.heroContactItem}>
              <span>Contact</span>
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className={styles.heroPhoneLink} aria-label={`Call ${lead.phone}`}>
                  <span aria-hidden="true">📞</span> {formatPhoneDashes(lead.phone)}
                </a>
              ) : (
                <strong>No phone provided</strong>
              )}
              {lead.phone && triage.contactPreference === 'text_only' ? <small className={styles.contactWarn}>💬 They asked for texts only — send a text before calling.</small> : null}
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className={styles.heroContactEmail} aria-label={`Email ${lead.email}`}>
                  <span aria-hidden="true">📧</span> {lead.email}
                </a>
              ) : (
                <strong>No email provided</strong>
              )}
              {!lead.phone && lead.email ? <small className={styles.contactWarn}>Email-only — text tools won&apos;t reach this lead.</small> : null}
            </div>
            <div className={styles.heroContactItem}>
              <span>Project address</span>
              <strong>{lead.address || 'Not provided'}</strong>
              <LeadRadiusMap address={lead.address} radiusMiles={10} size="mini" />
            </div>
          </div>
          <div className={styles.heroRequestSummary}>
            <div className={styles.heroPhotoStack}>
              <Link className={styles.heroDefaultPhoto} href={photoGalleryHref} aria-label="Open estimate photo gallery">
                {defaultPhoto ? (
                  <img src={defaultPhoto.url} alt="Project photo" />
                ) : (
                  <>
                    <strong>+</strong>
                    <span>Add estimate photos</span>
                  </>
                )}
              </Link>
              {defaultPhoto ? (
                <div className={styles.heroPhotoMinis}>
                  {photos.slice(1, 3).map((photo) => (
                    <Link key={photo.path} href={photoGalleryHref} className={styles.heroMiniPhoto} aria-label="Open estimate photo gallery">
                      <img src={photo.url} alt="Project photo" />
                    </Link>
                  ))}
                  <Link href={photoGalleryHref} className={styles.heroAddMiniPhoto} aria-label="Add estimate photos">
                    + Add Image
                  </Link>
                </div>
              ) : null}
            </div>
            <div>
              <span>Project details</span>
              <strong>{lead.project_type || 'Project request'}</strong>
              <p>{lead.message || 'No project details provided yet.'}</p>
            </div>
            <div className={styles.heroRequestActions}>
              <Link className="btn ghost" href={editLeadHref}>Edit details</Link>
            </div>
          </div>
        </div>
      </section>

      {searchParams.details === 'photos' ? (
        <div id="lead-photos-modal" className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="leadPhotosTitle">
          <section className={styles.editModalCard}>
            <div className={styles.editModalHeader}>
              <div>
                <p className="eyebrow">Estimate photos</p>
                <h2 id="leadPhotosTitle">Photo gallery</h2>
              </div>
              <Link href={closePhotoGalleryHref} className={styles.modalCloseButton} aria-label="Close photo gallery">x</Link>
            </div>
            <PhotoGallery
              entityId={lead.id}
              entityField="leadId"
              uploadUrl="/api/lead-photos"
              initialPhotos={photos}
              emptyLabel="No estimate photos yet. Add photos while you are at the visit."
              deleteConfirmMessage="Remove this photo from the lead? This cannot be undone."
              uploadLabel="+ Add estimate photos"
              helperText="Use this gallery during the estimate visit. Drag a photo into the first position to make it the default image shown in the lead header."
              coverMode
              reorderEnabled
            />
          </section>
        </div>
      ) : null}

      {searchParams.edit === 'client' ? (
        <div id="lead-edit-modal" className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="leadEditTitle">
          <section className={styles.editModalCard}>
            <div className={styles.editModalHeader}>
              <div>
                <p className="eyebrow">Edit lead</p>
                <h2 id="leadEditTitle">Client &amp; request details <a href="#lead-activity" className={styles.editActivityLink}>(lead activity)</a></h2>
              </div>
              <Link href={closeEditHref} className={styles.modalCloseButton} aria-label="Close edit details">x</Link>
            </div>
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
                <input id="leadProjectType" name="projectType" defaultValue={lead.project_type ?? ''} placeholder="Roof replacement" />
              </div>
              <div className="field">
                <label htmlFor="leadEstimatedHours">Estimated hours</label>
                <input id="leadEstimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" />
              </div>
              <div className="field full">
                <label htmlFor="leadMessage">Project details</label>
                <textarea id="leadMessage" name="message" rows={6} defaultValue={lead.message ?? ''} />
              </div>
              <div className={`field full ${styles.editModalActions}`}>
                <Link href={closeEditHref} className="btn secondary">Cancel</Link>
                <SaveButton>Save lead details</SaveButton>
              </div>
            </form>
            <div className={styles.editPhotosSection}>
              <div className="section-heading">
                <p className="eyebrow">Photos</p>
                <h3 className={styles.editPhotosTitle}>Project photos <span className={styles.editPhotosHint}>saved automatically</span></h3>
              </div>
              <PhotoGallery
                entityId={lead.id}
                entityField="leadId"
                uploadUrl="/api/lead-photos"
                initialPhotos={photos}
                emptyLabel="No photos yet. Add photos of the project so you can quote it faster."
                deleteConfirmMessage="Remove this photo from the lead? This cannot be undone."
                uploadLabel="+ Add photos"
                helperText="Attach photos from the request or the visit. Drag a photo into the first position to make it the lead's cover image."
                coverMode
                reorderEnabled
              />
            </div>
            <div id="lead-activity" className={styles.editActivitySection}>
              <div className="section-heading">
                <p className="eyebrow">Activity</p>
                <h3 className={styles.editPhotosTitle}>Lead timeline</h3>
              </div>
              <div className={styles.timelineList}>
                <div><span /> <p><strong>Website request received</strong><small>{new Date(lead.created_at).toLocaleString()}</small></p></div>
                {(triage.contactLog ?? []).map((entry, index) => (
                  <div key={`${entry.at}-${index}`}><span /> <p><strong>{entry.label}</strong><small>{new Date(entry.at).toLocaleString()}{entry.note ? ` — ${entry.note}` : ''}</small></p></div>
                ))}
                {photos.length > 0 ? <div><span /> <p><strong>{photos.length} project photo{photos.length === 1 ? '' : 's'} attached</strong><small>Use these to qualify the visit or quote faster.</small></p></div> : null}
                {lead.quote_visit ? <div><span /> <p><strong>Quote visit scheduled</strong><small>{visitLabel}{lead.quote_visit.confirmationTextSentAt ? ' - confirmation text sent' : ''}</small></p></div> : null}
                {lead.converted_job ? <div><span /> <p><strong>Converted to job</strong><small>Opened as an active quote/job.</small></p></div> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className={styles.detailGrid}>
        <aside className={styles.actionPanel}>
          {!lead.converted_job && !hasScheduledEstimate ? (
            <LeadAvailabilityScheduler
              className={styles.primaryActionCard}
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
            <section id="lead-estimate" className={`panel workspace-section-card ${styles.sendQuoteSection} ${hasScheduledEstimate ? styles.primaryActionCard : ''}`}>
              <div className="section-heading workspace-section-heading"><p className="eyebrow">Step 2</p><h2>Send the quote</h2></div>
              <p>Enter the amount and text the client their quote. Job start options can stay tucked away until you need them.</p>
              <form action={convertLead} className={styles.actionForm}>
                <div className={styles.quoteItemsField}>
                  <label>Quote line items</label>
                  <LeadQuoteFields initialItems={quoteSeedItems} />
                  <small>List what’s included, then add optional upsells the client can accept — the total updates live.</small>
                </div>
                <label htmlFor="estimatedHours">Estimated hours</label>
                <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" />
                <QuickFillButtons label="Quick add:" targetId="estimatedHours" values={[{ label: '4 hrs', value: '4' }, { label: '8 hrs', value: '8' }, { label: '16 hrs', value: '16' }, { label: '24 hrs', value: '24' }, { label: '40 hrs', value: '40' }]} />
                <label className={`sms-consent-check ${styles.quoteHoursCheck}`}>
                  <input id="showHoursToClient" name="showHoursToClient" type="checkbox" />
                  <span>
                    <strong>Show estimated hours on the client&apos;s quote</strong>
                    <small>Off by default — hours stay on your job for planning and aren&apos;t shown to the client.</small>
                  </span>
                </label>
                <DepositField />
                <label className={`sms-consent-check ${styles.quoteTextCheck}`}>
                  <input id="sendClientTextCheckbox" name="sendClientText" type="checkbox" defaultChecked />
                  <span>
                    <strong>Text quote and sign-off link</strong>
                    <small>Send the client their quote dashboard link. Reply STOP to opt out.</small>
                  </span>
                </label>
                <div className={styles.quotePreview}>
                  <span>Your client will receive</span>
                  {quotePreviewPhone ? (
                    <p><strong>📱 A text</strong> to {formatPhoneDashes(quotePreviewPhone)} with a secure link to view &amp; approve their quote.</p>
                  ) : quotePreviewEmail ? (
                    <p><strong>📧 An email</strong> to {quotePreviewEmail} with a link to view &amp; approve their quote — no mobile on file.</p>
                  ) : (
                    <p><strong>⚠ No phone or email on file.</strong> You&apos;ll get a link to copy and send yourself.</p>
                  )}
                </div>
                <details className={styles.optionalScheduleDetails}>
                  <summary>Suggest 3 job start times</summary>
                  <p>Optional. Text three service options with the quote so the client can book quickly.</p>
                  <QuoteStartDateCalendar
                    availability={quoteStartAvailabilityCards}
                    windowLabel={`${quoteStartAvailabilityCards[0]?.label} - ${quoteStartAvailabilityCards[quoteStartAvailabilityCards.length - 1]?.label}`}
                    previousHref={quoteStartHref(previousQuoteStart)}
                    nextHref={quoteStartHref(nextQuoteStart)}
                    canViewPrevious={canViewPreviousQuoteStart}
                  />
                </details>
                <div className={styles.sendQuoteActions}>
                  <QuotePreviewButton
                    businessName={quoteBusinessName}
                    clientName={lead.name ?? ''}
                  />
                  {stripeConnected ? (
                    <SaveButton>Send quote</SaveButton>
                  ) : (
                    <Link className="btn primary" href="/dashboard/settings">🔒 Connect Stripe to send</Link>
                  )}
                </div>
                {!stripeConnected ? (
                  <p className={styles.stripeGateNote}>Quotes collect payment through Stripe — connect it first so clients can pay and deposits work.</p>
                ) : null}
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
    </ScrollTopOnSaveProvider>
  );
}