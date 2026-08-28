import { clientJobDashboardText, jobUpdateText } from '@/lib/sms-templates';

/**
 * The script for the hero Job Record simulation on /features.
 *
 * PROVING THE CONNECTED CONTRACTOR WORKFLOW:
 * Shows one job moving through its complete 5-stage lifecycle:
 * Request received → Qualified → Quote approved → Tue 9–11 booked → $2,125 deposit paid
 *
 * It combines the changing Job Record state with supporting automated
 * customer SMS notifications and homeowner dashboard actions.
 */

export const SAMPLE_JOB = {
  business: 'Northline Electric',
  client: 'Alex Morgan',
  first: 'Alex',
  area: 'Royal Oak',
  jobRef: 'J-1048',
  trade: 'Kitchen Recessed Lighting (8x)',
  quoteLink: 'lgq.co/j/1048',
  payLink: 'lgq.co/p/1048',
  deposit: 2125,
} as const;

export type WorkflowStage = {
  id: string;
  label: string;
  detail: string;
  source: 'Website' | 'AI Intake' | 'Quotes' | 'Schedule' | 'Payments';
};

export const WORKFLOW_STAGES: readonly WorkflowStage[] = [
  {
    id: 'intake',
    label: 'Request received',
    detail: 'Website form · Royal Oak',
    source: 'Website',
  },
  {
    id: 'qualified',
    label: 'Qualified',
    detail: '8 recessed cans · $3–5k est.',
    source: 'AI Intake',
  },
  {
    id: 'quote',
    label: 'Quote approved',
    detail: 'Alex Morgan approved online',
    source: 'Quotes',
  },
  {
    id: 'schedule',
    label: 'Tue 9–11 booked',
    detail: 'Slot confirmed · Crew notified',
    source: 'Schedule',
  },
  {
    id: 'payment',
    label: '$2,125 deposit paid',
    detail: 'Instant Stripe payout',
    source: 'Payments',
  },
];

export type HeroSms = {
  id: string;
  at: number;
  label: string;
  body: string;
  link: string;
};

export const HERO_SMS: readonly HeroSms[] = [
  {
    id: 'quote',
    at: 400,
    label: 'Automated Quote Link',
    body: clientJobDashboardText({
      businessName: SAMPLE_JOB.business,
      jobRef: SAMPLE_JOB.jobRef,
      link: SAMPLE_JOB.quoteLink,
      includesScheduleOptions: true,
    }),
    link: SAMPLE_JOB.quoteLink,
  },
  {
    id: 'booked',
    at: 7200,
    label: 'Automated Confirmation',
    body: jobUpdateText({
      businessName: SAMPLE_JOB.business,
      jobRef: SAMPLE_JOB.jobRef,
      title: 'Booked for Tuesday, 9–11 AM',
      body: 'Your crew has been notified.',
    }),
    link: '',
  },
];

export type HeroEvent = {
  id: string;
  at: number;
  until: number;
  surface: 'Homeowner Dashboard' | 'Stripe Payments';
  headline: string;
  detail: string;
};

export const HERO_EVENTS: readonly HeroEvent[] = [
  {
    id: 'accepted',
    at: 2000,
    until: 3800,
    surface: 'Homeowner Dashboard',
    headline: 'Quote accepted',
    detail: 'Alex Morgan approved $4,250 quote',
  },
  {
    id: 'scheduled',
    at: 4400,
    until: 6200,
    surface: 'Homeowner Dashboard',
    headline: 'Slot selected',
    detail: 'Tuesday, 9:00–11:00 AM',
  },
  {
    id: 'paid',
    at: 6800,
    until: 8600,
    surface: 'Stripe Payments',
    headline: `Deposit received · $${SAMPLE_JOB.deposit.toLocaleString('en-US')}`,
    detail: 'Appointment confirmed & crew dispatched',
  },
];

export type StatusStep = {
  at: number;
  label: string;
  tone: 'neutral' | 'sent' | 'held' | 'booked';
  completedStages: number;
};

export const HERO_STATUS: readonly StatusStep[] = [
  { at: 0, label: 'Quote sent', tone: 'sent', completedStages: 2 },
  { at: 3800, label: 'Quote approved', tone: 'held', completedStages: 3 },
  { at: 6200, label: 'Tue 9–11 booked', tone: 'held', completedStages: 4 },
  { at: 8600, label: 'Booked & Paid', tone: 'booked', completedStages: 5 },
];

export const HERO_RUNTIME = 10_000;

export const HERO_THREAD_JOB = SAMPLE_JOB.jobRef;
export const HERO_THREAD_CLIENT = SAMPLE_JOB.client;
export const HERO_THREAD_BUSINESS = SAMPLE_JOB.business;
export const HERO_THREAD_AREA = SAMPLE_JOB.area;
export const HERO_THREAD_TRADE = SAMPLE_JOB.trade;

export const HERO_SUMMARY = `A live demonstration of one connected job record for ${SAMPLE_JOB.client} at ${SAMPLE_JOB.business}. Workflow progression: Request received → Qualified → Quote approved → Tue 9–11 booked → $${SAMPLE_JOB.deposit.toLocaleString('en-US')} deposit paid.`;
