import type { SupabaseClient } from '@supabase/supabase-js';
import { expandScheduledJobs, listJobs } from '@/lib/jobs';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { getLeadTriage, listLeads } from '@/lib/leads';
import { isLeadActive } from '@/lib/lead-queue';
import { listActiveScheduleRequests } from '@/lib/scheduling';
import { getAutomationActivity } from '@/lib/automation-activity';
import { countRebookCandidates } from '@/lib/rebook';
import { countRecentPrivateFeedback } from '@/lib/reviews';
import { leadSummary } from '@/lib/lead-summary';
import { recommendBlogTopic } from '@/lib/blog-topics';
import { collectSchedulingIssues } from '@/lib/scheduling-issues';
import { addZonedDays, resolvePayPeriod, startOfDay, zonedDateKey } from '@/lib/labor';
import { buildContactIdentityMapFromRows } from '@/lib/messages';
import {
  collectedInWindow,
  outstandingInvoices,
  quotesAwaitingApproval,
  scheduledWorkValue,
  type InvoiceRow,
  type PaymentRow,
  type QuotedJobRow,
} from '@/lib/dashboard-money';

import type { DashboardHome, OnboardingStep } from '@/lib/dashboard-types';
import { loadSystemStatus } from '@/lib/dashboard/system-status-loader';
import { buildPriorityQueue } from '@/lib/dashboard/attention-loader';
import { buildTodaySchedule } from '@/lib/dashboard/schedule-loader';
import { buildBusinessPulse } from '@/lib/dashboard/pulse-loader';
import { buildCapacitySummary } from '@/lib/dashboard/capacity-loader';
import { buildJobReadiness } from '@/lib/dashboard/readiness-loader';
import { loadCrewStatus } from '@/lib/dashboard/crew-status-loader';
import { loadCommunications } from '@/lib/dashboard/communications-loader';
import { buildAutomationSummary } from '@/lib/dashboard/automation-loader';
import { findBestOpportunity } from '@/lib/dashboard/opportunity-loader';
import { buildPipelineSummary } from '@/lib/dashboard/pipeline-loader';
import { buildCashPreview } from '@/lib/dashboard/cash-preview-loader';

export type { DashboardHome, PriorityItem, OnboardingStep } from '@/lib/dashboard-types';

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function buildDashboardHome(
  supabase: SupabaseClient,
  accountId: string,
  options: { rootDomain: string; basePath?: string; account?: unknown },
): Promise<DashboardHome> {
  const basePath = options.basePath ?? '/dashboard';
  const now = new Date();

  // ── WAVE 1: EVERYTHING THAT DEPENDS ON ACCOUNT ID ALONE ────────────────────
  const accountPromise = options.account !== undefined
    ? Promise.resolve({ data: options.account as Record<string, unknown> | null })
    : supabase
        .from('accounts')
        .select(
          'connect_onboarded, connect_disabled_at, schedule_day_hours, daily_digest_enabled, auto_review_request, quote_followups_enabled, appointment_reminders_enabled, booking_weekdays, timezone',
        )
        .eq('id', accountId)
        .single();

  const initialTimeZone = ((options.account as { timezone?: string | null } | null)?.timezone as string) || 'America/New_York';
  const initialMonth = resolvePayPeriod('monthly', 0, { now, timeZone: initialTimeZone });

  const [
    { data: account },
    { data: identityData },
    { data: site },
    jobs,
    leads,
    { count: clientCount },
    crew,
    automation,
    rebookDue,
    privateFeedback,
    { data: invoiceRows },
    { data: thisMonthPaidRows },
  ] = await Promise.all([
    accountPromise,
    supabase.auth.getUserIdentities(),
    supabase
      .from('sites')
      .select('published, subdomain, custom_domain, custom_domain_verified_at, content')
      .eq('account_id', accountId)
      .maybeSingle(),
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    listCrew(supabase, accountId, { activeOnly: true }),
    getAutomationActivity(supabase, accountId),
    countRebookCandidates(supabase, accountId),
    countRecentPrivateFeedback(supabase, accountId),
    supabase.from('invoices').select('id, total, status, job_id').eq('account_id', accountId).in('status', ['sent', 'signed']),
    // Date-bounded read for this month's revenue tile
    supabase
      .from('payments')
      .select('amount, refunded_amount, status, paid_at')
      .eq('account_id', accountId)
      .eq('status', 'paid')
      .gte('paid_at', initialMonth.startIso)
      .lt('paid_at', initialMonth.endIso),
  ]);

  const onboarded = (account as { connect_onboarded?: boolean | null } | null)?.connect_onboarded ?? false;
  const connectDisabledAt = (account as { connect_disabled_at?: string | null } | null)?.connect_disabled_at ?? null;
  const scheduleDayHours = Number((account as { schedule_day_hours?: unknown } | null)?.schedule_day_hours) || 8;
  const linkedMethodCount = identityData?.identities?.length ?? 1;
  const sitePublished = site?.published ?? false;

  // Lightweight extraction of blog and trade without normalizing the ~40-section website builder graph
  const rawContent = (site?.content as { blog?: { reminderWeeks?: number; posts?: Array<{ status?: string; date?: string }> }; trade?: string } | null) ?? null;
  const rawBlog = rawContent?.blog;
  const blogPosts = Array.isArray(rawBlog?.posts) ? rawBlog.posts : [];
  const publishedBlogPosts = blogPosts.filter((post) => post.status === 'published');
  const publishedBlogCount = publishedBlogPosts.length;
  const blogReminderWeeks = [2, 4, 8].includes(Number(rawBlog?.reminderWeeks)) ? Number(rawBlog?.reminderWeeks) : 0;
  const lastPublishedBlogISO = publishedBlogPosts
    .map((post) => post.date)
    .filter((d): d is string => Boolean(d))
    .sort()
    .slice(-1)[0] ?? null;
  const siteTrade = typeof rawContent?.trade === 'string' && rawContent.trade.trim() ? rawContent.trade.trim() : undefined;

  const siteUrl = sitePublished && site
    ? site.custom_domain && site.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site.subdomain
        ? `https://${site.subdomain}.${options.rootDomain}`
        : null
    : null;

  const onboardingSteps: OnboardingStep[] = [
    { key: 'website', label: 'Build and launch your website', description: 'Design and publish your free contractor site — customize your trade photos and services.', done: sitePublished, href: `${basePath}/sites`, cta: 'Build your site' },
    { key: 'text-to-job', label: 'Save dispatch line & try Text-to-Job', description: 'Save the company field texting line to your phone contacts and text your first job update.', done: sitePublished || jobs.length > 0, href: `/features/text-to-job`, cta: 'Try Text-to-Job' },
    { key: 'stripe', label: 'Connect Stripe payouts', description: 'Get paid directly for client deposits and stage payments.', done: onboarded, href: `${basePath}/settings`, cta: 'Connect Stripe' },
    { key: 'clients', label: 'Import your customers', description: 'Bring your existing customer list over from a spreadsheet.', done: (clientCount ?? 0) > 0, href: `${basePath}/clients/import`, cta: 'Import customers' },
    { key: 'first-job', label: 'Create your first job & quote', description: 'Turn a lead into an interactive quote and get the work on your calendar.', done: jobs.length > 0, href: `${basePath}/jobs`, cta: 'Create a job' },
    { key: 'login', label: 'Add a backup sign-in method', description: "So you're never locked out of your business.", done: linkedMethodCount > 1, href: `${basePath}/settings`, cta: 'Add a backup method' },
  ];
  const completedStepCount = onboardingSteps.filter((step) => step.done).length;

  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(
    scheduledJobs,
    scheduleDayHours,
    normalizeBookingWeekdays((account as { booking_weekdays?: unknown } | null)?.booking_weekdays),
  );

  const activeLeads = leads.filter((lead) => isLeadActive({ status: lead.status, triage: getLeadTriage(lead) }, now));
  const leadStats = leadSummary(activeLeads);

  const jobsByDate = new Map<string, typeof scheduledJobOccurrences>();
  for (const job of scheduledJobOccurrences) {
    const key = job.scheduled_for;
    const bucket = jobsByDate.get(key) ?? [];
    bucket.push(job);
    jobsByDate.set(key, bucket);
  }

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const next7Days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    const dateKey = toDateKey(day.getFullYear(), day.getMonth(), day.getDate());
    return {
      dateKey,
      label: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      shortLabel: index === 0 ? 'today' : day.toLocaleDateString('en-US', { weekday: 'short' }),
      jobs: jobsByDate.get(dateKey) ?? [],
    };
  });

  const unscheduledActiveJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived' && !job.scheduled_for);

  // ── WAVE 2: READS DEPENDING ON WAVE 1 RESULTS ──────────────────────────────
  const openInvoiceIds = (invoiceRows ?? []).map((row) => row.id).filter(Boolean);
  const openInvoicePaymentsPromise = openInvoiceIds.length > 0
    ? supabase
        .from('payments')
        .select('amount, refunded_amount, status, invoice_id')
        .eq('account_id', accountId)
        .eq('status', 'paid')
        .in('invoice_id', openInvoiceIds)
    : Promise.resolve({ data: [] });

  const [assignmentsByJob, scheduleRequestByJob, { data: openInvoicePaidRows }] = await Promise.all([
    listCrewAssignmentsForJobs(supabase, accountId, scheduledJobs.map((job) => job.id)),
    listActiveScheduleRequests(supabase, accountId, unscheduledActiveJobs.map((job) => job.id)),
    openInvoicePaymentsPromise,
  ]);
  const stuckScheduleCount = Object.values(scheduleRequestByJob).filter((request) => request.status === 'needs_more_options').length;

  const schedulingIssues = collectSchedulingIssues({
    windowOccurrences: next7Days.flatMap((day) => day.jobs),
    assignmentsByJob,
    unscheduledJobIds: unscheduledActiveJobs.map((job) => job.id),
  });
  const jobsNeedingCrewCount = schedulingIssues.needsCrew.length;
  const jobsMissingTimeCount = schedulingIssues.missingTime.length;
  const unscheduledJobCount = schedulingIssues.unscheduled.length;
  const schedulingIssueCount = schedulingIssues.all.length;

  // Money calculations
  const timeZone = ((account as { timezone?: string | null } | null)?.timezone as string) || initialTimeZone;
  const thisMonth = resolvePayPeriod('monthly', 0, { now, timeZone });
  const accountToday = startOfDay(now, timeZone);
  const bookedFromKey = zonedDateKey(accountToday, timeZone);
  const bookedToKey = zonedDateKey(addZonedDays(accountToday, 30, timeZone), timeZone);

  const outstanding = outstandingInvoices((invoiceRows ?? []) as InvoiceRow[], (openInvoicePaidRows ?? []) as PaymentRow[]);
  const openQuotes = quotesAwaitingApproval(jobs as unknown as QuotedJobRow[]);
  const bookedWork = scheduledWorkValue(jobs as unknown as QuotedJobRow[], bookedFromKey, bookedToKey);
  const collectedThisMonth = collectedInWindow((thisMonthPaidRows ?? []) as PaymentRow[], thisMonth.startIso, thisMonth.endIso);

  const reviewsOn = Boolean((account as { auto_review_request?: boolean } | null)?.auto_review_request);
  const followupsOn = Boolean((account as { quote_followups_enabled?: boolean } | null)?.quote_followups_enabled);
  const remindersOn = Boolean((account as { appointment_reminders_enabled?: boolean } | null)?.appointment_reminders_enabled);
  const dailyDigestOn = Boolean((account as { daily_digest_enabled?: boolean } | null)?.daily_digest_enabled);

  // Modular Loaders execution
  const todayJobs = jobsByDate.get(todayKey) ?? [];
  const todayAssignedCount = todayJobs.filter((j) => (assignmentsByJob[j.id] ?? []).length > 0).length;

  const identities = buildContactIdentityMapFromRows(jobs, leads);

  const [alerts, crewStatus, communications] = await Promise.all([
    loadSystemStatus(supabase, accountId, basePath, account as Record<string, unknown> | null),
    loadCrewStatus(supabase, accountId, crew, todayJobs.length, todayAssignedCount),
    loadCommunications(supabase, accountId, basePath, identities),
  ]);

  const jobsNeedingInfo = jobs.filter(
    (job) =>
      job.status !== 'archived' &&
      job.status !== 'complete' &&
      (!job.address || (!job.client_phone && !job.client_email) || job.quoted_amount <= 0),
  );

  const priorityQueue = buildPriorityQueue({
    leadStats,
    schedulingIssues,
    schedulingIssueCount,
    stuckScheduleCount,
    outstanding,
    openQuotes,
    followupsOn,
    jobsNeedingInfoCount: jobsNeedingInfo.length,
    basePath,
  });

  const todaySchedule = buildTodaySchedule({
    todayJobs,
    crew,
    assignmentsByJob,
    todayKey,
    dateLabel: next7Days[0]?.label || 'Today',
    basePath,
  });

  const thisMonthLeadsCount = leads.filter((l) => {
    const createdAt = new Date(l.created_at).getTime();
    return createdAt >= new Date(thisMonth.startIso).getTime() && createdAt < new Date(thisMonth.endIso).getTime();
  }).length;

  const pulse = buildBusinessPulse({
    collectedThisMonth,
    collectedMonthLabel: thisMonth.label,
    outstanding,
    openQuotes,
    bookedWork,
    newLeadsThisMonthCount: thisMonthLeadsCount,
    basePath,
  });

  const capacity = buildCapacitySummary({
    next7Days,
    todayKey,
    scheduleDayHours,
    unscheduledApprovedJobsCount: unscheduledActiveJobs.length,
  });

  const readiness = buildJobReadiness({
    upcomingOccurrences: next7Days.flatMap((day) => day.jobs),
    assignmentsByJob,
    basePath,
  });

  const automations = buildAutomationSummary({
    automation,
    reviewsOn,
    followupsOn,
    remindersOn,
    dailyDigestOn,
    basePath,
  });

  const opportunity = findBestOpportunity({
    jobs,
    leads,
    outstandingTotal: outstanding.total,
    rebookCount: rebookDue,
    basePath,
  });

  const pipeline = buildPipelineSummary({
    leads,
    jobs,
  });

  const cashPreview = buildCashPreview({
    outstandingTotal: outstanding.total,
    bookedWorkTotal: bookedWork.total,
    horizonDays: 14,
    basePath,
  });

  const priorityItems = priorityQueue.kind === 'ready' ? priorityQueue.data.needsAttention : [];
  const waitingItems = priorityQueue.kind === 'ready' ? priorityQueue.data.waitingOnCustomer : [];

  return {
    // Modular Loadable Modules
    alerts,
    priorityQueue,
    todaySchedule,
    pulse,
    pipeline,
    cashPreview,
    capacity,
    readiness,
    crewStatus,
    communications,
    automations,
    opportunity,

    // Core state & backward compatibility
    jobs,
    crew,
    assignmentsByJob,
    automation,
    rebookDue,
    privateFeedback,
    onboarded,
    connectDisabledAt,
    dailyDigestOn,
    reviewsOn,
    followupsOn,
    remindersOn,
    sitePublished,
    siteUrl,
    bookingSubdomain: sitePublished ? ((site?.subdomain as string | null) ?? null) : null,
    blogReminderWeeks,
    publishedBlogCount,
    lastPublishedBlogISO,
    blogTopicSuggestion: recommendBlogTopic(siteTrade, publishedBlogCount),
    onboardingSteps,
    completedStepCount,
    onboardingComplete: completedStepCount === onboardingSteps.length,
    leadStats,
    todayKey,
    next7Days,
    quietDays: next7Days.filter((day) => day.jobs.length === 0),
    jobsNext7Days: next7Days.reduce((sum, day) => sum + day.jobs.length, 0),
    jobsNeedingCrewCount,
    jobsMissingTimeCount,
    unscheduledJobCount,
    schedulingIssueCount,
    stuckScheduleCount,
    outstanding,
    openQuotes,
    bookedWork,
    collectedThisMonth,
    collectedMonthLabel: thisMonth.label,
    topPriorities: priorityItems.slice(0, 3),
    restPriorities: priorityItems.slice(3),
    waitingItems,
  };
}
