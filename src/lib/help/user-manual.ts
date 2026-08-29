export type ManualAudience = 'Owner' | 'Office staff' | 'Crew';

export type ManualChapter = {
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  number: number;
};

export type ManualSection = {
  title: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
};

export type ManualTroubleshootingItem = {
  problem: string;
  fix: string;
};

export type ManualArticle = {
  slug: string;
  chapterId: string;
  order: number;
  title: string;
  summary: string;
  outcome: string;
  audiences: ManualAudience[];
  readMinutes: number;
  routes: Array<{ label: string; href: string }>;
  prerequisites: string[];
  keywords: string[];
  sections: ManualSection[];
  customerView?: string;
  troubleshooting: ManualTroubleshootingItem[];
  related: string[];
};

export type ManualArticleSummary = Pick<
  ManualArticle,
  'slug' | 'chapterId' | 'order' | 'title' | 'summary' | 'audiences' | 'readMinutes' | 'prerequisites' | 'keywords'
>;

export const MANUAL_LAST_VERIFIED = 'August 28, 2026';

export const MANUAL_CHAPTERS: ManualChapter[] = [
  {
    id: 'start',
    number: 1,
    title: 'Start here',
    shortTitle: 'Start',
    summary: 'Set up the workspace, learn the navigation, and know which features are ready to use.',
  },
  {
    id: 'sales',
    number: 2,
    title: 'Leads, estimates, and quotes',
    shortTitle: 'Sales',
    summary: 'Take a new request from first response through an approved quote.',
  },
  {
    id: 'operations',
    number: 3,
    title: 'Jobs, schedule, and field operations',
    shortTitle: 'Operations',
    summary: 'Plan work, dispatch the right people, document the job, and keep the customer informed.',
  },
  {
    id: 'customers',
    number: 4,
    title: 'Clients and customer messages',
    shortTitle: 'Customers',
    summary: 'Keep customer records clean and manage every two-way conversation in one place.',
  },
  {
    id: 'crew',
    number: 5,
    title: 'Crew, subcontractors, and labor',
    shortTitle: 'Crew',
    summary: 'Manage people, assignments, timecards, labor cost, and subcontractor coverage.',
  },
  {
    id: 'money',
    number: 6,
    title: 'Invoices, payments, and cash',
    shortTitle: 'Money',
    summary: 'Collect deposits and balances, understand cash timing, and prepare financial reports.',
  },
  {
    id: 'growth',
    number: 7,
    title: 'Automations, reviews, and marketing',
    shortTitle: 'Growth',
    summary: 'Follow up consistently, earn reviews, rebook customers, and run responsible campaigns.',
  },
  {
    id: 'intake',
    number: 8,
    title: 'Website and intake channels',
    shortTitle: 'Intake',
    summary: 'Publish the website and configure Smart Intake, booking, Quick Stops, and AI voice.',
  },
  {
    id: 'account',
    number: 9,
    title: 'Account, data, and support',
    shortTitle: 'Account',
    summary: 'Control access, plans, integrations, imports, exports, security, and support.',
  },
];

export const MANUAL_ARTICLES: ManualArticle[] = [
  {
    slug: 'first-30-minutes',
    chapterId: 'start',
    order: 1,
    title: 'Your first 30 minutes in Let’s Get Quoted',
    summary: 'Complete the minimum setup needed to receive a lead, send a quote, and collect a payment.',
    outcome: 'You will have a recognizable business workspace, a usable price book, a connected payout account, and a safe test workflow.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Account', href: '/dashboard/settings' },
      { label: 'Price Book', href: '/dashboard/services' },
    ],
    prerequisites: ['Business email or mobile sign-in', 'Business and bank details for Stripe'],
    keywords: ['onboarding', 'quick start', 'first login', 'setup checklist', 'test lead'],
    sections: [
      {
        title: 'Complete the foundation first',
        steps: [
          'Open Account → Business and enter the company name, trade, ZIP code, operating location, and mailing address.',
          'Open Price Book and add the services you quote most often. Use a trade starter pack when one matches your work.',
          'Open Account → Payments and connect Stripe so deposits and invoices can be collected.',
          'Open Website, confirm the generated business details, and preview the site before publishing.',
          'Submit one test request through your website or add a manual lead from the Leads page.',
        ],
      },
      {
        title: 'Run one safe test',
        bullets: [
          'Use your own mobile number and email so no real customer receives a test.',
          'Build a small quote, preview the customer view, and stop before a real charge unless you intentionally want to test payment.',
          'Confirm the lead, quote, job, schedule, and customer record all carry the same details.',
        ],
      },
      {
        title: 'Use the onboarding checklist',
        paragraphs: ['The Dashboard keeps unfinished setup steps visible. Treat this as a readiness checklist: a green website or automation switch does not help if its prerequisite—such as an address, payout account, or messaging number—is missing.'],
      },
    ],
    customerView: 'Customers see your company name, branding, quote, scheduling choices, and payment instructions. Finish those settings before sending a real link.',
    troubleshooting: [
      { problem: 'A setup step still shows incomplete.', fix: 'Open the step from the Dashboard and confirm it was saved. Some steps require a published site or completed Stripe verification, not merely a started form.' },
      { problem: 'Payment actions are unavailable.', fix: 'Finish Stripe onboarding in Account → Payments and resolve any verification request shown there.' },
    ],
    related: ['navigate-the-dashboard', 'business-profile-and-locations', 'connect-stripe-and-get-paid'],
  },
  {
    slug: 'navigate-the-dashboard',
    chapterId: 'start',
    order: 2,
    title: 'Navigate the dashboard efficiently',
    summary: 'Understand the sidebar groups, attention badges, New menu, search, views, and mobile drawer.',
    outcome: 'You will know where work lives and how to reach the next action without hunting through menus.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
    prerequisites: ['A signed-in workspace'],
    keywords: ['navigation', 'sidebar', 'new menu', 'search', 'mobile', 'badges', 'views', 'theme'],
    sections: [
      {
        title: 'Read the sidebar as a workflow',
        bullets: [
          'Work contains Leads, Customer Messages, Jobs, Schedule, Crew & Labor, and Clients.',
          'Intake Channels contains Quick Stops, Online Booking, and the 24/7 AI Receptionist.',
          'Billing & Cash contains Reports & Insights, Recurring Jobs, Price Book, and Cash Flow.',
          'Marketing & AI contains Automations, Marketing, Blog, and Reviews.',
        ],
      },
      {
        title: 'Use the fastest controls',
        steps: [
          'Use + New for a job, lead, client, crew member, or subcontractor.',
          'Use search when you know a customer, job reference, phone number, or address.',
          'Treat numbered badges as work queues: unread conversations, open leads, jobs needing attention, or unscheduled work.',
          'On mobile, open Menu to reveal the same grouped navigation. The New button remains available from the top bar.',
        ],
      },
      {
        title: 'Choose a view for the job at hand',
        bullets: [
          'Inbox or Workspace views are best for working one record while keeping the queue beside it.',
          'Board views are best for understanding stage and moving work through a pipeline.',
          'Table views are best for sorting, scanning, exporting, and bulk work.',
          'Your chosen view is remembered on that device.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A menu item is missing for an office user.', fix: 'The owner controls office capabilities. Ask them to review Account → Team rather than sharing an owner login.' },
      { problem: 'The sidebar covers the page on a tablet.', fix: 'Close it with the Menu control or Escape. The drawer intentionally overlays the workspace at narrower widths.' },
    ],
    related: ['understand-dashboard-priorities', 'roles-permissions-and-feature-readiness', 'find-help-and-contact-support'],
  },
  {
    slug: 'understand-dashboard-priorities',
    chapterId: 'start',
    order: 3,
    title: 'Use the Dashboard as your daily command center',
    summary: 'Read Needs your attention, customer-waiting items, today’s schedule, readiness, cash, and system alerts.',
    outcome: 'You will start each day with the work that is most likely to affect revenue or customer experience.',
    audiences: ['Owner'],
    readMinutes: 5,
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
    prerequisites: ['At least one lead, job, or scheduled item for meaningful summaries'],
    keywords: ['dashboard', 'priority queue', 'needs attention', 'today', 'cash preview', 'pipeline', 'alerts'],
    sections: [
      {
        title: 'Work from the top down',
        steps: [
          'Resolve critical system alerts first, especially payout, messaging, or website readiness problems.',
          'Work Needs your attention in numbered order. These items require a decision from your team.',
          'Review With your customers separately. Those items are waiting on approval, payment, or a reply and usually should not be recreated.',
          'Check Today and the next seven days for missing crew, addresses, durations, or quiet capacity.',
          'Review unpaid invoices, open quotes, booked work, and collected cash as different measurements—not interchangeable totals.',
        ],
      },
      {
        title: 'Use the recommendations, not just the totals',
        paragraphs: ['Cards link back to the exact queue that produced the number. Open the source list before taking action so you can see which records are counted and why.'],
      },
      {
        title: 'Build a daily rhythm',
        bullets: [
          'Morning: priorities, today’s schedule, crew readiness, and communications.',
          'Midday: arrivals, exceptions, new leads, and schedule gaps.',
          'End of day: completed jobs, timecards, payment requests, and tomorrow’s blockers.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A dashboard number looks different from a report.', fix: 'Open the card to inspect its date range and definition. Booked work, collected cash, outstanding invoices, and quoted value intentionally measure different things.' },
      { problem: 'A panel says data is unavailable.', fix: 'Reload once. If the source page also fails, capture the panel name and contact support rather than recreating records.' },
    ],
    related: ['navigate-the-dashboard', 'manage-the-job-workspace', 'read-cash-flow-and-forecasts'],
  },
  {
    slug: 'business-profile-and-locations',
    chapterId: 'start',
    order: 4,
    title: 'Set up your business profile and locations',
    summary: 'Configure the details used by the website, routes, customer messages, and marketing compliance.',
    outcome: 'Your business identity and addresses will behave consistently across the dashboard and customer experience.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Business settings', href: '/dashboard/settings#business-basics' }],
    prerequisites: ['Company name', 'Trade', 'Service-area ZIP code'],
    keywords: ['business profile', 'company name', 'trade', 'zip', 'service area', 'operating address', 'mailing address'],
    sections: [
      {
        title: 'Enter the shared business details',
        steps: [
          'Open Account → Business → Profile & locations.',
          'Enter the company name, trade, ZIP code, and optional message sign-off.',
          'Choose a verified operating location: the yard, shop, or home where routes begin and end.',
          'Enter a business mailing address for promotional-email footers. A valid PO box may be appropriate for mail, but not for route planning.',
          'Save and confirm the same basics appear in the Website builder.',
        ],
      },
      {
        title: 'Keep the two addresses separate',
        bullets: [
          'Operating location affects drive calculations and day planning.',
          'Mailing address appears in promotional email footers and supports anti-spam compliance.',
          'Do not use a mailbox counter as the operating location unless crews truly leave from there.',
        ],
      },
      {
        title: 'Review after a move or rebrand',
        paragraphs: ['Update the business profile, website, Google Business Profile connection, email appearance, message sign-off, and any saved legal or insurance details together.'],
      },
    ],
    customerView: 'The company name, service area, mailing address, and message sign-off may appear on the public website, emails, quotes, and texts.',
    troubleshooting: [
      { problem: 'The route center is unverified.', fix: 'Choose the full operating address from the address suggestions instead of entering only a city or free-form description.' },
      { problem: 'Campaigns will not send.', fix: 'Confirm a business mailing address is saved; promotional email requires one.' },
    ],
    related: ['first-30-minutes', 'build-and-publish-your-website', 'import-existing-business-data'],
  },
  {
    slug: 'roles-permissions-and-feature-readiness',
    chapterId: 'start',
    order: 5,
    title: 'Understand roles, permissions, plans, and prerequisites',
    summary: 'Know why two people may see different controls and why a feature can be switched on but not live.',
    outcome: 'You will diagnose access and readiness issues without weakening account security.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Team', href: '/dashboard/settings#office-team' },
      { label: 'Plan & usage', href: '/dashboard/settings#plan-at-a-glance' },
    ],
    prerequisites: ['Owner access to change office permissions or plan capacity'],
    keywords: ['roles', 'owner', 'office', 'crew', 'permissions', 'capabilities', 'plan', 'credits', 'not live'],
    sections: [
      {
        title: 'Know the three workspace roles',
        bullets: [
          'Owner controls the business, payouts, plans, sensitive settings, and every capability.',
          'Office staff receive only the capabilities granted to their individual account.',
          'Crew use the field experience for assigned work, time, job notes, and permitted actions; they do not receive the owner dashboard.',
        ],
      },
      {
        title: 'Separate four kinds of availability',
        steps: [
          'Role: is this an owner, office staff member, or crew member?',
          'Permission: has this person been granted the required capability?',
          'Plan capacity: does the workspace include the required seats, credits, number, storage, or connection?',
          'Operational readiness: are dependencies such as Stripe, a published website, open booking windows, or carrier registration complete?',
        ],
      },
      {
        title: 'Grant the least access needed',
        bullets: [
          'Give a dispatcher schedule and job access without granting payouts or subscription controls.',
          'Give a bookkeeper reports and payment visibility without granting marketing sends.',
          'Remove access when duties change; do not share the owner’s sign-in.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A feature says On but Not live or Paused.', fix: 'Open the feature and read its readiness message. The switch records intent; the status confirms whether customers can actually use it.' },
      { problem: 'A seat or credit limit is reached.', fix: 'Open Plan & usage to review included and purchased capacity before removing users or buying more.' },
    ],
    related: ['manage-office-access-and-security', 'manage-plan-usage-and-credits', 'navigate-the-dashboard'],
  },

  {
    slug: 'manage-the-lead-inbox',
    chapterId: 'sales',
    order: 1,
    title: 'Manage the lead Inbox, Board, and Table',
    summary: 'Choose the right lead view, find the next response, and keep closed or snoozed work out of the active queue.',
    outcome: 'Every live lead will have a clear stage, priority, and next action.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Leads', href: '/dashboard/leads' }],
    prerequisites: ['Leads read access; write access for status changes'],
    keywords: ['leads', 'inbox', 'board', 'table', 'snooze', 'archive', 'new contacted quoted won lost'],
    sections: [
      {
        title: 'Pick the view that matches the work',
        bullets: [
          'Inbox prioritizes active leads and keeps one record open for fast follow-up.',
          'Board groups New, Contacted, Quoted, Won, and Lost work by stage.',
          'Table supports filtering, selection, export, and bulk updates.',
        ],
      },
      {
        title: 'Process the queue',
        steps: [
          'Open the oldest or highest-priority lead that is not already being handled.',
          'Review scope, location, photos, contact consent, score, and any Smart Intake flags.',
          'Log the call, text, email, or site visit so the next person sees the last touch.',
          'Move the lead to Contacted or Quoted as work advances.',
          'Snooze only when there is a real future reason to wait. Mark Won when verbally accepted, or Lost with the correct reason when the opportunity is finished.',
        ],
      },
      {
        title: 'Keep the queue trustworthy',
        bullets: [
          'Do not mark a lead Won merely to hide it; winning can create or advance connected job work.',
          'Use Lost reasons to improve intake rules and understand why work is not closing.',
          'Review snoozed and archived leads periodically rather than duplicating returning customers.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A closed lead disappeared.', fix: 'Switch the Inbox stage to Closed or open the Board’s Won/Lost area.' },
      { problem: 'A lead was closed automatically.', fix: 'Check the account’s lead auto-close window and the lead timeline. Reopen it if the homeowner returns.' },
    ],
    related: ['qualify-and-contact-a-lead', 'build-and-send-a-quote', 'manage-the-job-workspace'],
  },
  {
    slug: 'qualify-and-contact-a-lead',
    chapterId: 'sales',
    order: 2,
    title: 'Qualify, prioritize, and contact a lead',
    summary: 'Use Smart Intake signals, consent, route fit, and contact history to decide what to do next.',
    outcome: 'You will respond to the best opportunities first without losing the context behind the score.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Leads', href: '/dashboard/leads' },
      { label: 'Smart Intake settings', href: '/dashboard/automations#intake-ai' },
    ],
    prerequisites: ['A lead with contact information or an intake submission'],
    keywords: ['lead score', 'hot', 'warm', 'low', 'triage', 'consent', 'contact log', 'estimate visit'],
    sections: [
      {
        title: 'Use the score as a starting point',
        bullets: [
          'Hot usually means clear scope, service-area fit, realistic timing or budget, and strong hiring intent.',
          'Warm means the opportunity is real but something important is not confirmed.',
          'Low may indicate research-only intent, a poor service-area fit, below-minimum work, or work you do not take.',
        ],
      },
      {
        title: 'Make the first response useful',
        steps: [
          'Confirm the project, property address, desired timeline, and decision maker.',
          'Respect text-only or do-not-call signals. Use the permitted channel.',
          'Ask only for missing information; do not make the customer repeat the submitted form.',
          'Log the contact result and schedule an estimate visit when an on-site look is needed.',
          'Adjust the score or stage when your conversation changes the facts.',
        ],
      },
      {
        title: 'Tune Smart Intake carefully',
        paragraphs: ['Review several real leads before changing high-value thresholds, estimate posture, or low-quality muting. A stricter rule can reduce noise, but it can also bury unfamiliar work that would have been profitable.'],
      },
    ],
    customerView: 'The homeowner may receive a confirmation, estimate scheduling choices, or a decline message depending on the action and consent available.',
    troubleshooting: [
      { problem: 'Text controls are unavailable.', fix: 'Confirm a valid mobile number, customer texting readiness, and applicable consent. Use email or phone when appropriate.' },
      { problem: 'The score looks wrong.', fix: 'Open the lead, review the intake answers, and adjust the score. Then review Smart Intake rules if the same pattern repeats.' },
    ],
    related: ['manage-the-lead-inbox', 'schedule-estimate-and-start-date-options', 'configure-automations-safely'],
  },
  {
    slug: 'schedule-estimate-and-start-date-options',
    chapterId: 'sales',
    order: 3,
    title: 'Schedule an estimate and offer start-date choices',
    summary: 'Book the estimating visit, then offer realistic dates without overcommitting capacity.',
    outcome: 'The customer will know when to expect you and can choose from dates you can actually support.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Leads', href: '/dashboard/leads' }],
    prerequisites: ['Lead address', 'Working hours', 'Estimated duration when known'],
    keywords: ['estimate visit', 'availability', 'start date', 'schedule options', 'capacity'],
    sections: [
      {
        title: 'Schedule the estimating visit',
        steps: [
          'Open the lead and choose the estimate or site-visit action.',
          'Pick a date and time that fits working hours and travel.',
          'Confirm the address and contact channel before sending.',
          'Log any access, parking, gate, or property notes on the lead.',
        ],
      },
      {
        title: 'Offer job dates only after checking capacity',
        steps: [
          'Estimate the labor hours and likely crew size.',
          'Review the Schedule for existing work and quiet capacity.',
          'Offer a small set of credible dates rather than every open day.',
          'When a deposit is required before scheduling, make that order clear in the quote.',
        ],
      },
      {
        title: 'Use arrival windows',
        bullets: [
          'A window protects the customer from uncertainty without promising an exact minute traffic may break.',
          'Keep windows inside the configured workday and leave enough drive and job buffer.',
        ],
      },
    ],
    customerView: 'The customer sees the offered visit or start-date choices and may confirm or ask for different options.',
    troubleshooting: [
      { problem: 'A date looks open but cannot be offered.', fix: 'Check working hours, job duration, booking limits, existing holds, crew capacity, and any deposit-before-scheduling rule.' },
      { problem: 'The customer requested different dates.', fix: 'Open the request state, review their note, and send a new set instead of creating a duplicate job.' },
    ],
    related: ['qualify-and-contact-a-lead', 'build-and-send-a-quote', 'schedule-work-from-the-queue'],
  },
  {
    slug: 'build-and-send-a-quote',
    chapterId: 'sales',
    order: 4,
    title: 'Build, preview, and send a quote',
    summary: 'Create an itemized offer with required work, optional upgrades, recurring service, terms, and delivery controls.',
    outcome: 'The customer will receive a clear, reviewable quote that can be approved without re-entering the job.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [
      { label: 'Leads', href: '/dashboard/leads' },
      { label: 'Price Book', href: '/dashboard/services' },
    ],
    prerequisites: ['Customer name and a reachable email or mobile number', 'Stripe when a deposit is required'],
    keywords: ['quote', 'estimate', 'proposal', 'line items', 'optional add-ons', 'good better best', 'deposit', 'e-sign'],
    sections: [
      {
        title: 'Build the offer',
        steps: [
          'Start from the lead or connected job so customer and scope details carry forward.',
          'Add required line items from the Price Book or enter a custom item.',
          'Add optional upgrades only when the customer can understand the outcome of choosing them.',
          'Add a recurring line when ongoing service is part of the offer; set frequency, term, and any prepay discount deliberately.',
          'Set estimated hours, terms, deposit, and start-date choices where applicable.',
        ],
      },
      {
        title: 'Preview before sending',
        bullets: [
          'Confirm customer spelling, address, scope, selected defaults, math, deposit, and contact channel.',
          'Read the quote on a phone-sized preview; most homeowners will open it there.',
          'Make optional items clearly optional. Do not rely on fine print to explain the base scope.',
        ],
      },
      {
        title: 'Send and follow the state',
        steps: [
          'Send by the consented text or email channel shown on the record.',
          'Confirm the delivery result instead of assuming enqueueing means the customer received it.',
          'Let automatic follow-ups run if enabled; log personal follow-up so the team does not duplicate it.',
        ],
      },
    ],
    customerView: 'The customer can review the scope and price, choose eligible add-ons or recurring service, sign, pay a required deposit, and choose offered dates.',
    troubleshooting: [
      { problem: 'The quote cannot be sent.', fix: 'Check the contact channel, consent, messaging readiness, required quote fields, and Stripe readiness when the quote requests payment.' },
      { problem: 'The wrong item is selected by default.', fix: 'Return to the quote builder, correct selected and recommended states, and preview again before resending.' },
    ],
    related: ['manage-your-price-book', 'understand-the-customer-approval-flow', 'configure-automations-safely'],
  },
  {
    slug: 'understand-the-customer-approval-flow',
    chapterId: 'sales',
    order: 5,
    title: 'Understand approval, signature, deposit, and job conversion',
    summary: 'Know what happens when a customer approves online or accepts verbally.',
    outcome: 'You will advance the opportunity once, preserve the approval record, and avoid duplicate jobs or charges.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Leads', href: '/dashboard/leads' },
      { label: 'Jobs', href: '/dashboard/jobs' },
    ],
    prerequisites: ['A sent quote'],
    keywords: ['approve', 'signature', 'deposit', 'mark won', 'convert lead', 'job created'],
    sections: [
      {
        title: 'Online acceptance',
        steps: [
          'The customer opens the private quote link and reviews the scope.',
          'They choose eligible options, accept the agreement, and sign.',
          'If a deposit is required, they pay through the connected payment flow.',
          'The lead and connected job advance from the acceptance event; the feed records what happened.',
        ],
      },
      {
        title: 'Verbal acceptance',
        paragraphs: ['Use Mark won only when the customer has genuinely accepted outside the online flow. This records the business decision and can advance connected work; it is not merely an organizational label.'],
      },
      {
        title: 'Verify the handoff',
        bullets: [
          'Open the job created or linked from the lead.',
          'Confirm chosen options, amount, approval state, payment, schedule request, and customer details.',
          'Do not create another job when the lead already links to one.',
        ],
      },
    ],
    customerView: 'The approval page becomes the customer’s shared source for the accepted scope, schedule, updates, selections, and payments.',
    troubleshooting: [
      { problem: 'A customer says they approved but the job did not advance.', fix: 'Check the job feed and payment state. Do not mark approved a second time until you confirm whether the original event settled.' },
      { problem: 'The homeowner accepted by phone.', fix: 'Use Mark won and document the conversation. Send or update the written quote so the agreed scope is still recorded.' },
    ],
    related: ['build-and-send-a-quote', 'manage-the-job-workspace', 'request-deposits-and-stage-payments'],
  },

  {
    slug: 'manage-the-job-workspace',
    chapterId: 'operations',
    order: 1,
    title: 'Manage a job from overview to completion',
    summary: 'Use the job workspace, lifecycle actions, feed, checklist, files, and detail views without losing context.',
    outcome: 'The job record will remain the single source of truth from approved scope through completed work.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['A job record; jobs access for office staff'],
    keywords: ['job', 'workspace', 'overview', 'feed', 'checklist', 'photos', 'start complete archive'],
    sections: [
      {
        title: 'Choose a job-list view',
        bullets: [
          'Smoothie keeps the prioritized queue and job details together.',
          'Focus emphasizes one job while preserving a side list.',
          'Board groups New request, In progress, Complete, and Archived stages.',
          'Table is best for dense sorting; List is the classic stacked view.',
        ],
      },
      {
        title: 'Work the lifecycle in order',
        steps: [
          'Confirm quote approval and any required deposit.',
          'Set the schedule, duration, address, and assigned crew.',
          'Start the job when field work begins; this records actual lifecycle timing.',
          'Use the feed for customer-visible updates and internal notes with the correct visibility.',
          'Complete checklist, selections, documentation, invoicing, and review readiness before marking complete.',
          'Archive only when the record should leave active operations.',
        ],
      },
      {
        title: 'Use the right detail tab',
        bullets: [
          'Overview: client, contact, address, crew, and core facts.',
          'Property Intel and Permits: property and jurisdiction work.',
          'Timeline: the job’s history and customer updates.',
          'Checklist and Photos: execution proof.',
          'Quote & Payment: financial state and customer requests.',
        ],
      },
    ],
    customerView: 'Customer-visible feed updates, photos, schedule information, selections, invoices, and accepted documents appear in the private job experience.',
    troubleshooting: [
      { problem: 'A job is missing from the default list.', fix: 'Check the status filter, selected view, search, and Archived stage. Quote-only records may remain outside active work until accepted.' },
      { problem: 'Mark complete asks about a review.', fix: 'Choose whether this job should trigger the review request. The confirmation summarizes what will happen before completion.' },
    ],
    related: ['schedule-work-from-the-queue', 'document-work-and-change-orders', 'create-and-send-an-invoice'],
  },
  {
    slug: 'schedule-work-from-the-queue',
    chapterId: 'operations',
    order: 2,
    title: 'Schedule work from the unscheduled queue',
    summary: 'Resolve job blockers, place work on the calendar, and distinguish approved from tentative scheduling.',
    outcome: 'Scheduled jobs will have a credible date, duration, location, and crew plan.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Schedule', href: '/dashboard/schedule' }],
    prerequisites: ['Job address', 'Estimated hours', 'Working hours', 'Schedule permission for office staff'],
    keywords: ['schedule', 'unscheduled queue', 'calendar', 'drag drop', 'tentative', 'crew lanes', 'month week day'],
    sections: [
      {
        title: 'Clear readiness blockers',
        steps: [
          'Open the job in the Needs a date queue.',
          'Resolve missing address, duration, crew, approval, or customer-date state shown on the card.',
          'Review the calendar and crew lanes for the full job span, not just the first day.',
          'Choose the date and time, assign crew, and save the schedule.',
        ],
      },
      {
        title: 'Use tentative scheduling deliberately',
        paragraphs: ['Approved work gets the primary Schedule action. An unapproved quote can be placed tentatively when the business has a real reason to reserve capacity, but the calendar must not be mistaken for a sold job.'],
      },
      {
        title: 'Choose the calendar view',
        bullets: [
          'Day and week views support operational placement and crew conflicts.',
          'Month view shows capacity and longer spans.',
          'Map view reveals geographic clustering and inefficient travel.',
          'The mobile agenda prioritizes readable daily execution over a compressed desktop grid.',
        ],
      },
    ],
    customerView: 'Customers see the confirmed schedule or an offered choice only when you send or publish it; internal tentative placement is not a promise by itself.',
    troubleshooting: [
      { problem: 'The job is not in the unscheduled queue.', fix: 'It may already be scheduled, completed, archived, or filtered out. Open the job and inspect Scheduled for and status.' },
      { problem: 'A drag action will not save.', fix: 'Open the job panel and resolve required address, duration, crew, or scheduling constraints explicitly.' },
    ],
    related: ['plan-a-day-and-dispatch-crew', 'schedule-estimate-and-start-date-options', 'configure-online-booking'],
  },
  {
    slug: 'plan-a-day-and-dispatch-crew',
    chapterId: 'operations',
    order: 3,
    title: 'Plan a day, optimize the route, and dispatch crew',
    summary: 'Order stops, account for travel and unmappable work, brief the crew, and monitor the live day.',
    outcome: 'The day will have an intentional stop order and crews will receive the information needed to execute it.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Plan my day', href: '/dashboard/schedule/plan' },
      { label: 'Live Dispatch', href: '/dashboard/schedule/dispatch' },
    ],
    prerequisites: ['Scheduled jobs with verified addresses', 'Crew assignments for dispatch'],
    keywords: ['plan day', 'route map', 'stops', 'dispatch', 'arrival', 'weather', 'live map'],
    sections: [
      {
        title: 'Build the route',
        steps: [
          'Open Plan my day for the correct date.',
          'Review mappable stops and resolve any address that cannot be routed.',
          'Reorder work around promised windows, crew skills, supply needs, and realistic travel.',
          'Add a route stop when the day needs a supplier, dump, inspection, or other non-job visit.',
          'Save the plan and brief the assigned crew.',
        ],
      },
      {
        title: 'Run the live day',
        bullets: [
          'Use Live Dispatch to see assignments, active shifts, arrivals, and location freshness.',
          'Send arrival updates when someone is genuinely on the way.',
          'Treat stale location data as unknown, not as proof that a person is at a location.',
          'Review weather for operational decisions; do not promise weather-dependent work solely from a forecast panel.',
        ],
      },
      {
        title: 'Handle change without hiding it',
        paragraphs: ['When a stop moves, update the schedule and notify affected customers through the supported action. A silent drag can fix the internal calendar while leaving the customer with the old promise.'],
      },
    ],
    customerView: 'Customers may receive a schedule change, reminder, confirmation, or on-the-way update depending on the action and automation settings.',
    troubleshooting: [
      { problem: 'A stop cannot be routed.', fix: 'Open the job, select a verified full street address, and return to the planner.' },
      { problem: 'A crew location looks old.', fix: 'Check the freshness label, field-app permissions, active shift, and device connectivity before acting on it.' },
    ],
    related: ['schedule-work-from-the-queue', 'run-the-field-workflow', 'configure-appointment-and-arrival-messages'],
  },
  {
    slug: 'document-work-and-change-orders',
    chapterId: 'operations',
    order: 4,
    title: 'Document photos, selections, milestones, and change orders',
    summary: 'Capture proof, decisions, extra work, and customer-visible progress in the job record.',
    outcome: 'The completed job will show what was agreed, what changed, and what was delivered.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 7,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['An active job; write access for office staff'],
    keywords: ['photos', 'checklist', 'selections', 'milestones', 'change order', 'warranty', 'lien waiver', 'permits'],
    sections: [
      {
        title: 'Capture work as it happens',
        bullets: [
          'Use the checklist for verifiable completion items, not general conversation.',
          'Upload before, progress, and after photos with enough context to identify the area.',
          'Record customer selections with needed-by dates so reminders have a meaningful deadline.',
          'Use milestones for significant project stages and payment-linked proof.',
        ],
      },
      {
        title: 'Use a change order for extra work',
        steps: [
          'Describe why the original scope changed.',
          'List added or removed work and its price effect.',
          'Send the change for customer review when approval is required.',
          'Wait for the accepted state before treating the extra work as authorized.',
          'Keep internal notes separate from customer-visible wording.',
        ],
      },
      {
        title: 'Close with the right records',
        bullets: [
          'Use permits and inspections where jurisdiction work applies.',
          'Create lien waivers appropriate to the payment and completion state after compliance review.',
          'Record warranty terms and later claims on the same job.',
          'Review subcontractor compliance before final closeout.',
        ],
      },
    ],
    customerView: 'Customer-visible updates, selections, accepted change orders, schedule milestones, documents, and photos appear in the private job experience.',
    troubleshooting: [
      { problem: 'A customer says they did not approve extra work.', fix: 'Open the change order and confirm its status and event history. Do not rely on an internal note as customer approval.' },
      { problem: 'A photo is on the wrong job.', fix: 'Stop before sending customer updates. Download or preserve the file, remove it from the incorrect record if permitted, and upload it to the correct job.' },
    ],
    related: ['manage-the-job-workspace', 'run-the-field-workflow', 'create-and-send-an-invoice'],
  },
  {
    slug: 'manage-recurring-jobs',
    chapterId: 'operations',
    order: 5,
    title: 'Create and manage recurring jobs',
    summary: 'Turn repeat service into a plan, review future visits, and keep automatic billing understandable.',
    outcome: 'Recurring work will have a clear frequency, value, next visit, and review queue.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Recurring Jobs', href: '/dashboard/recurring' }],
    prerequisites: ['Customer and service details', 'Stripe for recurring automatic charges'],
    keywords: ['recurring', 'plan', 'weekly', 'biweekly', 'monthly', 'auto billing', 'calendar', 'map'],
    sections: [
      {
        title: 'Create a clear plan',
        steps: [
          'Choose the customer, plan name, service, amount, and frequency.',
          'Set the next visit and confirm whether payment is automatic or requested another way.',
          'Review the customer’s acceptance and saved payment readiness before relying on automatic billing.',
          'Use the calendar to check generated visits and the map to understand route density.',
        ],
      },
      {
        title: 'Operate the book',
        bullets: [
          'Work Needs your review before Coming up.',
          'Sort by next visit for execution, value for commercial review, and customer for account cleanup.',
          'Pause or edit future behavior instead of deleting history when service changes.',
        ],
      },
      {
        title: 'Explain billing in plain language',
        paragraphs: ['The frequency of work and the frequency of payment should be obvious to both the business and customer. Confirm the amount, cadence, term, and cancellation expectation in the accepted plan.'],
      },
    ],
    customerView: 'The customer sees the recurring plan terms, upcoming visits, accepted payment schedule, and receipts in the connected job experience.',
    troubleshooting: [
      { problem: 'A future visit is missing.', fix: 'Check the plan status, next-visit date, generation window, and whether the plan was paused or edited.' },
      { problem: 'An automatic charge did not run.', fix: 'Review the installment or payment state, saved payment method, and any failed-payment recovery status before retrying.' },
    ],
    related: ['request-deposits-and-stage-payments', 'schedule-work-from-the-queue', 'read-cash-flow-and-forecasts'],
  },

  {
    slug: 'manage-client-records',
    chapterId: 'customers',
    order: 1,
    title: 'Manage client records, history, statements, and duplicates',
    summary: 'Use one reliable customer record for contact details, jobs, leads, portal access, value, and payment history.',
    outcome: 'Your customer book will be searchable, deduplicated, and useful for service and marketing decisions.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Clients', href: '/dashboard/clients' }],
    prerequisites: ['Clients access for office staff'],
    keywords: ['clients', 'customers', 'duplicate', 'merge', 'statement', 'history', 'portal', 'repeat'],
    sections: [
      {
        title: 'Use the client workspace',
        bullets: [
          'Workspace view helps you work one customer with context beside the queue.',
          'Table view is better for comparing job count, value, and last activity.',
          'Search supports names, phone numbers, email addresses, and other saved details.',
          'Repeat-only and follow-up signals help find relationships worth attention.',
        ],
      },
      {
        title: 'Maintain one identity',
        steps: [
          'Search before adding a new client manually.',
          'Update contact details on the existing client when the same person returns.',
          'Review duplicate groups before campaigns, statements, or large imports.',
          'Merge only after confirming which details and history belong together.',
        ],
      },
      {
        title: 'Use the client detail',
        bullets: [
          'Review connected jobs and prior requests before responding.',
          'Check which private portal links the client holds.',
          'Use the statement for job and payment history when an owner-level financial view is appropriate.',
          'Keep durable service notes useful and professional; they may be read long after the original conversation.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'The same person appears twice.', fix: 'Open duplicate cleanup and compare phone, email, address, jobs, and payments before merging.' },
      { problem: 'An office user cannot open a statement.', fix: 'Client statements are owner-sensitive. Ask the owner to provide the appropriate financial information.' },
    ],
    related: ['work-the-customer-text-inbox', 'import-existing-business-data', 'request-and-manage-reviews'],
  },
  {
    slug: 'work-the-customer-text-inbox',
    chapterId: 'customers',
    order: 2,
    title: 'Work the customer text inbox',
    summary: 'Search and filter conversations, reply with context, handle unread work, and respect messaging state.',
    outcome: 'Customer conversations will be answered once, from the right identity, with the job context visible.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Customer Messages', href: '/dashboard/messages' }],
    prerequisites: ['Messages access', 'Customer texting readiness for outbound messages'],
    keywords: ['messages', 'text inbox', 'sms', 'reply', 'saved replies', 'unread', 'consent', 'stop'],
    sections: [
      {
        title: 'Process conversations',
        steps: [
          'Filter unread or search by customer, number, or conversation text.',
          'Open the thread and review the client, job, last invoice, and notes shown beside it.',
          'Reply in the existing conversation instead of starting a duplicate thread.',
          'Use a saved reply as a starting point, then personalize the facts that matter.',
          'Confirm the thread is marked read only after the needed response or follow-up is clear.',
        ],
      },
      {
        title: 'Respect consent and identity',
        bullets: [
          'A STOP or other opt-out is a state, not an objection to work around.',
          'Do not move business automation to a personal number because carrier registration is incomplete.',
          'Use the dedicated business identity shown by the workspace so replies route back to the correct account.',
        ],
      },
      {
        title: 'Keep the team coordinated',
        paragraphs: ['Use client and job notes for durable context. The inbox is for the conversation itself; do not force coworkers to read a long thread to discover the operational decision.'],
      },
    ],
    customerView: 'The customer sees a normal text conversation from the configured business number, including legally required opt-out language where applicable.',
    troubleshooting: [
      { problem: 'Reply is disabled.', fix: 'Read the readiness message. Check consent, destination validity, dedicated-number status, credits, and whether message history loaded safely.' },
      { problem: 'An unknown number is not linked to a client.', fix: 'Use Add as customer only after confirming identity; avoid attaching an ambiguous shared number to the wrong person.' },
    ],
    related: ['set-up-business-texting', 'manage-client-records', 'configure-appointment-and-arrival-messages'],
  },
  {
    slug: 'set-up-business-texting',
    chapterId: 'customers',
    order: 3,
    title: 'Set up your dedicated business texting number',
    summary: 'Submit accurate carrier-registration details, understand the approval states, and know when outbound texting is truly ready.',
    outcome: 'Customer texting will use a registered business identity with replies routed into the dashboard.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Dedicated number setup', href: '/dashboard/messages/dedicated-number' }],
    prerequisites: ['Legal business details', 'EIN when applicable', 'Published opt-in and privacy evidence'],
    keywords: ['dedicated number', '10dlc', 'carrier registration', 'sms setup', 'ein', 'campaign', 'signalwire'],
    sections: [
      {
        title: 'Prepare accurate registration information',
        bullets: [
          'Use the legal business name associated with the tax identity, not an informal nickname.',
          'Describe the real customer-message use cases and expected volume.',
          'Provide clear opt-in language and evidence from the actual customer journey.',
          'Confirm the website privacy and SMS terms match how the product is used.',
        ],
      },
      {
        title: 'Submit and follow the states',
        steps: [
          'Complete every required field and review for exact legal spelling.',
          'Submit once; do not create repeated applications while a carrier review is pending.',
          'Watch the setup page for requested corrections, campaign approval, number assignment, and inbound readiness.',
          'Send a canary message and reply only after the page reports the number ready.',
        ],
      },
      {
        title: 'Know what ready means',
        paragraphs: ['A purchased phone number is not enough. Carrier campaign approval, assignment, SMS capability, production callback readiness, and successful delivery all matter before automation should depend on the number.'],
      },
    ],
    customerView: 'Customers see a consistent local business number and can reply or use STOP/START keywords as supported by the messaging program.',
    troubleshooting: [
      { problem: 'Registration is rejected or needs correction.', fix: 'Correct the specific legal-name, tax-ID, opt-in, website, or use-case issue shown. Do not invent evidence or change unrelated fields.' },
      { problem: 'The number exists but messages are blocked.', fix: 'Check campaign assignment, outbound readiness, number capability, credits, and callback verification rather than buying another number.' },
    ],
    related: ['work-the-customer-text-inbox', 'configure-automations-safely', 'configure-ai-receptionist'],
  },

  {
    slug: 'manage-crew-and-field-access',
    chapterId: 'crew',
    order: 1,
    title: 'Add crew members and configure field access',
    summary: 'Create employee records, add verified contact details, set pay information, invite field access, and archive safely.',
    outcome: 'Each crew member will have one usable identity, the right assignments, and appropriate field access.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Crew & Labor', href: '/dashboard/crew?tab=people' }],
    prerequisites: ['An available crew seat for active employees', 'Crew write access for office staff'],
    keywords: ['crew', 'employee', 'invite', 'field app', 'pay rate', 'archive', 'phone verification'],
    sections: [
      {
        title: 'Create one complete crew record',
        steps: [
          'Open Crew & Labor → Team and choose Add employee.',
          'Enter the person’s name, mobile number, role label, worker type, and pay basis.',
          'Add a recognizable photo when useful for dispatch and field identification.',
          'Send the field invitation and confirm the person can sign in from their own device.',
          'Assign jobs only after checking the correct crew identity and contact number.',
        ],
      },
      {
        title: 'Use seat capacity intentionally',
        bullets: [
          'Active employees consume crew capacity; archived people preserve history without remaining active.',
          'Do not create a second record to fix an invitation. Correct or resend the existing one.',
          'Subcontractors have different compliance and dispatch needs; add them as subcontractors.',
        ],
      },
      {
        title: 'Protect payroll history',
        paragraphs: ['Archive rather than delete when a worker leaves. Historical hours, pay, assignments, and job labor must remain explainable.'],
      },
    ],
    troubleshooting: [
      { problem: 'A new employee cannot be activated.', fix: 'Review Plan & usage for crew-seat capacity, then archive an inactive employee or add eligible capacity.' },
      { problem: 'The invitation goes to the wrong phone.', fix: 'Correct the crew record before resending. Do not ask the worker to use another person’s link.' },
    ],
    related: ['run-the-field-workflow', 'review-timecards-and-pay', 'manage-subcontractor-coverage'],
  },
  {
    slug: 'run-the-field-workflow',
    chapterId: 'crew',
    order: 2,
    title: 'Run the crew field workflow',
    summary: 'Clock in, open assigned jobs, follow schedule details, record notes and materials, and send trustworthy arrival updates.',
    outcome: 'Field activity will reach the job and timecard records without requiring end-of-day reconstruction.',
    audiences: ['Crew', 'Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Crew & Labor', href: '/dashboard/crew' },
      { label: 'Live Dispatch', href: '/dashboard/schedule/dispatch' },
    ],
    prerequisites: ['Crew invitation accepted', 'Assigned job', 'Location and notification permissions where used'],
    keywords: ['field app', 'clock in', 'clock out', 'crew schedule', 'job notes', 'materials', 'arrival'],
    sections: [
      {
        title: 'Start the day from the assigned work',
        steps: [
          'Sign in with your own crew identity and review today’s assigned jobs.',
          'Clock in when the paid shift begins according to company policy.',
          'Open the job before navigating so the address, contact, scope, access notes, and checklist are current.',
          'Use the supported arrival action only when you are actually on the way.',
          'Add job notes, materials, photos, checklist progress, and change information while the facts are fresh.',
          'Clock out when the paid shift ends and review the captured time.',
        ],
      },
      {
        title: 'Use the voice hotline carefully',
        bullets: [
          'Identify the correct job before dictating a scope update, material cost, or change order.',
          'Review the parsed result when the workflow offers confirmation.',
          'Do not use hands-free convenience to bypass customer approval for added work.',
        ],
      },
      {
        title: 'Keep location expectations honest',
        paragraphs: ['Location freshness depends on permissions, connectivity, active work, and device behavior. A last-seen point is operational context, not a substitute for speaking to someone during an emergency.'],
      },
    ],
    customerView: 'Customers may receive arrival and job updates created by the field workflow; internal notes and labor records remain private when marked correctly.',
    troubleshooting: [
      { problem: 'A job is missing from the crew schedule.', fix: 'Ask the dispatcher to confirm the exact crew assignment, date, and field-access identity.' },
      { problem: 'A shift was left open.', fix: 'Tell the owner or payroll reviewer. Use the supported close or correction workflow so the audit trail explains the change.' },
    ],
    related: ['manage-crew-and-field-access', 'review-timecards-and-pay', 'document-work-and-change-orders'],
  },
  {
    slug: 'review-timecards-and-pay',
    chapterId: 'crew',
    order: 3,
    title: 'Review timecards, approve pay, and export payroll',
    summary: 'Work the timecard action queue, correct anomalies, approve a period, and preserve payroll evidence.',
    outcome: 'Paid hours will be reviewed, attributable to jobs where possible, and exported or marked paid with an audit trail.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [{ label: 'Timecards', href: '/dashboard/crew?tab=hours' }],
    prerequisites: ['Crew pay visibility; pay-write permission for office staff who approve or mark paid'],
    keywords: ['timecards', 'hours', 'pay', 'payroll', 'approve', 'export', 'anomalies', 'period'],
    sections: [
      {
        title: 'Use the action queue',
        steps: [
          'Choose the correct weekly, biweekly, monthly, or custom period.',
          'Resolve Needs attention & anomalies before approving anything.',
          'Review each worker’s hours, pay basis, rate changes, job attribution, and open shifts.',
          'Correct or document exceptions using the supported adjustment controls.',
          'Approve the period only when the source lines match the agreed time.',
          'Export to the configured payroll provider or mark the supported payment state accurately.',
        ],
      },
      {
        title: 'Do not confuse the states',
        bullets: [
          'Needs review means the time or calculation is not ready.',
          'Approved means the business accepts the amount; it does not mean money moved.',
          'Sent to payroll means the handoff occurred; it does not prove settlement.',
          'Paid should match the real payment and date.',
        ],
      },
      {
        title: 'Use Job labor for margin control',
        paragraphs: ['The Job labor tab compares actual labor hours and wages against quoted hours and revenue. Review overruns while the work is active enough to change course.'],
      },
    ],
    troubleshooting: [
      { problem: 'Pay totals changed after review.', fix: 'Check for newly closed shifts, adjustments, overlapping entries, period boundaries, or changed pay settings before approving again.' },
      { problem: 'Payroll export is blocked.', fix: 'Resolve unreviewed entries, missing pay configuration, required separation of approver and payer, and provider setup.' },
    ],
    related: ['manage-crew-and-field-access', 'run-the-field-workflow', 'read-reports-and-profitability'],
  },
  {
    slug: 'manage-subcontractor-coverage',
    chapterId: 'crew',
    order: 4,
    title: 'Manage subcontractors and coverage requests',
    summary: 'Maintain subcontractor profiles, request job coverage, track replies, assign accepted help, and review performance.',
    outcome: 'Subcontracted work will have a clear request, response, assignment, compliance state, and post-job review.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Crew & Labor', href: '/dashboard/crew?tab=people' },
      { label: 'Coverage Requests', href: '/dashboard/schedule/requests' },
    ],
    prerequisites: ['Subcontractor contact details', 'Open job', 'Crew and schedule permissions'],
    keywords: ['subcontractor', 'coverage request', 'offers', 'compliance', 'assign', 'insurance', 'review'],
    sections: [
      {
        title: 'Build a usable subcontractor roster',
        bullets: [
          'Record company name, trade, contact information, service area, and worker type accurately.',
          'Track insurance, licensing, tax, and other compliance evidence required by your business and jurisdiction.',
          'Archive unavailable vendors instead of losing their historical assignments and reviews.',
        ],
      },
      {
        title: 'Request coverage',
        steps: [
          'Open Coverage Requests or request a subcontractor from the job.',
          'Choose the job and write a specific work description, date, location, and pay expectation.',
          'Select appropriate recipients and send the offer.',
          'Track who was asked and whether they accepted, declined, or did not answer.',
          'Confirm the accepted subcontractor is assigned to the job and the schedule reflects the change.',
        ],
      },
      {
        title: 'Close the loop',
        paragraphs: ['After completion, review work quality, communication, on-time arrival, and cleanliness. Keep the review factual and tied to the job.'],
      },
    ],
    troubleshooting: [
      { problem: 'No subcontractors are available to offer the job.', fix: 'Add or reactivate eligible subcontractors and confirm the job is open and has enough details to request coverage.' },
      { problem: 'An acceptance did not assign the person.', fix: 'Open the request history and job assignment. Avoid sending a second offer until you know whether the inbound response was processed.' },
    ],
    related: ['manage-crew-and-field-access', 'plan-a-day-and-dispatch-crew', 'document-work-and-change-orders'],
  },

  {
    slug: 'connect-stripe-and-get-paid',
    chapterId: 'money',
    order: 1,
    title: 'Connect Stripe and understand payouts',
    summary: 'Complete payment onboarding, respond to verification requests, and distinguish customer payment from bank payout timing.',
    outcome: 'Your workspace will be able to request eligible payments and you will know where to resolve payout issues.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Payments settings', href: '/dashboard/settings#payments' }],
    prerequisites: ['Business identity', 'Authorized representative', 'Bank account and tax details'],
    keywords: ['stripe', 'connect', 'payout', 'bank', 'verification', 'payments paused', 'deposit timing'],
    sections: [
      {
        title: 'Complete onboarding',
        steps: [
          'Open Account → Payments and start the Stripe connection.',
          'Enter the legal entity, representative, ownership, tax, and bank details requested by Stripe.',
          'Return to Let’s Get Quoted and confirm the payout account reports connected.',
          'Resolve any additional information request promptly; a previously connected account can later require verification.',
        ],
      },
      {
        title: 'Understand the money states',
        bullets: [
          'A customer checkout session is not a completed payment.',
          'A successful payment is not necessarily an available bank payout yet.',
          'Card and bank payments clear on different timelines.',
          'Stripe controls payout verification and bank timing; the job payment record shows the customer-side event.',
        ],
      },
      {
        title: 'Respond to a paused account',
        paragraphs: ['Use the dashboard alert or Payments settings to reopen the Stripe onboarding surface and provide the exact requested information. Do not disconnect an account with unresolved customer money unless support directs you.'],
      },
    ],
    customerView: 'Customers see the secure payment flow and receipts; they do not see your bank payout schedule or verification documents.',
    troubleshooting: [
      { problem: 'Payments are paused.', fix: 'Open the Stripe verification surface from Account → Payments and complete the outstanding requirement.' },
      { problem: 'The customer paid but the bank deposit is missing.', fix: 'Confirm the payment settled, then check Stripe’s payout status, expected arrival, bank holidays, and any account hold.' },
    ],
    related: ['create-and-send-an-invoice', 'request-deposits-and-stage-payments', 'read-cash-flow-and-forecasts'],
  },
  {
    slug: 'create-and-send-an-invoice',
    chapterId: 'money',
    order: 2,
    title: 'Create, send, and manage an invoice',
    summary: 'Build the invoice from the job, request the correct amount, share the private link, and manage status safely.',
    outcome: 'The customer will receive one clear request for the correct outstanding amount.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['A job with customer contact details', 'Connected Stripe for online collection'],
    keywords: ['invoice', 'payment link', 'balance', 'line items', 'signed', 'paid', 'void'],
    sections: [
      {
        title: 'Prepare the invoice',
        steps: [
          'Open the job and review the accepted quote, change orders, deposits, prior invoices, and payments.',
          'Choose the invoice or payment action and confirm whether this is a deposit, progress payment, final balance, or custom request.',
          'Build the invoice lines and verify the total does not ask for money already collected.',
          'Preview the customer-facing invoice and payment methods.',
          'Send through the supported channel or copy the private sign-off link when appropriate.',
        ],
      },
      {
        title: 'Read invoice status correctly',
        bullets: [
          'Draft is not customer-ready.',
          'Sent means a delivery was attempted; inspect delivery evidence when important.',
          'Signed records customer sign-off where used.',
          'Paid must be supported by a payment or recorded settlement.',
          'Void keeps history while ending the request; deleting is a more destructive action.',
        ],
      },
      {
        title: 'Send one request at a time',
        paragraphs: ['When a payment is pending, do not create another invoice merely because the bank result is not instant. First determine whether the customer’s checkout is incomplete, processing, successful, failed, or awaiting settlement.'],
      },
    ],
    customerView: 'The customer sees the invoice breakdown, sign-off state, amount due, prior paid amount where applicable, and secure payment options.',
    troubleshooting: [
      { problem: 'The remaining balance is wrong.', fix: 'Review deposits, payments, refunds, voided invoices, and accepted change orders before editing or sending.' },
      { problem: 'The customer did not receive the invoice.', fix: 'Check the delivery channel and result, then resend or share the existing private link instead of creating a duplicate invoice.' },
    ],
    related: ['connect-stripe-and-get-paid', 'request-deposits-and-stage-payments', 'manage-refunds-and-payment-problems'],
  },
  {
    slug: 'request-deposits-and-stage-payments',
    chapterId: 'money',
    order: 3,
    title: 'Request deposits, progress payments, and payment plans',
    summary: 'Choose the right payment type, tie money to work stages, and avoid requesting the same balance twice.',
    outcome: 'Payment requests will match the commercial agreement and job progress.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['Connected Stripe', 'Approved quote or documented verbal acceptance'],
    keywords: ['deposit', 'progress payment', 'stage payment', 'final balance', 'installment', 'payment plan', 'milestone'],
    sections: [
      {
        title: 'Choose the payment type',
        bullets: [
          'Deposit reserves the work or funds materials under the agreed terms.',
          'Progress payment corresponds to a documented stage of work.',
          'Final balance closes the accepted amount after prior collections.',
          'A payment-plan installment follows an accepted schedule and saved payment arrangement.',
        ],
      },
      {
        title: 'Request the payment',
        steps: [
          'Review total accepted work, additions, credits, prior payments, and refunds.',
          'Select the payment purpose and amount.',
          'Add a plain-language label tied to the work stage.',
          'Preview the customer request and confirm scheduling consequences, such as deposit-before-start.',
          'Send once and follow the payment state from the existing request.',
        ],
      },
      {
        title: 'Use plans carefully',
        paragraphs: ['A recurring or installment plan should state amount, cadence, number of payments, timing, cancellation expectation, and what happens if a charge fails. Check local legal and disclosure requirements before offering financing-like arrangements.'],
      },
    ],
    customerView: 'The customer sees the payment purpose, amount, accepted schedule, saved-payment authorization where applicable, and receipt history.',
    troubleshooting: [
      { problem: 'Scheduling is blocked after approval.', fix: 'Check whether the quote requires a deposit before the schedule can be selected or confirmed.' },
      { problem: 'An installment failed.', fix: 'Review the failure and retry state. Do not manually charge a second time while an automatic retry is scheduled or the outcome is unknown.' },
    ],
    related: ['create-and-send-an-invoice', 'manage-recurring-jobs', 'manage-refunds-and-payment-problems'],
  },
  {
    slug: 'read-cash-flow-and-forecasts',
    chapterId: 'money',
    order: 4,
    title: 'Read Cash Flow and financial forecasts',
    summary: 'Separate confirmed cash from expected work, add scheduled expenses, and use forecast quality honestly.',
    outcome: 'You will understand the timing assumptions behind the projected balance and act before a shortfall.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Cash Flow', href: '/dashboard/cash-flow' }],
    prerequisites: ['Reports access', 'Job, invoice, payroll, or scheduled-payment data for a meaningful forecast'],
    keywords: ['cash flow', 'forecast', '30 60 90 days', 'bills', 'payroll', 'incoming', 'credit floor'],
    sections: [
      {
        title: 'Choose the planning window',
        bullets: [
          '30 days is best for near-term execution and immediate cash risk.',
          '60 days helps with payroll, materials, and upcoming project stages.',
          '90 days is directional; uncertainty increases as customer and schedule assumptions extend.',
        ],
      },
      {
        title: 'Build the outgoing side',
        steps: [
          'Add recurring bills, materials, equipment, loans, taxes, or other committed payments not already represented.',
          'Use the correct recurrence and date rather than a rough monthly total.',
          'Review payroll projections and avoid duplicating payroll as a manual scheduled bill.',
          'Enter an opening balance and credit floor only when they reflect accessible business cash and credit.',
        ],
      },
      {
        title: 'Interpret the lines',
        bullets: [
          'Expected money in includes timing assumptions from jobs, invoices, and payment plans.',
          'Committed money out includes payroll and scheduled obligations.',
          'Minimum cash needed shows the amount required to cover what remains ahead.',
          'Low forecast quality means use the shape as a warning, not as a bank promise.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'An expense appears twice.', fix: 'Check whether it is represented by payroll, a scheduled payment, or another source before deleting either record.' },
      { problem: 'Expected cash seems too optimistic.', fix: 'Review unscheduled work, unapproved quotes, failed payments, and forecast-quality notes. Move uncertain assumptions out of operational commitments.' },
    ],
    related: ['read-reports-and-profitability', 'create-and-send-an-invoice', 'review-timecards-and-pay'],
  },
  {
    slug: 'read-reports-and-profitability',
    chapterId: 'money',
    order: 5,
    title: 'Use Reports & Insights and financial reports',
    summary: 'Choose the right date range, interpret operational metrics, export analysis, and prepare bookkeeping reports.',
    outcome: 'You will answer a defined business question with the correct report rather than comparing unrelated totals.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Reports & Insights', href: '/dashboard/insights' },
      { label: 'Financial reports', href: '/dashboard/reports' },
    ],
    prerequisites: ['Reports access', 'Consistent job, invoice, cost, and payment records'],
    keywords: ['reports', 'insights', 'revenue', 'profit', 'sales', 'schedule utilization', 'schedule c', '1099'],
    sections: [
      {
        title: 'Start with the question',
        bullets: [
          'Sales question: lead volume, quote follow-up, conversion, or top opportunities.',
          'Operations question: arrival performance, schedule utilization, or recurring workload.',
          'Money question: revenue, payment health, service mix, costs, or profit.',
          'Bookkeeping question: profit and loss, Schedule C preparation, or subcontractor/1099 support.',
        ],
      },
      {
        title: 'Make comparisons valid',
        steps: [
          'Set the date range and note whether it measures created, scheduled, completed, invoiced, or paid activity.',
          'Use the previous-period comparison only when the periods are operationally comparable.',
          'Open the underlying records behind unusual totals.',
          'Export the filtered view when sharing with a bookkeeper or doing deeper analysis.',
        ],
      },
      {
        title: 'Know the limits of approximation',
        paragraphs: ['Revenue by service may group invoice line labels rather than a perfect accounting catalog. Financial reports are preparation tools, not filed tax forms or professional tax advice.'],
      },
    ],
    troubleshooting: [
      { problem: 'Revenue does not match cash collected.', fix: 'Revenue, invoices, and cash use different recognition events. Confirm the report definition and compare it with payment dates and refunds.' },
      { problem: 'Profit looks too high.', fix: 'Check missing job expenses, labor attribution, subcontractor cost, refunds, and whether overhead is included in the view.' },
    ],
    related: ['read-cash-flow-and-forecasts', 'review-timecards-and-pay', 'manage-refunds-and-payment-problems'],
  },
  {
    slug: 'manage-refunds-and-payment-problems',
    chapterId: 'money',
    order: 6,
    title: 'Handle refunds, failed payments, and uncertain outcomes',
    summary: 'Diagnose the payment state before retrying, refund only the correct amount, and preserve the financial trail.',
    outcome: 'Payment corrections will avoid duplicate charges and keep job, invoice, and cash records explainable.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['Owner access to sensitive payment actions'],
    keywords: ['refund', 'failed payment', 'retry', 'pending', 'indeterminate', 'duplicate charge', 'dispute'],
    sections: [
      {
        title: 'Identify the real state first',
        bullets: [
          'Pending or processing means wait for a definitive result unless the interface provides a safe recovery action.',
          'Failed means the payment did not complete; review whether a retry is scheduled.',
          'Indeterminate means the provider outcome is not safely known. Do not automatically retry.',
          'Succeeded means a second charge would be a duplicate even if payout has not reached the bank.',
        ],
      },
      {
        title: 'Refund safely',
        steps: [
          'Open the exact payment from the job or invoice.',
          'Confirm gross amount, prior refunds, platform effects, and refundable remainder.',
          'Choose full or partial refund based on the customer agreement and actual settlement.',
          'Submit once and wait for the provider result.',
          'Confirm the job feed, invoice balance, payment history, and cash reporting reflect the refund.',
        ],
      },
      {
        title: 'Escalate evidence, not guesses',
        paragraphs: ['When support is needed, provide the job reference, invoice, payment timestamp, amount, current state, and what the customer reports. Never send full card or bank credentials.'],
      },
    ],
    customerView: 'Customers receive the payment or refund status supported by the processor; bank posting time can differ from the dashboard event time.',
    troubleshooting: [
      { problem: 'A refund looks stuck.', fix: 'Check the provider refund state and original payment rail. Avoid resubmitting while the outcome is pending or unknown.' },
      { problem: 'The invoice balance did not update.', fix: 'Reload the job, verify the refund settled, and contact support with identifiers if reconciliation still disagrees.' },
    ],
    related: ['connect-stripe-and-get-paid', 'create-and-send-an-invoice', 'read-reports-and-profitability'],
  },

  {
    slug: 'configure-automations-safely',
    chapterId: 'growth',
    order: 1,
    title: 'Configure automations safely',
    summary: 'Turn on Smart Intake, follow-ups, reminders, confirmations, and daily briefings with their prerequisites understood.',
    outcome: 'Automations will send the intended message at the intended time without duplicating manual work.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 9,
    routes: [{ label: 'Automations', href: '/dashboard/automations' }],
    prerequisites: ['Settings access', 'Customer texting readiness for text automations', 'Accurate business settings'],
    keywords: ['automations', 'smart intake', 'quote follow-up', 'review request', 'reminder', 'daily digest', 'confirmation'],
    sections: [
      {
        title: 'Configure by customer journey',
        bullets: [
          'Booking & intake: Smart Intake, Online Booking, Quick Stops, AI receptionist, and missed-call text-back.',
          'Customer follow-through: review requests, quote follow-ups, appointment reminders, arrival updates, choice reminders, and past-customer lookup.',
          'Confirmations: internal emails when quotes, payment requests, reviews, or reminder batches go out.',
          'Briefing: the daily digest for business status and action items.',
        ],
      },
      {
        title: 'Turn on one sequence at a time',
        steps: [
          'Open the automation and review its prerequisite status.',
          'Set timing, channel, wording, and stop conditions.',
          'Preview what the customer or owner receives.',
          'Enable the automation and run a controlled test with your own contact details where supported.',
          'Review recent activity before enabling the next overlapping sequence.',
        ],
      },
      {
        title: 'Avoid accidental duplication',
        bullets: [
          'Log manual contact so coworkers do not chase the same customer.',
          'Do not create a second automation to compensate for a setup-required state.',
          'Use the settings history to understand who changed timing or enabled a sequence.',
          'Keep customer consent and opt-outs authoritative across every automated send.',
        ],
      },
    ],
    customerView: 'Each automation preview shows the customer-facing message or explains the internal confirmation. Actual delivery still depends on channel readiness and consent.',
    troubleshooting: [
      { problem: 'An automation says Setup required.', fix: 'Open its readiness reason and complete the missing number, website, Google profile, schedule, credits, or payment dependency.' },
      { problem: 'The same customer was contacted twice.', fix: 'Check automation activity, manual contact history, multiple jobs, and overlapping sequences before changing timing.' },
    ],
    related: ['set-up-business-texting', 'request-and-manage-reviews', 'qualify-and-contact-a-lead'],
  },
  {
    slug: 'configure-appointment-and-arrival-messages',
    chapterId: 'growth',
    order: 2,
    title: 'Configure appointment reminders and arrival updates',
    summary: 'Choose reminder timing, confirmation behavior, and on-the-way messages that match real operations.',
    outcome: 'Customers will receive useful schedule communication without false precision or excessive messages.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [{ label: 'Automations', href: '/dashboard/automations#reminders' }],
    prerequisites: ['Scheduled job', 'Customer consent and messaging readiness', 'Accurate account timezone'],
    keywords: ['appointment reminder', 'arrival update', 'on the way', 'confirmation', 'timezone', 'crew text'],
    sections: [
      {
        title: 'Set reminder timing',
        steps: [
          'Choose reminder offsets that fit the kind of work and give the customer time to respond.',
          'Preview the schedule wording and reschedule instructions.',
          'Enable confirmation behavior only when inbound replies are ready to route correctly.',
          'Review the nightly summary if you prefer one owner email instead of one per customer.',
        ],
      },
      {
        title: 'Send arrival updates from reality',
        bullets: [
          'Send On the way after departure, not at the beginning of an uncertain day.',
          'Keep the customer’s arrival window separate from an internal route estimate.',
          'When delayed, update the schedule and message rather than sending another unchanged reminder.',
        ],
      },
      {
        title: 'Use confirmations as operational evidence',
        paragraphs: ['A customer confirmation can reduce uncertainty, but it does not replace access notes, crew briefing, deposit readiness, or a verified address.'],
      },
    ],
    customerView: 'The customer receives the job date or window, business identity, reply instructions, and arrival status configured for that channel.',
    troubleshooting: [
      { problem: 'A reminder used the wrong time.', fix: 'Check the job schedule, account timezone, working hours, and whether the displayed window differs from the internal exact time.' },
      { problem: 'A confirmation reply is missing.', fix: 'Check the conversation, inbound readiness, destination number, and processing state before asking the customer to reply again.' },
    ],
    related: ['configure-automations-safely', 'plan-a-day-and-dispatch-crew', 'work-the-customer-text-inbox'],
  },
  {
    slug: 'request-and-manage-reviews',
    chapterId: 'growth',
    order: 3,
    title: 'Request reviews and manage private feedback',
    summary: 'Connect Google, send fair review requests, understand the metrics, and resolve private customer feedback.',
    outcome: 'Every eligible customer will receive the same honest choice between public review and private feedback.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Reviews', href: '/dashboard/reviews' },
      { label: 'Google profile setup', href: '/dashboard/sites?open=google' },
    ],
    prerequisites: ['Google Business Profile link for public reviews', 'Completed job and reachable customer'],
    keywords: ['reviews', 'google review', 'private feedback', 'rating', 'request review', 'resolve feedback'],
    sections: [
      {
        title: 'Prepare the destination',
        steps: [
          'Connect the correct Google Business Profile in the Website builder.',
          'Open Reviews and confirm the public review link is available.',
          'Configure the automatic review request or request from an eligible completed job.',
          'Preview the customer path before sending broadly.',
        ],
      },
      {
        title: 'Use the metrics accurately',
        bullets: [
          'Response rate compares requests sent with customers who responded.',
          'Google page visits show that the customer opened the destination; Google does not report whether a review was posted.',
          'Private feedback stays with your business and should be resolved deliberately.',
          'Rating breakdown describes the ratings received, not every request sent.',
        ],
      },
      {
        title: 'Do not review-gate',
        paragraphs: ['Every customer should receive the same public-review and private-feedback options. Do not send only happy customers to Google; platform policies prohibit selectively filtering reviewers.'],
      },
    ],
    customerView: 'The customer can choose to open the public Google review page or send private feedback directly to the business.',
    troubleshooting: [
      { problem: 'Copy review link is disabled.', fix: 'Connect a Google Business Profile in the Website builder and confirm the selected profile is the correct business.' },
      { problem: 'Private feedback is unresolved.', fix: 'Open the feedback detail, contact the customer appropriately, document the response, and mark resolved only when the business has handled it.' },
    ],
    related: ['configure-automations-safely', 'run-rebooking-and-customer-follow-up', 'manage-client-records'],
  },
  {
    slug: 'run-rebooking-and-customer-follow-up',
    chapterId: 'growth',
    order: 4,
    title: 'Rebook past customers',
    summary: 'Use service history and due signals to invite the right customers back without blasting the entire client list.',
    outcome: 'Past-customer outreach will be timely, relevant, and connected to the customer’s real history.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Rebook', href: '/dashboard/rebook' }],
    prerequisites: ['Client and completed-job history', 'Reachable and consented channel'],
    keywords: ['rebook', 'repeat customer', 'follow up', 'maintenance', 'past customers', 'due'],
    sections: [
      {
        title: 'Work the due list',
        steps: [
          'Review why each customer is considered due and open their history.',
          'Confirm the service, last visit, season, equipment, or interval still makes sense.',
          'Choose a personal message or an appropriate campaign instead of sending every customer the same copy.',
          'Record the response and create the next lead, job, or recurring plan from the existing client.',
        ],
      },
      {
        title: 'Use history, not assumptions',
        bullets: [
          'Do not offer maintenance the customer already received elsewhere or no longer needs.',
          'Use scheduled and completed dates rather than record-import dates.',
          'Exclude customers with unresolved complaints until the service issue is handled.',
        ],
      },
      {
        title: 'Choose recurring work when appropriate',
        paragraphs: ['When the same service repeats on a stable cadence, offer a recurring plan so the next visit and payment expectation are explicit.'],
      },
    ],
    customerView: 'The customer receives a relevant invitation tied to prior service and can reply, book, or start a new request.',
    troubleshooting: [
      { problem: 'A customer appears due too soon.', fix: 'Check the last scheduled/completed visit and service interval. Imported record dates may not represent actual service.' },
      { problem: 'The message cannot be sent.', fix: 'Review consent, channel readiness, contact validity, and campaign prerequisites such as a mailing address.' },
    ],
    related: ['manage-client-records', 'manage-recurring-jobs', 'run-marketing-campaigns'],
  },
  {
    slug: 'run-marketing-campaigns',
    chapterId: 'growth',
    order: 5,
    title: 'Build and send email and text campaigns',
    summary: 'Choose a relevant audience, use a template or original message, preview every channel, and read the delivery results.',
    outcome: 'Campaigns will reach an intentional audience with compliant, useful content and measurable outcomes.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [{ label: 'Campaigns', href: '/dashboard/marketing/campaigns' }],
    prerequisites: ['Settings or marketing access', 'Mailing address for promotional email', 'Consent and texting readiness for SMS'],
    keywords: ['marketing', 'campaign', 'email', 'text blast', 'audience', 'template', 'seasonal', 'performance'],
    sections: [
      {
        title: 'Start with the audience',
        steps: [
          'Choose a business reason: fill schedule gaps, seasonal service, maintenance, or a relevant past-customer offer.',
          'Select an audience whose history makes the offer useful.',
          'Choose Email, Text, or Email + text based on consent, message length, urgency, and cost.',
          'Write a clear subject and one primary action.',
          'Preview personalization, sign-off, mailing address, opt-out language, and channel length.',
          'Send only after the recipient count and message are both correct.',
        ],
      },
      {
        title: 'Use templates as a draft',
        bullets: [
          'Replace generic seasonal claims with services and dates you truly offer.',
          'Do not create false scarcity or guarantee results.',
          'Keep the landing action consistent with current booking and schedule availability.',
        ],
      },
      {
        title: 'Read performance honestly',
        paragraphs: ['Accepted or queued messages are not the same as completed jobs. Review delivered, failed, unreachable, reply, booking, and revenue outcomes separately.'],
      },
    ],
    customerView: 'Recipients see the branded email theme or business text identity, personalized content, one action, and the required unsubscribe or opt-out path.',
    troubleshooting: [
      { problem: 'The campaign is blocked.', fix: 'Check the mailing address, email/text credits, recipient reachability, texting registration, consent, and required website or unsubscribe details.' },
      { problem: 'The recipient count is unexpectedly high.', fix: 'Stop before sending and inspect the audience definition, repeat-customer logic, exclusions, duplicates, and channel availability.' },
    ],
    related: ['customize-email-and-blog-content', 'run-rebooking-and-customer-follow-up', 'manage-plan-usage-and-credits'],
  },
  {
    slug: 'customize-email-and-blog-content',
    chapterId: 'growth',
    order: 6,
    title: 'Customize email appearance and publish blog content',
    summary: 'Keep outbound email on-brand and move useful blog drafts through review, scheduling, and publication.',
    outcome: 'Marketing content will look consistent and publish only after factual review.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Marketing', href: '/dashboard/marketing' },
      { label: 'Blog', href: '/dashboard/marketing/blog' },
    ],
    prerequisites: ['Published website for public blog posts'],
    keywords: ['blog', 'email theme', 'marketing overview', 'draft ready scheduled published', 'stock photo'],
    sections: [
      {
        title: 'Set the email appearance',
        bullets: [
          'Choose a theme that remains readable with your logo and accent color.',
          'Preview important transactional and promotional messages, not only a decorative sample.',
          'Keep company identity and mailing details consistent with Account settings.',
        ],
      },
      {
        title: 'Move posts through the pipeline',
        steps: [
          'Start from a useful homeowner question or seasonal topic.',
          'Draft the post and add an accurate, licensed image.',
          'Verify factual claims, local applicability, prices, dates, and calls to action.',
          'Move to Ready only after editorial review.',
          'Schedule or publish, then confirm the post appears on the public website.',
        ],
      },
      {
        title: 'Write for customers, not search engines alone',
        paragraphs: ['A good post answers a real question, names the service area naturally, explains when to call a professional, and gives the reader a relevant next step. Avoid thin location pages and unsupported claims.'],
      },
    ],
    customerView: 'Published posts appear in the website’s Blog section when enabled; email themes apply to supported outgoing messages.',
    troubleshooting: [
      { problem: 'A published post is not visible.', fix: 'Confirm the website is published, the Blog section is enabled, and the post state and publish time are correct.' },
      { problem: 'Email colors are hard to read.', fix: 'Choose a higher-contrast theme and preview it in both light and dark email clients where possible.' },
    ],
    related: ['run-marketing-campaigns', 'build-and-publish-your-website', 'request-and-manage-reviews'],
  },

  {
    slug: 'build-and-publish-your-website',
    chapterId: 'intake',
    order: 1,
    title: 'Build, preview, and publish your website',
    summary: 'Configure branding, sections, photos, reviews, SEO, domains, and publishing without losing unsaved work.',
    outcome: 'Your website will represent the business accurately and provide working customer-intake paths.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 10,
    routes: [{ label: 'Website', href: '/dashboard/sites' }],
    prerequisites: ['Company name, trade, service area, and contact details'],
    keywords: ['website builder', 'publish', 'theme', 'hero', 'services', 'photos', 'seo', 'domain', 'analytics', 'legal'],
    sections: [
      {
        title: 'Build in three passes',
        steps: [
          'Setup: confirm business basics, social links, listings, visitor tracking, theme, logo, typography, and form appearance.',
          'Content: edit the header, hero, services, gallery, before/after, reviews, process, FAQs, statistics, blog, service areas, project showcase, and footer.',
          'Publish: choose the subdomain or connect a custom domain, review search appearance, analytics, verification, and legal pages.',
        ],
      },
      {
        title: 'Preview before saving and publishing',
        bullets: [
          'Check desktop and phone layouts.',
          'Test every call, message, quote, and booking action.',
          'Use real project photos when possible and obtain permission to publish customer work.',
          'Undo and redo small edits; discard all unsaved work only when you intend to lose the whole editing session.',
        ],
      },
      {
        title: 'Publish with complete trust signals',
        bullets: [
          'Use accurate license, insurance, hours, service-area, and review information.',
          'Connect the correct Google Business Profile.',
          'Write a search title and description that name the service and location without keyword stuffing.',
          'Keep privacy, terms, and SMS disclosures available wherever the intake flow collects information.',
        ],
      },
    ],
    customerView: 'Visitors see the published theme, business proof, services, content, forms, booking entry points, and legal footer—not your builder drafts.',
    troubleshooting: [
      { problem: 'The site is saved but not live.', fix: 'Check publish status, subdomain or custom-domain connection, and any domain verification message.' },
      { problem: 'A custom domain is offline.', fix: 'Compare the exact DNS records requested by the Domain Connector, remove conflicts, and allow propagation before changing them again.' },
    ],
    related: ['configure-smart-intake', 'configure-online-booking', 'business-profile-and-locations'],
  },
  {
    slug: 'configure-smart-intake',
    chapterId: 'intake',
    order: 2,
    title: 'Configure Smart Intake and website lead forms',
    summary: 'Set estimate posture, qualification signals, contact expectations, and the public form experience.',
    outcome: 'Website requests will arrive with enough context to prioritize and respond without making the homeowner start over.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Smart Intake', href: '/dashboard/automations#intake-ai' },
      { label: 'Website', href: '/dashboard/sites' },
    ],
    prerequisites: ['Published website for public intake', 'Business trade and service area'],
    keywords: ['smart intake', 'website form', 'estimate posture', 'lead priority', 'high value', 'photos', 'questions'],
    sections: [
      {
        title: 'Choose the intake posture',
        steps: [
          'Decide whether the form should encourage estimates, gather qualification first, or set another supported posture.',
          'Set the high-value threshold based on real job economics.',
          'Decide whether low-quality leads should be muted from attention—not deleted.',
          'Review the questions and form appearance in the Website builder.',
          'Submit tests for a strong fit, uncertain fit, and poor fit.',
        ],
      },
      {
        title: 'Ask only what improves the next decision',
        bullets: [
          'Collect scope, location, timing, photos, and other trade-specific facts that affect fit or response.',
          'Avoid turning the form into a full estimate that the homeowner cannot complete on a phone.',
          'Explain how phone and email information will be used.',
        ],
      },
      {
        title: 'Review outcomes after real traffic',
        paragraphs: ['Compare scores with actual conversations and won work. Adjust one rule at a time so you can tell whether it improved prioritization.'],
      },
    ],
    customerView: 'The homeowner sees the published intake style, business identity, relevant project questions, photo upload, consent language, and confirmation.',
    troubleshooting: [
      { problem: 'Submissions are not arriving.', fix: 'Confirm the site is published, the form is enabled, and a controlled test reaches Leads. Check support before repeatedly resubmitting customer data.' },
      { problem: 'Too many leads are marked low.', fix: 'Review the high-value threshold, service-area rules, estimate posture, and actual intake answers before weakening every signal.' },
    ],
    related: ['qualify-and-contact-a-lead', 'build-and-publish-your-website', 'configure-automations-safely'],
  },
  {
    slug: 'configure-online-booking',
    chapterId: 'intake',
    order: 3,
    title: 'Configure online booking requests',
    summary: 'Open realistic days and arrival windows, set limits and notice, block time off, and share the booking link.',
    outcome: 'Customers can request a preferred window while your business keeps final confirmation control.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 9,
    routes: [{ label: 'Online Booking', href: '/dashboard/schedule/booking' }],
    prerequisites: ['Published website', 'Working hours', 'At least one booking day and arrival window'],
    keywords: ['online booking', 'booking request', 'arrival window', 'notice', 'daily limit', 'time off', 'qr code'],
    sections: [
      {
        title: 'Make the page live',
        steps: [
          'Turn on Booking requests. The master switch applies immediately.',
          'Choose booking weekdays inside the working week.',
          'Set arrival-window length and select customer-facing window start times.',
          'Set daily job limits and minimum notice.',
          'Configure advanced rules and block time off or unavailable dates.',
          'Save the schedule settings and confirm the Availability preview reports a live offer.',
        ],
      },
      {
        title: 'Share the right expectation',
        bullets: [
          'Customers request a preferred arrival window; your business confirms the final time.',
          'A selected window outside working hours is hidden until corrected.',
          'No free day in the coming weeks can make an enabled page show nothing on offer.',
          'Use the copied link or QR code only after testing the public page.',
        ],
      },
      {
        title: 'Protect production capacity',
        paragraphs: ['Cap booking volume and keep enough notice for travel, preparation, and existing commitments. Self-service should expose safe capacity, not every white space on a calendar.'],
      },
    ],
    customerView: 'The customer sees available arrival windows and submits a request. They do not receive a final booking promise until the business confirms it.',
    troubleshooting: [
      { problem: 'The sidebar says Not live.', fix: 'Publish the website, enable booking, open at least one day and valid window, and make sure upcoming availability exists.' },
      { problem: 'A selected window is hidden.', fix: 'Move or shorten the window so it fits completely inside working hours, or extend the workday deliberately.' },
    ],
    related: ['schedule-work-from-the-queue', 'build-and-publish-your-website', 'configure-appointment-and-arrival-messages'],
  },
  {
    slug: 'configure-quick-stops',
    chapterId: 'intake',
    order: 4,
    title: 'Configure and operate Quick Stops',
    summary: 'Define eligible work, route fit, visit fees, limits, deadlines, priority areas, and the request workflow.',
    outcome: 'Quick Stops will offer profitable expedited work only when it fits the active route and rules.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 10,
    routes: [{ label: 'Quick Stops', href: '/dashboard/quick-stops' }],
    prerequisites: ['Stripe connection', 'Scheduled route data', 'Usable customer contact and address information'],
    keywords: ['quick stops', 'same day', 'route gap', 'speed fee', 'detour', 'priority area', 'refund', 'eligible work'],
    sections: [
      {
        title: 'Configure the offer',
        steps: [
          'Open Settings inside Quick Stops and choose eligible categories and days ahead.',
          'Set maximum visit length, required photos, detour miles, and detour minutes.',
          'Set the visit-fee structure and any priority-area rules.',
          'Set maximum stops per day, customer response deadline, and payment deadline.',
          'Review refund grace and the before-en-route, after-en-route, and after-arrival rules.',
          'Preview what the customer sees before switching the offer on.',
        ],
      },
      {
        title: 'Work Today first',
        bullets: [
          'Today shows status, coverage, and open requests waiting on a decision.',
          'Evaluate scope, location, route fit, price, photos, and existing commitments before accepting.',
          'Insights separates realized results from merely possible eligible work.',
          'You keep the underlying lead even when a Quick Stop is not accepted.',
        ],
      },
      {
        title: 'Do not treat speed fees as a shortcut around scope',
        paragraphs: ['The expedited fee buys a priority visit under the stated rules. It does not silently authorize unlimited repair work, waive safety, or replace a separate quote for additional scope.'],
      },
    ],
    customerView: 'The customer sees the priority-visit terms, fee, response and payment deadlines, refund rules, and confirmation before the stop is placed.',
    troubleshooting: [
      { problem: 'Quick Stops is On but Paused.', fix: 'Read the operational status. Check support hold, Stripe, route availability, eligible work, limits, and other readiness gates.' },
      { problem: 'A seemingly nearby request is ineligible.', fix: 'Review actual route detour, visit duration, category, photos, deadlines, daily cap, and priority-area rules—not straight-line distance alone.' },
    ],
    related: ['plan-a-day-and-dispatch-crew', 'manage-refunds-and-payment-problems', 'configure-online-booking'],
  },
  {
    slug: 'configure-ai-receptionist',
    chapterId: 'intake',
    order: 5,
    title: 'Configure the 24/7 AI Receptionist',
    summary: 'Set answer behavior, triage calls, review transcripts and recordings, and convert useful calls into follow-up work.',
    outcome: 'Calls will enter a reviewable queue with clear escalation and follow-up rather than disappearing into voicemail.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 9,
    routes: [{ label: 'AI Receptionist', href: '/dashboard/voice-calls' }],
    prerequisites: ['Voice entitlement and credits', 'Dedicated-number and routing readiness'],
    keywords: ['ai receptionist', 'voice calls', 'call inbox', 'transcript', 'recording', 'callback', 'urgent', 'simulator'],
    sections: [
      {
        title: 'Configure before taking live calls',
        steps: [
          'Review status, answer mode, business information, tone, and escalation expectations.',
          'Confirm dedicated-number routing and carrier health.',
          'Use the Voice Simulator for ordinary inquiry, booking, emergency, spam, and out-of-scope scenarios.',
          'Check that created leads, summaries, and schedule suggestions land in the correct workspace.',
          'Enable live behavior only after the simulation and number readiness both pass.',
        ],
      },
      {
        title: 'Work the call inbox',
        bullets: [
          'Prioritize urgent/emergency and needs-callback calls.',
          'Review the summary and transcript; listen to the recording when the exact wording matters.',
          'Add a note or workflow disposition so another person knows the call was handled.',
          'Convert suitable calls to a quote draft or lead once—do not recreate the same caller manually first.',
        ],
      },
      {
        title: 'Keep safety boundaries clear',
        paragraphs: ['The assistant can collect information, triage, and support booking workflows. It should not make unsafe technical promises, guarantee emergency response, or commit the business to an unverified price or schedule.'],
      },
    ],
    customerView: 'Callers hear the configured business assistant, consent and recording disclosures where applicable, qualification questions, and the supported booking or callback outcome.',
    troubleshooting: [
      { problem: 'Calls are not appearing.', fix: 'Check voice status, answer mode, number assignment, route readiness, credits, carrier health, and the date/filter view.' },
      { problem: 'A transcript or summary is inaccurate.', fix: 'Listen to the recording, correct the operational follow-up, and do not turn uncertain parsed details into a customer quote without review.' },
    ],
    related: ['set-up-business-texting', 'qualify-and-contact-a-lead', 'manage-plan-usage-and-credits'],
  },
  {
    slug: 'configure-text-to-job-and-field-intake',
    chapterId: 'intake',
    order: 6,
    title: 'Configure Text-to-Job & Hands-Free Field Dictation',
    summary: 'Update quotes, log milestones, add punch lists, and upload receipt photos simply by texting or voice-memo dictation from the truck.',
    outcome: 'You and your crew will keep job files 100% updated in real-time from the road without logging into an app or typing on site.',
    audiences: ['Owner', 'Crew', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Text-to-Job Dashboard', href: '/dashboard/text-to-job' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Owner Alert Phone or Crew Member Whitelist entry', 'Dedicated Platform Texting Number'],
    keywords: [
      'text to job',
      'voice memo',
      'dictate',
      'siri',
      'carplay',
      'punch list',
      'change order',
      'receipt photo',
      'undo rollback',
      'audio intake',
    ],
    sections: [
      {
        title: 'Save the field dispatch hotline',
        steps: [
          'Open Text-to-Job Dashboard to view your business hotline number.',
          'Tap "Save Contact (.vcf)" on your mobile phone to save it as "Job Intake" in iOS or Google Contacts.',
          'Set up Apple Siri ("Hey Siri, text Job Intake") or Android Auto Google Assistant for hands-free steering wheel dictation.',
        ],
      },
      {
        title: 'Dictate four core job pillars from the road',
        bullets: [
          'Quote Change Orders: Text "Add $450 to Miller job for extra 12/2 Romex line" to update estimate totals and stage customer approval.',
          'Milestones & Activity: Send a voice memo "Rough plumbing passed on Elm St" to log an audit timestamp and reserve drywall crew.',
          'Crew Punch Lists: Text multi-item to-do items to push checklist tasks to the crew field app.',
          'Receipt Photos: Snap a photo of a supply receipt at the register to OCR itemize costs and track gross profit margin.',
        ],
      },
      {
        title: 'Understand the 15-minute rollback safety invariant',
        paragraphs: [
          'If you make a typo or dictate an accidental change, simply reply "UNDO" within 15 minutes to atomic rollback the database to its previous state with zero data loss.',
        ],
      },
    ],
    customerView: 'Customers receive clean, formatted 1-tap quote approval SMS links when you text "SEND" after adding a change order.',
    troubleshooting: [
      { problem: 'A text from an unlisted number does not update a job.', fix: 'For security, unrecognized numbers are safely routed to the Leads inbox as inquiries. Ensure your number and crew phone numbers are enabled in the Authorized Phone Numbers list.' },
      { problem: 'A voice memo was unclear.', fix: 'Gemini filters background truck idle and wind noise, but if the voice recording was cut off, the AI will prompt for a 1/2 clarifying text before modifying live jobs.' },
    ],
    related: ['configure-ai-receptionist', 'plan-a-day-and-dispatch-crew', 'create-and-send-an-invoice'],
  },

  {
    slug: 'manage-office-access-and-security',
    chapterId: 'account',
    order: 1,
    title: 'Manage office access, sign-in, and account security',
    summary: 'Invite office users, grant individual capabilities, manage sign-in methods, and remove access safely.',
    outcome: 'Each person will use their own identity with only the access needed for their responsibilities.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [
      { label: 'Team', href: '/dashboard/settings#office-team' },
      { label: 'Login & security', href: '/dashboard/settings' },
    ],
    prerequisites: ['Owner access to invite, grant, or remove office access', 'Available office-seat capacity'],
    keywords: ['office user', 'invite', 'permissions', 'capabilities', 'login', 'email', 'phone', 'security', 'remove access'],
    sections: [
      {
        title: 'Invite an office user',
        steps: [
          'Open Account → Team and choose the office invitation action.',
          'Enter the person’s own email or mobile identity.',
          'Grant the smallest set of capabilities that supports their role.',
          'Send the invitation and have the person accept from their own sign-in.',
          'Test the pages they need and confirm sensitive pages remain unavailable.',
        ],
      },
      {
        title: 'Review access by responsibility',
        bullets: [
          'Dispatcher: jobs, clients, schedule, messages, and crew as required.',
          'Bookkeeper: reports and payment visibility, with collection authority only if truly needed.',
          'Marketing staff: website, automations, reviews, and campaigns without payout controls.',
          'General office: leads and customers first, then add narrower capabilities when the job requires them.',
        ],
      },
      {
        title: 'Remove access cleanly',
        paragraphs: ['Remove the membership or capabilities rather than changing a shared password. Preserve business records and audit history; access removal should not delete the person’s past actions.'],
      },
    ],
    troubleshooting: [
      { problem: 'An invitation cannot be created.', fix: 'Check office-seat capacity, whether the identity is already an owner/crew/office member, and whether a pending invitation already exists.' },
      { problem: 'An office user lands on a different page.', fix: 'They are redirected to the first route their capabilities allow. Review individual capability grants in Account → Team.' },
    ],
    related: ['roles-permissions-and-feature-readiness', 'manage-plan-usage-and-credits', 'find-help-and-contact-support'],
  },
  {
    slug: 'manage-plan-usage-and-credits',
    chapterId: 'account',
    order: 2,
    title: 'Manage your plan, usage, credits, and capacity',
    summary: 'Read the current entitlement, renewal timing, included limits, purchased capacity, overage controls, and plan changes.',
    outcome: 'You will know what the workspace includes and change capacity without surprising the team or customers.',
    audiences: ['Owner'],
    readMinutes: 8,
    routes: [{ label: 'Plan & usage', href: '/dashboard/settings#plan-at-a-glance' }],
    prerequisites: ['Owner access'],
    keywords: ['plan', 'usage', 'credits', 'top up', 'overage', 'office seats', 'crew seats', 'storage', 'voice', 'renewal'],
    sections: [
      {
        title: 'Read the plan at a glance',
        bullets: [
          'Current plan, billing interval, renewal or end date, and pending change.',
          'Text, marketing email, AI, and voice balances or allowances.',
          'Office users, crew users, domains, dedicated numbers, storage, connections, and voice limits.',
          'Purchased capacity and credit lots, including their expiry behavior.',
        ],
      },
      {
        title: 'Choose the right response to a limit',
        steps: [
          'Confirm whether the limit is included capacity, purchased capacity, or a usage balance.',
          'Review what is consuming it before buying or removing anything.',
          'Use an eligible top-up for temporary credits; use a plan or capacity change for sustained needs.',
          'Enable overage only when the business accepts the rate and spending limit.',
          'Review effective timing before upgrading, downgrading, or canceling.',
        ],
      },
      {
        title: 'Plan changes affect operations',
        paragraphs: ['Before reducing capacity, review active office users, crew, domains, phone numbers, storage, automations, and voice needs. A lower plan does not make operational dependencies disappear.'],
      },
    ],
    troubleshooting: [
      { problem: 'Usage looks unavailable.', fix: 'Reload once. If the entitlement cannot be verified, do not guess or repeatedly purchase; contact support with the Plan & usage state.' },
      { problem: 'A plan change is pending.', fix: 'Read its effective date and billing interval. Avoid submitting another change until the current operation finishes or support confirms recovery.' },
    ],
    related: ['roles-permissions-and-feature-readiness', 'manage-office-access-and-security', 'connect-stripe-and-get-paid'],
  },
  {
    slug: 'import-existing-business-data',
    chapterId: 'account',
    order: 3,
    title: 'Import customers, services, jobs, and invoices',
    summary: 'Move data from another system, review column matching, confirm preview results, and avoid creating duplicates.',
    outcome: 'Existing business records will enter in a controlled order without overwriting live work unexpectedly.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 8,
    routes: [{ label: 'Import & migrate', href: '/dashboard/import' }],
    prerequisites: ['Exported CSV, Excel, or supported contact files', 'Owner or relevant write permissions'],
    keywords: ['import', 'migration', 'csv', 'excel', 'customers', 'services', 'jobs', 'invoices', 'column mapping'],
    sections: [
      {
        title: 'Choose the import path',
        bullets: [
          'Use Move in from another CRM when you have several related files and want guided ordering.',
          'Use a single importer for only customers, services, jobs, or invoices.',
          'Import services and customers before jobs when the files depend on those identities.',
        ],
      },
      {
        title: 'Preview before writing',
        steps: [
          'Keep an untouched copy of the original export.',
          'Upload the file and review detected record type and column matches.',
          'Correct date, money, phone, status, and identifier mappings.',
          'Inspect skipped, duplicate, and invalid rows.',
          'Confirm only when the preview counts and examples make sense.',
          'Audit several imported records in Clients, Price Book, Jobs, and invoices.',
        ],
      },
      {
        title: 'Import financial history conservatively',
        paragraphs: ['Historical paid or outstanding states affect statements and reports. Do not invent missing payment evidence. Use the financial importer only when enabled and preserve the source export for reconciliation.'],
      },
    ],
    troubleshooting: [
      { problem: 'Dates or amounts import incorrectly.', fix: 'Stop before confirmation and correct the source format or mapping. Check decimal separators, currency units, and date ambiguity.' },
      { problem: 'Duplicates appeared after import.', fix: 'Use duplicate-client review and compare source identifiers. Avoid re-importing the whole file until you know whether the first run committed.' },
    ],
    related: ['manage-client-records', 'manage-your-price-book', 'export-data-and-connect-apps'],
  },
  {
    slug: 'manage-your-price-book',
    chapterId: 'account',
    order: 4,
    title: 'Build and maintain your Price Book',
    summary: 'Save reusable services and prices, load a trade starter pack, import a catalog, and keep quote language consistent.',
    outcome: 'Estimators will build faster quotes from shared, understandable service items.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Price Book', href: '/dashboard/services' }],
    prerequisites: ['Jobs or services access for office staff'],
    keywords: ['price book', 'services', 'prices', 'starter pack', 'catalog', 'import', 'quote items'],
    sections: [
      {
        title: 'Create customer-readable services',
        steps: [
          'Load a matching trade starter pack or add a service manually.',
          'Use a name a homeowner can understand without internal abbreviations.',
          'Set the unit price and include the scope assumptions needed by estimators.',
          'Keep optional upgrades separate from required base work.',
          'Archive outdated services rather than silently changing the meaning of historical quotes.',
        ],
      },
      {
        title: 'Review on a schedule',
        bullets: [
          'Update material-sensitive items when supplier costs change.',
          'Compare quoted hours with actual Job labor.',
          'Keep common service names consistent so reporting groups them more reliably.',
          'Use import for a deliberate catalog migration, not for daily one-off price edits.',
        ],
      },
      {
        title: 'Price Book is a starting point',
        paragraphs: ['A saved item speeds construction of the quote; the estimator still owns site conditions, quantity, permits, travel, complexity, risk, and the final reviewed price.'],
      },
    ],
    troubleshooting: [
      { problem: 'A starter pack would duplicate existing services.', fix: 'Review active items first and load only when the resulting duplicates can be safely reconciled.' },
      { problem: 'Reports split one service into several groups.', fix: 'Standardize the saved item and invoice line labels used going forward; historical wording may remain separate.' },
    ],
    related: ['build-and-send-a-quote', 'import-existing-business-data', 'read-reports-and-profitability'],
  },
  {
    slug: 'export-data-and-connect-apps',
    chapterId: 'account',
    order: 5,
    title: 'Export data and manage connected apps',
    summary: 'Download business records, connect QuickBooks and Google, and verify what each integration actually syncs.',
    outcome: 'You will retain portable records and use integrations without assuming two systems are identical.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Business settings', href: '/dashboard/settings#export' }],
    prerequisites: ['Settings access for connected apps; owner access for sensitive account operations'],
    keywords: ['export', 'csv', 'quickbooks', 'google business profile', 'connected apps', 'backup', 'sync'],
    sections: [
      {
        title: 'Export your records',
        steps: [
          'Open Account → Business → Import & data.',
          'Choose a complete export or an individual customers, services, jobs, or invoices file.',
          'Store the CSVs in an access-controlled business location.',
          'Open a sample and confirm identifiers, dates, statuses, and amounts before relying on it for migration or bookkeeping.',
        ],
      },
      {
        title: 'Connect apps with a defined purpose',
        bullets: [
          'QuickBooks: understand which transactions sync, the direction of sync, and how backfill behaves before using it as the bookkeeping source.',
          'Google Business Profile: verify the exact location because reviews and website trust signals use that connection.',
          'Analytics and verification fields: enter only identifiers from accounts the business controls.',
        ],
      },
      {
        title: 'Reconcile after connecting',
        paragraphs: ['Compare a small set of customers, invoices, payments, taxes, and refunds across systems before running a broad backfill. A connected status proves authorization, not accounting equivalence.'],
      },
    ],
    troubleshooting: [
      { problem: 'An export appears incomplete.', fix: 'Check the file type and active filters, then compare record counts with the source page. Contact support before repeating a destructive migration.' },
      { problem: 'A sync created a mismatch.', fix: 'Stop additional backfill, preserve both system identifiers, and reconcile the smallest affected sample before resuming.' },
    ],
    related: ['import-existing-business-data', 'manage-client-records', 'read-reports-and-profitability'],
  },
  {
    slug: 'find-help-and-contact-support',
    chapterId: 'account',
    order: 6,
    title: 'Find help and contact support effectively',
    summary: 'Search the manual and troubleshooting guides, restart the product tour, and open a support request with useful evidence.',
    outcome: 'You will reach the fastest self-service answer or give support enough context to investigate without repeated questions.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 5,
    routes: [
      { label: 'Dashboard Help & Guides', href: '/dashboard/help' },
      { label: 'Public Help Center', href: '/help' },
    ],
    prerequisites: [],
    keywords: ['help', 'support', 'ticket', 'guide', 'tour', 'troubleshooting', 'error'],
    sections: [
      {
        title: 'Use the shortest path',
        steps: [
          'Search this manual for the task or feature name.',
          'Use the Help Center troubleshooter when something that previously worked is failing.',
          'Restart the Dashboard Orientation when the issue is navigation or unfamiliar layout.',
          'Open a support request when the account state, provider outcome, or data needs investigation.',
        ],
      },
      {
        title: 'Include useful evidence',
        bullets: [
          'What you were trying to accomplish.',
          'The page, customer/job reference, and approximate time.',
          'What you expected and what happened instead.',
          'The exact visible status or error wording.',
          'A screenshot with private customer and financial information minimized.',
        ],
      },
      {
        title: 'Keep one issue per request',
        paragraphs: ['A focused request preserves a clean investigation and status. Reply to the existing request with new evidence; open a new request for a separate problem. Never send passwords, authentication codes, full card details, or bank credentials.'],
      },
    ],
    troubleshooting: [
      { problem: 'A help request is closed but the problem returned.', fix: 'Open a new request and link or mention the prior subject so the new occurrence has its own status.' },
      { problem: 'The manual and screen differ.', fix: `Use the screen’s current wording, capture the difference, and report it. This manual was last verified ${MANUAL_LAST_VERIFIED}.` },
    ],
    related: ['navigate-the-dashboard', 'roles-permissions-and-feature-readiness', 'manage-office-access-and-security'],
  },
];

export const FEATURED_MANUAL_ARTICLE_SLUGS = [
  'first-30-minutes',
  'manage-the-lead-inbox',
  'build-and-send-a-quote',
  'schedule-work-from-the-queue',
  'create-and-send-an-invoice',
  'configure-online-booking',
] as const;

const chapterById = new Map(MANUAL_CHAPTERS.map((chapter) => [chapter.id, chapter]));
const articleBySlug = new Map(MANUAL_ARTICLES.map((article) => [article.slug, article]));

export function getManualChapter(id: string): ManualChapter | undefined {
  return chapterById.get(id);
}

export function getManualArticle(slug: string): ManualArticle | undefined {
  return articleBySlug.get(slug);
}

export function getManualArticleSummaries(): ManualArticleSummary[] {
  return MANUAL_ARTICLES.map(({ sections: _sections, routes: _routes, outcome: _outcome, customerView: _customerView, troubleshooting: _troubleshooting, related: _related, ...summary }) => summary);
}

export function getManualArticlesInReadingOrder(): ManualArticle[] {
  return [...MANUAL_ARTICLES].sort((a, b) => {
    const aChapter = chapterById.get(a.chapterId)?.number ?? Number.MAX_SAFE_INTEGER;
    const bChapter = chapterById.get(b.chapterId)?.number ?? Number.MAX_SAFE_INTEGER;
    return aChapter - bChapter || a.order - b.order || a.title.localeCompare(b.title);
  });
}

export function getRelatedManualArticles(article: ManualArticle): ManualArticle[] {
  return article.related.map((slug) => articleBySlug.get(slug)).filter((entry): entry is ManualArticle => Boolean(entry));
}

export function getManualNeighbors(slug: string): { previous: ManualArticle | null; next: ManualArticle | null } {
  const ordered = getManualArticlesInReadingOrder();
  const index = ordered.findIndex((article) => article.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null,
  };
}
