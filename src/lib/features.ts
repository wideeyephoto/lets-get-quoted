// Single source of truth for the product's feature catalog. Every entry is
// grounded in real, shipped functionality.
//
// WHO ACTUALLY READS THIS, corrected — the note here used to say "the public
// /features page (full list) and the homepage favorites grid", and neither is
// true any more. /features rebuilt its "everything" band as the job-record
// component and stopped rendering the catalog at all. Today:
//
//   the COUNT      /pricing, /for/[trade], /founder
//   the ENTRIES    the seven suite pages under /features, via CapabilitySection
//
// That matters when adding a category: entries in a category no page names are
// entries nobody will ever see, however correct they are. Four categories are
// in that position today — clients, getting-found, leads and website — and
// suite-feature-pages.test.ts asserts exactly which, so the list is a decision
// rather than a discovery. 'website' joined it when /features/website-builder
// dropped the capability band: twelve entries and 1,837px of phone screen,
// restating claims the page had already made.
//
// Flip `favorite` to promote/demote a feature into the headline set.

export type Feature = {
  id: string;
  name: string;
  desc: string;
  // Headline features surfaced on the homepage grid + the /features highlights band.
  favorite?: boolean;
};

export type FeatureCategory = {
  num: string; // lifecycle order, e.g. '01'
  slug: string;
  title: string;
  intro: string;
  features: Feature[];
};

// Ordered the way a job actually flows: website → found → leads → quote → paid
// → schedule → run → recur → clients → reviews → market → measure.
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    num: '01',
    slug: 'website',
    title: 'Your website',
    intro: 'A professional site on your own domain, live in minutes — no web guy.',
    features: [
      { id: 'hosted-website', name: 'Hosted contractor website', desc: 'Publish a polished marketing site on your own domain, publish or unpublish anytime.', favorite: true },
      { id: 'templates', name: 'Trade-matched design themes', desc: 'Distinct layouts, motion, and hero styles for every trade.' },
      /* VIDEO WAS MISSING FROM THIS CATALOG ENTIRELY, which meant a shipped
         feature — six section layouts, uploads, codec and size checking — was
         absent from /features, the homepage grid and every capability list that
         reads from here. Three entries rather than one because they are three
         different promises: the layouts, the upload, and the part that stops a
         clip going live that nobody can play. */
      { id: 'video-sections', name: 'Video sections', desc: 'Six layouts — hero loop, video + text, project story, reel gallery, testimonial, process — up to four bands on a page.', favorite: true },
      { id: 'video-upload', name: 'Your own footage', desc: 'MP4, MOV, WebM or a YouTube link. Up to 50 MB a clip, 12 MB for a hero loop every visitor downloads.' },
      { id: 'video-checks', name: 'Playback and size checks', desc: 'Warns when a clip is HEVC, oversized or has no still frame, and names the fix — down to the iPhone setting. It advises; it never blocks.' },
      { id: 'customization', name: 'Deep customization', desc: 'Color schemes, accent color, brand fonts, 7 header layouts, 4 footers, and logo framing.' },
      { id: 'sections', name: 'Toggleable, reorderable sections', desc: 'Services, how-it-works, galleries, before/after, stats, FAQs, testimonials, and service areas.' },
      { id: 'auto-logo', name: 'Auto brand logo', desc: 'No logo? A trade-based mark drives your header, footer, favicon, and a downloadable icon.' },
      { id: 'auto-stock-photos', name: 'Auto stock photos', desc: 'Relevant, properly-attributed photos placed by role until you upload real job shots.' },
      { id: 'domains', name: 'Free subdomain + custom domain', desc: 'yourname.letsgetquoted.com free, or connect your own domain with live DNS verification.' },
      { id: 'legal-pages', name: 'Auto legal pages', desc: 'Generated, editable Privacy Policy and Terms in every footer.' },
      { id: 'hide-number', name: 'Hide-your-number mode', desc: 'Route contact through forms while still texting from your real line.' },
    ],
  },
  {
    num: '02',
    slug: 'getting-found',
    title: 'Getting found',
    intro: 'SEO and content that put you in front of homeowners searching now.',
    features: [
      { id: 'auto-seo', name: 'Automatic SEO', desc: 'Titles, descriptions, and canonical URLs written for you.' },
      { id: 'structured-data', name: 'Rich-result structured data', desc: 'LocalBusiness, review, and breadcrumb JSON-LD for standout Google listings.' },
      { id: 'ai-blog', name: 'AI blog drafts', desc: 'On-brand posts drafted for your approval, with optional scheduled auto-publish.' },
      { id: 'publish-reminders', name: 'Publish reminders', desc: 'Gentle 2/4/8-week reminders to keep content fresh.' },
      { id: 'rating-badge', name: 'On-page rating badge', desc: 'Optional aggregate-star badge that also emits rich-result markup.' },
      { id: 'reply-time-badge', name: 'Honest reply-time badge', desc: '"Typically replies within X" computed from your real response history.' },
    ],
  },
  {
    num: '03',
    slug: 'leads',
    title: 'Capturing leads',
    intro: 'Turn visitors into qualified leads — and know instantly which ones matter.',
    features: [
      { id: 'quote-forms', name: 'Quote request forms', desc: 'Classic multi-field intake, your fields.' },
      { id: 'ai-smart-intake', name: 'AI Smart Intake', desc: 'A conversational estimator that asks a few questions and returns a real price range, 24/7.', favorite: true },
      { id: 'satellite-property-sizing', name: 'Instant Satellite Property Sizing', desc: 'Calculates roof squares, pitch, siding area, gutter footage, and HVAC tonnage from aerial footprint data for accurate brackets.', favorite: true },
      { id: 'neighbor-cluster-pricing', name: 'Street Cluster Group Pricing', desc: 'Detects active jobs on the same street and unlocks $100–$500 neighbor discounts with viral sharing and same-day route batching.', favorite: true },
      { id: 'estimate-posture', name: 'Estimate posture', desc: 'Tune the AI from budget to high-margin pricing.' },
      { id: 'lead-triage', name: 'Hot / warm / low triage', desc: 'Every lead auto-scored; junk demoted, never hidden.' },
      { id: 'high-value-alerts', name: 'High-value alerts', desc: 'Big-ticket leads trigger a louder email plus an optional urgent text to your mobile.' },
      { id: 'mute-noise', name: 'Mute the noise', desc: 'Low-quality leads skip the interrupt but still land on your board.' },
      { id: 'lead-filters', name: 'Owner lead filters', desc: 'Service-area gate, minimum job size, work-you-don’t-take, timeline, and fully-booked mode.' },
      { id: 'phone-verification', name: 'Phone verification', desc: 'Optional one-time SMS code to confirm real numbers.' },
      { id: 'blocklist', name: 'Blocklist & spam guard', desc: 'Silently drop blocked contacts; honeypot and timing catch bots.' },
      { id: 'dedupe', name: 'Smart de-duping', desc: 'Repeat requests merge into the existing lead instead of stacking.' },
    ],
  },
  {
    num: '04',
    slug: 'quotes',
    title: 'Quotes & e-signatures',
    intro: 'Send a branded quote and get it signed from a phone — no printer, no PDF.',
    features: [
      { id: 'itemized-quotes', name: 'Itemized quotes', desc: 'Line items, optional add-on upsells, and subscription options.' },
      { id: 'client-esignature', name: 'Client e-signature', desc: 'Homeowner signs by typing their name; timestamped and locked to the record.', favorite: true },
      { id: 'deposit-gate', name: 'Deposit gate', desc: 'Require a paid deposit before scheduling or before work starts.' },
      { id: 'quote-followups', name: 'Automatic follow-ups', desc: 'Remind clients about un-approved quotes up to twice, then stop — hands-off.' },
      { id: 'client-portal', name: 'Client job portal', desc: 'One link to review, approve, sign, schedule, and pay.' },
    ],
  },
  {
    num: '05',
    slug: 'payments',
    title: 'Getting paid',
    intro: 'Card and bank payments on Stripe, straight to your account. Flex starts at $0/month plus a 1.25% LGQ platform fee.',
    features: [
      { id: 'stripe-payments', name: 'Stripe-powered payments', desc: 'Card and bank payments route to your account; we never see card numbers.', favorite: true },
      { id: 'deposits-stages', name: 'Deposits & stage payments', desc: 'Collect any payment at any point via hosted checkout.' },
      { id: 'payment-plans', name: 'Payment plans', desc: 'Split a quote into a deposit plus 0%-interest installments that auto-charge.', favorite: true },
      { id: 'ach', name: 'ACH bank debit', desc: 'Auto-offered on payments $1,000+ to cut fees on big jobs.' },
      { id: 'card-on-file', name: 'Card on file', desc: 'Save a card for hands-off future billing.' },
      { id: 'invoices', name: 'Invoices', desc: 'Itemized, tax & discount, sequential refs, PDF download, signable, locked when paid.' },
      { id: 'refunds', name: 'Refunds', desc: 'Full or partial, tracked, with an automatic client text.' },
      { id: 'offline-payments', name: 'Offline payments', desc: 'Log cash or check with correct invoice reconciliation.' },
      { id: 'disputes', name: 'Dispute handling', desc: 'Chargebacks tracked automatically from Stripe.' },
      { id: 'shrinking-fees', name: 'Plan-based payment fees', desc: 'Choose Flex at $0/month plus 1.25%, or a paid plan with a lower LGQ platform fee.' },
    ],
  },
  {
    num: '06',
    slug: 'scheduling',
    title: 'Scheduling & booking',
    intro: 'Get jobs on the calendar without the phone tag.',
    features: [
      { id: 'calendar', name: 'Drag-and-drop calendar', desc: 'Place and reschedule jobs; multi-day work auto-expands across days.' },
      { id: 'self-scheduling', name: 'Client self-scheduling', desc: 'Text up to 3 windows; the client picks one and it books itself.' },
      { id: 'online-booking', name: 'Online booking page', desc: 'Customers request an available arrival window right from your public site.', favorite: true },
      { id: 'reminders', name: 'Appointment reminders', desc: 'Text or email ahead of the job, on your schedule; reply "C" to confirm.' },
      { id: 'estimate-visits', name: 'Estimate visits', desc: 'Schedule free in-person estimates with SMS options.' },
    ],
  },
  {
    num: '07',
    slug: 'jobs',
    title: 'Jobs, crew & field app',
    intro: 'Run the work and see real margin — from the office or the truck.',
    features: [
      { id: 'job-pipeline', name: 'Job pipeline', desc: 'New → in progress → complete, with refs, scope, and photos.' },
      { id: 'sparky-ai', name: 'AI Contractor Sidekick & Copilot', desc: 'In-app AI assistant with live screen awareness. Text your AI copilot site photos, notes, and voice memos—it sorts them to the right job and reminds you later.', favorite: true },
      { id: 'text-to-job', name: 'Text-to-Job & Voice Intake', desc: 'Update quotes, append voice notes, and add punch lists simply by texting or sending voice memos to your platform number.', favorite: true },
      { id: 'job-costing', name: 'Job costing & margin', desc: 'Log materials and labor; see profit before you invoice.' },
      { id: 'activity-timeline', name: 'Activity timeline', desc: 'Per-job feed with client-visible and internal events.' },
      { id: 'crew-roster', name: 'Crew roster', desc: 'Roles, hourly rates, and photos.' },
      { id: 'crew-assignment', name: 'Crew assignment', desc: 'Assign crew to jobs; newly added crew get an auto text.' },
      { id: 'field-app', name: 'Field app', desc: 'Crew log in to see their jobs and record hours, materials, and photos on site.' },
      { id: 'payroll', name: 'Hours & pay', desc: 'Hours-and-pay rollups by crew member and pay period. Not a payroll run — no tax is calculated or withheld.' },
    ],
  },
  {
    num: '08',
    slug: 'recurring',
    title: 'Recurring & auto-billing',
    intro: 'Set repeating work once; it schedules and charges itself.',
    features: [
      { id: 'recurring-plans', name: 'Recurring plans', desc: 'Weekly, biweekly, or monthly visits that spawn a scheduled job each cycle.', favorite: true },
      { id: 'auto-charge', name: 'Auto-charge', desc: 'Saved-card billing per visit with a real itemized invoice each time.' },
      { id: 'fixed-terms', name: 'Fixed terms', desc: 'Cap a plan at a set number of visits (e.g. 12 months).' },
      { id: 'dunning', name: 'Smart dunning', desc: 'Declines are classified, retried, or routed to a card-update link automatically.' },
    ],
  },
  {
    num: '09',
    slug: 'clients',
    title: 'Clients (CRM)',
    intro: 'One profile per customer, their whole history in a place.',
    features: [
      { id: 'unified-profiles', name: 'Unified profiles', desc: 'Auto-merged by phone or email; leads, jobs, and plans in one record.' },
      { id: 'client-segments', name: 'Client list & segments', desc: 'Lifetime value, job count, last-seen; past / repeat / lapsed.' },
      { id: 'client-statements', name: 'Client statements', desc: 'Printable per-client ledger of quoted vs. paid vs. outstanding.' },
      { id: 'client-search', name: 'Client search', desc: 'Find anyone instantly by name, phone, email, or address.' },
      { id: 'client-import', name: 'Bulk import', desc: 'Bring your existing customer list in one go.' },
      { id: 'client-notes', name: 'Notes & contact', desc: 'Editable details and free-form notes per client.' },
    ],
  },
  {
    num: '10',
    slug: 'reviews',
    title: 'Reviews & reputation',
    intro: 'More reviews on Google, and a private line for anything that went wrong.',
    features: [
      { id: 'review-routing', name: 'Honest review requests', desc: 'Every customer is offered the same two things: post a public review, or tell you privately. No screening by star rating — that breaks Google’s rules and risks your profile.', favorite: true },
      { id: 'auto-reviews', name: 'Auto review requests', desc: 'Sent automatically after a job wraps.' },
      { id: 'reviews-dashboard', name: 'Reviews dashboard', desc: 'Invites, response rate, average, star distribution, and private feedback.' },
      { id: 'google-import', name: 'Google review import', desc: 'Pull your Google reviews onto your site with proper attribution.' },
    ],
  },
  {
    num: '11',
    slug: 'marketing',
    title: 'Marketing & advertising',
    intro: 'Run AI search campaigns with zero agency markups and bring past customers back.',
    features: [
      { id: 'ai-ads-autopilot', name: 'AI Ads Autopilot & Smart Bundles', desc: '1-click Google Search, Meta and Retargeting campaigns with zero agency markups and 10% transparent management.', favorite: true },
      { id: 'neighborhood-halo', name: 'Neighborhood Halo 1-Mile Micro-Ads', desc: 'Auto-launches geofenced 1-mile ads around completed job sites using site photos and sanitized street copy to win neighbor leads.', favorite: true },
      { id: 'speed-to-lead-sms', name: 'Instant Speed-to-Lead SMS', desc: 'Personalized sub-60-second text messages sent to ad leads to double booking rates.', favorite: true },
      { id: 'message-match-hero', name: 'Dynamic Message-Match Hero', desc: 'Auto-customizes website headlines to match homeowner Google search terms for max Quality Score.' },
      { id: 'weather-ad-surge', name: 'Weather Surge Demand Boost', desc: 'Auto-detects storms, freezes, and heatwaves and boosts ad budgets +25% during peak search demand.' },
      { id: 'closed-loop-conversions', name: 'Closed-Loop Conversion Sync', desc: 'Syncs gclid and signed quote revenue back to Google for AI Smart Bidding optimization.' },
      { id: 'campaigns', name: 'Campaigns', desc: 'Email/SMS blasts to all / past / repeat / lapsed, personalized, with live reach counts.' },
      { id: 'rebook', name: 'Rebook invites', desc: 'Remind customers due for their next visit; one tap or batch.' },
      { id: 'daily-digest', name: 'Daily digest', desc: 'One opt-in morning email of what matters — only on days with real news.' },
      { id: 'sms-inbox', name: 'Two-way SMS inbox', desc: 'All customer texts threaded in one place.' },
      { id: 'consent', name: 'Consent built in', desc: 'STOP/START/HELP, opt-out enforcement, delivery tracking, and unsubscribe suppression.' },
    ],
  },
  {
    num: '12',
    slug: 'insights',
    title: 'Insights, tax & exports',
    intro: 'Know your numbers and hand clean books to your accountant.',
    features: [
      { id: 'insights', name: 'Business insights', desc: 'Lead→won funnel, win rate, revenue, costs, margin vs. prior period, and recurring run-rate.' },
      { id: 'tax-reports', name: 'Tax reports', desc: 'Cash-basis P&L by year, expenses by category, CSV export.' },
      { id: 'quickbooks', name: 'QuickBooks export', desc: 'Import-ready CSV of income and expenses.' },
    ],
  },
];

export const ALL_FEATURES: Feature[] = FEATURE_CATEGORIES.flatMap((category) => category.features);

export const FEATURE_COUNT = ALL_FEATURES.length;

// The headline set, in lifecycle order, each carrying its category title for display.
export type FavoriteFeature = Feature & { category: string };
export const FAVORITE_FEATURES: FavoriteFeature[] = FEATURE_CATEGORIES.flatMap((category) =>
  category.features.filter((feature) => feature.favorite).map((feature) => ({ ...feature, category: category.title })),
);
