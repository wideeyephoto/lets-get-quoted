import type { SupabaseClient } from '@supabase/supabase-js';
import { expandScheduledJobs, formatMoney, listJobs, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { getLeadTriage, listLeads } from '@/lib/leads';
import { isLeadActive } from '@/lib/lead-queue';
import { listActiveScheduleRequests } from '@/lib/scheduling';
import { getAutomationActivity } from '@/lib/automation-activity';
import { countRebookCandidates } from '@/lib/rebook';
import { countRecentPrivateFeedback } from '@/lib/reviews';
import { getSiteContent } from '@/lib/site-content';
import { leadNeedsYouBreakdown, leadSummary } from '@/lib/lead-summary';
import { recommendBlogTopic } from '@/lib/blog-topics';
import { collectSchedulingIssues, schedulingIssueBreakdown } from '@/lib/scheduling-issues';
import { addZonedDays, resolvePayPeriod, startOfDay, zonedDateKey } from '@/lib/labor';
import {
  collectedInWindow,
  outstandingInvoices,
  quotesAwaitingApproval,
  scheduledWorkValue,
  type InvoiceRow,
  type PaymentRow,
  type QuotedJobRow,
} from '@/lib/dashboard-money';

/**
 * Everything the dashboard home derives.
 *
 * Lifted out of the page so the logged-out demo can compute the same figures.
 * The home page is a set of counts that have to agree with each other — the
 * priority list, the week strip and the onboarding checklist all read the same
 * jobs and leads — and a demo that re-derived them by hand would drift exactly
 * where it is most visible, on the first screen a prospect sees.
 *
 * Pure reads. `expireStaleLeads` deliberately stays on the page: it WRITES, and
 * the demo has nothing to write to.
 */

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * `detail` stays on the card; `info` moves behind the ⓘ.
 *
 * The split is not cosmetic. `detail` is live information you decide with —
 * which leads came from the website, which dates a client turned down — and
 * hiding it behind an icon costs a hover to read your own numbers. `info`
 * explains what the row MEANS, which is worth one read and then never again,
 * and spending a permanent line on it is what made these cards long.
 */
export type PriorityItem = { key: string; label: string; detail?: string; info?: string; href: string; cta: string };
export type OnboardingStep = { key: string; label: string; description: string; done: boolean; href: string; cta: string };

export type DashboardHome = {
  jobs: Job[];
  crew: Awaited<ReturnType<typeof listCrew>>;
  assignmentsByJob: Record<string, string[]>;
  automation: Awaited<ReturnType<typeof getAutomationActivity>>;
  rebookDue: number;
  privateFeedback: number;

  onboarded: boolean;
  connectDisabledAt: string | null;
  dailyDigestOn: boolean;
  reviewsOn: boolean;
  followupsOn: boolean;
  remindersOn: boolean;
  sitePublished: boolean;
  siteUrl: string | null;
  /** For the "Online booking page" button, which links to /book/<subdomain>. */
  bookingSubdomain: string | null;

  blogReminderWeeks: number;
  publishedBlogCount: number;
  lastPublishedBlogISO: string | null;
  blogTopicSuggestion: ReturnType<typeof recommendBlogTopic>;

  onboardingSteps: OnboardingStep[];
  completedStepCount: number;
  onboardingComplete: boolean;

  leadStats: ReturnType<typeof leadSummary>;
  todayKey: string;
  next7Days: { dateKey: string; label: string; shortLabel: string; jobs: ScheduledJobOccurrence<Job>[] }[];
  quietDays: { dateKey: string; label: string; shortLabel: string; jobs: ScheduledJobOccurrence<Job>[] }[];
  jobsNext7Days: number;
  jobsNeedingCrewCount: number;
  jobsMissingTimeCount: number;
  unscheduledJobCount: number;
  /**
   * Distinct jobs with at least one scheduling problem — the SIZE OF A UNION of
   * the three counts above, never their sum. See lib/scheduling-issues.
   */
  schedulingIssueCount: number;
  stuckScheduleCount: number;

  /** What the contractor is owed, net of deposits and part-payments. */
  outstanding: { total: number; count: number };
  /** Priced jobs still at the quote stage, and what they add up to. */
  openQuotes: { total: number; count: number };
  /** Quoted value of approved work on the calendar in the next 30 days. */
  bookedWork: { total: number; count: number };
  /** Paid, net of refunds, inside the account's own calendar month. */
  collectedThisMonth: { total: number; count: number };
  /** The month that figure covers — "August 2026", in the account's zone. */
  collectedMonthLabel: string;

  topPriorities: PriorityItem[];
  restPriorities: PriorityItem[];
  /** Waiting on the customer, not on the owner. Never mixed into the priorities. */
  waitingItems: PriorityItem[];
};

export async function buildDashboardHome(
  supabase: SupabaseClient,
  accountId: string,
  options: { rootDomain: string; basePath?: string },
): Promise<DashboardHome> {
  const basePath = options.basePath ?? '/dashboard';

  // ── EVERYTHING THAT DEPENDS ON NOTHING ────────────────────────────────────
  //
  // This was four waves. Only two of the reads in the later ones ever needed a
  // result from an earlier one — the crew assignments want the scheduled jobs,
  // and the schedule requests want the unscheduled ones — so the rest were
  // waiting for no reason. The crew, the automation activity, the rebook and
  // feedback counts and BOTH money reads are answered from the account id
  // alone, which is known before any of this starts.
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
    { data: paidRows },
  ] = await Promise.all([
    supabase.from('accounts').select('connect_onboarded, connect_disabled_at, schedule_day_hours, daily_digest_enabled, auto_review_request, quote_followups_enabled, appointment_reminders_enabled, booking_weekdays, timezone').eq('id', accountId).single(),
    supabase.auth.getUserIdentities(),
    supabase.from('sites').select('published, subdomain, custom_domain, custom_domain_verified_at, content').eq('account_id', accountId).maybeSingle(),
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    listCrew(supabase, accountId, { activeOnly: true }),
    getAutomationActivity(supabase, accountId),
    countRebookCandidates(supabase, accountId),
    countRecentPrivateFeedback(supabase, accountId),
    supabase.from('invoices').select('id, total, status, job_id').eq('account_id', accountId).in('status', ['sent', 'signed']),
    // Two windows come out of one read: the calendar month, and the invoice
    // netting, which needs every payment ever made against an open invoice
    // rather than only this month's. Bounded by status so it stays a small set.
    supabase.from('payments').select('amount, refunded_amount, status, paid_at, invoice_id').eq('account_id', accountId).eq('status', 'paid'),
  ]);

  const onboarded = account?.connect_onboarded ?? false;
  // Distinct from "never onboarded": Stripe disabled transfers on an account
  // that was previously working, so the contractor can no longer be paid until
  // they resolve it. This warrants a prominent alert, not the generic nudge.
  const connectDisabledAt = account?.connect_disabled_at ?? null;
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const linkedMethodCount = identityData?.identities?.length ?? 1;
  const sitePublished = site?.published ?? false;

  // Blog publishing reminder (owner-set cadence in the builder's Blog section).
  const siteContentForBlog = site?.content ? getSiteContent(site.content as Record<string, unknown>) : null;
  const blogContent = siteContentForBlog?.blog ?? null;
  const publishedBlogCount = blogContent ? blogContent.posts.filter((post) => post.status === 'published').length : 0;

  const siteUrl = sitePublished && site
    ? site.custom_domain && site.custom_domain_verified_at
      ? `https://${site.custom_domain}`
      : site.subdomain
        ? `https://${site.subdomain}.${options.rootDomain}`
        : null
    : null;

  const onboardingSteps: OnboardingStep[] = [
    { key: 'login', label: 'Add a backup sign-in method', description: "So you're never locked out of your business.", done: linkedMethodCount > 1, href: `${basePath}/settings`, cta: 'Add a backup method' },
    { key: 'website', label: 'Build your website', description: 'Design and publish your contractor site — the fun part!', done: sitePublished, href: `${basePath}/sites`, cta: 'Build your site' },
    { key: 'stripe', label: 'Connect Stripe payouts', description: 'Get paid directly for deposits and stage payments.', done: onboarded, href: `${basePath}/settings`, cta: 'Connect Stripe' },
    { key: 'clients', label: 'Import your customers', description: 'Bring your existing customer list over from a spreadsheet.', done: (clientCount ?? 0) > 0, href: `${basePath}/clients/import`, cta: 'Import customers' },
    { key: 'first-job', label: 'Create your first job', description: 'Turn a lead into a quote and get the work on your calendar.', done: jobs.length > 0, href: `${basePath}/jobs`, cta: 'Create a job' },
  ];
  const completedStepCount = onboardingSteps.filter((step) => step.done).length;

  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(
    scheduledJobs,
    scheduleDayHours,
    normalizeBookingWeekdays((account as { booking_weekdays?: unknown } | null)?.booking_weekdays),
  );
  const now = new Date();

  // One lead figure with its parts, rather than three totals in three places.
  // See lib/lead-summary for why the split is "whose move is it" rather than
  // status.
  //
  // Counted over the ACTIVE leads. Archive and Snooze only write into the
  // triage blob, so this used to count a lead the owner had put down — the card
  // said "3 lead follow-ups", the Leads page it linked to showed none of them,
  // and it did that for as long as the snooze ran. Same predicate the Leads
  // page splits its board with; see lib/lead-queue.
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
      // Just the weekday, for the "Clear: Wed, Thu, Sat" line — the date is
      // noise in a list whose whole job is to be skimmed past.
      shortLabel: index === 0 ? 'today' : day.toLocaleDateString('en-US', { weekday: 'short' }),
      jobs: jobsByDate.get(dateKey) ?? [],
    };
  });

  const unscheduledActiveJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived' && !job.scheduled_for);

  // ── THE ONLY TWO READS THAT HAD TO WAIT ───────────────────────────────────
  // Both are keyed on a list of job ids, and the job list is what the wave
  // above went and got. Everything else on this page now runs before them
  // rather than behind them.
  //
  // The second counts jobs whose LATEST live schedule request is "needs more
  // options" — a raw count of needs_more_options rows would over-count (the
  // status is never cleared once set) and disagree with the schedule board,
  // which dedupes to the latest request per job via the same helper.
  const [assignmentsByJob, scheduleRequestByJob] = await Promise.all([
    listCrewAssignmentsForJobs(supabase, accountId, scheduledJobs.map((job) => job.id)),
    listActiveScheduleRequests(supabase, accountId, unscheduledActiveJobs.map((job) => job.id)),
  ]);
  const stuckScheduleCount = Object.values(scheduleRequestByJob).filter((request) => request.status === 'needs_more_options').length;

  // ONE JOB, ONE ISSUE — see lib/scheduling-issues for the two over-counts this
  // replaces. The headline is the size of a union; the three reason lists are
  // still their own honest lengths and will add up to more than it.
  const schedulingIssues = collectSchedulingIssues({
    windowOccurrences: next7Days.flatMap((day) => day.jobs),
    assignmentsByJob,
    unscheduledJobIds: unscheduledActiveJobs.map((job) => job.id),
  });
  const jobsNeedingCrewCount = schedulingIssues.needsCrew.length;
  const jobsMissingTimeCount = schedulingIssues.missingTime.length;
  const unscheduledJobCount = schedulingIssues.unscheduled.length;
  const schedulingIssueCount = schedulingIssues.all.length;

  // -- Money -------------------------------------------------------------------
  //
  // Four reads, three pure calculators, and BOTH date windows — the calendar
  // month and the 30-day booked horizon — cut in the ACCOUNT'S zone rather than
  // the server's. See lib/dashboard-money for why each definition is the one it
  // is.
  //
  // The horizon used to be read off the server clock while the month beside it
  // was not. On a UTC server the two disagree for the last hours of a Pacific
  // owner's day, and both edges of the window moved a day: it opened on tomorrow,
  // dropping a job that is on today's calendar out of "booked", and closed on day
  // 31. scheduledWorkValue compares date keys as strings and says its caller
  // supplies days already cut in the account's zone — this is the caller doing it.
  const timeZone = (account?.timezone as string) || 'America/New_York';
  const thisMonth = resolvePayPeriod('monthly', 0, { now, timeZone });
  const accountToday = startOfDay(now, timeZone);
  const bookedFromKey = zonedDateKey(accountToday, timeZone);
  const bookedToKey = zonedDateKey(addZonedDays(accountToday, 30, timeZone), timeZone);

  // The two reads behind these figures came up in the opening wave: both are
  // keyed on the account alone, and only the DATE WINDOWS below need the
  // account's timezone. Cutting the windows here and the rows there is the
  // whole trick — nothing about the queries depended on the clock.
  const outstanding = outstandingInvoices((invoiceRows ?? []) as InvoiceRow[], (paidRows ?? []) as PaymentRow[]);
  const openQuotes = quotesAwaitingApproval(jobs as unknown as QuotedJobRow[]);
  const bookedWork = scheduledWorkValue(jobs as unknown as QuotedJobRow[], bookedFromKey, bookedToKey);
  const collectedThisMonth = collectedInWindow((paidRows ?? []) as PaymentRow[], thisMonth.startIso, thisMonth.endIso);

  // Setup tasks (Stripe, website) live in the onboarding checklist and the
  // topbar pills — keeping them out of the priority list stops the triple-listing
  // and prevents the cap from bumping real operational work.
  // Annotated as the nullable union rather than PriorityItem[]: now that some
  // rows carry `detail` and others carry `info`, TypeScript infers a union of
  // two object shapes for the literal and will not widen it to the optional-
  // property type on its own.
  //
  // ACT NOW vs WAITING — the split is "is this my move?"
  //
  // These were one list, and it put "5 leads need your attention" next to
  // "2 quotes awaiting approval" as though they were the same kind of thing.
  // They are not. One is work nobody can do but you; the other is a customer
  // taking their time, and with quote follow-ups switched on the app is already
  // chasing it on a schedule. A to-do list that includes things you cannot do is
  // a list people stop reading.
  const priorityCandidates: (PriorityItem | null)[] = [
    leadStats.needsYou > 0
      ? {
          key: 'leads',
          // "need you", not "waiting" — the page carries a second lead figure
          // for the ones waiting on the CUSTOMER, and two rows both saying
          // "waiting" is how the counts stopped meaning anything.
          label: `${leadStats.needsYou} lead follow-up${leadStats.needsYou === 1 ? '' : 's'}`,
          // Every lead in the headline is accounted for here. This used to name
          // only the website ones, so a card reading "5 leads need your
          // attention · 2 website leads are waiting" left three unexplained.
          detail: leadNeedsYouBreakdown(leadStats),
          href: `${basePath}/leads`,
          cta: 'Review leads',
        }
      : null,
    // THE SEVEN. One row, the size of the union, with the reasons underneath —
    // never three rows the reader is invited to add up.
    schedulingIssueCount > 0
      ? {
          key: 'scheduling',
          label: `${schedulingIssueCount} scheduling issue${schedulingIssueCount === 1 ? '' : 's'}`,
          detail: schedulingIssueBreakdown(schedulingIssues) ?? undefined,
          href: `${basePath}/schedule#unscheduled-jobs`,
          cta: 'Open the schedule',
        }
      : null,
    // A customer who passed on the dates you sent is waiting on YOU for new
    // ones, so this is an action, not a wait — which is why it is not in the
    // WAITING list below despite also being about a schedule request.
    stuckScheduleCount > 0
      ? { key: 'schedule-response', label: `${stuckScheduleCount} client${stuckScheduleCount === 1 ? '' : 's'} want${stuckScheduleCount === 1 ? 's' : ''} different dates`, detail: 'They passed on the times you sent — send a fresh set of dates.', href: `${basePath}/schedule#unscheduled-jobs`, cta: 'Send new dates' }
      : null,
    outstanding.count > 0
      ? {
          key: 'unpaid',
          label: `${formatMoney(outstanding.total)} in unpaid invoices`,
          detail: `${outstanding.count} invoice${outstanding.count === 1 ? '' : 's'} still owed, after deposits and part-payments.`,
          // ?owing=1 opens the jobs queue on "Most owed" rather than on the
          // date order, so the rows this figure is about are the rows at the
          // top. A bare /jobs sent the reader to a list sorted by when the work
          // is, where the invoices they came to chase are scattered through it.
          href: `${basePath}/jobs?owing=1`,
          cta: 'Chase payment',
        }
      : null,
  ];
  const priorityItems: PriorityItem[] = priorityCandidates.filter((item): item is PriorityItem => Boolean(item));

  // Things the customer owes YOU a move on. Named for the wait, with what the
  // app is doing about it — an owner who knows follow-ups are running does not
  // need to do anything with this row, which is the whole point of separating it.
  const waitingItems: PriorityItem[] = ([
    openQuotes.count > 0
      ? {
          key: 'quoted',
          label: `${openQuotes.count} quote${openQuotes.count === 1 ? '' : 's'} awaiting approval`,
          detail: `${formatMoney(openQuotes.total)} out with customers. ${
            // The one fact that decides whether this row is a task or a note.
            Boolean((account as { quote_followups_enabled?: boolean } | null)?.quote_followups_enabled)
              ? 'Automatic follow-ups are on.'
              : 'Automatic follow-ups are off — chasing these is manual.'
          }`,
          href: `${basePath}/jobs`,
          cta: 'Review quotes',
        }
      : null,
  ] as (PriorityItem | null)[]).filter((item): item is PriorityItem => Boolean(item));

  return {
    jobs,
    crew,
    assignmentsByJob,
    automation,
    rebookDue,
    privateFeedback,
    onboarded,
    connectDisabledAt,
    dailyDigestOn: Boolean((account as { daily_digest_enabled?: boolean } | null)?.daily_digest_enabled),
    reviewsOn: Boolean((account as { auto_review_request?: boolean } | null)?.auto_review_request),
    followupsOn: Boolean((account as { quote_followups_enabled?: boolean } | null)?.quote_followups_enabled),
    remindersOn: Boolean((account as { appointment_reminders_enabled?: boolean } | null)?.appointment_reminders_enabled),
    sitePublished,
    siteUrl,
    bookingSubdomain: sitePublished ? ((site?.subdomain as string | null) ?? null) : null,
    blogReminderWeeks: blogContent?.reminderWeeks ?? 0,
    publishedBlogCount,
    lastPublishedBlogISO: blogContent
      ? blogContent.posts.filter((post) => post.status === 'published' && post.date).map((post) => post.date).sort().slice(-1)[0] ?? null
      : null,
    blogTopicSuggestion: recommendBlogTopic(siteContentForBlog?.trade, publishedBlogCount),
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
    // Three, then the rest behind a disclosure. The page is five phone screens
    // tall and opens with a list that can run to six rows before anything else
    // starts; three is what fits above the fold with the heading.
    topPriorities: priorityItems.slice(0, 3),
    restPriorities: priorityItems.slice(3),
    waitingItems,
  };
}
