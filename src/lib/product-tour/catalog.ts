import type { TourDefinition, TourStep } from './types';

/**
 * Public 5-minute evaluation demo tour definition.
 */
export const PUBLIC_DEMO_TOUR: TourDefinition = {
  key: 'demo-job-lifecycle',
  version: 1,
  title: '5-Minute Job Lifecycle Tour',
  estimatedMinutes: 5,
  audience: ['anonymous'],
  steps: [
    {
      id: 'demo-site',
      route: '/demo/tour/site',
      title: 'Visit Contractor Website',
      body: 'A prospective homeowner lands on your free, high-converting contractor website.',
      perspective: 'homeowner',
    },
    {
      id: 'demo-intake',
      route: '/demo/tour/intake',
      title: 'Request an Instant Estimate',
      body: 'The homeowner submits a project request; AI qualifies fit and gathers job details 24/7.',
      perspective: 'homeowner',
    },
    {
      id: 'demo-lead',
      route: '/demo/tour/lead',
      title: 'Receive Qualified Lead',
      body: 'Switch perspectives: See how the lead arrives pre-scored with scope, urgency, and route fit.',
      perspective: 'contractor',
    },
    {
      id: 'demo-quote',
      route: '/demo/tour/quote',
      title: 'Prepare & Send Quote',
      body: 'Review itemized pricing, add optional upgrades, and send to the customer via SMS.',
      perspective: 'contractor',
    },
    {
      id: 'demo-approve',
      route: '/demo/tour/approve',
      title: 'Approve, Sign & Pay Deposit',
      body: 'Switch perspectives: Customer approves upgrades, e-signs, pays deposit, and books window.',
      perspective: 'homeowner',
    },
    {
      id: 'demo-complete',
      route: '/demo/tour/complete',
      title: 'Tour Complete',
      body: 'You experienced the full 5-step lifecycle. Start your free website or explore the dashboard.',
      perspective: 'summary',
    },
  ],
} as const;

/**
 * Signed-in workspace orientation tour definition.
 */
export const DASHBOARD_ORIENTATION_TOUR: TourDefinition = {
  key: 'dashboard-orientation',
  version: 1,
  title: 'Dashboard Orientation',
  estimatedMinutes: 1.5,
  audience: ['owner', 'office'],
  steps: [
    {
      id: 'dashboard-overview',
      route: '/dashboard',
      targetId: 'dashboard:needs-attention',
      title: 'What needs your attention',
      body: 'Your dashboard keeps high-priority work front and center: hot incoming leads, quotes awaiting approval, and jobs ready to schedule.',
      placement: 'bottom',
      ownerOnly: true,
    },
    {
      id: 'leads-inbox',
      route: '/dashboard/leads',
      targetId: 'leads:workspace',
      title: 'Where new work arrives',
      body: 'Incoming estimate requests and calls arrive pre-scored with project scope, urgency, and route fit so you can reply first.',
      placement: 'top',
      requiredCapabilities: ['leads.read'],
    },
    {
      id: 'jobs-board',
      route: '/dashboard/jobs',
      targetId: 'jobs:workspace',
      title: 'Quotes, invoices & payments',
      body: 'Track every active job in one place. Prepare itemized quotes with e-signatures, collect deposits, and invoice balances securely.',
      placement: 'top',
      requiredCapabilities: ['jobs.read'],
    },
    {
      id: 'schedule-workbench',
      route: '/dashboard/schedule',
      targetId: 'schedule:workbench',
      title: 'What is happening next',
      body: 'Drag and drop jobs onto the calendar, dispatch crew, and optimize driving routes to avoid dead time between appointments.',
      placement: 'top',
      requiredCapabilities: ['jobs.read'],
    },
    {
      id: 'website-builder',
      route: '/dashboard/sites',
      targetId: 'website:builder',
      title: 'Your contractor website',
      body: 'Customize your free contractor website, showcase past projects, connect Google reviews, and manage your 24/7 AI Smart Intake.',
      placement: 'bottom',
      requiredCapabilities: ['settings.write'],
    },
    {
      id: 'automations-overview',
      route: '/dashboard/automations',
      targetId: 'automations:overview',
      title: 'Work that runs automatically',
      body: 'Automatic quote follow-ups, appointment reminders, and post-job review requests keep customers happy while you stay on site.',
      placement: 'bottom',
      requiredCapabilities: ['settings.write'],
    },
  ],
} as const;

export const TOUR_CATALOG: Record<string, TourDefinition> = {
  [`${PUBLIC_DEMO_TOUR.key}:v${PUBLIC_DEMO_TOUR.version}`]: PUBLIC_DEMO_TOUR,
  [`${DASHBOARD_ORIENTATION_TOUR.key}:v${DASHBOARD_ORIENTATION_TOUR.version}`]: DASHBOARD_ORIENTATION_TOUR,
  // Alias default keys
  [PUBLIC_DEMO_TOUR.key]: PUBLIC_DEMO_TOUR,
  [DASHBOARD_ORIENTATION_TOUR.key]: DASHBOARD_ORIENTATION_TOUR,
};

export function getTourDefinition(key: string, version?: number): TourDefinition | null {
  if (version !== undefined) {
    const versionedKey = `${key}:v${version}`;
    if (TOUR_CATALOG[versionedKey]) return TOUR_CATALOG[versionedKey];
  }
  return TOUR_CATALOG[key] ?? null;
}

export function getStepById(tour: TourDefinition, stepId: string): TourStep | null {
  return tour.steps.find((s) => s.id === stepId) ?? null;
}

export function getStepIndex(tour: TourDefinition, stepId: string): number {
  return tour.steps.findIndex((s) => s.id === stepId);
}

export function getNextStep(tour: TourDefinition, currentStepId: string): TourStep | null {
  const idx = getStepIndex(tour, currentStepId);
  if (idx < 0 || idx >= tour.steps.length - 1) return null;
  return tour.steps[idx + 1] ?? null;
}

export function getPrevStep(tour: TourDefinition, currentStepId: string): TourStep | null {
  const idx = getStepIndex(tour, currentStepId);
  if (idx <= 0) return null;
  return tour.steps[idx - 1] ?? null;
}

export { filterStepsForUser } from './access';
