/**
 * Canonical Signup Intent model and URL builders.
 *
 * Ensures every marketing, pricing, demo, or feature CTA creates a typed
 * acquisition intent that survives authentication (Magic link, SMS OTP, OAuth)
 * and directs users to their promised destination based on account state.
 */

export type SignupGoal =
  | 'build_site'
  | 'choose_plan'
  | 'feature'
  | 'explore';

export type SignupFeature =
  | 'website'
  | 'ai_intake'
  | 'quick_stops'
  | 'quotes'
  | 'scheduling'
  | 'crew'
  | 'payments'
  | 'reviews'
  | 'cash_flow'
  | 'recurring';

export type SignupPlan = 'flex' | 'starter' | 'growth' | 'scale';
export type SignupBilling = 'monthly' | 'annual';

export type SignupSource =
  | 'home_hero'
  | 'site_generator'
  | 'pricing'
  | 'pricing_footer'
  | 'demo_complete'
  | 'demo_tour'
  | 'feature_page'
  | 'nav'
  | 'footer'
  | 'tools'
  | 'compare'
  | 'direct';

export type SignupIntent = {
  goal: SignupGoal;
  feature?: SignupFeature | null;
  trade?: string | null;
  city?: string | null;
  businessName?: string | null;
  plan?: SignupPlan | null;
  billing?: SignupBilling | null;
  source?: SignupSource | null;
  next?: string | null;
};

const VALID_GOALS = new Set<SignupGoal>(['build_site', 'choose_plan', 'feature', 'explore']);
const VALID_FEATURES = new Set<SignupFeature>([
  'website',
  'ai_intake',
  'quick_stops',
  'quotes',
  'scheduling',
  'crew',
  'payments',
  'reviews',
  'cash_flow',
  'recurring',
]);
const VALID_PLANS = new Set<SignupPlan>(['flex', 'starter', 'growth', 'scale']);
const VALID_BILLING = new Set<SignupBilling>(['monthly', 'annual']);

/**
 * Parses raw search parameters or dictionary into a sanitized, typed SignupIntent.
 */
export function parseSignupIntent(
  rawParams: URLSearchParams | Record<string, string | null | undefined>,
): SignupIntent {
  const get = (key: string): string | null => {
    if (rawParams instanceof URLSearchParams) {
      return rawParams.get(key);
    }
    const val = rawParams[key];
    return typeof val === 'string' ? val : null;
  };

  const rawGoal = get('goal')?.toLowerCase();
  const goal: SignupGoal = rawGoal && VALID_GOALS.has(rawGoal as SignupGoal) ? (rawGoal as SignupGoal) : 'build_site';

  const rawFeature = get('feature')?.toLowerCase().replace(/-/g, '_');
  const feature: SignupFeature | null =
    rawFeature && VALID_FEATURES.has(rawFeature as SignupFeature) ? (rawFeature as SignupFeature) : null;

  const rawPlan = get('plan')?.toLowerCase();
  const plan: SignupPlan | null = rawPlan && VALID_PLANS.has(rawPlan as SignupPlan) ? (rawPlan as SignupPlan) : null;

  const rawBilling = get('billing')?.toLowerCase();
  const billing: SignupBilling | null =
    rawBilling && VALID_BILLING.has(rawBilling as SignupBilling) ? (rawBilling as SignupBilling) : 'monthly';

  const trade = get('trade')?.trim() || null;
  const city = get('city')?.trim() || null;
  const businessName = get('business_name')?.trim() || get('name')?.trim() || null;
  const source = (get('source')?.trim() as SignupSource) || null;
  const next = get('next')?.trim() || null;

  return {
    goal,
    feature,
    trade,
    city,
    businessName,
    plan,
    billing: plan ? billing : null,
    source,
    next,
  };
}

/**
 * Serializes a SignupIntent into URLSearchParams for appending to URLs.
 */
export function serializeSignupIntent(intent: Partial<SignupIntent>): URLSearchParams {
  const params = new URLSearchParams();

  if (intent.goal && intent.goal !== 'build_site') {
    params.set('goal', intent.goal);
  } else if (intent.goal) {
    params.set('goal', 'build_site');
  }

  if (intent.feature) params.set('feature', intent.feature);
  if (intent.trade) params.set('trade', intent.trade);
  if (intent.city) params.set('city', intent.city);
  if (intent.businessName) params.set('business_name', intent.businessName);
  if (intent.plan) params.set('plan', intent.plan);
  if (intent.plan && intent.billing) params.set('billing', intent.billing);
  if (intent.source) params.set('source', intent.source);
  if (intent.next) params.set('next', intent.next);

  return params;
}

export const APP_SIGNUP_URL = 'https://app.letsgetquoted.com/start?goal=build_site';

/**
 * Builds the canonical entry point URL `/start` with the given intent.
 */
export function buildStartUrl(intent: Partial<SignupIntent>, baseUrl = 'https://app.letsgetquoted.com'): string {
  const params = serializeSignupIntent(intent);
  const query = params.toString();
  const base = baseUrl.endsWith('/start') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/start`;
  return `${base}${query ? `?${query}` : ''}`;
}

/**
 * Helper to build the marketing site's primary signup CTA with `goal=build_site`
 * and optional trade, city, or source attribution without query string corruption.
 */
export function buildSignupUrl(
  options?: {
    trade?: string | null;
    city?: string | null;
    source?: SignupSource | null;
  },
  baseUrl = 'https://app.letsgetquoted.com',
): string {
  return buildStartUrl(
    {
      goal: 'build_site',
      trade: options?.trade,
      city: options?.city,
      source: options?.source,
    },
    baseUrl,
  );
}

/**
 * Resolves the destination path inside the app dashboard based on intent and account state.
 */
export function resolveDestination(
  intent: SignupIntent,
  accountState: 'new' | 'onboarding' | 'active' = 'active',
): string {
  if (intent.next && intent.next.startsWith('/') && !intent.next.startsWith('//')) {
    return intent.next;
  }

  if (accountState === 'onboarding') {
    const welcomeParams = serializeSignupIntent(intent);
    return `/welcome${welcomeParams.toString() ? `?${welcomeParams.toString()}` : ''}`;
  }

  // Active established account destination mapping
  switch (intent.goal) {
    case 'build_site':
      return '/dashboard/sites';
    case 'choose_plan':
      return '/dashboard/settings';
    case 'feature': {
      switch (intent.feature) {
        case 'quick_stops':
          return '/dashboard/quick-stops';
        case 'ai_intake':
          return '/dashboard/leads';
        case 'quotes':
        case 'payments':
          return '/dashboard/jobs';
        case 'scheduling':
          return '/dashboard/schedule';
        case 'crew':
          return '/dashboard/crew';
        case 'reviews':
          return '/dashboard/reviews';
        case 'cash_flow':
          return '/dashboard/cash-flow';
        case 'recurring':
          return '/dashboard/recurring';
        default:
          return '/dashboard';
      }
    }
    case 'explore':
    default:
      return '/dashboard';
  }
}
