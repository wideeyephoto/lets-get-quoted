import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
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
import LienWaiverPanel from './LienWaiverPanel';
import SelectionBoard from './SelectionBoard';
import JobFormsPanel from '@/components/forms/JobFormsPanel';
import { attachJobFormAction, requestCustomerSignatureAction } from './form-actions';
import { listJobFormSubmissions, listFormTemplates } from '@/lib/forms/forms-data';
import { PermitWorkspace } from '@/components/permits/PermitWorkspace';
import { PermitFeasibilityCard } from '@/components/permits/PermitFeasibilityCard';
import { PropertyDossierCard } from '@/components/property-intel/PropertyDossierCard';
import TaskAddForm from './TaskAddForm';
import { zonedNowParts } from '@/lib/quick-stop';
import { lastSelectionSendAt, listSelections, listSelectionTemplates, signSelectionPhotos } from '@/lib/selections-data';
import { boardStatus } from '@/lib/selections';
import { listWarranties, listClaims } from '@/lib/warranties-data';
import { listJobTasks, taskProgress } from '@/lib/job-tasks';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import { isLegacyDestinationPayment, listPayments } from '@/lib/payments';
import { computeInvoiceTotals, getInvoiceWithItems, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';
import { paidTowardInvoice, paymentsForInvoice } from '@/lib/invoice-pay';
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
import JobClientNameHeader from './JobClientNameHeader';
import JobAddressHeader from './JobAddressHeader';
import JobContactHeader from './JobContactHeader';
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
import { cookies } from 'next/headers';
import { JOB_DETAIL_LAYOUT_COOKIE, normalizeJobDetailLayout } from '@/lib/dashboard-views';
import JobDetailWorkspace, { type JobDetailTab, type TabBadges } from './JobDetailWorkspace';
import ClientChannelField from './ClientChannelField';
import {
  CLIENT_CHANNEL_LABEL,
  canTextClient,
  clientChannelChip,
  normalizeClientChannelPreference,
} from '@/lib/client-channel';

export const metadata = { title: 'Job' };

export default async function JobDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; view?: string; clientToken?: string; edit?: string; open?: string; delivery?: string; arrival?: string; sms?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const cookieStore = await cookies();
  const layoutCookie = cookieStore.get(JOB_DETAIL_LAYOUT_COOKIE)?.value;
  const layout = normalizeJobDetailLayout(searchParams.view || layoutCookie);

  const { supabase, accountId, role } = await requireOfficeContext('jobs.read', 'clients.read');

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

  const costs = role === 'owner' ? await listCosts(supabase, accountId, job.id) : [];
  const margin = computeMargin(job, costs);
  const changeOrders = await listChangeOrders(supabase, accountId, job.id);
  const [selections, selectionTemplates, lastSelectionSent] = await Promise.all([
    listSelections(supabase, accountId, job.id),
    listSelectionTemplates(supabase, accountId),
    // From the job feed, which is where BOTH senders record themselves — the
    // contractor's own button and the scheduled reminder. See lastSelectionSendAt.
    lastSelectionSendAt(supabase, accountId, job.id),
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
  const marginWarning = role === 'owner' ? marginVerdict({
    revenue: margin.revenue,
    totalCost: margin.totalCost,
    minMarginPct: await getMinMarginPct(supabase, accountId),
    evidencedPct: confidence.evidencedPct,
  }) : null;
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
  const [jobFormSubmissions, availableFormTemplates] = await Promise.all([
    listJobFormSubmissions(supabase, accountId, job.id),
    listFormTemplates(supabase, accountId, { includePresets: true }),
  ]);

  // Arrival. The live trip and the account's arrival rules — read with the
  // admin client because job_tracking is owner-scoped by RLS and this page is
  // already inside requireOwnerContext.
  const arrivalAdmin = createAdminClient();
  const [{ data: arrivalAccount }, { data: arrivalSite }, activeArrival] = await Promise.all([
    arrivalAdmin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    arrivalAdmin.from('sites').select('company_name, phone, subdomain, custom_domain').eq('account_id', accountId).limit(1).maybeSingle(),
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

  // Subcontractor dispatch: the live request for this job (if any), whether
  // there is anybody to ask, and — once the work is done — the private review.
  // All four reads are cheap and degrade to nothing on a database that has not
  // taken the 2026-08-17 migration.
  const [subRequest, subcontractorDirectory, jobSubcontractors, jobSubReviews] = await Promise.all([
    getActiveRequestForJob(supabase, accountId, job.id),
    loadSubcontractors(supabase, accountId, { today: todayIn(arrivalSettings.timeZone) }),
    listJobSubcontractors(supabase, accountId, job.id),
    listSubcontractorReviews(supabase, accountId, { jobId: job.id }),
  ]);
  const jobInvoice = selectPrimaryInvoice(invoices);
  // The SAME arithmetic the customer's /invoice/[id] uses, rather than a
  // second hand-rolled copy of it. This reduce filtered to status 'paid' and
  // summed the gross, subtracting no refunded_amount -- so after a partial
  // refund the contractor's screen read Balance $0 while that same customer
  // was still being offered a live Pay button for the difference. This number
  // also prefills the collect-payment box and feeds PaymentPreview, which the
  // comment further down calls THE INVOICE AS THE CLIENT WILL SEE IT.
  const invoicePaidTotal = jobInvoice
    ? paidTowardInvoice(paymentsForInvoice(payments, jobInvoice.id))
    : 0;
  const invoiceDisplayTotal = jobInvoice ? Math.max(Number(jobInvoice.total), Number(job.quoted_amount)) : Number(job.quoted_amount);
  const invoiceBalance = jobInvoice ? Math.max(0, invoiceDisplayTotal - invoicePaidTotal) : null;
  const outstandingBalance = Math.max(0, invoiceDisplayTotal - invoicePaidTotal);

  /* THE INVOICE AS THE CLIENT WILL SEE IT, for the preview beside the send
     button. Lines and charges rather than a total, because a preview that only
     repeats the number already on the screen answers no question anybody had.
     Loaded only when there is an invoice, so a job with none costs no query. */
  const previewInvoice = jobInvoice ? await getInvoiceWithItems(supabase, accountId, jobInvoice.id) : null;
  const previewTotals = previewInvoice
    ? computeInvoiceTotals(
        previewInvoice.items,
        Number(previewInvoice.invoice.discount_percent) || 0,
        Number(previewInvoice.invoice.tax_rate) || 0,
      )
    : null;
  const previewBusinessName = await loadBusinessName(supabase, accountId);
  const jobPhotos = await createJobPhotoLinks(accountId, job.photo_paths || []);
  const { data: accountRow } = await supabase
    .from('accounts')
    .select('connect_onboarded, auto_review_request, schedule_day_hours')
    .eq('id', accountId)
    .maybeSingle();
  const stripeOnboarded = accountRow?.connect_onboarded ?? false;
  const autoReviewRequest = Boolean(accountRow?.auto_review_request);
  // The working day, for the "18 hrs across 6 days is about 3 a day" line on
  // the scheduling card. Same fallback the schedule page uses.
  const scheduleDayHours = Number(accountRow?.schedule_day_hours) || 8;
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
  // The ACCOUNT'S date, not the server's. This was toISOString().slice(0,10) —
  // UTC — which for a west-coast account is tomorrow's date from 5pm onwards.
  // Anything that compares a booked day against "today" has to use the clock
  // the contractor is actually looking at, or it calls a normal completion
  // early and an early one normal for several hours a day.
  const { data: accountClock } = await supabase.from('accounts').select('timezone').eq('id', accountId).maybeSingle();
  const todayKey = zonedNowParts(new Date(), (accountClock?.timezone as string) || 'America/New_York').dateKey;
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
  const boundScheduleJob = scheduleJobAction.bind(null, job.id);
  // How this customer may be messaged about this job — the contractor's setting,
  // their own STOP reply, and what's actually on file, resolved together in one
  // place. Every card on this page that offers to text them asks this rather
  // than checking for a phone number and hoping.
  const clientChannelPreference = normalizeClientChannelPreference(job.message_channel);
  const clientOptedOut = job.client_phone ? await isPhoneOptedOut(accountId, job.client_phone) : false;
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
            <JobClientNameHeader jobId={job.id} clientName={job.client_name} />
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
            <JobAddressHeader jobId={job.id} address={job.address} />
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
          <div className="job-hero-contact">
            <JobContactHeader jobId={job.id} clientPhone={job.client_phone} clientEmail={job.client_email} />
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
          {/* Missing Critical Information Alert Banner */}
          {(!job.address || (!job.client_phone && !job.client_email) || job.quoted_amount <= 0) && job.status !== 'archived' && job.status !== 'complete' ? (
            <div className="job-missing-info-banner" role="alert">
              <div className="job-missing-info-head">
                <span className="job-missing-info-badge">⚠️ Needs Information</span>
                <span className="job-missing-info-title">This job has missing details before work or billing can proceed:</span>
              </div>
              <ul className="job-missing-info-list">
                {!job.address ? (
                  <li>
                    <span>📍 <strong>Missing site address</strong> — add address for routing, arrival texts, and directions.</span>
                    <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`} className="job-missing-fix-link">Add address →</Link>
                  </li>
                ) : null}
                {!job.client_phone && !job.client_email ? (
                  <li>
                    <span>📞 <strong>Missing customer contact</strong> — add phone or email so quotes and automated updates reach the client.</span>
                    <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`} className="job-missing-fix-link">Add contact →</Link>
                  </li>
                ) : null}
                {job.quoted_amount <= 0 ? (
                  <li>
                    <span>💰 <strong>No quote amount priced</strong> — proposal value is currently $0.00.</span>
                    <Link href={`/dashboard/jobs/${job.id}#quote-breakdown`} className="job-missing-fix-link">Price quote →</Link>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
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
              {job.client_phone ? (
                <Link
                  className="job-actions-item"
                  href={`/dashboard/messages?to=${encodeURIComponent(job.client_phone)}`}
                >
                  <strong>Message client</strong>
                  <small>Text {formatPhoneDashes(job.client_phone)}</small>
                </Link>
              ) : null}
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

      {(() => {
        let initialTab: JobDetailTab = 'overview';
        if (searchParams.tab === 'financials' || searchParams.tab === 'execution' || searchParams.tab === 'selections' || searchParams.tab === 'settings' || searchParams.tab === 'overview') {
          initialTab = searchParams.tab;
        } else if (searchParams.open === 'payment' || searchParams.open === 'costs' || searchParams.open === 'warranty') {
          initialTab = 'financials';
        } else if (searchParams.open === 'scheduling' || searchParams.edit === 'client') {
          initialTab = 'settings';
        } else if (searchParams.open === 'checklist') {
          initialTab = 'execution';
        } else if (searchParams.open === 'update') {
          initialTab = 'overview';
        }

        const tabBadges: TabBadges = {
          feedCount: displayedFeed.length,
          remainingLabel: money.remainingCents > 0 ? formatMoneyExact(money.remainingCents / 100) : undefined,
          tasksDone: taskStats.done,
          tasksTotal: taskStats.total,
          selectionsWaiting: selectionStatus.waiting,
          selectionsOverdue: selectionStatus.overdue,
          scheduledLabel: job.scheduled_for ? formatJobSchedule(job.scheduled_for, job.scheduled_time) : null,
        };

        const arrivalBlock = job.scheduled_for && job.status !== 'complete' && job.status !== 'archived' ? (
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
              canShareLocation={false}
              shareDefaultsOn={false}
              canReschedule
              canSend
              sendAction={sendArrivalOwnerAction.bind(null, job.id)}
              statusAction={setArrivalStatusOwnerAction.bind(null, job.id)}
            />
          </>
        ) : null;

        const milestonesBlock = (
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
        );

        const quoteBreakdownBlock = (
          <section id="quote-breakdown" className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <p className="eyebrow">Quote</p>
                <h2>Quote breakdown</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link href="/dashboard/services" className="btn secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}>
                  📖 Price Book
                </Link>
                <Link href="/dashboard/services/import" className="btn secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}>
                  📥 Import Catalog
                </Link>
              </div>
            </div>
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
        );

        const recurringPlansBlock = pendingPlans.length > 0 ? (
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
        ) : null;

        const punchListBlock = (
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
        );

        const selectionsBlock = (
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
                  {selections.length > 0 ? ` · ${selections.length - selectionStatus.waiting}/${selections.length} chosen` : ''}
                </h2>
              </div>
              <span className={`workspace-details-copy${selectionStatus.overdue > 0 ? ' is-overdue' : ''}`}>
                {selectionStatus.label || 'What the customer has to choose, and what it costs.'}
              </span>
            </summary>
            <SelectionBoard jobId={job.id} selections={selections} templates={selectionTemplates} photos={selectionPhotos} lastSentAt={lastSelectionSent} />
          </details>
        );

        const feedBlock = (
          <section id="job-feed" className="panel workspace-section-card job-feed-command-panel">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
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
                  const canCancelPayment =
                    event.kind === 'payment_requested'
                    && linkedPayment?.status === 'requested'
                    && isLegacyDestinationPayment(linkedPayment);
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
        );

        const paymentInvoiceBlock = (
          <details id="request-payment" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'payment' || layout === 'tabs'}>
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
                  <Link href="/dashboard/settings#payouts">Connect Stripe in Settings →</Link>
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
                        {!isLegacyDestinationPayment(payment) ? ' · connected-account checkout' : null}
                        {(payment.status === 'requested' || payment.status === 'processing') && isLegacyDestinationPayment(payment) ? (
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
                        canRefund={Boolean(payment.stripe_payment_intent) && isLegacyDestinationPayment(payment)}
                        canUseLegacyRail={isLegacyDestinationPayment(payment)}
                        amount={Number(payment.amount)}
                        refundedAmount={Number(payment.refunded_amount) || 0}
                      />
                      {(payment.status === 'requested' || payment.status === 'processing') && isLegacyDestinationPayment(payment) ? (
                        <CopyLinkButton url={`${quoteLinkOrigin}/pay/${payment.id}`} label="Copy pay link" />
                      ) : null}
                      {isLegacyDestinationPayment(payment) && payment.sms_events?.some((event) => event.event_type === 'payment_requested' && event.status === 'failed') && (
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
        );

        const jobDetailsAndCrewBlock = (
          <details id="job-details" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.edit === 'client' || layout === 'tabs'}>
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Overview</p>
                <h2>Job details &amp; settings</h2>
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

            {role === 'owner' ? (
              <div className="workspace-danger-zone">
                <p className="eyebrow danger-eyebrow">
                  Danger zone
                </p>
                <p className="job-meta workspace-danger-copy">
                  Deleting a job permanently removes it and all of its logged costs.
                </p>
                <DeleteJobButton action={boundDeleteJob} />
              </div>
            ) : null}
          </details>
        );

        const schedulingBlock = (
          <details id="job-scheduling" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'scheduling' || layout === 'tabs'}>
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
        );

        const expensesBlock = role === 'owner' ? (
          <details className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'costs' || layout === 'tabs'}>
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Expenses</p>
                <h2>Job expenses</h2>
              </div>
              <span className="workspace-details-copy">Log materials, labor, subcontractors, receipts, and other costs.</span>
            </summary>

            <div className="cost-add-row" style={{ marginBottom: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <ModalDialog triggerClassName="btn secondary" triggerLabel="+ Add expense" title="Add expense" defaultOpen={searchParams.open === 'costs'}>
                <form action={boundCreateCost} className="cost-form">
                  <JobExpenseFields crew={crew} onReadReceipt={readReceiptAction} />
                  <div style={{ marginTop: '0.8rem' }}>
                    <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                  </div>
                  <CloseOnSuccess />
                </form>
              </ModalDialog>
              <Link href="/dashboard/expenses" className="btn secondary" style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}>
                💳 View all company expenses →
              </Link>
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
        ) : null;

        const warrantyBlock = (
          <details className="panel workspace-section-card workspace-details job-action-details" open={(job.status === 'complete' && warranties.length === 0) || searchParams.open === 'warranty'}>
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
            <WarrantyPanel
              jobId={job.id}
              warranties={warranties}
              claims={warrantyClaims}
              defaultMonths={defaultWarrantyMonths}
              businessName={previewBusinessName}
              servicePhone={(arrivalSite?.phone || (arrivalAccount as Record<string, unknown> | null)?.phone || '') as string}
              portalUrl={
                arrivalSite?.custom_domain
                  ? `https://${arrivalSite.custom_domain}/portal`
                  : arrivalSite?.subdomain
                  ? `https://${arrivalSite.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}/portal`
                  : `${quoteLinkOrigin}/portal/view/${job.id}`
              }
            />
          </details>
        );

        const changeOrdersBlock = changeOrders.length > 0 ? (
          <details id="change-orders" className="panel workspace-section-card workspace-details job-action-details" open={changeOrderTotals(changeOrders).unsent > 0 || layout === 'tabs'}>
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Extra work</p>
                <h2>Change orders</h2>
              </div>
              <span className="workspace-details-copy">
                {(() => {
                  const totals = changeOrderTotals(changeOrders);
                  if (totals.unsent > 0) return `${formatMoney(totals.unsent)} written up and not sent yet.`;
                  if (totals.awaiting > 0) return `${formatMoney(totals.awaiting)} waiting on the customer.`;
                  if (totals.approved > 0) return `${formatMoney(totals.approved)} approved and added to this job.`;
                  return 'Extra work found on site.';
                })()}
              </span>
            </summary>
            <ChangeOrderPanel jobId={job.id} orders={changeOrders} />
          </details>
        ) : null;

        const lienWaiverBlock = (
          <details className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'lien-waiver' || job.status === 'complete'}>
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Legal &amp; billing protection</p>
                <h2>Lien waivers</h2>
              </div>
              <span className="workspace-details-copy">
                Statutory conditional &amp; unconditional release forms for progress draws and job closeout.
              </span>
            </summary>
            <LienWaiverPanel
              jobId={job.id}
              jobRef={job.ref}
              clientName={job.client_name}
              address={job.address}
              jobStatus={job.status}
              suggestedAmount={margin.revenue || 0}
            />
          </details>
        );

        const roiBlock = role === 'owner' ? (
          <details className="panel workspace-section-card workspace-details job-action-details" open={layout === 'tabs'}>
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
        ) : null;

        const overviewPane = (
          <>
            {arrivalBlock}
            {feedBlock}
          </>
        );

        const financialsPane = (
          <>
            <div className="job-financial-overview-grid">
              <div className="job-financial-metric-card">
                <span className="metric-label">Quoted / Approved</span>
                <span className="metric-val">{formatMoneyExact(money.approvedCents / 100)}</span>
              </div>
              <div className="job-financial-metric-card">
                <span className="metric-label">Collected</span>
                <span className="metric-val" style={{ color: 'var(--good, #22c55e)' }}>{formatMoneyExact(money.paidCents / 100)}</span>
              </div>
              <div className="job-financial-metric-card">
                <span className="metric-label">Remaining Due</span>
                <span className="metric-val" style={{ color: money.remainingCents > 0 ? 'var(--accent, #ff7a21)' : 'var(--muted, #94a3b8)' }}>{formatMoneyExact(money.remainingCents / 100)}</span>
              </div>
              {role === 'owner' ? (
                <div className="job-financial-metric-card">
                  <span className="metric-label">Net Profit ({formatPercent(margin.margin)} ROI)</span>
                  <span className="metric-val" style={{ color: margin.profit >= 0 ? 'var(--good, #22c55e)' : 'var(--bad, #ef4444)' }}>{formatMoney(margin.profit)}</span>
                </div>
              ) : null}
            </div>
            {quoteBreakdownBlock}
            {recurringPlansBlock}
            {paymentInvoiceBlock}
            {expensesBlock}
            {changeOrdersBlock}
            {lienWaiverBlock}
            {roiBlock}
          </>
        );

        const formsBlock = (
          <JobFormsPanel
            jobId={job.id}
            jobRef={job.ref}
            clientName={job.client_name}
            initialSubmissions={jobFormSubmissions}
            availableTemplates={availableFormTemplates}
            attachFormAction={attachJobFormAction}
            requestSignatureAction={requestCustomerSignatureAction}
          />
        );

        const executionPane = (
          <>
            {milestonesBlock}
            {formsBlock}
            {punchListBlock}
            <div className="panel workspace-section-card">
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
          </>
        );

        const permitsBlock = (
          <section id="permits" className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Intelligence &amp; Compliance</p>
              <h2>Permits &amp; Property Intel</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.75rem' }}>
              {job.address ? (
                <>
                  <PropertyDossierCard address={job.address} scope={job.scope} />
                  <PermitFeasibilityCard address={job.address} />
                </>
              ) : null}
              <PermitWorkspace
                jobId={job.id}
                address={job.address}
                headingLevel={3}
              />
            </div>
          </section>
        );

        const permitsPane = permitsBlock;
        const selectionsPane = selectionsBlock;

        const settingsPane = (
          <>
            {schedulingBlock}
            {jobDetailsAndCrewBlock}
            {warrantyBlock}
          </>
        );

        const classicContent = (
          <>
            <nav className="job-subnav" aria-label="Jump to a section">
              <a href="#job-top">Overview</a>
              <a href="#checklist">Work</a>
              <a href="#permits">Permits</a>
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
            {arrivalBlock}
            {milestonesBlock}
            {formsBlock}
            {permitsBlock}
            {quoteBreakdownBlock}
            {recurringPlansBlock}
            {punchListBlock}
            {selectionsBlock}
            {feedBlock}
            {paymentInvoiceBlock}
            {jobDetailsAndCrewBlock}
            {schedulingBlock}
            <section id="job-costs" className="workspace-grid">
              {expensesBlock}
              {warrantyBlock}
              {changeOrdersBlock}
              {lienWaiverBlock}
              {roiBlock}
            </section>
          </>
        );

        return (
          <JobDetailWorkspace
            jobId={job.id}
            layout={layout}
            initialTab={initialTab}
            badges={tabBadges}
            overviewPane={overviewPane}
            financialsPane={financialsPane}
            executionPane={executionPane}
            permitsPane={permitsPane}
            selectionsPane={selectionsPane}
            settingsPane={settingsPane}
            classicContent={classicContent}
          />
        );
      })()}

    </main>
    </ScrollTopOnSaveProvider>
  );
}


