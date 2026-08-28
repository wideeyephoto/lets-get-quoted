/**
 * Canonical Public Route Manifest for Let's Get Quoted.
 * Defines all public routes, expected headings, required anchor IDs, and auth requirements.
 */

export interface PublicRouteDefinition {
  path: string;
  expectedH1Pattern: RegExp;
  requiredAnchorIds?: string[];
  requiresAuth: boolean;
  category: 'marketing' | 'demo' | 'auth' | 'legal';
}

export const PUBLIC_ROUTE_MANIFEST: PublicRouteDefinition[] = [
  {
    path: '/',
    expectedH1Pattern: /From first click to final payment/i,
    requiredAnchorIds: ['workflow', 'flagships', 'included', 'pricing', 'faq'],
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/pricing',
    expectedH1Pattern: /Start free\. Pay less as you grow/i,
    requiredAnchorIds: ['plans', 'recommender', 'included', 'calculator', 'comparison', 'faq'],
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/features',
    expectedH1Pattern: /website lead to paid job/i,
    requiredAnchorIds: ['flagship-index', 'quick-stops', 'faq'],
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/how-it-works',
    expectedH1Pattern: /How Let’s Get Quoted Works/i,
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/for',
    expectedH1Pattern: /Contractor Software Built for Your Specific Trade/i,
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/compare',
    expectedH1Pattern: /The contractor software built for/i,
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/faq',
    expectedH1Pattern: /Everything you’re wondering/i,
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/contact',
    expectedH1Pattern: /Talk to a real person/i,
    requiresAuth: false,
    category: 'marketing',
  },
  {
    path: '/demo',
    expectedH1Pattern: /Evergreen Lawn & Landscape/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/site',
    expectedH1Pattern: /Homeowner visits contractor’s website/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/intake',
    expectedH1Pattern: /Homeowner requests an instant estimate/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/lead',
    expectedH1Pattern: /Contractor receives qualified lead in Leads Inbox/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/quote',
    expectedH1Pattern: /Contractor prepares & sends itemized quote/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/approve',
    expectedH1Pattern: /Homeowner approves upgrades, e-signs & pays deposit/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/demo/tour/complete',
    expectedH1Pattern: /From first click to paid deposit/i,
    requiresAuth: false,
    category: 'demo',
  },
  {
    path: '/start',
    expectedH1Pattern: /./, // Redirects to login, welcome, or dashboard
    requiresAuth: false,
    category: 'auth',
  },
  {
    path: '/login',
    expectedH1Pattern: /./, // Dynamic based on intent
    requiresAuth: false,
    category: 'auth',
  },
];
