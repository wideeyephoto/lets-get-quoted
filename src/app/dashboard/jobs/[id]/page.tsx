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
import { deriveJobListBadge, buildPipelineChecklist, completionBlockers, completionPreflight } from '@/lib/job-badges';
import {
  jobMoney,
  jobStage,
  jobWaitNote,
  primaryJobAction,
  shouldSuggestStages,
  JOB_STAGE_LABEL,
} from '@/lib/job-lifecycle';
import { getJob, listCosts, computeMargin, formatJobQuoteSummary, formatJobSchedule, formatMoney, formatMoneyExact, formatPercent, parseQuoteItems } from '@/lib/jobs';
import { listServices } from '@/lib/services';
import { COST_SOURCE_LABEL, costConfidence, describeDuplicate, duplicateCostIds, marginVerdict } from '@/lib/cost-truth';
import { getMinMarginPct } from '@/lib/cost-truth-data';
import { listChangeOrders } from '@/lib/change-orders-data';
import { changeOrderTotals } from '@/lib/change-orders';
import ChangeOrderPanel from './ChangeOrderPanel';
import WarrantyPanel from './WarrantyPanel';
import SelectionBoard from './SelectionBoard';
import TaskAddForm from './TaskAddForm';
import { zonedNowParts } from '@/lib/quick-stop';
import { lastSelectionSendAt, listSelections, listSelectionTemplates, signSelectionPhotos } from '@/lib/selections-data';
import { boardStatus } from '@/lib/selections';
import { listWarranties, listClaims } from '@/lib/warranties-data';
import { listJobTasks, taskProgress } from '@/lib/job-tasks';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import { listPayments } from '@/lib/payments';
import { computeInvoiceTotals, getInvoiceWithItems, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { loadBusinessName } from '@/lib/business-name';
import PaymentPreview from './PaymentPreview';
import { createLinkedFeedItems, getActiveClientAccessCount, listJobFeed, sortJobFeed, type JobFeedEvent } from '@/lib/job-feed';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import {
  getActiveRequestForJob,
  listJobSubcontractors,
  listSubcontractorReviews,
  loadSubcontractors,
  todayIn,
} from '@/lib/subcontractor-dispatch-data';
import SubcontractorPanel from './SubcontractorPanel';
import SubcontractorReview from './SubcontractorReview';
import { getLeadByConvertedJob } from '@/lib/leads';
import { formatPhoneDashes } from '@/lib/phone';
import { isPhoneOptedOut } from '@/lib/sms';
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
  saveQuoteItemsAndNotifyAction,
  draftQuoteAction,
  reviewQuoteAction,
  scheduleJobAction,
  sendClientScheduleOptionsAction,
  undoJobCompleteAction,
  editJobFeedUpdateAction,
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
import JobActionMenu from './JobActionMenu';
import JobScheduleFields from './JobScheduleFields';
import StartJobButton from './StartJobButton';
import ClientChannelField from './ClientChannelField';
import {
  CLIENT_CHANNEL_LABEL,
  canTextClient,
  clientChannelChip,
  normalizeClientChannelPreference,
} from '@/lib/client-channel';

export const metadata = { title: 'Job' };

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; clientToken?: string; edit?: string; open?: string; delivery?: string; arrival?: string; sms?: string };
}) {
  const { supabase, accountId, accountTimeZone } = await requireOwnerContext();

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

  // ── TWO WAVES, NOT TWENTY-TWO ROUND TRIPS ─────────────────────────────────
  //
  // Everything from here down used to be awaited a statement at a time —
  // payments, then invoices, then the feed, then the client-link count, then
  // the crew — though none of them needs anything the one before it returns.
  // Rendering this screen cost about twenty-two serial round trips.
  //
  // The two waves below are both independent of each other and could be one
  // Promise.all. They are split to hold the fan-out to about a dozen concurrent
  // reads: this is the heaviest page in the app, and a twenty-wide burst on
  // every open changes the database's access pattern under load, not just this
  // page's latency. The second wave costs one extra round trip and keeps the
  // concurrency near where it has already been running.
  const arrivalAdmin = createAdminClient();
  const [
    costs,
    changeOrders,
    selections,
    selectionTemplates,
    lastSelectionSent,
    warranties,
    warrantyClaims,
    minMarginPct,
    payments,
    invoices,
    feed,
    activeClientLinkCount,
  ] = await Promise.all([
    listCosts(supabase, accountId, job.id),
    listChangeOrders(supabase, accountId, job.id),
    listSelections(supabase, accountId, job.id),
    listSelectionTemplates(supabase, accountId),
    // From the job feed, which is where BOTH senders record themselves — the
    // contractor's own button and the scheduled reminder. See lastSelectionSendAt.
    lastSelectionSendAt(supabase, accountId, job.id),
    listWarranties(supabase, accountId, job.id),
    listClaims(supabase, accountId, job.id),
    getMinMarginPct(supabase, accountId),
    listPayments(supabase, accountId, job.id),
    listInvoices(supabase, accountId, job.id),
    listJobFeed(supabase, accountId, job.id),
    getActiveClientAccessCount(supabase, accountId, job.id),
  ]);

  // Arrival. The live trip and the account's arrival rules — read with the
  // admin client because job_tracking is owner-scoped by RLS and this page is
  // already inside requireOwnerContext.
  const [
    crew,
    { data: arrivalAccount },
    { data: arrivalSite },
    activeArrival,
    milestones,
    assignedCrewIds,
    previewBusinessName,
    jobPhotos,
    originatingLead,
    priceBookServices,
    jobTasks,
    reviewUrl,
    clientOptedOut,
  ] = await Promise.all([
    listCrew(supabase, accountId, { activeOnly: true }),
    arrivalAdmin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    arrivalAdmin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    getActiveTracking(arrivalAdmin, accountId, job.id),
    listMilestones(supabase, accountId, job.id),
    listCrewIdsForJob(supabase, accountId, job.id),
    loadBusinessName(supabase, accountId),
    createJobPhotoLinks(accountId, job.photo_paths || []),
    getLeadByConvertedJob(supabase, accountId, job.id),
    listServices(supabase, accountId, { activeOnly: true }),
    listJobTasks(supabase, accountId, job.id),
    resolveAccountReviewUrl(supabase, accountId),
    // How this customer may be messaged about this job — their own STOP reply.
    // No phone, no question to ask, and no query.
    job.client_phone ? isPhoneOptedOut(accountId, job.client_phone) : Promise.resolve(false),
  ]);

  const margin = computeMargin(job, costs);
  const selectionStatus = boardStatus(selections);
  // Off the account row the arrival block already fetches in full. This was its
  // own single-column read, and so were the Stripe/review/day-hours columns and
  // the timezone further down — four queries against one row.
  const defaultWarrantyMonths = Number((arrivalAccount as { default_warranty_months?: unknown } | null)?.default_warranty_months) || 0;
  // How defensible this job's cost figure is, and whether it's worth saying
  // anything about the margin. Both stay quiet on a job with nothing recorded.
  const confidence = costConfidence(
    costs.map((cost) => ({ amount: Number(cost.amount) || 0, burdenAmount: Number(cost.burden_amount) || 0, source: cost.cost_source })),
  );
  const marginWarning = marginVerdict({
    revenue: margin.revenue,
    totalCost: margin.totalCost,
    minMarginPct,
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
  const milestoneViews = milestones.map(flattenMilestone);
  const jobInvoice = selectPrimaryInvoice(invoices);
  const invoicePaidTotal = jobInvoice
    ? payments.filter((payment) => payment.invoice_id === jobInvoice.id && payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0)
    : 0;
  const invoiceDisplayTotal = jobInvoice ? Math.max(Number(jobInvoice.total), Number(job.quoted_amount)) : Number(job.quoted_amount);
  const invoiceBalance = jobInvoice ? Math.max(0, invoiceDisplayTotal - invoicePaidTotal) : null;
  const outstandingBalance = Math.max(0, invoiceDisplayTotal - invoicePaidTotal);

  // ── THE THIRD WAVE: the only three reads that actually had to wait ────────
  //
  // Each needs something the waves above returned — the selections, the primary
  // invoice, and the account's timezone — which is what separates them from the
  // twenty that were merely written in sequence.
  //
  // THE INVOICE AS THE CLIENT WILL SEE IT, for the preview beside the send
  // button. Lines and charges rather than a total, because a preview that only
  // repeats the number already on the screen answers no question anybody had.
  // Loaded only when there is an invoice, so a job with none still costs no query.
  //
  // The homeowner saw pictures and the contractor saw a text list. Both sides of
  // a feature about agreeing on what was picked should see the same thing.
  //
  // Subcontractor dispatch: the live request for this job (if any), whether
  // there is anybody to ask, and — once the work is done — the private review.
  // All four reads are cheap and degrade to nothing on a database that has not
  // taken the 2026-08-17 migration.
  const [
    previewInvoice,
    selectionPhotos,
    subRequest,
    subcontractorDirectory,
    jobSubcontractors,
    jobSubReviews,
  ] = await Promise.all([
    jobInvoice ? getInvoiceWithItems(supabase, accountId, jobInvoice.id) : Promise.resolve(null),
    signSelectionPhotos(accountId, selections),
    getActiveRequestForJob(supabase, accountId, job.id),
    loadSubcontractors(supabase, accountId, { today: todayIn(arrivalSettings.timeZone) }),
    listJobSubcontractors(supabase, accountId, job.id),
    listSubcontractorReviews(supabase, accountId, { jobId: job.id }),
  ]);
  const previewTotals = previewInvoice
    ? computeInvoiceTotals(
        previewInvoice.items,
        Number(previewInvoice.invoice.discount_percent) || 0,
        Number(previewInvoice.invoice.tax_rate) || 0,
      )
    : null;
  // All three off the account row already in hand, rather than a fourth query
  // for three columns of it.
  const accountRow = (arrivalAccount ?? {}) as Record<string, unknown>;
  const stripeOnboarded = Boolean(accountRow.connect_onboarded);
  const autoReviewRequest = Boolean(accountRow.auto_review_request);
  // The working day, for the "18 hrs across 6 days is about 3 a day" line on
  // the scheduling card. Same fallback the schedule page uses.
  const scheduleDayHours = Number(accountRow.schedule_day_hours) || 8;

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
  // The ACCOUNT'S date, not the server's. This was toISOString().slice(0,10) —
  // UTC — which for a west-coast account is tomorrow's date from 5pm onwards.
  // Anything that compares a booked day against "today" has to use the clock
  // the contractor is actually looking at, or it calls a normal completion
  // early and an early one normal for several hours a day.
  // accountTimeZone comes off the account row requireOwnerContext already read,
  // and resolves the same 'America/New_York' fallback this used to spell out.
  // It was a fifth query against that row.
  const todayKey = zonedNowParts(new Date(), accountTimeZone).dateKey;
  // appointment_confirmed_at is selected via getJob's `*` but isn't on the Job
  // type yet — read it off the row without widening the shared type.
  const appointmentConfirmedAt = (job as { appointment_confirmed_at?: string | null }).appointment_confirmed_at ?? null;
  const priceBook = priceBookServices
    .map((service) => ({ id: service.id, name: service.name, unitPrice: Number(service.unit_price) || 0, unit: service.unit }));
  const taskStats = taskProgress(jobTasks);
  const lastReviewRequest = feed.find((event) => event.kind === 'review_requested');
  const boundSendScheduleOptions = sendClientScheduleOptionsAction.bind(null, job.id);
  const boundScheduleJob = scheduleJobAction.bind(null, job.id);
  // How this customer may be messaged about this job — the contractor's setting,
  // their own STOP reply (resolved in the wave above), and what's actually on
  // file, brought together in one place. Every card on this page that offers to
  // text them asks this rather than checking for a phone number and hoping.
  const clientChannelPreference = normalizeClientChannelPreference(job.message_channel);
  const clientContact = {
    phone: job.client_phone,
    email: job.client_email,
    preference: clientChannelPreference,
    optedOut: clientOptedOut,
    kind: 'automatic' as const,
  };
  const clientCanBeTexted = canTextClient(clientContact);
  const clientChannelNote = clientChannelChip(clientContact);
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

  /* ONE LIFECYCLE, ONE PRIMARY ACTION, ONE SUM.
     The hero used to badge the job from one derivation, offer every action at
     once regardless of stage, and headline a customer's name — while the money
     figures on the page never subtracted. See lib/job-lifecycle for the page
     that made all three worth fixing at once. */
  const money = jobMoney({
    quotedAmount: Number(job.quoted_amount) || 0,
    approvedChangeOrderTotal: changeOrderTotals(changeOrders).approved,
    payments,
  });
  const stage = jobStage({
    status: job.status,
    quotedAmount: Number(job.quoted_amount) || 0,
    startedAt: job.started_at ?? null,
    scheduledFor: job.scheduled_for ?? null,
    clientLinkCount: activeClientLinkCount,
    remainingCents: money.remainingCents,
  });
  const primaryAction = primaryJobAction(stage, {
    todayKey,
    scheduledFor: job.scheduled_for ?? null,
    reviewConfigured: Boolean(reviewUrl),
    reviewAlreadyRequested: Boolean(lastReviewRequest),
  });
  const isPrimary = (key: string) => primaryAction?.key === key;
  const suggestStages = shouldSuggestStages({
    quotedAmount: Number(job.quoted_amount) || 0,
    estimatedHours: job.estimated_hours ? Number(job.estimated_hours) : null,
    dayHours: scheduleDayHours,
  });

  /* WHAT THIS JOB IS, ahead of whose it is. "Dana Whitfield" is not enough when
     a customer has three jobs open; the first line of the scope is what the
     contractor called the work, and the first quote line is the fallback. */
  const jobTitle =
    (job.scope ? job.scope.split('\n')[0].trim().slice(0, 70) : '') ||
    quoteItems.find((item) => item.kind === 'base')?.label ||
    'Job';

  // Only when there is a section to land on. Change orders currently originate
  // from a crew member's find, so a job with none has no panel to link to, and
  // a dead link is worse than no link.
  const changeOrderHref = changeOrders.length > 0 ? `/dashboard/jobs/${job.id}#change-orders` : undefined;
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

  /* THE THREE CONTROLS THAT ARE COMPONENTS, built once.
     Start, complete and review each carry their own confirm dialog and their
     own pending state, and each can be either the hero's bright control or an
     entry in the menu beside it. Built here so the two placements cannot drift
     into offering different warnings for the same press. */
  const startControl = (
    <StartJobButton
      action={boundMarkJobStarted}
      clientName={job.client_name}
      quoteUnapproved={job.status === 'new_lead'}
      primary={isPrimary('start')}
    />
  );
  const completeControl = (
    /* The end of the job, and the only button on this page that should feel
       like one — but it is an instruction, not a state, so it says "Mark". It
       stops for a preflight first, because completing can fire the automatic
       review request, and a text to a customer is the one thing on this screen
       that cannot be undone. */
    <CompleteJobButton
      action={boundMarkJobComplete}
      warning={{
        clientName: job.client_name,
        autoReviewRequest,
        reviewUrlConfigured: Boolean(reviewUrl),
        alreadyRequested: Boolean(lastReviewRequest),
        channel: job.client_phone ? 'text' : job.client_email ? 'email' : null,
        // The chronology guard. todayKey is the ACCOUNT'S date, not the
        // server's — a west-coast owner closing a job at 9pm is still on
        // yesterday, and comparing against UTC would call a normal completion
        // early and an early one normal.
        scheduledFor: job.scheduled_for,
        todayKey,
        // Everything still open on this job, phrased once in completionBlockers
        // so the dialog and any future surface cannot describe the same job
        // differently.
        quoteUnapproved: job.status === 'new_lead',
        blockers: completionBlockers({
          openSelections: selectionStatus.waiting,
          openTasks: taskStats.total - taskStats.done,
          outstandingBalance,
          nothingBilled: payments.length === 0 && invoices.length === 0,
        }),
      }}
      // The same facts again, structured, so the preflight can put a fix link
      // beside each one instead of naming it and leaving you to go looking.
      preflight={completionPreflight({
        openSelections: selectionStatus.waiting,
        openTasks: taskStats.total - taskStats.done,
        outstandingBalance,
        nothingBilled: payments.length === 0 && invoices.length === 0,
      })}
      pill={reviewPillState({
        clientName: job.client_name,
        autoReviewRequest,
        reviewUrlConfigured: Boolean(reviewUrl),
        alreadyRequested: Boolean(lastReviewRequest),
        channel: job.client_phone ? 'text' : job.client_email ? 'email' : null,
      })}
      muted={!isPrimary('complete')}
    />
  );
  const reviewControl = (
    <RequestReviewButton
      action={boundRequestReview}
      reviewConfigured={Boolean(reviewUrl)}
      lastRequestedAt={lastReviewRequest?.created_at ?? null}
    />
  );

  /* THE ONE BRIGHT CONTROL, chosen by the stage rather than by the section it
     happens to live in. Two of the seven keys had no control up here at all,
     which is why a job at the pricing stage led with "Request payment". */
  const primaryControl = !primaryAction ? null : primaryAction.key === 'start' ? (
    startControl
  ) : primaryAction.key === 'complete' ? (
    completeControl
  ) : primaryAction.key === 'request_review' ? (
    reviewControl
  ) : (
    <Link
      href={
        primaryAction.key === 'schedule'
          ? `/dashboard/jobs/${job.id}?open=scheduling#job-scheduling`
          : primaryAction.key === 'request_payment'
            ? `/dashboard/jobs/${job.id}?open=payment#request-payment`
            : `/dashboard/jobs/${job.id}#quote-breakdown`
      }
      className="btn primary"
    >
      {primaryAction.label}
    </Link>
  );
  const waitNote = jobWaitNote(stage, {
    clientName: job.client_name,
    scheduledLabel: job.scheduled_for ? formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until) : null,
    reviewAlreadyRequested: Boolean(lastReviewRequest),
  });

  return (
    <ScrollTopOnSaveProvider>
    <main className="wide-shell workspace-shell">
      {searchParams.delivery ? (
        <QuoteDeliveryBanner delivery={searchParams.delivery} clientLink={clientLink} clientName={job.client_name} clientEmail={job.client_email} />
      ) : null}
      <section id="job-top" className="workspace-hero panel job-command-hero">
        <div className="workspace-hero-copy">
          <div className="job-title-row">
            <h1 className="workspace-title job-hero-title">{jobTitle}</h1>
            <span className="job-hero-ref">{job.ref}</span>
            {/* Names the noun. This opens Job details — the client's name and
                phone, the schedule, the crew — and sits one link away from
                "Client profile", which opens somebody else's record entirely. */}
            <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`} className="job-title-edit-link">
              Edit job
            </Link>
            {job.client_id ? (
              <Link href={`/dashboard/clients/${job.client_id}`} className="job-title-edit-link">Client profile ↗</Link>
            ) : null}
          </div>
          <p className="job-hero-who">
            {job.client_name}
            {' · '}
            {/* The stage, from the one ladder. The badge below still carries the
                finer-grained "payment issue" / "client signed" states — this
                says where the job IS, which is the thing four controls used to
                disagree about. */}
            {JOB_STAGE_LABEL[stage]}
            {job.scheduled_for ? ` · ${formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)}` : ''}
          </p>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${heroStatus.tone}`} title={heroStatus.title}>{heroStatus.label}</span>
            <span className="workspace-inline-note">{job.address || 'No address on file yet'}</span>
          </div>

          {/* THE MONEY, SUBTRACTED, and always on screen. A $99.94 quote with
              two $250 deposit requests against it read as "Request payment"
              because nothing on the page ever compared the asks to the deal. */}
          <dl className={`job-money-strip${money.overRequestedCents > 0 ? ' is-over' : ''}`} aria-label="Money on this job">
            <div><dt>Approved</dt><dd>{formatMoneyExact(money.approvedCents / 100)}</dd></div>
            <div><dt>Requested</dt><dd>{formatMoneyExact(money.requestedCents / 100)}</dd></div>
            <div><dt>Paid</dt><dd>{formatMoneyExact(money.paidCents / 100)}</dd></div>
            <div><dt>Remaining</dt><dd>{formatMoneyExact(money.remainingCents / 100)}</dd></div>
          </dl>
          {money.overRequestedCents > 0 ? (
            <p className="job-money-warn">
              {formatMoneyExact(money.overRequestedCents / 100)} more has been asked for than this job is approved for. Raise a
              change order so the customer approves the difference, or cancel a request below.
            </p>
          ) : null}
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
              {/* Only when there is something to say. clientChannelChip returns
                  null for the ordinary case — a customer we text, with a mobile,
                  who has not replied STOP — because a badge on every job saying
                  "nothing unusual here" trains people to stop reading badges. */}
              {clientChannelNote ? (
                <Link
                  href={`/dashboard/jobs/${job.id}?edit=client#job-details`}
                  className={`job-channel-chip tone-${clientChannelNote.tone}`}
                  title="How automatic messages reach this customer — change it in Job details"
                >
                  {clientChannelNote.label}
                </Link>
              ) : null}
            </div>
          ) : null}
          {/* TO THE CENT, because the money panel below is. This header said
              "$100 quoted" over an Approved and a Remaining of $99.94 — the
              same number twice, rounded in one place and not the other, which
              reads as two different figures and sends somebody looking for the
              six cents. formatMoney's own note says it: whole dollars are for a
              summary, never for something a customer authorizes, and a quote is
              the thing a customer authorizes. */}
          <div className="job-command-facts" aria-label="Job facts">
            <span>
              <strong>
                <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>{formatMoneyExact(job.quoted_amount)}</Link>
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
          {/* ONE control looks like a control. Everything on this row used to be
              offered at once — "Request payment" in primary orange beside "Job
              started" beside a dominant "Mark Job Completed", on a job whose
              service date was three days away. The stage decides which one is
              bright; every alternative moves into the menu beside it, two taps
              away and still named. See primaryJobAction and JobActionMenu. */}
          <div className="actions workspace-actions">
            {primaryControl}
            <JobActionMenu
              label={primaryControl ? 'More actions' : 'Job actions'}
              defaultOpen={searchParams.open === 'costs'}
            >
              {/* Ordered by how often they're wanted, not by the pipeline —
                  this is the drawer you open when the recommended step is not
                  the one you came for. Each entry omits itself when it is the
                  bright control above, so nothing is offered twice. */}
              {!isPrimary('price') && !isPrimary('send_quote') ? (
                <Link className="job-actions-item" href={`/dashboard/jobs/${job.id}#quote-breakdown`}>
                  <strong>{job.quoted_amount > 0 ? 'Edit the quote' : 'Price this job'}</strong>
                  {/* Same figure as the header and the money panel, so all
                      three agree to the cent. */}
                  <small>{job.quoted_amount > 0 ? `${formatMoneyExact(job.quoted_amount)} quoted` : 'No amount on this job yet'}</small>
                </Link>
              ) : null}
              {!isPrimary('schedule') ? (
                <Link className="job-actions-item" href={`/dashboard/jobs/${job.id}?open=scheduling#job-scheduling`}>
                  <strong>{job.scheduled_for ? 'Change the date' : 'Schedule the work'}</strong>
                  <small>
                    {job.scheduled_for
                      ? formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)
                      : 'Nothing booked yet'}
                  </small>
                </Link>
              ) : null}
              {!isPrimary('request_payment') ? (
                <Link className="job-actions-item" href={`/dashboard/jobs/${job.id}?open=payment#request-payment`}>
                  <strong>Request payment</strong>
                  <small>
                    {money.remainingCents > 0
                      ? `${formatMoneyExact(money.remainingCents / 100)} still to collect`
                      : 'Send an invoice or a payment link'}
                  </small>
                </Link>
              ) : null}
              <Link className="job-actions-item" href={`/dashboard/jobs/${job.id}#job-feed`}>
                <strong>View the live client page</strong>
                <small>{activeClientLinkCount > 0 ? 'Shared and live' : 'Not shared yet'}</small>
              </Link>
              <div className="job-actions-item is-control">
                <ModalDialog triggerClassName="btn secondary" triggerLabel="Add expense" title="Add expense" defaultOpen={searchParams.open === 'costs'}>
                  <form action={boundCreateCost} className="cost-form">
                    <JobExpenseFields crew={crew} onReadReceipt={readReceiptAction} />
                    <div style={{ marginTop: '0.8rem' }}>
                      <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                    </div>
                    <CloseOnSuccess />
                  </form>
                </ModalDialog>
              </div>
              {/* Start and complete are a pair, so they sit together. "Job
                  started" disappears once it has been pressed rather than turning
                  into a disabled button — the feed and the pipeline step carry the
                  fact from then on, and Undo lives with the feed entry it undoes. */}
              {!isPrimary('start') && !job.started_at && job.status !== 'complete' && job.status !== 'archived' ? (
                <div className="job-actions-item is-control">{startControl}</div>
              ) : null}
              {!isPrimary('complete') && job.status !== 'complete' && job.status !== 'archived' ? (
                <div className="job-actions-item is-control">{completeControl}</div>
              ) : null}
              {!isPrimary('request_review') && job.status === 'complete' ? (
                <div className="job-actions-item is-control">{reviewControl}</div>
              ) : null}
            </JobActionMenu>
          </div>
          {/* When nothing is the contractor's move, say whose it is. A hero
              with no bright control and no sentence reads as a page that has
              run out of things to say. See jobWaitNote. */}
          {!primaryControl && waitNote ? <p className="job-wait-note">{waitNote}</p> : null}
        </div>

        <aside className="pipeline-checklist" aria-label="Client pipeline checklist">
          {/* A HEADED CARD, AND THE HEAD IS A DOOR.
              It was an unnamed list of ticks floating beside the hero — you had
              to infer what it was from its contents. It is the job's progress,
              and the place that says what actually happened is the feed further
              down, so the title is the link to it rather than a label you read
              and then go hunting. */}
          <a className="pipeline-checklist-head" href="#job-feed">
            <span>Job Feed</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5.5 15.5 12 9 18.5" />
            </svg>
          </a>
          <ol>
            {pipelineChecklist.map((item, index) => {
              const state = item.complete ? 'complete' : index === currentPipelineIndex ? 'current' : 'upcoming';
              return (
                <li key={item.key}>
                  <Link className={`pipeline-step pipeline-step-${state}`} href={item.href}>
                    {/* Drawn, not typed. "✓" is a font glyph: it arrives at a
                        different weight on every platform, sits off-center in
                        its own box, and cannot be made heavier without making
                        the whole marker heavier with it. */}
                    <span className="pipeline-step-marker">
                      {item.complete ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12.5 10 17.5 19 7" />
                        </svg>
                      ) : null}
                    </span>
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

      {/* THE WAY AROUND A LONG RECORD.
          Quote, stages, punch list, feed, payment, scheduling, expenses,
          selections, warranty and ROI make a page nobody can hold in their
          head, and on a phone reaching the money meant scrolling past all of
          it. Plain anchors, so it works before any JavaScript has run and on a
          job page opened in a van with one bar. */}
      <nav className="job-subnav" aria-label="Jump to a section">
        <a href="#job-top">Overview</a>
        <a href="#checklist">Work</a>
        {/* Only ever a link, never a badge that exists to be decorative: the
            count appears when the job is actually stopped on somebody else. */}
        <a href="#selections">
          Choices
          {selectionStatus.waiting > 0 ? (
            <span className={`job-subnav-count${selectionStatus.overdue > 0 ? ' is-overdue' : ''}`}>{selectionStatus.waiting}</span>
          ) : null}
        </a>
        <a href="#quote-breakdown">Quote</a>
        <a href="#job-feed">Feed</a>
        <a href="#request-payment">Money</a>
        <a href="#job-details">More</a>
      </nav>

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
      {/* Collapsed until this job actually has stages. On a small job the empty
          state is a paragraph of pitch, and it sat between the arrival panel
          and the quote on every job whether or not staged payments made any
          sense for it. */}
      <details id="milestones" className="panel workspace-section-card job-section-collapsible" open={milestoneViews.length > 0}>
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Getting paid</p>
            <h2>Stages &amp; proof</h2>
          </div>
          <span className="workspace-details-copy">
            {milestoneViews.length > 0
              ? `${milestoneViews.length} stage${milestoneViews.length === 1 ? '' : 's'} on this job.`
              : 'Get paid as each part is finished, with the proof attached.'}
          </span>
        </summary>
        <Milestones
          entries={milestoneViews}
          quotedAmount={Number(job.quoted_amount) || 0}
          clientPhone={job.client_phone}
          suggestSplit={suggestStages}
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
      </details>

      <section id="quote-breakdown" className="panel workspace-section-card">
        {/* The heading is the heading. Print moved down into QuoteBuilder's
            toolbar to sit with the other two things you can do to a quote —
            it was the only one of the three up here, which made it look like
            the section's primary action rather than the one you reach for
            last. */}
        <div className="section-heading workspace-section-heading">
          <div>
            <p className="eyebrow">Quote</p>
            <h2>Quote breakdown</h2>
          </div>
        </div>
        {/* Three sentences became one. The two it lost — that the total updates
            itself, and what an empty list means — were explaining machinery
            above a quote nobody had written yet. */}
        <p className="workspace-details-copy" style={{ marginTop: '0.4rem', marginBottom: '0.9rem' }}>
          Itemize the work, add optional upgrades, or leave this empty for one quoted amount.
        </p>
        <QuoteBuilder
          action={boundSaveQuoteItems}
          notifyAction={saveQuoteItemsAndNotifyAction.bind(null, job.id)}
          autosaveKey={job.id}
          draftAction={draftQuoteAction.bind(null, job.id)}
          reviewAction={reviewQuoteAction.bind(null, job.id)}
          printHref={`/dashboard/jobs/${job.id}/quote`}
          initialItems={quoteItems}
          quotedAmount={Number(job.quoted_amount) || 0}
          services={priceBook}
          approved={job.status !== 'new_lead'}
          approvedTotal={Number(job.quoted_amount) || 0}
          clientLabel={job.client_name}
          changeOrderHref={changeOrderHref}
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

      {/* Collapsed while it is empty. An untouched punch list is a heading, a
          paragraph of explanation and an empty state — three screenfuls of
          nothing between the quote and the feed on a phone. It opens the moment
          it has anything in it. */}
      <details id="checklist" className="panel workspace-section-card job-section-collapsible" open={jobTasks.length > 0}>
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Checklist</p>
            <h2>Punch list{taskStats.total > 0 ? ` · ${taskStats.done}/${taskStats.total} done` : ''}</h2>
          </div>
          <span className="workspace-details-copy">
            {jobTasks.length > 0 ? 'What your crew ticks off from the field app.' : 'Nothing on it yet.'}
          </span>
        </summary>
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
        <TaskAddForm action={addJobTaskAction.bind(null, job.id)} />
      </details>

      {/* THE CUSTOMER'S HALF OF THE WORK, out of the bottom of the page.
          This sat inside #job-costs — the grid of expenses, margin and ROI —
          below the scheduling panel, three screens past anything anybody opens
          this page for. Selections are not a cost record: they are the list of
          decisions the JOB is stopped on, and a job stalled on a tile choice
          looks exactly like a job that is going fine until you scroll to the
          end of it.

          So it sits with the punch list, which is the other answer to "what is
          outstanding", and above the feed, because a choice nobody has made is
          the thing the next feed entry is waiting for.

          Open whenever anything is waiting, not only when something is late —
          the point of asking early is to stop it becoming late. And it keeps
          its id, because the completion preflight links here. */}
      <details
        id="selections"
        className="panel workspace-section-card workspace-details job-action-details"
        open={selectionStatus.waiting > 0}
      >
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Selections</p>
            <h2>
              Colors, materials &amp; fixtures
              {/* The same shape the punch list uses two sections up, so two
                  lists of outstanding work read the same way. */}
              {selections.length > 0 ? ` · ${selections.length - selectionStatus.waiting}/${selections.length} chosen` : ''}
            </h2>
          </div>
          <span className={`workspace-details-copy${selectionStatus.overdue > 0 ? ' is-overdue' : ''}`}>
            {selectionStatus.label || 'What the customer has to choose, and what it costs.'}
          </span>
        </summary>
        <SelectionBoard jobId={job.id} selections={selections} templates={selectionTemplates} photos={selectionPhotos} lastSentAt={lastSelectionSent} />
      </details>

      <section id="job-feed" className="panel workspace-section-card job-feed-command-panel">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
              {/* THE DOOR, BESIDE THE THING IT OPENS.
                  This was a card at the foot of the feed with a heading, a
                  paragraph and a status line, under a feed whose every row
                  already carries an "In Job Feed" badge. What it was for is one
                  link: the same feed as the customer sees it. Whether the page
                  has been shared is still said once, in the pipeline step at
                  the top — see buildPipelineChecklist.

                  The form sits BESIDE the h2 rather than inside it. Minting is
                  a write, so it has to be a submit rather than an anchor, and a
                  <form> is flow content — invalid inside a heading, where the
                  browser would close the h2 around it. */}
              <div className="job-feed-title-row">
                <h2>Job Feed</h2>
                {clientViewHref ? (
                  <a className="job-feed-live-link" href={clientViewHref} target="_blank" rel="noreferrer">
                    (live page)
                  </a>
                ) : (
                  <form action={boundCreateClientJobLink}>
                    <SaveButton className="job-feed-live-link" pendingLabel="(opening…)" savedLabel="(opening…)">
                      (live page)
                    </SaveButton>
                  </form>
                )}
              </div>
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
                            {/* EDIT, BESIDE UNDO — and only on an update
                                somebody typed. Everything else in this feed is
                                a record of something that happened, and the
                                action enforces that with a where clause rather
                                than trusting this condition. A <details> so it
                                costs nothing until it is wanted, and it takes
                                the full row when open (the badge row wraps). */}
                            {event.kind === 'job_update' ? (
                              <details className="feed-edit">
                                <summary className="feed-undo-btn">Edit</summary>
                                <form
                                  action={editJobFeedUpdateAction.bind(null, job.id, event.id)}
                                  className="feed-edit-form"
                                >
                                  <label htmlFor={`feed-title-${event.id}`}>Update</label>
                                  <input
                                    id={`feed-title-${event.id}`}
                                    name="title"
                                    defaultValue={event.title ?? ''}
                                    maxLength={120}
                                    required
                                  />
                                  <label htmlFor={`feed-body-${event.id}`}>Details</label>
                                  <textarea id={`feed-body-${event.id}`} name="body" rows={3} defaultValue={event.body ?? ''} />
                                  <label className="sms-consent-check">
                                    <input name="clientVisible" type="checkbox" defaultChecked={event.visibility !== 'internal'} />
                                    <span>
                                      <strong>{job.client_name} can see this</strong>
                                      <small>Untick to keep it in your own record only.</small>
                                    </span>
                                  </label>
                                  <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">Save changes</SaveButton>
                                  <p className="feed-edit-note">
                                    If you texted this update when you posted it, that text has already gone. Editing changes
                                    this page and {job.client_name}&rsquo;s, not the message on their phone — and it is marked
                                    as edited on both.
                                  </p>
                                </form>
                              </details>
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
                          {event.edited_at ? <span className="feed-edited"> · edited {formatFeedTime(event.edited_at)}</span> : null}
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

            <form id="payment-request-form" action={boundCreateDepositRequest} className="cost-form workspace-form-block">
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
              {/* The deal, stated where the ask is typed. The server refuses an
                  over-request without this box ticked — see the guardrail in
                  createDepositRequestAction — so the checkbox is the sentence
                  somebody has to agree to, not a nicety. */}
              <div className="payment-approved-line">
                <span>
                  Approved <strong>{formatMoneyExact(money.approvedCents / 100)}</strong> · already asked for{' '}
                  <strong>{formatMoneyExact((money.paidCents + money.requestedCents) / 100)}</strong> · room left{' '}
                  <strong>{formatMoneyExact(Math.max(0, money.remainingCents) / 100)}</strong>
                </span>
                <label className="sms-consent-check">
                  <input name="confirmOverage" type="checkbox" />
                  <span>Collect more than the approved total (a change order is the cleaner way to raise it)</span>
                </label>
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
              {/* THE BUTTON THAT ASKS FOR MONEY GETS A PREVIEW, like the one
                  that sends a quote already has. Everything this form does
                  happens on somebody else's phone, and until now the first time
                  anyone read the message was after it had gone. */}
              <div className="payment-send-row">
                <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Send invoice/payment link</SaveButton>
                <PaymentPreview
                  formId="payment-request-form"
                  businessName={previewBusinessName}
                  jobRef={job.ref}
                  clientName={job.client_name}
                  payOrigin={quoteLinkOrigin}
                  invoice={
                    previewInvoice && previewTotals
                      ? {
                          ref: previewInvoice.invoice.ref,
                          statusLabel: INVOICE_STATUS_LABEL[previewInvoice.invoice.status],
                          items: previewInvoice.items.map((item) => ({
                            id: item.id,
                            description: item.description,
                            amount: Number(item.amount) || 0,
                          })),
                          subtotal: previewTotals.subtotal,
                          discountPercent: previewTotals.discountPercent,
                          discountAmount: previewTotals.discountAmount,
                          taxRate: previewTotals.taxRate,
                          taxAmount: previewTotals.taxAmount,
                          total: previewTotals.total,
                          paid: invoicePaidTotal,
                          balance: invoiceBalance ?? 0,
                        }
                      : null
                  }
                />
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
              {/* THE CONTRACTOR'S HALF OF CONSENT, with somewhere to live at last.
                  It was asked once, as a checkbox on the quote form, and never
                  written down — so an owner who deliberately unticked it got the
                  customer texted anyway by the next automation that found a phone
                  number. Set here it governs every automatic message on this job:
                  choice reminders, the morning-of confirmation, the review ask.
                  The customer's own STOP reply is separate and still outranks it. */}
              {/* Two switches, the same ones the quote form uses. It was a
                  <select> whose options were sentences — "Text, or email if
                  there's no mobile" — for a setting that is really two
                  independent yes/nos. See components/channel-toggles. */}
              <ClientChannelField
                initial={clientChannelPreference}
                phone={job.client_phone}
                email={job.client_email}
                optedOut={clientOptedOut}
              />
              <div className="field full">
                <label htmlFor="address">Address</label>
                <AddressAutocomplete id="address" name="address" defaultValue={job.address ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="scope">Job Description</label>
                <textarea id="scope" name="scope" defaultValue={job.scope ?? ''} />
              </div>
              {/* NOT "STATUS". The badge at the top of this page says
                  "Scheduled", this select said "In progress", and the button
                  beside them said "Job started" — three vocabularies over the
                  same job, none of them wrong on its own terms, and no way to
                  tell which one was lying.
                  There is one status, it is derived, and it is the badge in the
                  hero (JOB_STAGE_LABEL). This field is the stored record state
                  the derivation reads FROM, so it says so and names what the
                  job currently resolves to. */}
              <div className="field">
                <label htmlFor="status">Record state</label>
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
                <p className="job-meta">
                  With the date, the payments and the client link, this job currently reads as{' '}
                  <strong>{JOB_STAGE_LABEL[stage]}</strong> — the status shown at the top of the page.
                </p>
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
                {/* WHAT THIS NOTE USED TO SAY WAS HALF WRONG.
                    "Used for labor cost and margin — not for how many days this
                    blocks." The first clause is true and the second was true
                    only of the SPAN: the end date decides which days, but the
                    hours decide how much of each of them, because every reader
                    of the calendar divides one by the other. An owner doing
                    three hours a day at one site was being told the number that
                    expresses it had nothing to do with the calendar. */}
                <p className="job-meta">
                  Labor cost and margin — and, across a date range, how much of each day the job takes.
                  The last day is what decides which days.
                </p>
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

            {/* WHO IS DOING THIS WORK — both answers, under one heading.
                Assigning your own crew and asking a subcontractor to cover it
                are the two ways this question gets settled, and splitting them
                across two screens is how a job ends up double-manned. */}
            <div className="workspace-section-divider">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Crew</p>
                <h2>Who is doing this work</h2>
              </div>

              <h3>Assign crew</h3>
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

              <h3>Request a subcontractor</h3>
              <SubcontractorPanel
                jobId={job.id}
                entry={subRequest}
                canRequest={subcontractorDirectory.length > 0}
                reason={
                  subcontractorDirectory.length === 0
                    ? 'You have no subcontractors saved yet.'
                    : undefined
                }
              />
            </div>

            {/* Only once the work is finished. Scoring somebody's cleanliness
                halfway through is an opinion, not a record. */}
            {job.status === 'complete' ? (
              <SubcontractorReview
                jobId={job.id}
                subcontractors={jobSubcontractors}
                reviews={jobSubReviews}
                requestId={subRequest?.request.id ?? null}
              />
            ) : null}

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

      {/* SCHEDULING IS NOT A TEXT MESSAGE.
          This card was titled "Send 3 Start Dates" and held one form: a mobile
          number, three options, a consent checkbox. That is a fine way to book
          a job and it is not the only way — it is not even the common one for a
          contractor whose customers do not text, or whose start date was agreed
          on the phone before the quote went out. For them the entire pipeline
          step named "Schedule the work" pointed at a form they could not use,
          and the way to put a date on a job was buried inside "edit client
          details", three sections down, under a heading about the customer.

          So the section is named for the outcome and leads with the route that
          always works. Texting options is still here, one press away, demoted
          from "the scheduling card" to "or let them pick" — which is what it
          is. The SMS half also stops pretending when there is no mobile on
          file, instead of offering an empty phone field and a consent box for a
          text that cannot be sent. */}
      <details id="job-scheduling" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'scheduling'}>
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Scheduling</p>
            <h2>Set the start date</h2>
          </div>
          <span className="workspace-details-copy">Put it on the calendar yourself, or text the client dates to choose from.</span>
        </summary>
        <p className="workspace-card-copy">
          {job.scheduled_for
            ? `Booked for ${formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until)}. Saving a new date moves it.`
            : 'Nobody is booked in yet. Pick the day you plan to be there — the client sees it on their job feed.'}
        </p>
        <form action={boundScheduleJob} className="form-grid">
          <JobScheduleFields
            scheduledFor={job.scheduled_for ?? ''}
            scheduledTime={job.scheduled_time?.slice(0, 5) ?? ''}
            scheduledUntil={job.scheduled_until ?? ''}
            estimatedHours={Number(job.estimated_hours) || null}
            capacityHours={scheduleDayHours}
          />
        </form>

        <details className="job-schedule-alt">
          <summary>Or let the client pick from 3 dates</summary>
          {clientCanBeTexted ? (
            <>
              <p className="workspace-card-copy">They choose one or ask for different times with a note. Whichever they pick lands on the calendar automatically.</p>
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
            </>
          ) : (
            <p className="workspace-card-copy">
              {job.client_phone
                ? `${job.client_name} is set to ${CLIENT_CHANNEL_LABEL[clientChannelPreference].toLowerCase()}, so scheduling texts are off for this job. Change it in Job details, or use the date picker above.`
                : `No mobile on file for ${job.client_name}, so there's nowhere to text options. Add one in Job details, or use the date picker above.`}
            </p>
          )}
        </details>
      </details>

      {/* ONE COLUMN, NOT TWO.
          These five sections used to sit in a `detail-grid` — a 2fr column
          holding Job expenses alone, and a 1fr column holding Selections,
          Warranty, Change orders and ROI. The column with four cards got a
          third of the width, so its headings wrapped to three and four lines
          and it ran 456px tall beside a 130px card, leaving a ragged 327px of
          nothing under Job expenses (391px before the shell went fluid).

          Balancing the two columns does not hold: every card here is a
          `<details>` the owner opens and closes independently, and Change
          orders only exists on some jobs. Any distribution that lines up while
          they are all shut goes ragged the moment one is opened.

          The ROI card carried `sticky-card` to ride along beside the expenses
          you are logging, which is a good idea that never worked: it was the
          LAST child of its column, so it had no track below it to slide along.
          Measured — scrolled 900px past a tall expenses list and its offset
          inside its own column did not move by a pixel. Nothing is lost by
          dropping it.

          So: one card per row, the full width of the shell, the same as the
          two sections above. Bottoms cannot misalign when there is one column,
          it does not care how many cards there are or which are open, and the
          selections board and the expenses list get the width the fluid shell
          now has to give them. */}
      <section id="job-costs" className="workspace-grid">
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
              <details id="change-orders" className="panel workspace-section-card workspace-details job-action-details" open={changeOrderTotals(changeOrders).unsent > 0}>
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

            <details className="panel workspace-section-card workspace-details job-action-details">
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
        </section>

    </main>
    </ScrollTopOnSaveProvider>
  );
}


