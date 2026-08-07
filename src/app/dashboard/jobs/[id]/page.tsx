import Link from 'next/link';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import ArrivalPanel from '@/components/arrival-panel';
import { arrivalSettingsFromAccount, describeArrivalOutcome, formatArrivalWindow, DEFAULT_ARRIVAL_TEMPLATE } from '@/lib/arrival';
import { getActiveTracking } from '@/lib/job-tracking';
import { sendArrivalOwnerAction, setArrivalStatusOwnerAction } from './arrival-actions';
import Milestones from './Milestones';
import { flattenMilestone } from './milestone-view';
import { listMilestones } from '@/lib/milestones-data';
import {
  addMilestoneTaskAction, attachMilestonePhotoAction, createMilestoneAction, deleteMilestoneAction,
  removeMilestonePhotoAction, requestMilestonePaymentAction, seedMilestonesAction, updateMilestoneAction,
} from './milestone-actions';
import PhotoGallery from '@/components/photo-gallery';
import AddressAutocomplete from '@/components/address-autocomplete';
import { deriveJobListBadge, buildPipelineChecklist } from '@/lib/job-badges';
import { getJob, listCosts, computeMargin, formatJobQuoteSummary, formatJobSchedule, formatMoney, formatPercent, parseQuoteItems } from '@/lib/jobs';
import { listServices } from '@/lib/services';
import { COST_SOURCE_LABEL, costConfidence, describeDuplicate, duplicateCostIds, marginVerdict } from '@/lib/cost-truth';
import { getMinMarginPct } from '@/lib/cost-truth-data';
import { listChangeOrders } from '@/lib/change-orders-data';
import { changeOrderTotals } from '@/lib/change-orders';
import ChangeOrderPanel from './ChangeOrderPanel';
import WarrantyPanel from './WarrantyPanel';
import SelectionBoard from './SelectionBoard';
import { listSelections, listSelectionTemplates, signSelectionPhotos } from '@/lib/selections-data';
import { boardStatus } from '@/lib/selections';
import { listWarranties, listClaims } from '@/lib/warranties-data';
import { listJobTasks, taskProgress } from '@/lib/job-tasks';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import { listPayments } from '@/lib/payments';
import { listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { createLinkedFeedItems, getActiveClientAccessCount, listJobFeed, sortJobFeed, type JobFeedEvent } from '@/lib/job-feed';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import { getLeadByConvertedJob } from '@/lib/leads';
import { formatPhoneDashes } from '@/lib/phone';
import {
  createClientJobLinkAction,
  createCostAction,
  readReceiptAction,
  createManualJobFeedAction,
  deleteCostAction,
  deleteJobAction,
  markJobCompleteAction,
  markJobStartedAction,
  requestJobReviewAction,
  resolveAccountReviewUrl,
  saveQuoteItemsAction,
  draftQuoteAction,
  reviewQuoteAction,
  sendClientScheduleOptionsAction,
  undoJobCompleteAction,
  undoJobStartedAction,
  updateJobAction,
  updateJobCrewAction,
  addJobTaskAction,
  setJobTaskDoneAction,
  deleteJobTaskAction,
  acceptSubscriptionAction,
} from '../actions';
import AcceptPlanCard from './AcceptPlanCard';
import { createDepositRequestAction, refundPaymentAction, markPaymentFailedAction, markPaymentPaidManuallyAction, retryPaymentAction, retryPaymentTextAction, cancelPaymentRequestAction } from '../payments-actions';
import { cancelInvoiceAction, createInvoiceAction } from '../invoices-actions';
import DeleteJobButton from './DeleteJobButton';
import PaymentActionButtons from './PaymentActionButtons';
import ConfirmActionButton from './ConfirmActionButton';
import JobExpenseFields from '@/components/job-expense-fields';
import SaveButton, { ScrollTopOnSaveProvider } from '@/components/save-button';
import QuickFillButtons from '@/components/quick-fill-buttons';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import JobDateRange from '@/components/job-date-range';
import TimeSlotSelect from '@/components/time-slot-select';
import ModalDialog, { CloseOnSuccess } from '@/components/modal-dialog';
import QuoteDeliveryBanner from './QuoteDeliveryBanner';
import CopyLinkButton from './CopyLinkButton';
import RequestReviewButton from './RequestReviewButton';
import QuoteBuilder from './QuoteBuilder';
// Shared with the pipeline's Focus pane so the two can't describe the same
// event differently — see src/lib/job-detail-labels.ts.
import {
  COST_TYPE_ICON,
  FEED_KIND_ICON,
  FEED_KIND_LABEL,
  FEED_VISIBILITY_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  formatFeedTime,
  getFeedDisplayBody,
  getFeedDisplayTitle,
  marginTier,
  reviewPillState,
} from '@/lib/job-detail-labels';
import CompleteJobButton from './CompleteJobButton';

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; clientToken?: string; edit?: string; open?: string; delivery?: string; arrival?: string; sms?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const job = await getJob(supabase, accountId, params.id);

  if (!job) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Job not found.</p>
          <Link href="/dashboard/jobs" className="btn secondary">
            Back to jobs
          </Link>
        </div>
      </main>
    );
  }

  const costs = await listCosts(supabase, accountId, job.id);
  const margin = computeMargin(job, costs);
  const changeOrders = await listChangeOrders(supabase, accountId, job.id);
  const [selections, selectionTemplates] = await Promise.all([
    listSelections(supabase, accountId, job.id),
    listSelectionTemplates(supabase, accountId),
  ]);
  // The homeowner saw pictures and the contractor saw a text list. Both sides
  // of a feature about agreeing on what was picked should see the same thing.
  const selectionPhotos = await signSelectionPhotos(accountId, selections);
  const selectionStatus = boardStatus(selections);
  const [warranties, warrantyClaims, { data: warrantyDefaults }] = await Promise.all([
    listWarranties(supabase, accountId, job.id),
    listClaims(supabase, accountId, job.id),
    supabase.from('accounts').select('default_warranty_months').eq('id', accountId).maybeSingle(),
  ]);
  const defaultWarrantyMonths = Number(warrantyDefaults?.default_warranty_months) || 0;
  // How defensible this job's cost figure is, and whether it's worth saying
  // anything about the margin. Both stay quiet on a job with nothing recorded.
  const confidence = costConfidence(
    costs.map((cost) => ({ amount: Number(cost.amount) || 0, burdenAmount: Number(cost.burden_amount) || 0, source: cost.cost_source })),
  );
  const marginWarning = marginVerdict({
    revenue: margin.revenue,
    totalCost: margin.totalCost,
    minMarginPct: await getMinMarginPct(supabase, accountId),
    evidencedPct: confidence.evidencedPct,
  });
  // Computed over the whole list, not just at entry: the duplicate worth
  // catching is usually the one saved last week.
  const duplicates = duplicateCostIds(
    costs.map((cost) => ({
      id: cost.id,
      description: cost.description,
      amount: Number(cost.amount) || 0,
      supplier: cost.supplier,
      createdAt: cost.created_at,
    })),
  );
  const payments = await listPayments(supabase, accountId, job.id);
  const invoices = await listInvoices(supabase, accountId, job.id);
  const feed = await listJobFeed(supabase, accountId, job.id);
  const activeClientLinkCount = await getActiveClientAccessCount(supabase, accountId, job.id);
  const crew = await listCrew(supabase, accountId, { activeOnly: true });

  // Arrival. The live trip and the account's arrival rules — read with the
  // admin client because job_tracking is owner-scoped by RLS and this page is
  // already inside requireOwnerContext.
  const arrivalAdmin = createAdminClient();
  const [{ data: arrivalAccount }, { data: arrivalSite }, activeArrival] = await Promise.all([
    arrivalAdmin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    arrivalAdmin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    getActiveTracking(arrivalAdmin, accountId, job.id),
  ]);
  const arrivalSettings = arrivalSettingsFromAccount(arrivalAccount as Record<string, unknown> | null);
  const jobBusinessName =
    (arrivalSite?.company_name as string | undefined) || (arrivalAccount?.business_name as string | undefined) || 'Your contractor';
  const arrivalTrip = activeArrival ? {
    status: activeArrival.status,
    windowLabel: activeArrival.arrival_start
      ? formatArrivalWindow(
          { start: new Date(activeArrival.arrival_start), end: new Date(activeArrival.arrival_end ?? activeArrival.arrival_start) },
          arrivalSettings.timeZone,
        )
      : null,
    sentAgoMinutes: activeArrival.last_sent_at
      ? Math.max(0, Math.round((Date.now() - new Date(activeArrival.last_sent_at).getTime()) / 60000))
      : null,
    smsStatus: activeArrival.sms_status,
    shareLocation: Boolean(activeArrival.share_location),
    sentBy: activeArrival.sent_by,
    homeownerNote: activeArrival.homeowner_note,
  } : null;
  const arrivalFlash = describeArrivalOutcome(searchParams.arrival, searchParams.sms);

  // Proof-to-Pay stages, flattened for the client component.
  const milestoneViews = (await listMilestones(supabase, accountId, job.id)).map(flattenMilestone);
  const assignedCrewIds = await listCrewIdsForJob(supabase, accountId, job.id);
  const jobInvoice = selectPrimaryInvoice(invoices);
  const invoicePaidTotal = jobInvoice
    ? payments.filter((payment) => payment.invoice_id === jobInvoice.id && payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0)
    : 0;
  const invoiceDisplayTotal = jobInvoice ? Math.max(Number(jobInvoice.total), Number(job.quoted_amount)) : Number(job.quoted_amount);
  const invoiceBalance = jobInvoice ? Math.max(0, invoiceDisplayTotal - invoicePaidTotal) : null;
  const outstandingBalance = Math.max(0, invoiceDisplayTotal - invoicePaidTotal);
  const jobPhotos = await createJobPhotoLinks(accountId, job.photo_paths || []);
  const { data: accountRow } = await supabase
    .from('accounts')
    .select('connect_onboarded, auto_review_request')
    .eq('id', accountId)
    .maybeSingle();
  const stripeOnboarded = accountRow?.connect_onboarded ?? false;
  const autoReviewRequest = Boolean(accountRow?.auto_review_request);
  const originatingLead = await getLeadByConvertedJob(supabase, accountId, job.id);

  const boundUpdateJob = updateJobAction.bind(null, job.id);
  const boundUpdateJobCrew = updateJobCrewAction.bind(null, job.id, true);
  const boundDeleteJob = deleteJobAction.bind(null, job.id);
  const boundCreateCost = createCostAction.bind(null, job.id);
  const boundCreateDepositRequest = createDepositRequestAction.bind(null, job.id);
  const boundMarkJobComplete = markJobCompleteAction.bind(null, job.id);
  const boundMarkJobStarted = markJobStartedAction.bind(null, job.id);
  const boundRequestReview = requestJobReviewAction.bind(null, job.id);
  const boundSaveQuoteItems = saveQuoteItemsAction.bind(null, job.id);
  const quoteItems = parseQuoteItems(job.quote_items);
  const pendingPlans = quoteItems.filter((item) => item.kind === 'subscription' && !item.signedUp);
  const todayKey = new Date().toISOString().slice(0, 10);
  // appointment_confirmed_at is selected via getJob's `*` but isn't on the Job
  // type yet — read it off the row without widening the shared type.
  const appointmentConfirmedAt = (job as { appointment_confirmed_at?: string | null }).appointment_confirmed_at ?? null;
  const priceBook = (await listServices(supabase, accountId, { activeOnly: true }))
    .map((service) => ({ id: service.id, name: service.name, unitPrice: Number(service.unit_price) || 0, unit: service.unit }));
  const jobTasks = await listJobTasks(supabase, accountId, job.id);
  const taskStats = taskProgress(jobTasks);
  const reviewUrl = await resolveAccountReviewUrl(supabase, accountId);
  const lastReviewRequest = feed.find((event) => event.kind === 'review_requested');
  const boundSendScheduleOptions = sendClientScheduleOptionsAction.bind(null, job.id);
  const boundCreateClientJobLink = createClientJobLinkAction.bind(null, job.id);
  const boundPostFeedUpdate = createManualJobFeedAction.bind(null, job.id);
  const boundCreateInvoice = createInvoiceAction.bind(null, job.id);
  const boundRetryPaymentText = retryPaymentTextAction.bind(null, job.id);
  const linkedFeedItems = createLinkedFeedItems(feed, payments, invoices, accountId, job.id);
  const hasActiveClientView = activeClientLinkCount > 0 || Boolean(searchParams.clientToken);
  const clientViewHref = searchParams.clientToken ? `/client/jobs/${searchParams.clientToken}` : null;
  const quoteLinkOrigin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  const clientLink = searchParams.clientToken ? `${quoteLinkOrigin}/client/jobs/${searchParams.clientToken}` : null;
  const pipelineChecklist = buildPipelineChecklist(job, payments, invoices, activeClientLinkCount, originatingLead?.id ?? null);
  const heroStatus = deriveJobListBadge(job, payments, invoices, activeClientLinkCount);
  const nextPipelineIndex = pipelineChecklist.findIndex((item) => !item.complete);
  const currentPipelineIndex = nextPipelineIndex === -1 ? pipelineChecklist.length - 1 : nextPipelineIndex;
  const displayedFeed: JobFeedEvent[] = sortJobFeed([
    ...feed,
    ...linkedFeedItems,
    ...(feed.some((event) => event.kind === 'job_created')
      ? []
      : [
        {
          id: `job-created-${job.id}`,
          account_id: accountId,
          job_id: job.id,
          kind: 'job_created',
          title: `${job.ref} created`,
          body: formatJobQuoteSummary(job),
          image_url: null,
          author: null,
          meta: null,
          visibility: 'client',
          amount: null,
          source_table: 'jobs',
          source_id: job.id,
          action_url: null,
          published_at: job.created_at,
          created_at: job.created_at,
        } satisfies JobFeedEvent,
      ]),
  ]).filter((event) => event.visibility !== 'internal');

  return (
    <ScrollTopOnSaveProvider>
    <main className="wide-shell workspace-shell">
      {searchParams.delivery ? (
        <QuoteDeliveryBanner delivery={searchParams.delivery} clientLink={clientLink} clientName={job.client_name} clientEmail={job.client_email} />
      ) : null}
      <section className="workspace-hero panel job-command-hero">
        <div className="workspace-hero-copy">
          <div className="job-title-row">
            <h1 className="workspace-title">{job.client_name}</h1>
            <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`} className="job-title-edit-link">
              (edit)
            </Link>
            {job.client_id ? (
              <Link href={`/dashboard/clients/${job.client_id}`} className="job-title-edit-link">Client profile ↗</Link>
            ) : null}
          </div>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${heroStatus.tone}`} title={heroStatus.title}>{heroStatus.label}</span>
            <span className="workspace-inline-note">{job.address || 'No address on file yet'}</span>
          </div>
          {job.client_phone || job.client_email ? (
            <div className="job-hero-contact">
              {job.client_phone ? (
                <a href={`tel:${job.client_phone}`} className="hero-phone-link" aria-label={`Call ${job.client_phone}`}>
                  <span aria-hidden="true">📞</span> {formatPhoneDashes(job.client_phone)}
                </a>
              ) : null}
              {job.client_email ? (
                <a href={`mailto:${job.client_email}`} className="hero-email-link" aria-label={`Email ${job.client_email}`}>
                  <span aria-hidden="true">📧</span> {job.client_email}
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="job-command-facts" aria-label="Job facts">
            <span>
              <strong>
                <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>{formatMoney(job.quoted_amount)}</Link>
              </strong>{' '}
              quoted
            </span>
            <span>
              <strong>
                <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>
                  {job.estimated_hours ? `${job.estimated_hours} hrs` : 'Not set'}
                </Link>
              </strong>{' '}
              estimated hours
            </span>
            {job.scheduled_for ? (
              <span>
                <strong>
                  <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>
                    {formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)}
                  </Link>
                </strong>{' '}
                Date(s) of Service
                {appointmentConfirmedAt ? <span className="appt-confirmed-badge" title="The client confirmed this appointment by text">✓ Confirmed by client</span> : null}
              </span>
            ) : null}
          </div>
          <div className="actions workspace-actions">
            <Link href={`/dashboard/jobs/${job.id}?open=payment#request-payment`} className="btn primary">Request payment</Link>
            <ModalDialog triggerClassName="btn secondary" triggerLabel="Add expense" title="Add expense" defaultOpen={searchParams.open === 'costs'}>
              <form action={boundCreateCost} className="cost-form">
                <JobExpenseFields crew={crew} onReadReceipt={readReceiptAction} />
                <div style={{ marginTop: '0.8rem' }}>
                  <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                </div>
                <CloseOnSuccess />
              </form>
            </ModalDialog>
            {/* Start and complete are a pair, so they sit together. "Job
                started" disappears once it has been pressed rather than turning
                into a disabled button — the feed and the pipeline step carry the
                fact from then on, and Undo lives with the feed entry it undoes. */}
            {!job.started_at && job.status !== 'complete' && job.status !== 'archived' ? (
              <form action={boundMarkJobStarted}>
                <SaveButton className="btn secondary" pendingLabel="Starting…" savedLabel="Started ✓">Job started</SaveButton>
              </form>
            ) : null}
            {job.status !== 'complete' && job.status !== 'archived' ? (
              /* The end of the job, and the only button on this page that
                 should feel like one — but it is an instruction, not a state,
                 so it says "Mark". It asks first because completing can fire
                 the automatic review request, and a text to a customer is the
                 one thing on this screen that cannot be undone. */
              <CompleteJobButton
                action={boundMarkJobComplete}
                warning={{
                  clientName: job.client_name,
                  autoReviewRequest,
                  reviewUrlConfigured: Boolean(reviewUrl),
                  alreadyRequested: Boolean(lastReviewRequest),
                  channel: job.client_phone ? 'text' : job.client_email ? 'email' : null,
                }}
                pill={reviewPillState({
                  clientName: job.client_name,
                  autoReviewRequest,
                  reviewUrlConfigured: Boolean(reviewUrl),
                  alreadyRequested: Boolean(lastReviewRequest),
                  channel: job.client_phone ? 'text' : job.client_email ? 'email' : null,
                })}
              />
            ) : null}
            {job.status === 'complete' ? (
              <RequestReviewButton
                action={boundRequestReview}
                reviewConfigured={Boolean(reviewUrl)}
                lastRequestedAt={lastReviewRequest?.created_at ?? null}
              />
            ) : null}
          </div>
        </div>

        <aside className="pipeline-checklist" aria-label="Client pipeline checklist">
          <ol>
            {pipelineChecklist.map((item, index) => {
              const state = item.complete ? 'complete' : index === currentPipelineIndex ? 'current' : 'upcoming';
              return (
                <li key={item.key}>
                  <Link className={`pipeline-step pipeline-step-${state}`} href={item.href}>
                    <span className="pipeline-step-marker">{item.complete ? '✓' : ''}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>

      </section>

      {/* Arrival. Only on a job with a date — "on my way" to something
          unscheduled is a message with no visit behind it. Sits high on the
          page because on the day itself it is the only thing on this screen
          anybody needs. */}
      {job.scheduled_for && job.status !== 'complete' && job.status !== 'archived' ? (
        <>
          {arrivalFlash ? (
            <p className={`payment-banner ${arrivalFlash.error ? 'warning' : 'success'}`}>{arrivalFlash.text}</p>
          ) : null}
          <ArrivalPanel
            surface="dashboard"
            job={{
              id: job.id,
              clientName: job.client_name,
              address: job.address,
              scheduleLabel: formatJobSchedule(job.scheduled_for, job.scheduled_time),
              jobType: job.scope ? job.scope.split('\n')[0].slice(0, 60) : null,
              hasPhone: Boolean(job.client_phone),
              // Sent from a desk, so there's no "here" to measure from — the
              // GPS suggestion is a field-app affordance only.
              lat: null,
              lng: null,
            }}
            trip={arrivalTrip}
            business={jobBusinessName}
            crewName={arrivalTrip?.sentBy || jobBusinessName}
            template={arrivalSettings.messageTemplate || DEFAULT_ARRIVAL_TEMPLATE}
            timeZone={arrivalSettings.timeZone}
            windowStyle={arrivalSettings.windowStyle}
            windowMinutes={arrivalSettings.windowMinutes}
            defaultMinutes={arrivalSettings.defaultMinutes}
            // Sending from a desk: the office's coordinates are not the tech's,
            // so there is nothing honest to put on a map from here.
            canShareLocation={false}
            shareDefaultsOn={false}
            canReschedule
            canSend
            sendAction={sendArrivalOwnerAction.bind(null, job.id)}
            statusAction={setArrivalStatusOwnerAction.bind(null, job.id)}
          />
        </>
      ) : null}

      {/* Proof-to-Pay. Directly under the quote, because stages are how the
          quote gets collected — and above the checklist, because the checklist
          is now partly evidence for these. */}
      <section id="milestones" className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <div>
            <p className="eyebrow">Getting paid</p>
            <h2>Stages &amp; proof</h2>
          </div>
        </div>
        <Milestones
          entries={milestoneViews}
          quotedAmount={Number(job.quoted_amount) || 0}
          clientPhone={job.client_phone}
          actions={{
            seed: seedMilestonesAction.bind(null, job.id),
            create: createMilestoneAction.bind(null, job.id),
            update: updateMilestoneAction.bind(null, job.id),
            remove: deleteMilestoneAction.bind(null, job.id),
            addTask: addMilestoneTaskAction.bind(null, job.id),
            attachPhoto: attachMilestonePhotoAction.bind(null, job.id),
            removePhoto: removeMilestonePhotoAction.bind(null, job.id),
            requestPayment: requestMilestonePaymentAction.bind(null, job.id),
          }}
        />
      </section>

      <section id="quote-breakdown" className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <div>
            <p className="eyebrow">Quote</p>
            <h2>Quote breakdown</h2>
          </div>
          <Link href={`/dashboard/jobs/${job.id}/quote`} className="btn secondary">Print estimate →</Link>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Itemize the work and offer optional add-ons the client can accept on their quote page. The
          quote total updates automatically. Leave this empty to keep the single quoted amount.
        </p>
        <QuoteBuilder
          action={boundSaveQuoteItems}
          draftAction={draftQuoteAction.bind(null, job.id)}
          reviewAction={reviewQuoteAction.bind(null, job.id)}
          initialItems={quoteItems}
          quotedAmount={Number(job.quoted_amount) || 0}
          services={priceBook}
        />
      </section>

      {/* Recurring plans on this quote that nobody has started yet. The client
          can accept these from their own quote page; this is the same decision
          for the far more common case where they said yes on the phone. */}
      {pendingPlans.length > 0 ? (
        <section id="recurring-plans" className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Recurring</p>
            <h2>{pendingPlans.length === 1 ? 'Plan on this quote' : 'Plans on this quote'}</h2>
          </div>
          <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
            Not started yet. Accept one here when the client agrees in person or over the phone — you pick the day
            it starts, and it repeats on the cadence already quoted.
          </p>
          <div className="accept-plan-list">
            {pendingPlans.map((item) => (
              <AcceptPlanCard key={item.id} item={item} today={todayKey} action={acceptSubscriptionAction.bind(null, job.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <section id="checklist" className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Checklist</p>
          <h2>Punch list{taskStats.total > 0 ? ` · ${taskStats.done}/${taskStats.total} done` : ''}</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Build the punch list for this job. Your crew can tick items off from the field app, and you&apos;ll see who did what.
        </p>
        {jobTasks.length > 0 ? (
          <>
            {taskStats.total > 0 ? (
              <div className="task-progress" aria-hidden="true"><div className="task-progress-fill" style={{ width: `${taskStats.pct}%` }} /></div>
            ) : null}
            <div className="task-list">
              {jobTasks.map((task) => (
                <div className={`task-row${task.done ? ' is-done' : ''}`} key={task.id}>
                  <form action={setJobTaskDoneAction.bind(null, job.id, task.id, !task.done)}>
                    <button type="submit" className="task-check" aria-label={task.done ? 'Mark not done' : 'Mark done'}>{task.done ? '✓' : ''}</button>
                  </form>
                  <div className="task-row-main">
                    <span className="task-title">{task.title}</span>
                    {task.done && task.done_by ? <span className="task-done-by">Done by {task.done_by}</span> : null}
                  </div>
                  <form action={deleteJobTaskAction.bind(null, job.id, task.id)}>
                    <button type="submit" className="task-delete" aria-label="Delete task">×</button>
                  </form>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">No checklist items yet. Add the first below.</p>
        )}
        <form action={addJobTaskAction.bind(null, job.id)} className="task-add-form">
          <input name="title" placeholder="Add a task (e.g. Haul away debris)" required maxLength={120} aria-label="New task" />
          <SaveButton className="btn secondary" pendingLabel="Adding…" savedLabel="Added ✓">Add</SaveButton>
        </form>
      </section>

      <section id="job-feed" className="panel workspace-section-card job-feed-command-panel">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
              <h2>Job Feed</h2>
            </div>
            <details className="workspace-details job-feed-composer" open={searchParams.open === 'update'}>
              <summary className="workspace-details-summary">
                <span className="btn secondary">+ Post an update</span>
                <span className="workspace-details-copy">Log progress on this job{job.client_phone ? ' and optionally text the client' : ''}.</span>
              </summary>
              <form action={boundPostFeedUpdate} className="form-grid job-feed-composer-form">
                <input type="hidden" name="visibility" value="client" />
                <div className="field full">
                  <label htmlFor="feedTitle">Update</label>
                  <input id="feedTitle" name="title" required placeholder="Crew arrived on site" maxLength={120} />
                </div>
                <div className="field full">
                  <label htmlFor="feedBody">Details (optional)</label>
                  <textarea id="feedBody" name="body" rows={3} placeholder="Started demo on the north wall — on track to finish Thursday." />
                </div>
                {job.client_phone ? (
                  <label className="sms-consent-check field full">
                    <input name="notifyClientSms" type="checkbox" />
                    <span>
                      <strong>Also text this update to {job.client_name}</strong>
                      <small>Sends to {formatPhoneDashes(job.client_phone)}. Reply STOP to opt out.</small>
                    </span>
                  </label>
                ) : null}
                <div className="field full">
                  <SaveButton pendingLabel="Posting…" savedLabel="Posted ✓">Post update</SaveButton>
                </div>
              </form>
            </details>
            {displayedFeed.length === 0 ? (
              <p className="empty-state">No job feed updates yet.</p>
            ) : (
              <div className="job-feed-list workspace-list-block">
                {displayedFeed.map((event) => {
                  const linkedPayment = event.source_table === 'payments' ? payments.find((payment) => payment.id === event.source_id) : undefined;
                  const linkedInvoice = event.source_table === 'invoices' ? invoices.find((invoice) => invoice.id === event.source_id) : undefined;
                  const canCancelPayment = event.kind === 'payment_requested' && linkedPayment?.status === 'requested';
                  const canCancelInvoice =
                    (event.kind === 'invoice_created' || event.kind === 'invoice_sent' || event.kind === 'invoice_signoff_link') &&
                    (linkedInvoice?.status === 'draft' || linkedInvoice?.status === 'sent');

                  return (
                    <article className={`job-feed-item feed-kind-${event.kind}`} key={event.id}>
                      <div className="job-feed-dot">{FEED_KIND_ICON[event.kind] ?? '•'}</div>
                      <div className="job-feed-content">
                        <div className="job-row-header">
                          <span className="cost-item-desc">{getFeedDisplayTitle(event)}</span>
                          <div className="feed-badge-row">
                            {event.kind === 'job_created' && originatingLead ? (
                              <Link className="feed-undo-btn" href={`/dashboard/leads/${originatingLead.id}`}>
                                Undo
                              </Link>
                            ) : null}
                            {event.kind === 'job_started' && job.started_at ? (
                              <form action={undoJobStartedAction.bind(null, job.id, event.id)}>
                                <SaveButton className="feed-undo-btn" pendingLabel="Undoing…" savedLabel="Undone ✓">Undo</SaveButton>
                              </form>
                            ) : null}
                            {event.kind === 'job_completed' && job.status === 'complete' ? (
                              <form action={undoJobCompleteAction.bind(null, job.id, event.id)}>
                                <SaveButton className="feed-undo-btn" pendingLabel="Undoing…" savedLabel="Undone ✓">Undo</SaveButton>
                              </form>
                            ) : null}
                            {canCancelPayment && linkedPayment ? (
                              <ConfirmActionButton
                                action={cancelPaymentRequestAction.bind(null, job.id, linkedPayment.id)}
                                confirmMessage="Cancel this payment request? The payment link will stop working."
                                pendingLabel="Cancelling…"
                                savedLabel="Cancelled ✓"
                              >
                                Cancel
                              </ConfirmActionButton>
                            ) : null}
                            {canCancelInvoice && linkedInvoice ? (
                              <ConfirmActionButton
                                action={cancelInvoiceAction.bind(null, job.id, linkedInvoice.id)}
                                confirmMessage={`Cancel invoice ${linkedInvoice.ref}? This voids it so it can no longer be paid or signed.`}
                                pendingLabel="Cancelling…"
                                savedLabel="Cancelled ✓"
                              >
                                Cancel
                              </ConfirmActionButton>
                            ) : null}
                            <span className="status-badge status-new_lead">{FEED_KIND_LABEL[event.kind] ?? 'Update'}</span>
                            <span className={`status-badge ${event.visibility === 'internal' ? 'status-archived' : 'status-complete'}`}>
                              {FEED_VISIBILITY_LABEL[event.visibility]}
                            </span>
                          </div>
                        </div>
                        {getFeedDisplayBody(event) ? <p className="workspace-card-copy">{getFeedDisplayBody(event)}</p> : null}
                        <p className="job-meta">
                          {formatFeedTime(event.created_at)}
                          {event.amount ? ` · ${formatMoney(Number(event.amount))}` : ''}
                          {event.action_url ? (
                            <>
                              {' · '}
                              <Link href={event.action_url} target="_blank">Open link</Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <div className="job-feed-share-strip">
              <div>
                <strong>{hasActiveClientView ? 'Client view shared' : 'Client view not shared'}</strong>
                <p>{hasActiveClientView ? 'The quote, payment links, invoices, and job updates live in one client feed.' : 'Create a client view link before sending job updates or payment links.'}</p>
                {hasActiveClientView ? (
                  <span>Shared client access is active</span>
                ) : (
                  <span>No active client view link</span>
                )}
              </div>
              <div className="job-feed-share-actions">
                {clientViewHref ? (
                  <a className="btn secondary" href={clientViewHref} target="_blank" rel="noreferrer">Client View</a>
                ) : hasActiveClientView ? (
                  <form action={boundCreateClientJobLink}>
                    <SaveButton className="btn secondary" pendingLabel="Creating…" savedLabel="Created ✓">Client View</SaveButton>
                  </form>
                ) : (
                  <form action={boundCreateClientJobLink}>
                    <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Create client view link</SaveButton>
                  </form>
                )}
              </div>
            </div>

      </section>

      <details id="request-payment" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'payment'}>
          <summary className="workspace-details-summary job-action-summary">
            <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Invoice &amp; payment</p>
            <h2>Send an invoice or payment link to {job.client_name}</h2>
            </div>
            <span className="workspace-details-copy">Payment links are tied to this job&apos;s invoice.</span>
          </summary>
            {!stripeOnboarded ? (
              <div className="payment-banner warning">
                <p>
                  <strong>Stripe isn&apos;t connected yet.</strong> Homeowners won&apos;t be able to pay
                  until you finish onboarding.
                </p>
                <p>
                  <Link href="/dashboard/settings">Connect Stripe in Account settings →</Link>
                </p>
              </div>
            ) : null}
            <div className="toolbar" style={{ marginBottom: '1rem' }}>
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Invoice
                </p>
                <h2>Job invoice</h2>
              </div>
              {jobInvoice ? (
                <Link href={`/dashboard/jobs/${job.id}/invoices/${jobInvoice.id}`} className="btn secondary">Open invoice</Link>
              ) : (
                <form action={boundCreateInvoice}>
                  <SaveButton className="btn secondary" pendingLabel="Creating…" savedLabel="Created ✓">Build itemized invoice</SaveButton>
                </form>
              )}
            </div>

            {invoices.length === 0 ? (
              <p className="empty-state">No invoice yet. Sending a payment link will create the job invoice automatically.</p>
            ) : (
              <div className="cost-list workspace-list-block">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="cost-item">
                    <Link href={`/dashboard/jobs/${job.id}/invoices/${invoice.id}`} className="cost-item-main">
                      <span className="cost-item-desc">{invoice.ref}</span>
                      <span className="cost-item-sub">
                        {INVOICE_STATUS_LABEL[invoice.status]} · {new Date(invoice.created_at).toLocaleDateString()}
                      </span>
                    </Link>
                    <div className="cost-item-actions">
                      <span className="cost-item-amount">{formatMoney(invoice.total)}</span>
                      {invoice.status === 'draft' || invoice.status === 'sent' ? (
                        <ConfirmActionButton
                          action={cancelInvoiceAction.bind(null, job.id, invoice.id)}
                          confirmMessage={`Cancel invoice ${invoice.ref}? This voids it so it can no longer be paid or signed.`}
                          className="btn secondary compact"
                          pendingLabel="Cancelling…"
                          savedLabel="Cancelled ✓"
                        >
                          Cancel
                        </ConfirmActionButton>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form action={boundCreateDepositRequest} className="cost-form workspace-form-block">
              <div className="invoice-context-pill">
                <span>Job invoice</span>
                <strong>{jobInvoice ? `${jobInvoice.ref} · Balance ${formatMoney(invoiceBalance ?? 0)}` : 'Draft invoice will be created automatically'}</strong>
              </div>
              <div className="cost-form-row">
                <div className="field">
                  <label htmlFor="pay-kind">Payment type</label>
                  <select id="pay-kind" name="kind" defaultValue="deposit">
                    <option value="deposit">Deposit request</option>
                    <option value="stage">Progress payment</option>
                    <option value="final">Final balance</option>
                    <option value="plan_installment">Custom payment</option>
                  </select>
                  <QuickFillButtons
                    label="Quick add:"
                    targetId="pay-kind"
                    values={[
                      { label: 'Deposit', value: 'deposit' },
                      { label: 'Progress', value: 'stage' },
                      { label: 'Final balance', value: 'final' },
                      { label: 'Custom', value: 'plan_installment' },
                    ]}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pay-amount">Amount ($)</label>
                  <input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="2500" defaultValue={outstandingBalance > 0 ? outstandingBalance : undefined} />
                </div>
                <div className="field">
                  <label htmlFor="pay-label">Notes (optional)</label>
                  <input id="pay-label" name="label" placeholder="Optional payment note" />
                </div>
              </div>
              <div className="payment-sms-options">
                <label className="field" htmlFor="homeowner-phone">
                  <span>Homeowner mobile</span>
                  <input id="homeowner-phone" name="homeownerPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
                </label>
                <label className="sms-consent-check">
                  <input name="sendSms" type="checkbox" />
                  <span>Text the secure payment link and automatic payment updates. The homeowner agreed to transactional texts; message and data rates may apply. Reply STOP to opt out.</span>
                </label>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Send invoice/payment link</SaveButton>
              </div>
            </form>

            {payments.length === 0 ? (
              <p className="empty-state">No payment requests yet.</p>
            ) : (
              <div className="cost-list workspace-list-block">
                {payments.map((payment) => (
                  <div key={payment.id} className="cost-item">
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{payment.label || payment.kind}</span>
                      <span className="cost-item-sub">
                        {PAYMENT_STATUS_LABEL[payment.status]}
                        {payment.status === 'paid' && payment.platform_fee != null
                          ? ` · platform fee ${formatMoney(payment.platform_fee)} (${((payment.fee_rate ?? 0) * 100).toFixed(2)}%)`
                          : null}
                        {payment.sms_events?.find((event) => event.event_type === 'payment_requested') ? ` · SMS ${payment.sms_events.find((event) => event.event_type === 'payment_requested')?.status}` : null}
                        {payment.status === 'requested' || payment.status === 'processing' ? (
                          <>
                            {' · '}
                            <a href={`/pay/${payment.id}`} target="_blank" rel="noreferrer">
                              /pay/{payment.id}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="cost-item-amount">{formatMoney(payment.amount)}</span>
                      {Number(payment.refunded_amount) > 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                          {formatMoney(Number(payment.refunded_amount))} refunded
                        </span>
                      ) : null}
                      <PaymentActionButtons
                        jobId={job.id}
                        paymentId={payment.id}
                        status={payment.status}
                        onRefund={refundPaymentAction}
                        onMarkFailed={markPaymentFailedAction}
                        onRetry={retryPaymentAction}
                        onCancel={cancelPaymentRequestAction}
                        onMarkPaidManually={markPaymentPaidManuallyAction}
                        canRefund={Boolean(payment.stripe_payment_intent)}
                        amount={Number(payment.amount)}
                        refundedAmount={Number(payment.refunded_amount) || 0}
                      />
                      {payment.status === 'requested' || payment.status === 'processing' ? (
                        <CopyLinkButton url={`${quoteLinkOrigin}/pay/${payment.id}`} label="Copy pay link" />
                      ) : null}
                      {payment.sms_events?.some((event) => event.event_type === 'payment_requested' && event.status === 'failed') && (
                        <form action={boundRetryPaymentText.bind(null, payment.id)}>
                          <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent ✓">
                            Retry SMS
                          </SaveButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </details>

      <details id="job-details" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.edit === 'client'}>
          <summary className="workspace-details-summary job-action-summary">
            <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Overview</p>
            <h2>Job details</h2>
            </div>
            <span className="workspace-details-copy">Edit client info, schedule, crew, photos, and job settings.</span>
          </summary>
            <form action={boundUpdateJob} className="form-grid">
              <div className="field">
                <label htmlFor="clientName">Client name</label>
                <input id="clientName" name="clientName" defaultValue={job.client_name} required />
              </div>
              <div className="field">
                <label htmlFor="clientPhone">Client phone</label>
                <input id="clientPhone" name="clientPhone" defaultValue={job.client_phone ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="clientEmail">Client email</label>
                <input id="clientEmail" name="clientEmail" type="email" defaultValue={job.client_email ?? ''} placeholder="client@example.com" />
              </div>
              <div className="field full">
                <label htmlFor="address">Address</label>
                <AddressAutocomplete id="address" name="address" defaultValue={job.address ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="scope">Job Description</label>
                <textarea id="scope" name="scope" defaultValue={job.scope ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={job.status}>
                  <option value="new_lead">New request</option>
                  <option value="in_progress">In progress</option>
                  <option value="complete">Complete</option>
                  <option value="archived">Archived</option>
                </select>
                <QuickFillButtons
                  label="Quick add:"
                  targetId="status"
                  values={[
                    { label: 'New request', value: 'new_lead' },
                    { label: 'In progress', value: 'in_progress' },
                    { label: 'Complete', value: 'complete' },
                    { label: 'Archived', value: 'archived' },
                  ]}
                />
              </div>
              <JobDateRange
                startName="scheduledFor"
                endName="scheduledUntil"
                startDefault={job.scheduled_for ?? ''}
                endDefault={job.scheduled_until ?? ''}
              />
              <div className="field">
                <label htmlFor="scheduledTime">Time of day</label>
                <TimeSlotSelect id="scheduledTime" name="scheduledTime" defaultValue={job.scheduled_time?.slice(0, 5) ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="estimatedHours">Estimated hours</label>
                <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={job.estimated_hours ?? ''} />
                <QuickFillButtons
                  label="Quick add:"
                  targetId="estimatedHours"
                  values={[
                    { label: '4 hrs', value: '4' },
                    { label: '8 hrs', value: '8' },
                    { label: '16 hrs', value: '16' },
                    { label: '24 hrs', value: '24' },
                    { label: '40 hrs', value: '40' },
                  ]}
                />
                {/* Labor and margin now; it stopped deciding calendar days when
                    the job gained a real end date. */}
                <p className="job-meta">Used for labor cost and margin — not for how many days this blocks.</p>
              </div>
              <div className="field">
                <label htmlFor="quotedAmount">Quoted amount ($)</label>
                <input
                  id="quotedAmount"
                  name="quotedAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={job.quoted_amount}
                />
              </div>
              <div className="field full">
                <label className="sms-consent-check">
                  <input name="clientFeedAccess" type="checkbox" defaultChecked={hasActiveClientView} />
                  <span>Client has access to the Job Feed</span>
                </label>
              </div>
              <div className="field full">
                <p className="workspace-card-copy">Current schedule: {formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)}</p>
              </div>
              <div className="field full">
                <SaveButton>Save changes</SaveButton>
              </div>
            </form>

            <div className="workspace-section-divider">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Crew</p>
                <h2>Assigned crew members</h2>
              </div>
              {crew.length === 0 ? (
                <p className="empty-state">
                  No crew members yet. <Link href="/dashboard/crew">Add your crew →</Link>
                </p>
              ) : (
                <form action={boundUpdateJobCrew} className="form-grid">
                  <div className="field full">
                    {crew.map((member) => (
                      <label key={member.id} className="sms-consent-check" style={{ marginBottom: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="crewIds"
                          value={member.id}
                          defaultChecked={assignedCrewIds.includes(member.id)}
                        />
                        <span>
                          <strong>{member.name}</strong> — {member.role_label} · {member.phone}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="field full inline-action-form">
                    <SaveButton formAction={updateJobCrewAction.bind(null, job.id, true)} aria-label="Save crew assignment and text newly added crew">Save &amp; text</SaveButton>
                    <SaveButton className="btn secondary" formAction={updateJobCrewAction.bind(null, job.id, false)} aria-label="Save crew assignment without texting">Save without texting</SaveButton>
                  </div>
                </form>
              )}
            </div>

            <div className="workspace-section-divider">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Attachments</p>
                <h2>Job photos</h2>
              </div>
              <PhotoGallery
                entityId={job.id}
                entityField="jobId"
                uploadUrl="/api/job-photos"
                initialPhotos={jobPhotos}
                emptyLabel="No photos yet. Add progress shots or before/after photos."
                uploadLabel="+ Add job photos"
                helperText="The first photo is the default image. Drag photos to reorder them."
                coverMode
                reorderEnabled
              />
            </div>

            <div className="workspace-danger-zone">
              <p className="eyebrow danger-eyebrow">
                Danger zone
              </p>
              <p className="job-meta workspace-danger-copy">
                Deleting a job permanently removes it and all of its logged costs.
              </p>
              <DeleteJobButton action={boundDeleteJob} />
            </div>
        </details>

      <details id="job-scheduling" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'scheduling'}>
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Client scheduling</p>
            <h2>Send 3 Start Dates</h2>
          </div>
          <span className="workspace-details-copy">Text the client three dates that work for your crew.</span>
        </summary>
        <p className="workspace-card-copy">They can choose one or request different times with a note.</p>
        <form action={boundSendScheduleOptions} className="form-grid">
          <div className="field full">
            <label htmlFor="scheduleClientPhone">Client mobile</label>
            <input id="scheduleClientPhone" name="scheduleClientPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
          </div>
          {[1, 2, 3].map((optionNumber) => (
            <div className="schedule-option-grid field full" key={optionNumber}>
              <div>
                <label htmlFor={`scheduleDate${optionNumber}`}>Option {optionNumber} date</label>
                <ScheduledDatePicker id={`scheduleDate${optionNumber}`} name={`scheduleDate${optionNumber}`} />
              </div>
              <div>
                <label htmlFor={`scheduleTime${optionNumber}`}>Option {optionNumber} time</label>
                <TimeSlotSelect id={`scheduleTime${optionNumber}`} name={`scheduleTime${optionNumber}`} />
              </div>
            </div>
          ))}
          <div className="field full">
            <label className="sms-consent-check">
              <input name="scheduleSmsConsent" type="checkbox" required />
              <span>The client agreed to receive transactional scheduling texts. Message and data rates may apply. Reply STOP to opt out.</span>
            </label>
          </div>
          <div className="field full">
            <SaveButton pendingLabel="Sending..." savedLabel="Sent">Text 3 start dates</SaveButton>
          </div>
        </form>
      </details>

      <section id="job-costs" className="detail-grid workspace-grid-gap">
          <div>
            <details className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'costs'}>
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Expenses</p>
                  <h2>Job expenses</h2>
                </div>
                <span className="workspace-details-copy">Log materials, labor, subcontractors, receipts, and other costs.</span>
              </summary>

              <div className="cost-add-row" style={{ marginBottom: '0.9rem' }}>
                <ModalDialog triggerClassName="btn secondary" triggerLabel="+ Add expense" title="Add expense">
                  <form action={boundCreateCost} className="cost-form">
                    <JobExpenseFields crew={crew} onReadReceipt={readReceiptAction} />
                    <div style={{ marginTop: '0.8rem' }}>
                      <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                    </div>
                    <CloseOnSuccess />
                  </form>
                </ModalDialog>
              </div>

              {costs.length === 0 ? (
                <p className="empty-state">No expenses logged yet.</p>
              ) : (
                <div className="cost-list">
                  {costs.map((cost) => (
                    <div key={cost.id} className="cost-item">
                      <div className="cost-item-main">
                        <span className="cost-item-desc">
                          {COST_TYPE_ICON[cost.type]} {cost.description}
                        </span>
                        <span className="cost-item-sub">
                          {cost.type === 'labor'
                            ? `${cost.hours} hrs × ${formatMoney(Number(cost.rate))}/hr${cost.crew_name ? ` · ${cost.crew_name}` : ''}${cost.supplier ? ` · ${cost.supplier}` : ''}`
                            : cost.supplier || cost.category}
                          {cost.cost_source !== 'unspecified' ? ` · ${COST_SOURCE_LABEL[cost.cost_source]}` : ''}
                        </span>
                        {/* A warning, never a block. A contractor really can buy
                            the same $47 of PVC twice in a week, and refusing the
                            second one just teaches them to type $47.01. */}
                        {duplicates.has(cost.id) ? (
                          <span className="cost-item-duplicate">
                            Possible duplicate — {describeDuplicate(duplicates.get(cost.id)!)}
                          </span>
                        ) : null}
                      </div>
                      <div className="cost-item-actions">
                        <span className="cost-item-amount">−{formatMoney(Number(cost.amount))}</span>
                        <form action={deleteCostAction.bind(null, job.id, cost.id)}>
                          <button type="submit" className="icon-btn">
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </div>

          <div>
            {/* Open when the job is waiting on the customer. A stalled job is
                the thing an owner most needs to see, and it's the whole reason
                "waiting on homeowner" is a status rather than a feeling. */}
            <details className="panel workspace-section-card workspace-details job-action-details" open={selectionStatus.overdue > 0}>
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Selections</p>
                  <h2>Colours, materials &amp; fixtures</h2>
                </div>
                <span className={`workspace-details-copy${selectionStatus.overdue > 0 ? ' is-overdue' : ''}`}>
                  {selectionStatus.label || 'What the customer has to choose, and what it costs.'}
                </span>
              </summary>
              <SelectionBoard jobId={job.id} selections={selections} templates={selectionTemplates} photos={selectionPhotos} />
            </details>

            {/* Open by default once the work is done: that is the moment a
                warranty is worth starting, and the moment it gets forgotten. */}
            <details className="panel workspace-section-card workspace-details job-action-details" open={job.status === 'complete' && warranties.length === 0}>
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">After the work</p>
                  <h2>Warranty</h2>
                </div>
                <span className="workspace-details-copy">
                  {warranties.length === 0
                    ? 'What you stand behind, and for how long.'
                    : `${warranties.length} warranty${warranties.length === 1 ? '' : ' records'} on this job${
                        warrantyClaims.length > 0 ? ` · ${warrantyClaims.length} customer request${warrantyClaims.length === 1 ? '' : 's'}` : ''
                      }.`}
                </span>
              </summary>
              <WarrantyPanel jobId={job.id} warranties={warranties} claims={warrantyClaims} defaultMonths={defaultWarrantyMonths} />
            </details>

            {changeOrders.length > 0 ? (
              <details className="panel workspace-section-card workspace-details job-action-details" open={changeOrderTotals(changeOrders).unsent > 0}>
                <summary className="workspace-details-summary job-action-summary">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Extra work</p>
                    <h2>Change orders</h2>
                  </div>
                  <span className="workspace-details-copy">
                    {(() => {
                      const totals = changeOrderTotals(changeOrders);
                      // The unsent figure leads because it's the actionable one:
                      // work the crew documented that nobody has billed for.
                      if (totals.unsent > 0) return `${formatMoney(totals.unsent)} written up and not sent yet.`;
                      if (totals.awaiting > 0) return `${formatMoney(totals.awaiting)} waiting on the customer.`;
                      if (totals.approved > 0) return `${formatMoney(totals.approved)} approved and added to this job.`;
                      return 'Extra work found on site.';
                    })()}
                  </span>
                </summary>
                <ChangeOrderPanel jobId={job.id} orders={changeOrders} />
              </details>
            ) : null}

            <details className="panel workspace-section-card workspace-details job-action-details sticky-card">
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Profitability</p>
                  <h2>ROI</h2>
                </div>
                <span className="workspace-details-copy">Track profit against the quoted job amount as costs come in.</span>
              </summary>
              <div className="margin-card">
                <div className="margin-row">
                  <span>Revenue</span>
                  <span>{formatMoney(margin.revenue)}</span>
                </div>
                <div className="margin-row sub">
                  <span>Materials</span>
                  <span>−{formatMoney(margin.materialsCost)}</span>
                </div>
                <div className="margin-row sub">
                  <span>Labor</span>
                  <span>−{formatMoney(margin.laborCost)}</span>
                </div>
                {/* Burden is shown on its own line rather than hidden inside
                    "Labor". A contractor seeing $300 where they paid $240 needs
                    to know the difference is taxes and comp, not an error. */}
                {margin.laborBurden > 0 ? (
                  <div className="margin-row sub muted">
                    <span>&nbsp;&nbsp;of which taxes &amp; insurance</span>
                    <span>−{formatMoney(margin.laborBurden)}</span>
                  </div>
                ) : null}
                <div className="margin-row sub">
                  <span>Other</span>
                  <span>−{formatMoney(margin.otherCost)}</span>
                </div>
                <div className="margin-row bold">
                  <span>Profit</span>
                  <span>{formatMoney(margin.profit)}</span>
                </div>
                <div className={`margin-badge ${marginTier(margin.margin)}`}>
                  <div className="label">ROI</div>
                  <div className="value">{formatPercent(margin.margin)}</div>
                </div>
              </div>
              {marginWarning?.message ? (
                <p className={`margin-alert${marginWarning.losing ? ' is-loss' : ''}`}>{marginWarning.message}</p>
              ) : null}
              <p className="margin-note">
                Revenue is the job&apos;s quoted amount. ROI updates live as you log costs.
                {confidence.total > 0 ? (
                  <>
                    {' '}
                    {Math.round(confidence.evidencedPct * 100)}% of the cost here is backed by a receipt, an invoice or
                    the time clock.
                  </>
                ) : null}
              </p>
            </details>
          </div>
        </section>

    </main>
    </ScrollTopOnSaveProvider>
  );
}


