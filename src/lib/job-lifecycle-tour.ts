import { DEMO_TOUR_JOB } from './demo-tour-data';

export const JOB_TOUR_VERSION = 2;
export const JOB_TOUR_STORAGE_KEY = 'lgq_job_lifecycle_v2';
export const JOB_TOUR_STEPS = [
  { slug: 'site', label: 'Website', perspective: 'Homeowner', title: 'A first click becomes a request.', description: 'Your website gives the homeowner a clear next step. Try the estimate button on this sample plumbing site.', takeaway: 'Your business. Your website. Your leads.' },
  { slug: 'intake', label: 'Smart Intake', perspective: 'Homeowner', title: 'Capture the details while interest is fresh.', description: 'Smart Intake gathers scope, timing, and location. Analyze this sample request to see what carries forward.', takeaway: 'A preliminary estimate helps set expectations. You set the final price.' },
  { slug: 'lead', label: 'Qualified Lead', perspective: 'Contractor', title: 'Know what needs your attention.', description: 'The same request arrives with its scope and fit score. Review the context, then build a quote.', takeaway: 'Scoring prioritizes requests. Every lead stays visible.' },
  { slug: 'quote', label: 'Quote', perspective: 'Contractor', title: 'Turn the scope into a clear price.', description: 'Try the optional valve upgrade, review the total, then simulate sending the quote to the homeowner.', takeaway: 'One quote connects the scope, options, and deposit.' },
  { slug: 'approve', label: 'Approval & Booking', perspective: 'Homeowner', title: 'From “yes” to a booked visit.', description: 'Apply the sample signature, simulate the deposit, and confirm the sample arrival window. See the result right here.', takeaway: 'Approval, deposit, and schedule stay with the same job.' },
] as const;
export type JobTourStep = typeof JOB_TOUR_STEPS[number]['slug'];
export type JobTourState = {
  step: JobTourStep;
  intakeAnalyzed: boolean;
  upgradeSelected: boolean;
  quoteSent: boolean;
  signed: boolean;
  depositSimulated: boolean;
  booked: boolean;
};
export const INITIAL_JOB_TOUR_STATE: JobTourState = {
  step: 'site', intakeAnalyzed: false, upgradeSelected: true, quoteSent: false,
  signed: false, depositSimulated: false, booked: false,
};
export function normalizeJobTourStep(value: unknown): JobTourStep {
  if (value === 'complete') return 'approve';
  return JOB_TOUR_STEPS.find((step) => step.slug === value)?.slug ?? 'site';
}
export function jobTourHref(step: JobTourStep = 'site', upgrade?: boolean): string {
  const params = new URLSearchParams({ tour: 'job-lifecycle', step });
  if (upgrade !== undefined) params.set('upgrade', upgrade ? '1' : '0');
  return `/how-it-works?${params}`;
}
export function jobTourTotals(upgradeSelected: boolean) {
  const subtotal = DEMO_TOUR_JOB.lineItems.reduce((sum, item) => sum + item.amount, 0);
  const upgrade = upgradeSelected ? DEMO_TOUR_JOB.optionalUpgrades.reduce((sum, item) => sum + item.amount, 0) : 0;
  const total = subtotal + upgrade;
  return { subtotal, upgrade, total, deposit: DEMO_TOUR_JOB.requiredDeposit, balance: total - DEMO_TOUR_JOB.requiredDeposit };
}
export function updateJobTourState(previous: JobTourState, patch: Partial<JobTourState>): JobTourState {
  const next = { ...previous, ...patch };
  // Changing the price invalidates consent to the previous quote and its result.
  if (next.upgradeSelected !== previous.upgradeSelected) {
    next.quoteSent = false;
    next.signed = false;
    next.depositSimulated = false;
    next.booked = false;
  }
  if (!next.signed) next.depositSimulated = false;
  if (!next.depositSimulated) next.booked = false;
  return next;
}
export function restoreJobTourState(raw: string | null): JobTourState {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || typeof data !== 'object') return { ...INITIAL_JOB_TOUR_STATE };
    const signed = data.signed === true;
    const depositSimulated = signed && data.depositSimulated === true;
    return {
      step: normalizeJobTourStep(data.step), intakeAnalyzed: data.intakeAnalyzed === true,
      upgradeSelected: typeof data.upgradeSelected === 'boolean' ? data.upgradeSelected : true,
      quoteSent: data.quoteSent === true, signed, depositSimulated,
      booked: depositSimulated && data.booked === true,
    };
  } catch { return { ...INITIAL_JOB_TOUR_STATE }; }
}
