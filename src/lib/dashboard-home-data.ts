import type { SupabaseClient } from '@supabase/supabase-js';
import { expandScheduledJobs, listJobs, type Job, type ScheduledJobOccurrence } from '@/lib/jobs';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { listLeads } from '@/lib/leads';
import { listActiveScheduleRequests } from '@/lib/scheduling';
import { getAutomationActivity } from '@/lib/automation-activity';
import { countRebookCandidates } from '@/lib/rebook';
import { countRecentPrivateFeedback } from '@/lib/reviews';
import { getSiteContent } from '@/lib/site-content';
import { leadSummary } from '@/lib/lead-summary';
import { recommendBlogTopic } from '@/lib/blog-topics';

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

export type PriorityItem = { key: string; label: string; detail: string; href: string; cta: string };
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
  stuckScheduleCount: number;

  topPriorities: PriorityItem[];
  restPriorities: PriorityItem[];
};

export async function buildDashboardHome(
  supabase: SupabaseClient,
  accountId: string,
  options: { rootDomain: string; basePath?: string },
): Promise<DashboardHome> {
  const basePath = options.basePath ?? '/dashboard';

  const [{ data: account }, { data: identityData }, { data: site }, jobs, leads, { count: clientCount }] = await Promise.all([
    supabase.from('accounts').select('connect_onboarded, connect_disabled_at, schedule_day_hours, daily_digest_enabled, auto_review_request, quote_followups_enabled, appointment_reminders_enabled, booking_weekdays').eq('id', accountId).single(),
    supabase.auth.getUserIdentities(),
    supabase.from('sites').select('published, subdomain, custom_domain, custom_domain_verified_at, content').eq('account_id', accountId).maybeSingle(),
    listJobs(supabase, accountId),
    listLeads(supabase, accountId),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
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
  // One lead figure with its parts, rather than three totals in three places.
  // See lib/lead-summary for why the split is "whose move is it" rather than
  // status.
  const leadStats = leadSummary(leads);
  const [crew, assignmentsByJob, automation, rebookDue, privateFeedback] = await Promise.all([
    listCrew(supabase, accountId, { activeOnly: true }),
    listCrewAssignmentsForJobs(supabase, accountId, scheduledJobs.map((job) => job.id)),
    getAutomationActivity(supabase, accountId),
    countRebookCandidates(supabase, accountId),
    countRecentPrivateFeedback(supabase, accountId),
  ]);

  const jobsByDate = new Map<string, typeof scheduledJobOccurrences>();
  for (const job of scheduledJobOccurrences) {
    const key = job.scheduled_for;
    const bucket = jobsByDate.get(key) ?? [];
    bucket.push(job);
    jobsByDate.set(key, bucket);
  }

  const now = new Date();
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

  const jobsNeedingCrewCount = next7Days.reduce(
    (sum, day) => sum + day.jobs.filter((job) => (assignmentsByJob[job.id] ?? []).length === 0).length,
    0,
  );
  const jobsMissingTimeCount = next7Days.reduce((sum, day) => sum + day.jobs.filter((job) => !job.scheduled_time).length, 0);
  const unscheduledActiveJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived' && !job.scheduled_for);

  // Count jobs whose LATEST live schedule request is "needs more options" — a
  // raw count of needs_more_options rows would over-count (the status is never
  // cleared once set) and disagree with the schedule board, which dedupes to
  // the latest request per job via the same helper.
  const scheduleRequestByJob = await listActiveScheduleRequests(supabase, accountId, unscheduledActiveJobs.map((job) => job.id));
  const stuckScheduleCount = Object.values(scheduleRequestByJob).filter((request) => request.status === 'needs_more_options').length;
  const unscheduledJobCount = unscheduledActiveJobs.length;

  // Setup tasks (Stripe, website) live in the onboarding checklist and the
  // topbar pills — keeping them out of the priority list stops the triple-listing
  // and prevents the cap from bumping real operational work.
  const priorityItems: PriorityItem[] = [
    leadStats.needsYou > 0
      ? {
          key: 'leads',
          // "need you", not "waiting" — the page carries a second lead figure
          // for the ones waiting on the CUSTOMER, and two rows both saying
          // "waiting" is how the counts stopped meaning anything.
          label: `${leadStats.needsYou} lead${leadStats.needsYou === 1 ? '' : 's'} need${leadStats.needsYou === 1 ? 's' : ''} you`,
          detail: leadStats.fromWebsite > 0
            ? `${leadStats.fromWebsite} came from your website and ${leadStats.fromWebsite === 1 ? 'has' : 'have'} had no reply yet.`
            : 'Send a quote or follow up before the lead goes cold.',
          href: `${basePath}/leads`,
          cta: 'Review leads',
        }
      : null,
    leadStats.waitingOnCustomer > 0
      ? { key: 'quoted', label: `${leadStats.waitingOnCustomer} quote${leadStats.waitingOnCustomer === 1 ? '' : 's'} awaiting approval`, detail: 'Follow up with homeowners who have not signed off yet.', href: `${basePath}/leads`, cta: 'View quotes' }
      : null,
    stuckScheduleCount > 0
      ? { key: 'schedule-response', label: `${stuckScheduleCount} client${stuckScheduleCount === 1 ? '' : 's'} want${stuckScheduleCount === 1 ? 's' : ''} different dates`, detail: 'They passed on the times you sent — send a fresh set of dates.', href: `${basePath}/schedule#unscheduled-jobs`, cta: 'Send new dates' }
      : null,
    jobsNeedingCrewCount > 0
      ? { key: 'crew', label: `${jobsNeedingCrewCount} scheduled job${jobsNeedingCrewCount === 1 ? '' : 's'} need crew`, detail: 'Assign crew before the work day starts.', href: `${basePath}/schedule`, cta: 'Open schedule' }
      : null,
    jobsMissingTimeCount > 0
      ? { key: 'time', label: jobsMissingTimeCount === 1 ? '1 job needs a start time' : `${jobsMissingTimeCount} jobs need start times`, detail: 'Add start times so the week is easier to run.', href: `${basePath}/schedule`, cta: 'Set times' }
      : null,
    unscheduledJobCount > 0
      ? { key: 'unscheduled', label: `${unscheduledJobCount} open job${unscheduledJobCount === 1 ? '' : 's'} not scheduled`, detail: 'Put approved work on the calendar.', href: `${basePath}/schedule#unscheduled-jobs`, cta: 'Schedule work' }
      : null,
  ].filter((item): item is PriorityItem => Boolean(item));

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
    stuckScheduleCount,
    // Three, then the rest behind a disclosure. The page is five phone screens
    // tall and opens with a list that can run to six rows before anything else
    // starts; three is what fits above the fold with the heading.
    topPriorities: priorityItems.slice(0, 3),
    restPriorities: priorityItems.slice(3),
  };
}
