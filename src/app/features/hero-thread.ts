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

export type TradePresetId = 'electrical' | 'plumbing' | 'hvac' | 'roofing' | 'remodeling';

export type TradeWorkflowPreset = {
  id: TradePresetId;
  name: string;
  icon: string;
  business: string;
  client: string;
  first: string;
  area: string;
  jobRef: string;
  trade: string;
  badge: string;
  deposit: number;
  totalQuote: number;
  stages: readonly WorkflowStage[];
  aiScope: {
    tag: string;
    detail: string;
    photoCount: number;
    urgency: string;
  };
  smsText: {
    quote: string;
    booked: string;
  };
  floatingPillTop: {
    icon: string;
    title: string;
    subtitle: string;
    tone: 'mint' | 'orange' | 'cyan';
  };
  floatingPillBottom: {
    icon: string;
    title: string;
    subtitle: string;
    tone: 'mint' | 'orange' | 'cyan';
  };
};

export const TRADE_WORKFLOW_PRESETS: Record<TradePresetId, TradeWorkflowPreset> = {
  electrical: {
    id: 'electrical',
    name: 'Electrical',
    icon: '⚡',
    business: 'Northline Electric',
    client: 'Alex Morgan',
    first: 'Alex',
    area: 'Royal Oak',
    jobRef: 'J-1048',
    trade: 'Kitchen Recessed Lighting (8x)',
    badge: 'ESTIMATE & SCOPE',
    deposit: 2125,
    totalQuote: 4250,
    stages: WORKFLOW_STAGES,
    aiScope: {
      tag: '8 Cans + 200A Panel Scan',
      detail: 'Drywall joist clearance verified. 3-way switch circuit included.',
      photoCount: 3,
      urgency: 'HIGH FIT',
    },
    smsText: {
      quote: 'Alex, your Northline Electric quote for 8 recessed cans is ready to review.',
      booked: 'Northline Electric: Booked for Tuesday, 9–11 AM. Tech Sarah assigned.',
    },
    floatingPillTop: {
      icon: '💳',
      title: '+$2,125.00 Payout',
      subtitle: 'Instant Stripe Transfer ✓',
      tone: 'mint',
    },
    floatingPillBottom: {
      icon: '📸',
      title: 'AI Photo Scanned',
      subtitle: '8 Cans & Joist Depth OK',
      tone: 'cyan',
    },
  },
  plumbing: {
    id: 'plumbing',
    name: 'Plumbing',
    icon: '🚰',
    business: 'Cascade Plumbing & Drain',
    client: 'Marcus Vance',
    first: 'Marcus',
    area: 'Birmingham',
    jobRef: 'J-1052',
    trade: '50-Gal Tankless Water Heater',
    badge: 'HOT LEAD · SAME DAY',
    deposit: 1200,
    totalQuote: 3850,
    stages: [
      { id: 'intake', label: 'Request received', detail: 'Emergency intake · Birmingham', source: 'Website' },
      { id: 'qualified', label: 'Qualified', detail: '3/4" gas line · Tankless upgrade', source: 'AI Intake' },
      { id: 'quote', label: 'Quote approved', detail: 'Marcus Vance approved $3,850', source: 'Quotes' },
      { id: 'schedule', label: 'Today 1–3 PM booked', detail: 'Truck #4 en route · Mike B.', source: 'Schedule' },
      { id: 'payment', label: '$1,200 deposit paid', detail: 'Direct Stripe settlement', source: 'Payments' },
    ],
    aiScope: {
      tag: 'Active Leak Detected',
      detail: 'Gas line verified 3/4", direct power vent route mapped.',
      photoCount: 2,
      urgency: 'EMERGENCY',
    },
    smsText: {
      quote: 'Marcus, your Cascade Plumbing estimate for tankless replacement is ready.',
      booked: 'Cascade Plumbing: Dispatched for today 1–3 PM. Mike B. is on his way.',
    },
    floatingPillTop: {
      icon: '💳',
      title: '+$1,200.00 Payout',
      subtitle: 'Instant Stripe Deposit ✓',
      tone: 'mint',
    },
    floatingPillBottom: {
      icon: '🚨',
      title: 'Emergency Priority',
      subtitle: 'Same-day 1–3 PM booked',
      tone: 'orange',
    },
  },
  hvac: {
    id: 'hvac',
    name: 'HVAC',
    icon: '❄️',
    business: 'Vanguard Heating & Air',
    client: 'Elena Rostova',
    first: 'Elena',
    area: 'Bloomfield',
    jobRef: 'J-1064',
    trade: '4-Ton Heat Pump Replacement',
    badge: 'HIGH VALUE · REBATE',
    deposit: 2950,
    totalQuote: 9800,
    stages: [
      { id: 'intake', label: 'Request received', detail: 'Website form · Bloomfield Hills', source: 'Website' },
      { id: 'qualified', label: 'Qualified', detail: '18 SEER2 · DTE Rebate Eligible', source: 'AI Intake' },
      { id: 'quote', label: 'Quote approved', detail: 'Elena Rostova signed $9,800', source: 'Quotes' },
      { id: 'schedule', label: 'Wed 8–10 AM booked', detail: 'Lead Tech Jason + Crew', source: 'Schedule' },
      { id: 'payment', label: '$2,950 deposit paid', detail: 'Card on file · Stripe Sync', source: 'Payments' },
    ],
    aiScope: {
      tag: '16-Yr R-410A Coil Scan',
      detail: 'Line set reusable, electrical disconnect upgrade required.',
      photoCount: 4,
      urgency: 'HIGH TICKET',
    },
    smsText: {
      quote: 'Elena, your Vanguard HVAC 18 SEER2 heat pump proposal is ready.',
      booked: 'Vanguard Heating: Installation confirmed for Wednesday, 8–10 AM.',
    },
    floatingPillTop: {
      icon: '💳',
      title: '+$2,950.00 Deposit',
      subtitle: 'Stripe Collected ($9.8k total)',
      tone: 'mint',
    },
    floatingPillBottom: {
      icon: '⚡',
      title: 'Utility Rebate Active',
      subtitle: '$1,400 Clean Heat Credit',
      tone: 'cyan',
    },
  },
  roofing: {
    id: 'roofing',
    name: 'Roofing',
    icon: '🔨',
    business: 'Apex Ridge Roofing',
    client: 'David Chen',
    first: 'David',
    area: 'Troy',
    jobRef: 'J-1071',
    trade: 'Architectural Shingle Tear-Off (28 Sq)',
    badge: 'STORM CLAIM · SCOPE',
    deposit: 4200,
    totalQuote: 14200,
    stages: [
      { id: 'intake', label: 'Request received', detail: 'Storm damage form · Troy', source: 'Website' },
      { id: 'qualified', label: 'Qualified', detail: '28 Sq · GAF Timberline HDZ', source: 'AI Intake' },
      { id: 'quote', label: 'Quote approved', detail: 'David Chen e-signed on mobile', source: 'Quotes' },
      { id: 'schedule', label: 'Thu 7 AM booked', detail: 'Roof Crew Alpha (6 Techs)', source: 'Schedule' },
      { id: 'payment', label: '$4,200 deposit paid', detail: 'Automated ACH / Stripe', source: 'Payments' },
    ],
    aiScope: {
      tag: 'Hail Damage Detected',
      detail: 'Pitch 7/12, valley flashing replacement & synthetic underlayment.',
      photoCount: 5,
      urgency: 'INSURANCE CLAIM',
    },
    smsText: {
      quote: 'David, your Apex Ridge 28-square roof replacement proposal is ready.',
      booked: 'Apex Ridge: Crew Alpha dispatched for Thursday at 7:00 AM.',
    },
    floatingPillTop: {
      icon: '💳',
      title: '+$4,200.00 Deposit',
      subtitle: 'Instant Stripe ACH Sync ✓',
      tone: 'mint',
    },
    floatingPillBottom: {
      icon: '🏠',
      title: '28 Squares Scanned',
      subtitle: 'GAF Timberline HDZ Spec',
      tone: 'orange',
    },
  },
  remodeling: {
    id: 'remodeling',
    name: 'Remodeling',
    icon: '🏡',
    business: 'Crown Craft Remodeling',
    client: 'Sarah Jenkins',
    first: 'Sarah',
    area: 'Rochester',
    jobRef: 'J-1089',
    trade: 'Primary Bath Remodel & Tile Shower',
    badge: 'TURNKEY · HIGH TICKET',
    deposit: 5500,
    totalQuote: 18500,
    stages: [
      { id: 'intake', label: 'Request received', detail: 'Project intake · Rochester', source: 'Website' },
      { id: 'qualified', label: 'Qualified', detail: '10x12 layout · Schluter system', source: 'AI Intake' },
      { id: 'quote', label: 'Quote approved', detail: 'Sarah Jenkins signed $18,500', source: 'Quotes' },
      { id: 'schedule', label: 'Mon 7:30 AM booked', detail: 'Lead Carpenter Brian + Crew', source: 'Schedule' },
      { id: 'payment', label: '$5,500 deposit paid', detail: 'Milestone 1 of 3 Paid', source: 'Payments' },
    ],
    aiScope: {
      tag: '10x12 Bath Layout Scan',
      detail: 'Tub-to-shower conversion with dual vanity plumbing re-route.',
      photoCount: 4,
      urgency: 'TURNKEY REMODEL',
    },
    smsText: {
      quote: 'Sarah, your Crown Craft custom primary bath proposal is ready.',
      booked: 'Crown Craft: Phase 1 Demo booked for Monday, 7:30 AM.',
    },
    floatingPillTop: {
      icon: '💳',
      title: '+$5,500.00 Milestone',
      subtitle: 'Deposit Secured in Stripe ✓',
      tone: 'mint',
    },
    floatingPillBottom: {
      icon: '✨',
      title: 'Schluter Shower Spec',
      subtitle: 'Dual Vanity Plumb Plan',
      tone: 'cyan',
    },
  },
};
