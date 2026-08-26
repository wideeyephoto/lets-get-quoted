import type { Job, ScheduledJobOccurrence } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import type { leadSummary } from '@/lib/lead-summary';
import type { getAutomationActivity } from '@/lib/automation-activity';
import type { recommendBlogTopic } from '@/lib/blog-topics';
import type { CapacityLevel } from '@/lib/schedule-capacity';

/**
 * Robust Loadable data container.
 * Prevents partial query failures from turning into false "$0" values
 * and ensures a single failed card does not crash the entire dashboard.
 */
export type Loadable<T> =
  | { kind: 'ready'; data: T }
  | { kind: 'unavailable'; reason: 'query_failed' | 'disabled' | 'unsupported' };

export function ready<T>(data: T): Loadable<T> {
  return { kind: 'ready', data };
}

export function unavailable<T>(reason: 'query_failed' | 'disabled' | 'unsupported' = 'query_failed'): Loadable<T> {
  return { kind: 'unavailable', reason };
}

export function isReady<T>(loadable: Loadable<T> | undefined | null): loadable is { kind: 'ready'; data: T } {
  return loadable?.kind === 'ready';
}

/* --------------------------------------------------------------------------
   Section A: Critical System Alerts
   -------------------------------------------------------------------------- */
export type SystemAlertSeverity = 'critical' | 'warning' | 'info';

export type SystemAlert = {
  id: string;
  title: string;
  description: string;
  severity: SystemAlertSeverity;
  actionHref: string;
  actionLabel: string;
};

export type SystemAlertsSummary = {
  alerts: SystemAlert[];
  criticalCount: number;
  warningCount: number;
};

/* --------------------------------------------------------------------------
   Section B: Priority Queue
   -------------------------------------------------------------------------- */
export type PriorityItem = {
  key: string;
  label: string;
  detail?: string;
  info?: string;
  href: string;
  cta: string;
  amount?: number | null;
  ageOrDeadline?: string | null;
  secondaryDetails?: string[];
};

export type PriorityQueueSummary = {
  needsAttention: PriorityItem[];
  waitingOnCustomer: PriorityItem[];
  totalAttentionCount: number;
  totalWaitingCount: number;
};

/* --------------------------------------------------------------------------
   Section C: Today's Schedule Timeline
   -------------------------------------------------------------------------- */
export type TodayJobStatus = 'upcoming' | 'in_progress' | 'complete' | 'delayed';
export type TodayJobReadiness = 'ready' | 'needs_crew' | 'needs_time' | 'blocked';

export type TodayScheduleItem = {
  jobId: string;
  clientName: string;
  jobType: string;
  address: string | null;
  city: string;
  scheduledTime: string | null;
  formattedTime: string;
  assignedCrew: { id: string; name: string; initials: string }[];
  quotedAmount: number;
  status: TodayJobStatus;
  readiness: TodayJobReadiness;
  href: string;
};

export type TodayScheduleSummary = {
  dateLabel: string;
  dateKey: string;
  items: TodayScheduleItem[];
  totalWorkValue: number;
  completedCount: number;
  inProgressCount: number;
  upcomingCount: number;
};

/* --------------------------------------------------------------------------
   Section D: Business Pulse (5 Metrics)
   -------------------------------------------------------------------------- */
export type MetricCardValue = {
  amount?: number;
  count?: number;
  label: string;
  formattedValue: string;
  subtitle: string;
  tooltip: string;
  href: string;
  accent?: boolean;
};

export type BusinessPulse = {
  collectedThisMonth: MetricCardValue;
  outstandingInvoices: MetricCardValue;
  quotesAwaitingApproval: MetricCardValue;
  bookedWorkNext30Days: MetricCardValue;
  newLeadsThisMonth: MetricCardValue;
  monthLabel: string;
};

/* --------------------------------------------------------------------------
   Section E: Sales Pipeline / Activity Funnel
   -------------------------------------------------------------------------- */
export type PipelineStage = {
  id: 'new_leads' | 'contacted' | 'quote_sent' | 'approved' | 'scheduled' | 'complete';
  label: string;
  count: number;
  value?: number;
};

export type PipelineSummary = {
  stages: PipelineStage[];
  avgFirstResponseMinutes: number | null;
  openQuoteValue: number;
  quoteApprovalRatePct: number | null;
  avgJobValue: number;
  oldestUnansweredLeadAge: string | null;
};

/* --------------------------------------------------------------------------
   Section F: Cash Preview
   -------------------------------------------------------------------------- */
export type CashPreviewItem = {
  id: string;
  dateKey: string;
  label: string;
  amount: number;
  type: 'incoming' | 'refund' | 'installment' | 'failed';
};

export type CashPreview = {
  horizonDays: 14 | 30;
  expectedIncoming: number;
  scheduledRefunds: number;
  failedInstallments: number;
  outstandingInvoiceBalance: number;
  netExpectedCash: number;
  upcomingMovements: CashPreviewItem[];
  href: string;
};

/* --------------------------------------------------------------------------
   Section G: Capacity (Next 7 Working Days)
   -------------------------------------------------------------------------- */
export type CapacityDay = {
  dateKey: string;
  label: string;
  shortLabel: string;
  isToday: boolean;
  jobCount: number;
  level: CapacityLevel;
  jobs: ScheduledJobOccurrence<Job>[];
};

export type CapacitySummary = {
  days: CapacityDay[];
  workingDaysWithJobs: number;
  workingDaysTotal: number;
  quietDaysCount: number;
  daysAtOrOverCapacity: number;
  unscheduledApprovedJobsCount: number;
  crewAvailabilityConflictsCount: number;
};

/* --------------------------------------------------------------------------
   Section H: Job Readiness
   -------------------------------------------------------------------------- */
export type JobReadinessIssue = {
  jobId: string;
  clientName: string;
  scheduledDate: string | null;
  blockers: string[];
  href: string;
};

export type ReadinessSummary = {
  upcomingJobsCount: number;
  fullyReadyCount: number;
  blockedJobs: JobReadinessIssue[];
};

/* --------------------------------------------------------------------------
   Section I: Crew Status
   -------------------------------------------------------------------------- */
export type ActiveClockedMember = {
  crewId: string;
  crewName: string;
  jobId: string;
  jobTitle: string;
  startedAt: string;
  elapsedHours: number;
};

export type CrewSummary = {
  clockedIn: ActiveClockedMember[];
  openShiftCount: number;
  activeRosterCount: number;
  unassignedTodayJobsCount: number;
  assignedTodayJobsCount: number;
};

/* --------------------------------------------------------------------------
   Section J: Communications & Callbacks
   -------------------------------------------------------------------------- */
export type WaitingThread = {
  phone: string;
  clientName: string;
  lastMessageSnippet: string;
  waitingDuration: string;
  unreadCount: number;
  isDeliveryFailure: boolean;
  href: string;
};

export type CommunicationSummary = {
  waitingThreads: WaitingThread[];
  unreadTotal: number;
  pendingCallbacksCount: number;
};

/* --------------------------------------------------------------------------
   Section K: Automation Health
   -------------------------------------------------------------------------- */
export type AutomationItemHealth = {
  id: string;
  name: string;
  enabled: boolean;
  status: 'healthy' | 'off' | 'failed';
  lastRunAt: string | null;
  recentCount30d: number;
};

export type AutomationSummary = {
  items: AutomationItemHealth[];
  activeCount: number;
  totalConfigured: number;
  actionableFailures: { id: string; message: string; href: string }[];
  totalActions30d: number;
};

/* --------------------------------------------------------------------------
   Section L: Best Next Opportunity
   -------------------------------------------------------------------------- */
export type BestOpportunity = {
  id: string;
  type: 'viewed_quote' | 'high_value_lead' | 'rebook' | 'chase_balance' | 'schedule_approved';
  headline: string;
  reason: string;
  estimatedValue?: number | null;
  actionLabel: string;
  actionHref: string;
};

/* --------------------------------------------------------------------------
   Complete Dashboard Contract
   -------------------------------------------------------------------------- */
export type OnboardingStep = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
};

export type DashboardHome = {
  // Account & system context
  onboarded: boolean;
  connectDisabledAt: string | null;
  sitePublished: boolean;
  siteUrl: string | null;
  bookingSubdomain: string | null;
  onboardingSteps: OnboardingStep[];
  completedStepCount: number;
  onboardingComplete: boolean;

  // Blog Cadence
  blogReminderWeeks: number;
  publishedBlogCount: number;
  lastPublishedBlogISO: string | null;
  blogTopicSuggestion: ReturnType<typeof recommendBlogTopic>;

  // Quick stats
  rebookDue: number;
  privateFeedback: number;

  // 12 Command Center Modules (Loadable-wrapped for resilience)
  alerts: Loadable<SystemAlertsSummary>;
  priorityQueue: Loadable<PriorityQueueSummary>;
  todaySchedule: Loadable<TodayScheduleSummary>;
  pulse: Loadable<BusinessPulse>;
  pipeline: Loadable<PipelineSummary>;
  cashPreview: Loadable<CashPreview>;
  capacity: Loadable<CapacitySummary>;
  readiness: Loadable<ReadinessSummary>;
  crewStatus: Loadable<CrewSummary>;
  communications: Loadable<CommunicationSummary>;
  automations: Loadable<AutomationSummary>;
  opportunity: Loadable<BestOpportunity | null>;

  // Backwards compatibility for existing components / demo
  jobs: Job[];
  crew: CrewMember[];
  assignmentsByJob: Record<string, string[]>;
  automation: Awaited<ReturnType<typeof getAutomationActivity>>;
  leadStats: ReturnType<typeof leadSummary>;
  todayKey: string;
  next7Days: { dateKey: string; label: string; shortLabel: string; jobs: ScheduledJobOccurrence<Job>[] }[];
  quietDays: { dateKey: string; label: string; shortLabel: string; jobs: ScheduledJobOccurrence<Job>[] }[];
  jobsNext7Days: number;
  schedulingIssueCount: number;
  jobsNeedingCrewCount: number;
  jobsMissingTimeCount: number;
  unscheduledJobCount: number;
  stuckScheduleCount: number;
  outstanding: { total: number; count: number };
  openQuotes: { total: number; count: number };
  bookedWork: { total: number; count: number };
  collectedThisMonth: { total: number; count: number };
  collectedMonthLabel: string;
  topPriorities: PriorityItem[];
  restPriorities: PriorityItem[];
  waitingItems: PriorityItem[];
  reviewsOn: boolean;
  followupsOn: boolean;
  remindersOn: boolean;
  dailyDigestOn: boolean;
};
