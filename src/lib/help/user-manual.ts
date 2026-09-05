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
> & {
  searchText?: string;
};

export const MANUAL_LAST_VERIFIED = 'August 29, 2026';

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
    summary: 'Keep customer records clean, manage two-way messaging, and activate self-service customer tools.',
  },
  {
    id: 'crew',
    number: 5,
    title: 'Crew, subcontractors, and labor',
    shortTitle: 'Crew',
    summary: 'Manage field access, offline sync, timecards, labor cost, and subcontractor coverage.',
  },
  {
    id: 'money',
    number: 6,
    title: 'Invoices, payments, and cash',
    shortTitle: 'Money',
    summary: 'Understand platform fees, collect deposits, handle disputes, and track cash timing.',
  },
  {
    id: 'growth',
    number: 7,
    title: 'Automations, reviews, and marketing',
    shortTitle: 'Growth',
    summary: 'Follow up consistently, manage marketing lists, earn reviews, and run compliant campaigns.',
  },
  {
    id: 'intake',
    number: 8,
    title: 'Website and intake channels',
    shortTitle: 'Intake',
    summary: 'Publish your website, connect custom domains, and configure Smart Intake and Text-to-Job.',
  },
  {
    id: 'account',
    number: 9,
    title: 'Account, data, and support',
    shortTitle: 'Account',
    summary: 'Manage team access, plan capacity, imports, exports, account safety, and support.',
  },
];

export const MANUAL_ARTICLES: ManualArticle[] = [
  // ==========================================
  // CHAPTER 1: START HERE
  // ==========================================
  {
    slug: 'first-30-minutes',
    chapterId: 'start',
    order: 1,
    title: 'Your first 30 minutes in Let’s Get Quoted',
    summary: 'Complete the minimum setup needed to receive a lead, send a quote, and collect a payment.',
    outcome: 'You will have a verified workspace ready to accept real customer requests and get paid without test-mode confusion.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Settings', href: '/dashboard/settings' },
    ],
    prerequisites: ['Owner sign-in', 'US business bank account details for Stripe Connect'],
    keywords: ['onboarding', 'quick start', 'checklist', 'setup', 'stripe connect', 'first steps'],
    sections: [
      {
        title: 'Complete the foundation first',
        steps: [
          'Open Settings → Business to confirm your legal company name, public phone, and time zone.',
          'Connect Stripe in Settings → Payments so payouts land in your checking account.',
          'Add your first price book item or starter service so you can assemble an estimate in seconds.',
        ],
      },
      {
        title: 'Run one safe test',
        steps: [
          'Create a test lead using your own mobile number and email.',
          'Build and send a sample quote to experience the homeowner view.',
          'Review the live dashboard cards to verify the test lead and quote appear in your active pipeline.',
        ],
      },
      {
        title: 'Use the onboarding checklist',
        paragraphs: [
          'The dashboard checklist tracks your progress across business profile setup, website publishing, Stripe connection, and texting activation.',
        ],
      },
    ],
    customerView: 'Customers will see your official business name, logo, phone number, and professional quote approval portal.',
    troubleshooting: [
      { problem: 'Stripe onboarding is stuck or pending.', fix: 'Open Settings → Payments and check for missing identity or bank verification prompts from Stripe.' },
      { problem: 'Sample SMS does not arrive.', fix: 'Verify your phone number in Settings and check that carrier registration is active.' },
    ],
    related: ['navigate-the-dashboard', 'business-profile-and-locations', 'connect-stripe-and-get-paid'],
  },
  {
    slug: 'navigate-the-dashboard',
    chapterId: 'start',
    order: 2,
    title: 'Navigate the dashboard efficiently',
    summary: 'Learn the primary workspace layout, quick search shortcuts, and view toggles.',
    outcome: 'You will quickly move between leads, schedule, jobs, and invoices across desktop and mobile browsers.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
    prerequisites: ['Active dashboard account'],
    keywords: ['navigation', 'sidebar', 'shortcuts', 'mobile layout', 'views', 'command bar'],
    sections: [
      {
        title: 'Read the sidebar as a workflow',
        bullets: [
          'Daily Ops: Leads, Schedule, Jobs, and Messages keep active customer work moving.',
          'Financials: Quotes, Invoices, Cash Flow, and Reports track revenue and collections.',
          'Growth & Channel: Website, Intake, Automations, Reviews, and Campaigns drive new business.',
          'Settings & Team: Profile, Team, Plan & Usage, and Integrations manage workspace controls.',
        ],
      },
      {
        title: 'Use the fastest controls',
        steps: [
          'Use the global search bar or press "/" on desktop to find any client, job, or invoice instantly.',
          'Use top-level tabs on pages like Leads and Jobs to switch between Inbox, Board, and Table views.',
          'Use mobile bottom navigation when reviewing the dashboard from a phone browser.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A sidebar item is missing.', fix: 'Check your login role. Certain settings, payouts, and billing features are restricted to the workspace Owner.' },
    ],
    related: ['first-30-minutes', 'understand-dashboard-priorities', 'roles-permissions-and-feature-readiness'],
  },
  {
    slug: 'understand-dashboard-priorities',
    chapterId: 'start',
    order: 3,
    title: 'Use the Dashboard as your daily command center',
    summary: 'Prioritize unread messages, urgent leads, today’s schedule, and overdue balances.',
    outcome: 'You will start each morning knowing exactly which customer-waiting items and revenue opportunities require action.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
    prerequisites: ['Dashboard access'],
    keywords: ['command center', 'metrics', 'pipeline', 'overdue', 'priorities', 'morning routine'],
    sections: [
      {
        title: 'Work from the top down',
        steps: [
          'Review the Action Required queue: pending quotes, unread client messages, and new leads waiting for response.',
          'Check Today’s Schedule to confirm crew assignments and customer arrival windows.',
          'Examine the Revenue & Cash tracker to review deposits collected and overdue invoice reminders.',
        ],
      },
      {
        title: 'Use the recommendations, not just the totals',
        paragraphs: [
          'The dashboard highlights proactive recommendations—such as unquoted leads approaching 24 hours old or past-due invoices ready for automated follow-up.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Metrics do not match expectations.', fix: 'Verify date range filters and check whether test records were archived or excluded.' },
    ],
    related: ['first-30-minutes', 'manage-the-lead-inbox', 'read-cash-flow-and-forecasts'],
  },
  {
    slug: 'business-profile-and-locations',
    chapterId: 'start',
    order: 4,
    title: 'Set up your business profile and locations',
    summary: 'Configure public contact details, brand identity, service areas, and multi-location addresses.',
    outcome: 'Your estimates, invoices, client portal, and public site will present consistent and accurate company details.',
    audiences: ['Owner'],
    readMinutes: 5,
    routes: [{ label: 'Business Profile', href: '/dashboard/settings#business' }],
    prerequisites: ['Owner access'],
    keywords: ['business settings', 'company profile', 'address', 'logo', 'service area', 'timezone'],
    sections: [
      {
        title: 'Enter shared business details',
        steps: [
          'Go to Settings → Business and enter your public business name, phone, email, and website.',
          'Upload a high-resolution company logo for display on customer quotes, invoices, and the portal header.',
          'Set your primary operating timezone so automated messages and calendar slots sync accurately.',
        ],
      },
      {
        title: 'Keep legal and physical addresses accurate',
        paragraphs: [
          'Your physical mailing address is used for 10DLC carrier registration and anti-spam footer compliance on marketing emails. Ensure your legal business name matches IRS records.',
        ],
      },
    ],
    customerView: 'Customers see your official company branding, contact number, license information, and address across all communications.',
    troubleshooting: [
      { problem: 'Address changes do not appear on past invoices.', fix: 'Past invoices preserve historical legal records; newly created invoices and quotes will reflect the updated business profile.' },
    ],
    related: ['first-30-minutes', 'build-and-publish-your-website', 'set-up-business-texting'],
  },
  {
    slug: 'roles-permissions-and-feature-readiness',
    chapterId: 'start',
    order: 5,
    title: 'Understand roles, permissions, plans, and prerequisites',
    summary: 'Understand workspace roles, server-enforced access gates, plan allowances, and live feature readiness.',
    outcome: 'You will understand what owners, office staff, and field crew can access without confusing plan limits or server gates.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Team', href: '/dashboard/settings#office-team' },
      { label: 'Plan & usage', href: '/dashboard/settings#plan-at-a-glance' },
    ],
    prerequisites: ['Owner access to manage team members or change plan tiers'],
    keywords: ['roles', 'owner', 'office staff', 'crew', 'permissions', 'plan limits', 'capabilities', 'access control', 'setup required', 'not live'],
    sections: [
      {
        title: 'Know the three workspace roles',
        bullets: [
          'Owner: Unrestricted access to the entire business, billing, plans, payouts, team invitations, and irreversible actions.',
          'Office Staff: Invited via email to access permitted dashboard pages (Leads, Schedule, Messages, Jobs, Reports) as bounded by server security gates. Note: there are no individual capability checkboxes in the UI.',
          'Crew: Field workers who access assigned jobs, timecards, arrival buttons, and in-app voice notes via their magic link field portal (/field). They do not access the back-office dashboard.',
        ],
      },
      {
        title: 'Separate four kinds of feature readiness',
        steps: [
          'Role gate: Does the user role (Owner vs Office vs Crew) have server clearance for the requested action?',
          'Plan entitlement: Does your active subscription tier include sufficient seats, text credits, or storage?',
          'Operational prerequisites: Are external connections (such as Stripe Connect or carrier 10DLC registration) complete?',
          'Status vs Live: An on/off switch in settings expresses intent, but the feature only works live when dependencies are satisfied.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'An office user cannot access certain actions like sending quotes or merging clients.', fix: 'High-trust financial and destructive actions require Owner role clearance.' },
      { problem: 'A feature is enabled but not sending messages.', fix: 'Verify carrier registration under Settings → Business and check that text credits are available.' },
    ],
    related: ['manage-office-access-and-security', 'manage-plan-usage-and-credits', 'navigate-the-dashboard'],
  },
  {
    slug: 'ai-contractor-copilot-and-companions',
    chapterId: 'start',
    order: 6,
    title: 'Use the AI Contractor Copilot and customize your companion',
    summary: 'Leverage the in-app AI assistant with screen context, voice commands, and personalized companion avatars like Sparky, Diesel, Echo, and Energy Orbit.',
    outcome: 'You will work faster across estimating, dispatching, and customer replies with an AI copilot that understands your active screen.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 5,
    routes: [{ label: 'Dashboard', href: '/dashboard' }],
    prerequisites: ['Active workspace account'],
    keywords: ['ai copilot', 'avatars', 'sparky', 'diesel', 'echo', 'companion', 'mascot', 'ai assistant', 'screen awareness', 'voice commands', 'sidekick'],
    sections: [
      {
        title: 'Activate the AI Assistant on any screen',
        steps: [
          'Click the AI Copilot avatar in the bottom navigation or click the AI Copilot button in any record view.',
          'The copilot automatically captures your active screen context (such as the open quote draft, customer message thread, or crew calendar).',
          'Ask questions or request actions in plain English without re-typing customer names, job locations, or line item numbers.',
        ],
      },
      {
        title: 'Issue fast voice and text workflow commands',
        bullets: [
          'Estimate Generation: "Draft a 3-tier Good/Better/Best proposal with standard plumbing markups."',
          'Schedule Queries: "Find all unassigned jobs in Maplewood for tomorrow afternoon."',
          'Client Summaries: "Summarize this customer’s past payment history and open warranty items."',
        ],
      },
      {
        title: 'Attach job photos, PDF scopes, receipts, and rate sheets',
        bullets: [
          'Photo & Damage Inspection: Click the paperclip attachment button, paste from clipboard, or drag & drop job site photos to let your companion inspect equipment rating plates, damage, or punch list items.',
          'Receipt & Supply Invoicing: Upload store receipts or supplier invoice scans (JPEG, PNG, WebP) to automatically log job expenses and recalculate job profit margins.',
          'PDF & Scope Documents: Upload insurance adjuster packets, subcontractor bids, or PDF scopes of work for instant item extraction, cost estimation, and quote drafting.',
          'Rate Sheets & Spreadsheets: Attach Excel (.xlsx) or CSV price books to calculate custom quotes or update service pricing directly.',
        ],
      },
      {
        title: 'Customize companion personas and style',
        paragraphs: [
          'Open the Companion Picker to select your preferred assistant persona and avatar (such as Sparky with trade uniforms, Diesel the Foreman, Echo the Safety Inspector, or Energy Orbit) to tailor response tone and detail level to your workflow.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'AI assistant does not see updated page details.', fix: 'Ensure page changes have saved before opening the assistant modal, or close and reopen the companion window to refresh screen state.' },
      { problem: 'Companion avatar is hidden.', fix: 'Check your user display preferences in Settings to ensure the mascot companion is enabled.' },
    ],
    related: ['navigate-the-dashboard', 'configure-text-to-job-and-field-intake', 'understand-dashboard-priorities'],
  },

  // ==========================================
  // CHAPTER 2: SALES & QUOTING
  // ==========================================
  {
    slug: 'manage-the-lead-inbox',
    chapterId: 'sales',
    order: 1,
    title: 'Manage the lead Inbox, Board, and Table',
    summary: 'Triage new requests, prioritize urgent inquiries, and understand lead stage lifecycles.',
    outcome: 'Every new homeowner inquiry will have a clear stage, assigned owner, and prompt next action.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Leads', href: '/dashboard/leads' }],
    prerequisites: ['Leads view access'],
    keywords: ['leads', 'inbox', 'pipeline', 'stages', 'triage', 'delete lead', 'irreversible'],
    sections: [
      {
        title: 'Pick the view for your workflow',
        bullets: [
          'Inbox: Prioritizes active unresponded inquiries and shows customer history alongside the conversation.',
          'Board: Visual Kanban pipeline grouped by New, Contacted, Quoted, Won, and Lost stages.',
          'Table: Compact high-density list for bulk reviewing, filtering by source, or sorting by creation date.',
        ],
      },
      {
        title: 'Understand lead deletion cannot be undone',
        paragraphs: [
          'WARNING: Deleting a lead is permanent and cannot be undone. Deleting a lead hard-deletes the lead record, message history, and all uploaded intake and inspection photos from cloud storage.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A lead was accidentally deleted.', fix: 'Lead deletion cannot be undone. If the customer texts again, a new lead will automatically be generated.' },
    ],
    related: ['qualify-and-contact-a-lead', 'build-and-send-a-quote', 'configure-smart-intake'],
  },
  {
    slug: 'qualify-and-contact-a-lead',
    chapterId: 'sales',
    order: 2,
    title: 'Qualify, prioritize, and contact a lead',
    summary: 'Review homeowner scope, check trade match, and initiate two-way text or phone conversations.',
    outcome: 'You will respond to incoming inquiries in minutes with prepared details and clear next steps.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [
      { label: 'Leads', href: '/dashboard/leads' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Dashboard access', 'Active texting allowance'],
    keywords: ['qualify', 'lead score', 'contact lead', 'sms response', 'convert lead'],
    sections: [
      {
        title: 'Review scope and AI intake details',
        steps: [
          'Open the lead card to review homeowner description, job address, uploaded photos, and budget expectations.',
          'Check the automated trade and urgency tag generated by Smart Intake.',
          'Send a fast clarifying text directly from the lead drawer or click the phone number to call.',
        ],
      },
      {
        title: 'Progress to an estimate or on-site visit',
        paragraphs: [
          'When qualified, Owners can convert the lead to a quote draft or book an on-site estimate visit directly from the lead action menu.',
        ],
      },
    ],
    customerView: 'Homeowners receive immediate, professional text replies from your business number.',
    troubleshooting: [
      { problem: 'SMS reply fails to send.', fix: 'Verify the customer provided a valid mobile number and confirm your workspace has available text credits.' },
    ],
    related: ['manage-the-lead-inbox', 'schedule-estimate-and-start-date-options', 'build-and-send-a-quote'],
  },
  {
    slug: 'schedule-estimate-and-start-date-options',
    chapterId: 'sales',
    order: 3,
    title: 'Schedule estimate visits and hold start dates',
    summary: 'Book on-site consultations, reserve project start windows, and coordinate estimator calendars.',
    outcome: 'Estimate visits and tentative project starts will be booked without schedule conflicts.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [
      { label: 'Schedule', href: '/dashboard/schedule' },
      { label: 'Leads', href: '/dashboard/leads' },
    ],
    prerequisites: ['Owner access to book visits and create calendar reservations'],
    keywords: ['estimate visit', 'booking', 'start date', 'calendar hold', 'consultation'],
    sections: [
      {
        title: 'Book an on-site consultation',
        steps: [
          'From the lead details, click "Book Visit".',
          'Choose an available date and arrival window that aligns with your schedule.',
          'Assign an estimator or field technician to the visit.',
          'Confirm to automatically send the customer an SMS confirmation with their arrival window.',
        ],
      },
      {
        title: 'Hold a tentative start date on quotes',
        paragraphs: [
          'When assembling a quote, you can specify a proposed start date or timeline window. This date is held provisionally until the customer approves the estimate.',
        ],
      },
    ],
    customerView: 'Customers receive calendar invitations and SMS notifications detailing the estimator arrival window and preparation notes.',
    troubleshooting: [
      { problem: 'Customer wants to reschedule an estimate visit.', fix: 'Open Schedule, find the visit card, click Reschedule, and select a new time slot.' },
    ],
    related: ['qualify-and-contact-a-lead', 'build-and-send-a-quote', 'plan-a-day-and-dispatch-crew'],
  },
  {
    slug: 'build-and-send-a-quote',
    chapterId: 'sales',
    order: 4,
    title: 'Build and send a professional quote',
    summary: 'Assemble line items, configure deposits, attach photos, and understand the destructive nature of quote edits.',
    outcome: 'You will deliver beautiful interactive estimates that homeowners can approve and deposit from any device.',
    audiences: ['Owner'],
    readMinutes: 8,
    routes: [
      { label: 'Quotes', href: '/dashboard/jobs' },
      { label: 'Leads', href: '/dashboard/leads' },
    ],
    prerequisites: ['Owner access', 'Stripe Connect connected account (required to send quotes)'],
    keywords: ['quotes', 'estimate builder', 'deposits', 'line items', 'edit quote', 'destructive edit', 'resend quote'],
    sections: [
      {
        title: 'Build the estimate with price book items',
        steps: [
          'Click "New Quote" from the Quotes page or convert an existing lead.',
          'Select items from your Price Book or type custom scope descriptions, quantities, and rates.',
          'Configure optional upgrade line items for customer selection.',
          'Set deposit requirements (percentage or flat dollar amount) if upfront payment is required.',
        ],
      },
      {
        title: 'Stripe Connect requirement for sending quotes',
        paragraphs: [
          'Stripe Connect must be connected before you can send quotes to customers—even for zero-deposit estimates. This ensures reliable payment rails for subsequent milestone and final payments.',
        ],
      },
      {
        title: 'Understand the destructive effect of "Edit & Resend Quote"',
        paragraphs: [
          'IMPORTANT: If a quote has already been sent, clicking "Edit & Resend" is destructive. It immediately voids the customer’s existing approval link and permanently deletes any draft jobs, logged costs, draft invoices, or schedule requests attached to that quote version. Once edited, you must resend the new quote link to the client.',
        ],
      },
    ],
    customerView: 'Homeowners receive an SMS and email link opening a mobile-friendly interactive quote with 1-tap approval, optional upgrades, and secure card/bank deposit payment.',
    troubleshooting: [
      { problem: 'Quote send button is disabled.', fix: 'Ensure Stripe Connect is fully onboarded in Settings → Payments and that all line items have non-negative prices.' },
      { problem: 'Customer opened an old quote link after an edit.', fix: 'The old link is invalidated upon edit. Ensure the customer clicks the newest link sent after re-publishing.' },
    ],
    related: ['understand-the-customer-approval-flow', 'request-deposits-and-stage-payments', 'connect-stripe-and-get-paid'],
  },
  {
    slug: 'understand-the-customer-approval-flow',
    chapterId: 'sales',
    order: 5,
    title: 'Understand the customer approval flow',
    summary: 'Learn how clients view quotes, select optional upgrades, ask questions, sign, and pay deposits.',
    outcome: 'You will understand the customer experience and respond smoothly to questions or custom upgrade selections.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [{ label: 'Quotes', href: '/dashboard/jobs' }],
    prerequisites: ['Owner access'],
    keywords: ['approval flow', 'customer signature', 'optional extras', 'ask question', 'deposit payment'],
    sections: [
      {
        title: 'Interactive homeowner choices',
        bullets: [
          'Optional Upgrades: Customers can check or uncheck optional add-on items; the subtotal and deposit adjust dynamically in real time.',
          'Ask a Question: Approval is not the only option—customers can type a clarifying question directly on the quote page, notifying you via text and dashboard alert.',
          'Digital Signature & Deposit: To accept, the customer draws their digital signature and pays the required deposit using Apple Pay, Google Pay, credit card, or ACH.',
        ],
      },
      {
        title: 'Automated transition to Won Job',
        paragraphs: [
          'Upon successful approval and deposit payment, the quote status automatically flips to "Approved", the lead moves to "Won", and a linked Job record is instantly created with the approved scope and collected funds.',
        ],
      },
    ],
    customerView: 'Clients experience a clean, modern approval portal with instant receipts and clear project timeline expectations.',
    troubleshooting: [
      { problem: 'Customer asked a question instead of signing.', fix: 'Open Messages or the Quote page to read their question, reply by text, and answer their concerns.' },
      { problem: 'Customer signed but deposit failed.', fix: 'The quote remains in pending deposit state until card authorization clears. You can send a payment reminder link from the quote view.' },
    ],
    related: ['build-and-send-a-quote', 'manage-the-job-workspace', 'request-deposits-and-stage-payments'],
  },

  // ==========================================
  // CHAPTER 3: OPERATIONS & JOBS
  // ==========================================
  {
    slug: 'manage-the-job-workspace',
    chapterId: 'operations',
    order: 1,
    title: 'Manage the Job workspace and milestones',
    summary: 'Track live project execution, crew assignments, milestone checklists, and job cost accounting.',
    outcome: 'You will maintain complete operational control and audit trails across every active project.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Jobs', href: '/dashboard/jobs' }],
    prerequisites: ['Jobs access'],
    keywords: ['job workspace', 'milestones', 'punch list', 'job costing', 'delete job', 'irreversible'],
    sections: [
      {
        title: 'Monitor live project progress',
        steps: [
          'Open any active Job to view customer contact info, job site address, scope notes, and milestone checklists.',
          'Review field technician time entries and material receipts logged from the road.',
          'Generate change orders or progress invoices as project phases complete.',
        ],
      },
      {
        title: 'Job deletion is permanent and cannot be undone',
        paragraphs: [
          'WARNING: Deleting a job cannot be undone. Deleting a job hard-deletes the job file, milestone history, scheduled crew appointments, and all logged job costs and material records. If you only want to close out work, mark the job as Completed or Cancelled instead.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A job was accidentally deleted.', fix: 'Job deletion cannot be undone. Linked historical Stripe payment records remain in Payments for accounting, but the job file must be re-created if needed.' },
    ],
    related: ['schedule-work-from-the-queue', 'document-work-and-change-orders', 'create-and-send-an-invoice'],
  },
  {
    slug: 'schedule-work-from-the-queue',
    chapterId: 'operations',
    order: 2,
    title: 'Schedule work from the queue and handle booking requests',
    summary: 'Dispatch unscheduled jobs, configure weather alert settings, and handle booking requests or reschedule offers.',
    outcome: 'You will efficiently slot jobs onto the master calendar while respecting customer availability and weather safety.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Schedule', href: '/dashboard/schedule' }],
    prerequisites: ['Schedule access'],
    keywords: ['schedule queue', 'weather alerts', 'booking decline', 'reschedule offer', 'dispatch calendar'],
    sections: [
      {
        title: 'Enable weather alerts in schedule settings',
        paragraphs: [
          'Weather alerts on the schedule calendar are turned off by default. To activate real-time precipitation and extreme temperature warnings on your dispatch board, go to Schedule Settings (/dashboard/schedule/settings) and enable "Weather Alerts".',
        ],
      },
      {
        title: 'Handling booking requests and declines',
        bullets: [
          'Accepting a Request: Confirms the selected slot and sends an automated confirmation SMS to the homeowner.',
          'Declining a Request: WARNING: Declining a booking request immediately sends an unrecallable cancellation SMS text to the customer.',
          'Reschedule Negotiation: Use "Ask customer to move day" to propose alternative dates via text before declining.',
        ],
      },
    ],
    customerView: 'Customers receive clear SMS updates with technician names and arrival timeframes.',
    troubleshooting: [
      { problem: 'Weather warnings are not showing on rainy days.', fix: 'Open Schedule Settings (/dashboard/schedule/settings) and verify the Weather Alerts toggle is enabled.' },
    ],
    related: ['plan-a-day-and-dispatch-crew', 'manage-the-job-workspace', 'configure-appointment-and-arrival-messages'],
  },
  {
    slug: 'plan-a-day-and-dispatch-crew',
    chapterId: 'operations',
    order: 3,
    title: 'Plan a day and dispatch crew',
    summary: 'Optimize daily drive routes, assign lead technicians, and publish daily schedules.',
    outcome: 'Your crews will receive clear daily routes and homeowners will know when to expect technicians.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Schedule', href: '/dashboard/schedule' },
      { label: 'Jobs', href: '/dashboard/jobs' },
    ],
    prerequisites: ['Schedule dispatch access'],
    keywords: ['daily dispatch', 'route planning', 'crew assignment', 'arrival windows'],
    sections: [
      {
        title: 'Organize daily technician routes',
        steps: [
          'Open Schedule in Day view to inspect overlapping appointments and geographic clusters.',
          'Drag and drop jobs to balance workload across available crew leads.',
          'Review travel times and buffer windows between job sites.',
        ],
      },
      {
        title: 'Dispatch and notify field workers',
        paragraphs: [
          'Publishing the schedule syncs assigned jobs directly to the crew field portal at /field, giving technicians one-tap driving directions and customer access instructions.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A technician cannot see today’s dispatched job.', fix: 'Verify the technician is assigned as an active crew member on the job and that their field app is synced.' },
    ],
    related: ['schedule-work-from-the-queue', 'run-the-field-workflow', 'manage-crew-and-field-access'],
  },
  {
    slug: 'document-work-and-change-orders',
    chapterId: 'operations',
    order: 4,
    title: 'Document work, photos, and change orders',
    summary: 'Capture before/after photos, append progress voice notes, and issue customer-approved change orders.',
    outcome: 'You will protect profit margins on unexpected job site conditions with signed change orders and photo proof.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Jobs', href: '/dashboard/jobs' },
      { label: 'Text-to-Job', href: '/dashboard/text-to-job' },
    ],
    prerequisites: ['Jobs access'],
    keywords: ['change orders', 'progress photos', 'voice notes', 'scope increase', 'field documentation'],
    sections: [
      {
        title: 'Log visual proof and voice memos from the field',
        steps: [
          'Use the 🎙️ Voice Note button in the field job interface (/field/jobs/[id]) or text a voice memo to log site observations.',
          'Take clear photos of hidden damage (e.g. rotted wood, unexpected wiring) directly into the job file.',
          'Tag photos as "Internal" or "Client Visible".',
        ],
      },
      {
        title: 'Create and send a change order',
        paragraphs: [
          'When extra work is needed, generate a Change Order from the job workspace. Specify additional materials and labor, and send an SMS approval link so the homeowner approves the price increase before work continues.',
        ],
      },
    ],
    customerView: 'Clients receive a clean change order approval link on their phone, showing the reason for additional work and updated project cost.',
    troubleshooting: [
      { problem: 'Homeowner claims they did not approve extra charges.', fix: 'Open the job file to view the timestamped change order record, digital signature, and photo attachments.' },
    ],
    related: ['manage-the-job-workspace', 'run-the-field-workflow', 'configure-text-to-job-and-field-intake'],
  },
  {
    slug: 'manage-recurring-jobs',
    chapterId: 'operations',
    order: 5,
    title: 'Manage recurring service jobs and maintenance contracts',
    summary: 'Automate recurring service visits, seasonal tune-ups, and recurring billing cycles.',
    outcome: 'You will build reliable recurring service revenue with automated job generation and reminder texts.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [
      { label: 'Jobs', href: '/dashboard/jobs' },
      { label: 'Schedule', href: '/dashboard/schedule' },
    ],
    prerequisites: ['Jobs access'],
    keywords: ['recurring jobs', 'maintenance agreements', 'service contracts', 'auto dispatch', 'repeat visits'],
    sections: [
      {
        title: 'Set up a recurring schedule rule',
        steps: [
          'Open any client record and click "Add Recurring Job".',
          'Choose the frequency: weekly, bi-weekly, monthly, quarterly, or semi-annual.',
          'Specify preferred crew assignment, standard checklist, and automated booking notice timing.',
        ],
      },
      {
        title: 'Automated visit generation',
        paragraphs: [
          'The scheduler automatically generates upcoming job instances in your queue according to your lead-time settings, ensuring recurring customers never fall through the cracks.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A recurring visit needs to be skipped or paused.', fix: 'Open the recurring series in the client file and select "Skip Next Visit" or "Pause Series".' },
    ],
    related: ['manage-the-job-workspace', 'schedule-work-from-the-queue', 'run-rebooking-and-customer-follow-up'],
  },
  {
    slug: 'insurance-claims-and-restoration-packets',
    chapterId: 'operations',
    order: 6,
    title: 'Manage insurance claims, adjuster evidence, and restoration packets',
    summary: 'Document storm damage and emergency losses with timestamped photo evidence, generate adjuster packets, and bill supplemental scopes.',
    outcome: 'You will accelerate insurance claim approvals and secure full reimbursement for homeowner storm, fire, or water damage restoration.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Claims', href: '/dashboard/claims' },
      { label: 'Jobs', href: '/dashboard/jobs' },
    ],
    prerequisites: ['Job record created for restoration or insurance-funded project'],
    keywords: ['insurance claims', 'restoration', 'adjuster packet', 'storm damage', 'supplements', 'photo evidence', 'scope of work'],
    sections: [
      {
        title: 'Structure insurance claims and damage scopes',
        steps: [
          'Navigate to Claims in the job file and input the insurance carrier, policy claim number, policyholder deductible, and assigned adjuster details.',
          'Document the date of loss and cause of damage (wind/hail storm, pipe freeze/burst, electrical fire, water backup).',
          'Map code-required restoration items alongside standard repair scopes.',
        ],
      },
      {
        title: 'Compile timestamped photo evidence and moisture logs',
        bullets: [
          'Geotagged Damage Photos: Upload high-resolution photos of damaged shingles, siding, drywall, and structural framing with automated date/time stamps.',
          'Drone & Aerial Intel: Integrate aerial roof pitch and square measurements directly into the damage report.',
          'Moisture & Meter Logs: Record drying chamber readings and equipment logs for water mitigation compliance.',
        ],
      },
      {
        title: 'Export branded PDF adjuster packets & supplemental invoices',
        paragraphs: [
          'Generate professional adjuster packets formatted with itemized line items, photographic evidence sheets, and local municipal building code citations. When unexpected sub-surface rot or damage is discovered, issue supplemental change orders for adjuster approval.',
        ],
      },
    ],
    customerView: 'Homeowners and insurance adjusters receive a complete, transparent claim documentation package with side-by-side photographic proof.',
    troubleshooting: [
      { problem: 'Adjuster disputes a supplemental change order.', fix: 'Export the timestamped change order log with before-and-after photo attachments from the Claims tab.' },
      { problem: 'Deductible payment needs separate tracking.', fix: 'Record the homeowner deductible collection separately from carrier progress payments in the job billing ledger.' },
    ],
    related: ['document-work-and-change-orders', 'manage-the-job-workspace', 'configure-smart-intake'],
  },

  // ==========================================
  // CHAPTER 4: CUSTOMERS & MESSAGES
  // ==========================================
  {
    slug: 'manage-client-records',
    chapterId: 'customers',
    order: 1,
    title: 'Manage client records, properties, and histories',
    summary: 'Maintain customer contact details, service properties, equipment tags, and understand irreversible actions.',
    outcome: 'You will keep clean customer records and avoid accidental data loss when managing duplicate accounts.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Clients', href: '/dashboard/clients' }],
    prerequisites: ['Clients access (Owner role required for Merge, Delete, and Revoke Access)'],
    keywords: ['clients', 'crm', 'merge clients', 'block contact', 'delete client', 'irreversible', 'warranties'],
    sections: [
      {
        title: 'Maintain client profiles and property addresses',
        steps: [
          'View complete communication history, quote drafts, past invoices, and warranty documents for each client.',
          'Add multiple service property addresses under a single commercial or residential customer account.',
          'Attach equipment tags, gate codes, and pet safety notes for field technicians.',
        ],
      },
      {
        title: 'Irreversible client actions: Merge and Block',
        bullets: [
          'Merge Clients: WARNING: Merging client records cannot be undone. Merging permanently deletes the duplicate client profiles and detaches historical warranty records. Ensure you designate the correct master record before confirming.',
          'Block Contact: WARNING: Blocking a contact cannot be undone in the dashboard (no unblock surface exists). Blocked numbers can never send incoming leads or texts.',
          'Revoke Portal Access: Owner-only action that immediately invalidates customer portal magic links.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'An office user cannot see Merge or Delete buttons.', fix: 'Destructive client operations require Owner role authorization.' },
      { problem: 'Client profile merged with wrong record.', fix: 'Client merging cannot be undone. You will need to manually re-enter the separated contact details.' },
    ],
    related: ['work-the-customer-text-inbox', 'turn-on-the-customer-portal', 'manage-the-lead-inbox'],
  },
  {
    slug: 'work-the-customer-text-inbox',
    chapterId: 'customers',
    order: 2,
    title: 'Work the two-way customer text inbox',
    summary: 'Manage two-way SMS conversations, photo messages, and understand the carrier STOP opt-out invariant.',
    outcome: 'You will maintain fast customer response times while remaining 100% compliant with carrier messaging rules.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Messages', href: '/dashboard/messages' }],
    prerequisites: ['Messages access', 'Active texting allowance'],
    keywords: ['messages', 'sms inbox', 'stop compliance', 'opt out', 'unstop', 'block contact', 'mms photos'],
    sections: [
      {
        title: 'Communicate in real time from one business thread',
        steps: [
          'Open Messages to view customer conversations unified across web intake, quote comments, and direct SMS.',
          'Send text replies, estimate links, payment receipts, or site photos in seconds.',
          'Assign conversations to specific office team members for follow-up.',
        ],
      },
      {
        title: 'The STOP opt-out trap: Save button will NOT re-opt',
        paragraphs: [
          'CRITICAL CARRIER INVARIANT: When a customer replies STOP, carrier-level automation immediately marks their phone number as opted out. Clicking "Save" or editing their client card in the dashboard will NEVER re-opt them. To resume text messages, the customer MUST text START or UNSTOP from their own physical mobile handset.',
        ],
      },
      {
        title: 'Block contact is permanent',
        paragraphs: [
          'Clicking "Block Contact" stops all incoming messages permanently. There is no dashboard unblock action, so reserve blocking exclusively for severe spam or harassment.',
        ],
      },
    ],
    customerView: 'Customers receive texts from your official business texting number and can reply naturally with text or photos.',
    troubleshooting: [
      { problem: 'Messages to a customer are failing with opt-out errors.', fix: 'The customer texted STOP. Ask them to text "START" or "UNSTOP" to your business number to re-enable messaging.' },
    ],
    related: ['set-up-business-texting', 'set-up-your-own-text-alerts', 'manage-your-marketing-list-and-opt-outs'],
  },
  {
    slug: 'set-up-business-texting',
    chapterId: 'customers',
    order: 3,
    title: 'Set up business texting and carrier registration',
    summary: 'Configure your dedicated business texting number, 10DLC registration, and brand verification.',
    outcome: 'Your business texts will deliver reliably without carrier spam filtering or delivery delays.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [{ label: 'Business Settings', href: '/dashboard/settings#business' }],
    prerequisites: ['Owner access', 'Company legal EIN letter'],
    keywords: ['10dlc', 'carrier registration', 'dedicated number', 'sms setup', 'brand verification'],
    sections: [
      {
        title: 'Choose dedicated number vs shared platform number',
        bullets: [
          'Dedicated Business Number: Provides an exclusive local phone number dedicated to your company for all inbound/outbound calls and texts.',
          'Shared Platform Number: Provided on starting tiers with automated prefixing to identify your company to homeowners.',
        ],
      },
      {
        title: 'Complete 10DLC carrier brand registration',
        steps: [
          'Go to Settings → Business and verify your legal business name matches your official IRS EIN documentation exactly.',
          'Submit your physical business address and authorized contact representative.',
          'Carrier review typically completes within 2 to 24 hours.',
        ],
      },
    ],
    troubleshooting: [
      { problem: '10DLC carrier registration was rejected.', fix: 'Check that your legal business name and EIN in Settings match IRS records with exact spelling and punctuation.' },
    ],
    related: ['work-the-customer-text-inbox', 'set-up-your-own-text-alerts', 'business-profile-and-locations'],
  },
  {
    slug: 'turn-on-the-customer-portal',
    chapterId: 'customers',
    order: 4,
    title: 'Turn on and manage the customer portal',
    summary: 'Activate client self-service for quote viewing, invoice payment, and service requests from your live site.',
    outcome: 'Your clients will access their approved estimates, past invoices, and upcoming visits securely.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [
      { label: 'Automations', href: '/dashboard/automations#client-portal' },
      { label: 'Website', href: '/dashboard/sites' },
    ],
    prerequisites: ['Published website or subdomain', 'Stripe Connect for customer payments'],
    keywords: ['customer portal', 'client login', 'magic link', 'invoices', 'quotes', 'portal switch', 'automations'],
    sections: [
      {
        title: 'Master switch location on Automations page',
        paragraphs: [
          'The customer portal master switch is located on the Automations page (/dashboard/automations#client-portal), not under general Settings. Toggling this master switch off immediately and permanently strips the "Client Login" button from your live public website header.',
        ],
      },
      {
        title: 'What customers see in their portal',
        bullets: [
          'Estimates & Quotes: Review pending and accepted quotes with signed agreements.',
          'Invoices & Payments: View outstanding balances, download PDF receipts, and make one-click payments.',
          'Service Appointments: View scheduled technician arrival times and service history.',
          'Warranty & Equipment: Access documented serial numbers and completed job photos.',
        ],
      },
      {
        title: 'Passwordless magic link security',
        paragraphs: [
          'Homeowners sign in using passwordless email or SMS magic links. There are no forgotten passwords to reset, and client session tokens expire securely after inactivity.',
        ],
      },
    ],
    customerView: 'Clients enjoy a branded, secure self-service portal to review documents and pay invoices 24/7.',
    troubleshooting: [
      { problem: 'Client Login button is missing from website.', fix: 'Open Automations (/dashboard/automations#client-portal) and ensure the Customer Portal master toggle is enabled.' },
      { problem: 'Customer cannot open portal link.', fix: 'Send a fresh magic link directly from the client profile page in your dashboard.' },
    ],
    related: ['manage-client-records', 'create-and-send-an-invoice', 'build-and-publish-your-website'],
  },
  {
    slug: 'set-up-your-own-text-alerts',
    chapterId: 'customers',
    order: 5,
    title: 'Set up your own dispatch and lead text alerts',
    summary: 'Route urgent new leads, customer replies, and field updates directly to your mobile phone.',
    outcome: 'You will receive immediate SMS notifications for critical business events without constantly watching the dashboard.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [
      { label: 'Settings', href: '/dashboard/settings#business' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Verified mobile phone number', 'Active workspace texting allowance'],
    keywords: ['text alerts', 'owner phone', 'lead notification', 'dispatch alerts', 'mobile sms', 'instant alerts'],
    sections: [
      {
        title: 'Configure Owner Alert Phone',
        steps: [
          'Go to Settings → Business and enter your personal mobile phone number in "Owner Alert Phone".',
          'Verify the number with the 6-digit confirmation code sent to your phone.',
          'Select the specific alert triggers you want forwarded via SMS.',
        ],
      },
      {
        title: 'Choose your alert trigger events',
        bullets: [
          'New Incoming Leads: Immediate alert when a homeowner submits a web intake form or texts your number.',
          'Quote Approved & Deposit Paid: Instant notification when a client signs an estimate and pays a deposit.',
          'Customer Message Replies: Receive direct notifications when an active client texts a question.',
          'Emergency Service Requests: Priority routing for after-hours urgent repair inquiries.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Alert texts are not arriving on mobile.', fix: 'Verify your phone number in Settings → Business and confirm that notification toggles are switched on.' },
    ],
    related: ['work-the-customer-text-inbox', 'set-up-business-texting', 'configure-smart-intake'],
  },

  // ==========================================
  // CHAPTER 5: CREW & FIELD OPERATIONS
  // ==========================================
  {
    slug: 'manage-crew-and-field-access',
    chapterId: 'crew',
    order: 1,
    title: 'Manage crew members and field access',
    summary: 'Add field technicians, invite crew via magic link, assign labor rates, and control field permissions.',
    outcome: 'Field technicians will receive secure mobile access to their assigned jobs without viewing company financials.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Crew', href: '/dashboard/crew' },
    ],
    prerequisites: ['Crew management access'],
    keywords: ['crew', 'technicians', 'field access', 'magic link', 'labor rates', 'field routes'],
    sections: [
      {
        title: 'Add crew members and send magic link invitations',
        steps: [
          'Open Crew → Team and click "Add Crew Member".',
          'Enter their full name, mobile number, email address, and hourly labor pay rate.',
          'Send the invitation: crew access is delivered via an emailed magic link (not an SMS invite).',
          'The technician clicks their magic link to log directly into their field portal.',
        ],
      },
      {
        title: 'Core field app routes',
        bullets: [
          '/field: Primary mobile dashboard displaying today’s assigned jobs and active clock-in status.',
          '/field/login: Passwordless magic link authentication portal for crew members.',
          '/field/choose: Multi-job selector when a technician is assigned multiple sites in a day.',
          '/field/pay: Summary of captured shift hours and approved timecard entries.',
          '/field/offline: Offline sync manager for reviewing and submitting locally cached job notes.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Crew member did not receive their invite.', fix: 'Check that the technician’s email address is correct and ask them to check spam/junk folders for the magic link.' },
      { problem: 'Crew member sees financial reports.', fix: 'Ensure the user was invited as a Crew Member, not an Owner or Office user.' },
    ],
    related: ['run-the-field-workflow', 'review-timecards-and-pay', 'install-the-field-app-and-work-without-signal'],
  },
  {
    slug: 'run-the-field-workflow',
    chapterId: 'crew',
    order: 2,
    title: 'Run the daily field workflow and voice notes',
    summary: 'Clock in, navigate to job sites, tap On My Way, record in-app voice notes, and sync offline updates.',
    outcome: 'Technicians will execute their daily jobs smoothly from their truck with fast in-app voice notes.',
    audiences: ['Owner', 'Crew'],
    readMinutes: 7,
    routes: [
      { label: 'Jobs', href: '/dashboard/jobs' },
      { label: 'Field App', href: '/help/manual' },
    ],
    prerequisites: ['Crew access link'],
    keywords: ['field workflow', 'clock in', 'on my way', 'voice note', '12 hour sync', 'checklist', 'offline'],
    sections: [
      {
        title: 'Daily technician routine',
        steps: [
          'Open the Field App on mobile (/field) and tap "Clock In" at the start of the shift.',
          'Select the first assigned job to view the customer name, address, access codes, and scope checklist.',
          'Tap "On My Way" to notify the homeowner with an automated arrival ETA.',
          'Complete job milestone checklist items as work progresses.',
          'Tap "Clock Out" when the shift ends.',
        ],
      },
      {
        title: 'Record in-app voice notes (No telephone hotline required)',
        paragraphs: [
          'Technicians record field notes directly using the 🎙️ Voice Note button on the job page (/field/jobs/[id]) or by texting voice memos to Text-to-Job. There is no telephone call-in hotline—everything is captured cleanly within the app interface.',
        ],
      },
      {
        title: '12-hour offline sync expiration invariant',
        paragraphs: [
          'CRITICAL OFFLINE INVARIANT: Job notes, checklist completions, and time punches recorded without mobile signal are queued locally. When signal is restored, the queue syncs automatically. However, offline entries older than 12 hours are permanently refused by server sync to prevent stale data conflicts. Always sync before the end of your shift.',
        ],
      },
    ],
    customerView: 'Customers receive timely "On the way" texts with technician names and accurate arrival estimates.',
    troubleshooting: [
      { problem: 'Voice note transcription failed.', fix: 'Ensure microphone permissions are allowed in the mobile browser settings and record in a quiet environment.' },
      { problem: 'Offline entries failed to sync.', fix: 'Verify entries were recorded within the last 12 hours and check that internet connectivity is restored.' },
    ],
    related: ['manage-crew-and-field-access', 'install-the-field-app-and-work-without-signal', 'review-timecards-and-pay'],
  },
  {
    slug: 'review-timecards-and-pay',
    chapterId: 'crew',
    order: 3,
    title: 'Review timecards, approve pay, and export payroll',
    summary: 'Audit shift punches, resolve open shift anomalies, approve pay periods, and export payroll CSVs.',
    outcome: 'You will run accurate job costing and export clean payroll records with verified audit trails.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Timecards', href: '/dashboard/crew?tab=timecards' }],
    prerequisites: ['Timecards review access'],
    keywords: ['timecards', 'payroll export', 'labor cost', 'hourly pay', 'salaried exclusion', 'shift audit'],
    sections: [
      {
        title: 'Audit and approve crew timecards',
        steps: [
          'Open Timecards to review clocked hours grouped by employee, date, and assigned job.',
          'Inspect flagged anomalies (e.g. shifts left open overnight or missing lunch breaks).',
          'Edit punch times with a documented reason if manual corrections are required.',
          'Click "Approve Pay Period" to lock approved hours against further editing.',
        ],
      },
      {
        title: 'Payroll CSV export details',
        paragraphs: [
          'Click "Export Payroll CSV" to generate a payroll file formatted for QuickBooks, Gusto, or ADP. NOTE: The export includes all hourly shift punches and deliberately excludes salaried workers, who do not log hourly timecards.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A salaried employee is missing from the payroll CSV.', fix: 'The payroll CSV export is designed for hourly punch workers. Salaried compensation is tracked in general accounting.' },
      { problem: 'Technician forgot to clock out.', fix: 'Click the open shift row, enter the correct end time, and save the audit reason.' },
    ],
    related: ['manage-crew-and-field-access', 'run-the-field-workflow', 'read-reports-and-profitability'],
  },
  {
    slug: 'manage-subcontractor-coverage',
    chapterId: 'crew',
    order: 4,
    title: 'Manage subcontractor coverage and insurance compliance',
    summary: 'Track subcontractor 1099 agreements, Certificate of Insurance (COI) expirations, and trade assignments.',
    outcome: 'You will protect your business from liability by ensuring all subcontractors have active insurance on file.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Subcontractors', href: '/dashboard/crew?tab=team' }],
    prerequisites: ['Crew management access'],
    keywords: ['subcontractors', 'coi', 'insurance', '1099', 'compliance', 'expiration alerts'],
    sections: [
      {
        title: 'Track subcontractor credentials and COIs',
        steps: [
          'Add trade partners and 1099 subcontractors in Crew → Subcontractors.',
          'Upload Certificate of Insurance (COI) PDFs and record policy expiration dates.',
          'Set automated alerts 30 days before policy expiration.',
        ],
      },
      {
        title: 'Assign sub trades to project milestones',
        paragraphs: [
          'Assign subcontractors to specialized job phases (e.g. electrical rough-in, roofing) with clear scope instructions and site access dates.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Subcontractor shows an expired COI warning banner.', fix: 'Request an updated insurance certificate and update the policy expiration date in their profile.' },
    ],
    related: ['manage-crew-and-field-access', 'plan-a-day-and-dispatch-crew', 'manage-the-job-workspace'],
  },
  {
    slug: 'install-the-field-app-and-work-without-signal',
    chapterId: 'crew',
    order: 5,
    title: 'Install the field app and work without mobile signal',
    summary: 'Install the field app on mobile home screens, queue updates offline, and sync job notes when reconnected.',
    outcome: 'Field technicians will log notes, checklists, and timecards even in basements and remote job sites.',
    audiences: ['Owner', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Crew', href: '/dashboard/crew' },
      { label: 'Help', href: '/help/manual' },
    ],
    prerequisites: ['Crew member access link', 'Mobile browser with PWA / home screen support'],
    keywords: ['field app', 'offline', 'pwa', 'home screen', 'queue sync', '12 hours', 'no signal', 'voice note'],
    sections: [
      {
        title: 'Install the Field App to your mobile home screen',
        steps: [
          'iOS (Safari): Open your field access link, tap the Share icon at the bottom of Safari, and select "Add to Home Screen".',
          'Android (Chrome): Open your field access link, tap the 3-dot menu in Chrome, and select "Install app" or "Add to Home screen".',
          'Launch the app from your home screen icon for full-screen mobile operation.',
        ],
      },
      {
        title: 'Work in basements and dead zones with offline queueing',
        bullets: [
          'When signal drops, the field app displays an offline status indicator.',
          'Technicians can continue clocking shifts, checking off punch list items, taking photos, and typing job notes.',
          'All updates are securely stored in the mobile browser’s encrypted offline storage queue.',
        ],
      },
      {
        title: 'The 12-hour sync window invariant',
        paragraphs: [
          'CRITICAL OFFLINE RULE: As soon as mobile signal or Wi-Fi is restored, open the app or visit /field/offline to sync queued updates. Any offline queue items older than 12 hours will be permanently rejected by the server to avoid overwriting newer changes.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Offline queue shows pending items after returning to service.', fix: 'Open the field app, tap the offline indicator, and click "Sync Now".' },
      { problem: 'App asks for login again when reopening.', fix: 'Ensure you launch the app from the installed Home Screen icon rather than opening private/incognito browser tabs.' },
    ],
    related: ['run-the-field-workflow', 'manage-crew-and-field-access', 'document-work-and-change-orders'],
  },
  {
    slug: 'material-inventory-and-distributor-pricing',
    chapterId: 'crew',
    order: 6,
    title: 'Manage truck inventory and live distributor material pricing',
    summary: 'Track stock on service trucks, connect wholesale distributor pricing (Ferguson, ABC Supply, Graybar), and automate material purchase orders.',
    outcome: 'You will stop running out of critical parts in the field and quote accurate supply costs with live distributor price sheets.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Inventory', href: '/dashboard/inventory' },
      { label: 'Price Book', href: '/dashboard/services' },
    ],
    prerequisites: ['Inventory access enabled'],
    keywords: ['inventory', 'materials', 'distributor pricing', 'supply house', 'purchase orders', 'truck stock', 'edi 850', 'stock levels'],
    sections: [
      {
        title: 'Track warehouse and truck inventory',
        steps: [
          'Navigate to Inventory and configure items stocked on primary service vehicles (e.g. fittings, wire rolls, breakers, refrigerant).',
          'Set baseline minimum quantity reorder thresholds for each vehicle.',
          'Technicians deduct items from truck stock when completing jobs or logging field materials.',
        ],
      },
      {
        title: 'Connect distributor catalog pricing',
        bullets: [
          'Live Wholesale Price Feeds: Link distributor supplier accounts (Ferguson, ABC Supply, Graybar, Johnstone) to pull live contractor tier discounts.',
          'Direct EDI 850 Transmission: Transmit electronic purchase orders directly to local supply house branches.',
          'Price Book Sync: Automatically update your material line items when distributor wholesale costs increase.',
        ],
      },
      {
        title: 'Automate job material pick-lists and purchase orders',
        paragraphs: [
          'Approved quote line items instantly generate a job pick-list. Office managers can export a supplier purchase order with one click, saving technicians time at the supply counter.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Distributor catalog pricing shows outdated rates.', fix: 'Click "Refresh Price Catalog" in Inventory settings to sync the latest branch pricing feed.' },
      { problem: 'Truck stock counts do not match physical inventory.', fix: 'Perform a quick vehicle audit from the Field App and submit a count adjustment.' },
    ],
    related: ['manage-your-price-book', 'manage-job-expenses-and-receipt-ocr', 'run-the-field-workflow'],
  },

  // ==========================================
  // CHAPTER 6: INVOICES, PAYMENTS, AND CASH
  // ==========================================
  {
    slug: 'connect-stripe-and-get-paid',
    chapterId: 'money',
    order: 1,
    title: 'Connect Stripe and understand payment costs',
    summary: 'Onboard Stripe Connect, understand the platform fee schedule by plan, and reconcile payout balances.',
    outcome: 'You will accept credit card and bank payments securely with 100% transparency into fee structures and payout timing.',
    audiences: ['Owner'],
    readMinutes: 8,
    routes: [
      { label: 'Payments', href: '/dashboard/payments' },
      { label: 'Payments Settings', href: '/dashboard/settings#payouts' },
    ],
    prerequisites: ['Owner access', 'US business checking account and Tax ID (EIN or SSN)'],
    keywords: ['stripe connect', 'platform fee', 'application fee', 'payouts', 'credit card processing', 'fee basis', 'rates'],
    sections: [
      {
        title: 'Connect your business bank account with Stripe',
        steps: [
          'Go to Settings → Payments and click "Connect with Stripe".',
          'Complete the Stripe onboarding form with your legal business name, EIN, and banking routing/account numbers.',
          'Upon returning to the dashboard, your Stripe status will display "Connected & Active".',
        ],
      },
      {
        title: 'What a payment costs you: Complete fee schedule',
        bullets: [
          'Platform Fee Rates by Plan: Flex plan is 125 bps (1.25%), Solo plan is 50 bps (0.50%), Growth plan is 25 bps (0.25%), and Scale plan is 10 bps (0.10%).',
          'Stripe Processing Fee: Stripe charges a separate standard processing fee (typically 2.9% + $0.30 per card transaction) directly to your connected account.',
          'Platform Fee Basis: The platform fee is calculated on the discount-adjusted eligible service subtotal. Sales tax and customer tips are strictly excluded from the platform fee basis.',
          'Fee Rate Locking: The platform fee rate locks at checkout session creation, ensuring rate stability for each specific transaction.',
        ],
      },
      {
        title: 'Reconciling your three balances',
        paragraphs: [
          'To reconcile payouts, compare: (1) Invoice Gross Amount paid by customer, minus (2) Platform Application Fee and Stripe processing fee, equals (3) Net Payout transferred to your checking account on a standard 2-business-day rolling schedule.',
        ],
      },
    ],
    customerView: 'Customers pay via secure Stripe-hosted checkouts with instant email receipts and bank-grade SSL encryption.',
    troubleshooting: [
      { problem: 'First customer payment has not reached bank account.', fix: 'Stripe applies an initial 7-14 business day verification period for newly connected accounts. Subsequent transfers occur on a 2-day rolling window.' },
      { problem: 'Stripe onboarding shows restricted.', fix: 'Open Settings → Payments to review requested ID verification documents in the Stripe Express portal.' },
    ],
    related: ['create-and-send-an-invoice', 'request-deposits-and-stage-payments', 'manage-refunds-and-payment-problems'],
  },
  {
    slug: 'create-and-send-an-invoice',
    chapterId: 'money',
    order: 2,
    title: 'Create and send professional invoices',
    summary: 'Generate final invoices from completed jobs, apply discounts and taxes, and send payment links.',
    outcome: 'You will bill clients promptly and get paid faster with 1-tap mobile payment links.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Payments', href: '/dashboard/payments' }],
    prerequisites: ['Invoices access', 'Stripe Connect connected'],
    keywords: ['invoices', 'send invoice', 'billing', 'tax calculation', 'payment link', 'pdf invoice', 'print', 'print invoice'],
    sections: [
      {
        title: 'Generate, print, or send an invoice from job scope',
        steps: [
          'Click "Create Invoice" from the job file or Invoices workspace.',
          'Scope items, materials, and approved change orders populate automatically with previous deposits deducted.',
          'Apply sales tax percentage or promo discounts as needed.',
          'Click "Send Invoice" to deliver the payment link via SMS and email.',
        ],
      },
      {
        title: 'Track invoice status in real time',
        bullets: [
          'Draft: Editable invoice being prepared.',
          'Sent: Delivered to customer; awaiting payment.',
          'Overdue: Past due date; automated reminder sequences activate.',
          'Paid: Funds collected and credited to job accounting.',
        ],
      },
    ],
    customerView: 'Homeowners receive clean SMS/email invoices with an immediate "Pay Invoice" link supporting card, Apple Pay, and ACH.',
    troubleshooting: [
      { problem: 'Customer cannot open the invoice payment link.', fix: 'Resend the invoice link from the invoice action menu or copy the payment URL directly.' },
    ],
    related: ['connect-stripe-and-get-paid', 'request-deposits-and-stage-payments', 'read-cash-flow-and-forecasts'],
  },
  {
    slug: 'request-deposits-and-stage-payments',
    chapterId: 'money',
    order: 3,
    title: 'Request deposits, progress billing, and stage payments',
    summary: 'Configure milestone installment schedules and understand proportional platform fee allocation.',
    outcome: 'You will maintain positive cash flow on large projects with structured progress payments.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Payments', href: '/dashboard/payments' },
      { label: 'Quotes', href: '/dashboard/jobs' },
    ],
    prerequisites: ['Invoices access', 'Stripe Connect connected'],
    keywords: ['deposits', 'stage payments', 'progress billing', 'milestone payments', 'fee allocation'],
    sections: [
      {
        title: 'Structure milestone installments',
        steps: [
          'When creating a quote or invoice, select "Milestone / Stage Payments".',
          'Add stages (e.g. 33% Deposit on Approval, 33% Rough-in Passed, 34% Final Completion).',
          'Trigger each installment invoice as the corresponding job phase is completed.',
        ],
      },
      {
        title: 'Proportional fee allocation across installments',
        paragraphs: [
          'Platform fees are allocated proportionally across each installment relative to the total eligible service subtotal. This ensures that installment splits always sum to the exact fee basis when the invoice is paid in full.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Customer wants to pay an installment early.', fix: 'Open the job file, find the staged invoice item, and click "Send Now".' },
    ],
    related: ['connect-stripe-and-get-paid', 'create-and-send-an-invoice', 'manage-the-job-workspace'],
  },
  {
    slug: 'read-cash-flow-and-forecasts',
    chapterId: 'money',
    order: 4,
    title: 'Read cash flow projections and payment forecasts',
    summary: 'Forecast 30-day incoming cash flow, monitor payout dates, and predict upcoming expenses.',
    outcome: 'You will anticipate cash needs and avoid cash flow pinches on materials and payroll.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [{ label: 'Cash Flow', href: '/dashboard/cash-flow' }],
    prerequisites: ['Owner access'],
    keywords: ['cash flow', 'forecast', 'payout timing', 'projected revenue', 'financial planning'],
    sections: [
      {
        title: 'Understand the cash flow forecast model',
        steps: [
          'Open Reports → Cash Flow to inspect projected 30-day inflows and outflows.',
          'Inflows project confirmed deposits, active stage invoices, and scheduled job completions.',
          'Outflows project crew labor costs and supplier material expenditures.',
        ],
      },
      {
        title: 'Monitor payout transit timing',
        paragraphs: [
          'The transit pipeline displays funds currently in flight from Stripe to your bank account, highlighting exact expected deposit dates.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A completed job does not show in cash flow inflows.', fix: 'Verify that an invoice has been generated and sent for the completed job.' },
    ],
    related: ['connect-stripe-and-get-paid', 'read-reports-and-profitability', 'create-and-send-an-invoice'],
  },
  {
    slug: 'read-reports-and-profitability',
    chapterId: 'money',
    order: 5,
    title: 'Read revenue reports, job costing, and gross margins',
    summary: 'Analyze project gross margins, revenue by trade service, and crew labor efficiency.',
    outcome: 'You will identify your most profitable services and price future jobs with confidence.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Reports', href: '/dashboard/reports' }],
    prerequisites: ['Owner access'],
    keywords: ['reports', 'profitability', 'gross margin', 'job costing', 'revenue by trade', 'financial analytics'],
    sections: [
      {
        title: 'Analyze job profitability and gross margin',
        steps: [
          'Open Reports → Profitability to view gross profit (Billed Revenue minus Direct Labor and Materials).',
          'Filter by trade category to compare plumbing, HVAC, electrical, or general contracting margins.',
          'Inspect individual job scorecards to identify jobs that ran over labor hour budgets.',
        ],
      },
      {
        title: 'Export financial reports',
        paragraphs: [
          'Export detailed CSV summaries of revenue, taxes collected, and labor allocations for your CPA or bookkeeping software.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Job gross margin shows as 100%.', fix: 'Ensure crew timecards and material receipts were logged and attached to the job file.' },
    ],
    related: ['read-cash-flow-and-forecasts', 'review-timecards-and-pay', 'manage-your-price-book'],
  },
  {
    slug: 'manage-refunds-and-payment-problems',
    chapterId: 'money',
    order: 6,
    title: 'Manage refunds, failed charges, and chargebacks',
    summary: 'Issue partial/full refunds and understand the critical evidence submission procedure for chargeback disputes.',
    outcome: 'You will handle payment disputes and customer refunds correctly without losing dispute rights.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [
      { label: 'Payments', href: '/dashboard/payments' },
      { label: 'Help', href: '/dashboard/help' },
    ],
    prerequisites: ['Owner access'],
    keywords: ['refunds', 'chargebacks', 'disputes', 'failed payments', 'stripe express', 'evidence submission'],
    sections: [
      {
        title: 'Issue a partial or full refund',
        steps: [
          'Open the paid invoice in Invoices and click "Issue Refund".',
          'Enter the refund amount and select a reason (e.g. scope reduction, cancelled work).',
          'Confirm refund: Stripe processes the refund back to the customer’s card within 5–10 business days.',
          'Platform application fees are automatically and proportionally refunded.',
        ],
      },
      {
        title: 'Handling chargebacks: Submit evidence to LGQ Support immediately',
        bullets: [
          'Dispute Alert: When a homeowner disputes a charge with their bank (charge.dispute.created), the payment status flips to "Disputed" and a dispute_due_by deadline is recorded.',
          'Express Account Limitation: Because contractor accounts use Stripe Express with platform loss collection, contractors cannot respond to disputes inside Stripe.',
          'The ONLY Correct Action: You must email all dispute evidence directly to Let’s Get Quoted Support (support@letsgetquoted.com) well before the dispute_due_by deadline.',
          'Required Evidence: Attach the signed quote agreement, signed change orders, timestamped completion photos, customer text message logs, and paid invoices.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A chargeback notification was received.', fix: 'Collect all signed contracts, completion photos, and communication history, and email them to support@letsgetquoted.com before the deadline.' },
      { problem: 'Customer claims a refund did not post.', fix: 'Card refunds take 5-10 business days depending on the customer’s issuing bank.' },
    ],
    related: ['connect-stripe-and-get-paid', 'create-and-send-an-invoice', 'find-help-and-contact-support'],
  },
  {
    slug: 'manage-job-expenses-and-receipt-ocr',
    chapterId: 'money',
    order: 7,
    title: 'Track job expenses, receipts, and supply costs with AI OCR',
    summary: 'Capture material receipts from your phone camera, extract line items with AI OCR, and assign expenses directly to jobs for real-time margin tracking.',
    outcome: 'You will eliminate lost paper receipts and know exact job profitability before sending final invoices.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 6,
    routes: [
      { label: 'Expenses', href: '/dashboard/expenses' },
      { label: 'Jobs', href: '/dashboard/jobs' },
    ],
    prerequisites: ['Dashboard or field app access'],
    keywords: ['expenses', 'receipts', 'ocr', 'material costs', 'job costing', 'supply receipts', 'camera capture', 'actual margin'],
    sections: [
      {
        title: 'Snap and upload supply receipts instantly',
        steps: [
          'Open Expenses in the dashboard or Field App and click "Add Expense / Scan Receipt".',
          'Take a photo of paper register slips from Home Depot, Lowe’s, Ferguson, or local supply houses.',
          'Upload PDF invoices or e-receipts directly from your mobile device or desktop.',
        ],
      },
      {
        title: 'AI OCR line-item parsing and job mapping',
        bullets: [
          'Automatic Field Extraction: AI OCR extracts merchant name, date, subtotal, tax, and individual material line items.',
          'Job Assignment: Select the active Job ID to assign expenses directly to that project’s cost ledger.',
          'Category Classification: Classify items as Materials, Equipment Rental, Disposal/Dump, or Subcontractor Expense.',
        ],
      },
      {
        title: 'Compare estimated vs. actual job margins',
        paragraphs: [
          'Every logged expense instantly updates the job’s real-time financial scorecard, comparing actual spent materials and labor burden against quoted prices so you catch cost overruns before final invoicing.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Receipt OCR failed on a crumpled or faded receipt.', fix: 'Ensure good lighting against a dark background, or manually edit the extracted amount and vendor fields before saving.' },
      { problem: 'Expense was assigned to the wrong customer job.', fix: 'Open the expense record in Expenses, click Edit, and select the correct Job ID from the dropdown.' },
    ],
    related: ['manage-the-job-workspace', 'run-the-field-workflow', 'read-reports-and-profitability'],
  },

  // ==========================================
  // CHAPTER 7: AUTOMATIONS & GROWTH
  // ==========================================
  {
    slug: 'configure-automations-safely',
    chapterId: 'growth',
    order: 1,
    title: 'Configure automations safely and responsibly',
    summary: 'Set up automated lead responses, review requests, quiet hours, and avoid spam filtering.',
    outcome: 'Your automations will nurture leads and follow up with clients without annoying customers or violating carrier rules.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Automations', href: '/dashboard/automations' }],
    prerequisites: ['Owner access'],
    keywords: ['automations', 'quiet hours', 'triggers', 'follow up', 'anti spam', 'rules'],
    sections: [
      {
        title: 'Understand the core automation rules',
        steps: [
          'Open Automations to review available event triggers: New Lead, Quote Sent, Job Completed, and Invoice Paid.',
          'Set automated delay timers (e.g. send review request 2 hours after job completion).',
          'Enforce Quiet Hours (e.g. 8:00 PM to 8:00 AM in the recipient\'s or account\'s local time zone) so automated texts are paused until morning.',
        ],
      },
      {
        title: 'Test automations before enabling',
        paragraphs: [
          'Always test automation sequences on your own phone number before enabling them for all live customer traffic.',
        ],
      },
    ],
    customerView: 'Customers experience timely, natural follow-ups that feel personal rather than robotic.',
    troubleshooting: [
      { problem: 'Automated text was delayed until morning.', fix: 'Quiet Hours settings prevent automated SMS delivery during nighttime hours (evaluated in the recipient\'s or account\'s local time zone). Messages queue and send automatically when quiet hours end.' },
    ],
    related: ['configure-appointment-and-arrival-messages', 'request-and-manage-reviews', 'run-marketing-campaigns'],
  },
  {
    slug: 'configure-appointment-and-arrival-messages',
    chapterId: 'growth',
    order: 2,
    title: 'Configure appointment reminders and arrival notices',
    summary: 'Automate 24-hour appointment reminders, morning-of confirmation texts, and technician arrival ETAs.',
    outcome: 'You will virtually eliminate customer no-shows and prepare homeowners for crew arrivals.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Automations', href: '/dashboard/automations#reminders' }],
    prerequisites: ['Automations access'],
    keywords: ['appointment reminders', 'arrival notices', 'on my way', 'no shows', 'sms reminders'],
    sections: [
      {
        title: 'Set reminder delivery cadences',
        steps: [
          'Enable 24-hour reminder texts: Sends an automated confirmation SMS the day before scheduled work.',
          'Enable 2-hour reminder texts: Reminds the client to clear work areas and secure pets.',
          'Configure the technician "On My Way" button template.',
        ],
      },
      {
        title: 'Customize reminder copy',
        paragraphs: [
          'Insert dynamic tags like {customer_name}, {technician_name}, {arrival_window}, and {company_phone} into your templates.',
        ],
      },
    ],
    customerView: 'Homeowners receive clear, helpful reminder texts and real-time technician arrival notices.',
    troubleshooting: [
      { problem: 'Customer texted back to reschedule after a reminder.', fix: 'Customer replies appear immediately in your Messages inbox for fast office rescheduling.' },
    ],
    related: ['configure-automations-safely', 'plan-a-day-and-dispatch-crew', 'run-the-field-workflow'],
  },
  {
    slug: 'request-and-manage-reviews',
    chapterId: 'growth',
    order: 3,
    title: 'Request and manage customer reviews',
    summary: 'Automate Google review collection and understand the difference between Direct-to-Google and Private Feedback modes.',
    outcome: 'You will systematically build 5-star Google Business ratings after every completed job.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Reviews', href: '/dashboard/reviews' },
      { label: 'Automations', href: '/dashboard/automations#reviews' },
    ],
    prerequisites: ['Reviews access', 'Google Business Profile link'],
    keywords: ['reviews', 'google reviews', 'direct to google', 'customer feedback', 'reputation management'],
    sections: [
      {
        title: 'Connect your Google Business Profile',
        steps: [
          'Go to Automations → Reviews and paste your Google Business Review link.',
          'Set the automated trigger: e.g. 2 hours after a job is marked Completed.',
          'Choose your Review Routing Mode.',
        ],
      },
      {
        title: 'Understand the two review modes',
        bullets: [
          'Direct-to-Google Mode: Sends the customer straight to your public Google review page. NOTE: In this mode, no private negative feedback is intercepted or collected; all users go directly to Google.',
          'Private Feedback Filter Mode: Asks the customer a 1–5 star satisfaction question first. 5-star ratings route to Google; lower ratings open a private owner feedback form.',
        ],
      },
    ],
    customerView: 'Satisfied customers receive a 1-tap link taking them directly to leave a review on your Google Business Profile.',
    troubleshooting: [
      { problem: 'Review link opens an invalid Google page.', fix: 'Verify your Google Review URL in Automations → Reviews. Test the link in an incognito window.' },
    ],
    related: ['configure-automations-safely', 'manage-the-job-workspace', 'customize-email-and-blog-content'],
  },
  {
    slug: 'run-rebooking-and-customer-follow-up',
    chapterId: 'growth',
    order: 4,
    title: 'Run rebooking campaigns and seasonal follow-ups',
    summary: 'Re-engage past clients with automated seasonal maintenance reminders and tune-up offers.',
    outcome: 'You will generate steady repeat work from your existing customer database during slow seasons.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Rebook', href: '/dashboard/rebook' }],
    prerequisites: ['Automations access'],
    keywords: ['rebooking', 'seasonal tune ups', 'repeat business', 'customer lifecycle', 'follow up'],
    sections: [
      {
        title: 'Configure automated rebooking intervals',
        steps: [
          'Select trade triggers: e.g. 6-month HVAC filter/tune-up, 12-month plumbing inspection, or annual gutter cleaning.',
          'Set automated SMS/email invitations linking to your online booking page.',
          'Include promotional seasonal discounts if desired.',
        ],
      },
      {
        title: 'Review rebooking conversion metrics',
        paragraphs: [
          'Track rebooking campaign response rates and revenue generated from past customers in your dashboard reports.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A rebooking text sent to an inactive customer.', fix: 'Archive inactive client records to exclude them from automated rebooking triggers.' },
    ],
    related: ['configure-automations-safely', 'run-marketing-campaigns', 'manage-recurring-jobs'],
  },
  {
    slug: 'run-marketing-campaigns',
    chapterId: 'growth',
    order: 5,
    title: 'Run targeted promotional campaigns',
    summary: 'Broadcast SMS and email promotions, understand immediate send execution, and the 250-recipient limit.',
    outcome: 'You will launch revenue-generating marketing broadcasts while staying within delivery and compliance limits.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 7,
    routes: [{ label: 'Campaigns', href: '/dashboard/marketing/campaigns' }],
    prerequisites: ['Campaigns access', 'Saved business mailing address', 'Available marketing send allowance'],
    keywords: ['campaigns', 'sms marketing', 'max recipients', '250 limit', 'immediate send', 'opted in', 'broadcast'],
    sections: [
      {
        title: 'Compose your promotional campaign',
        steps: [
          'Open Campaigns and click "Create Campaign".',
          'Choose SMS Broadcast or Email Newsletter.',
          'Write your message with a compelling call-to-action and direct booking link.',
          'Preview the message on desktop and mobile mockups.',
        ],
      },
      {
        title: 'Understand campaign send realities and limits',
        bullets: [
          'Immediate Execution: Marketing sends are executed immediately upon clicking Send. There is no delayed queue or cancel-after-send mechanism.',
          '250-Recipient Cap: Campaign audiences are sliced to MAX_RECIPIENTS = 250 per run. If your audience has 400 contacts, the system sends to the first 250.',
          'Opted-In List Composition: The SMS broadcast list filters on status = opted_in. Contacts generated during transactional quoting or booking are included unless they have texted STOP.',
          'Performance Tracking: Tracks actual operational metrics: runs, sent, queued, and failed counts.',
        ],
      },
    ],
    customerView: 'Customers receive clean, formatted promotional messages with clear opt-out instructions.',
    troubleshooting: [
      { problem: 'Campaign sends to fewer people than expected.', fix: 'Campaign runs are capped at 250 recipients (MAX_RECIPIENTS = 250), and contacts who previously texted STOP are automatically excluded.' },
      { problem: 'Campaign cannot be sent.', fix: 'Verify a physical business mailing address is saved in Settings → Business (required for anti-spam compliance).' },
    ],
    related: ['manage-your-marketing-list-and-opt-outs', 'customize-email-and-blog-content', 'configure-automations-safely'],
  },
  {
    slug: 'customize-email-and-blog-content',
    chapterId: 'growth',
    order: 6,
    title: 'Customize email templates and publish blog content',
    summary: 'Design email layouts, publish SEO blog articles, and understand instant publishing and email suppression.',
    outcome: 'You will improve website SEO and client communication with rich branding and educational articles.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Blog & Content', href: '/dashboard/marketing/blog' }],
    prerequisites: ['Website builder access'],
    keywords: ['blog', 'seo articles', 'instant publish', 'email suppression', 'content marketing'],
    sections: [
      {
        title: 'Publish trade blog articles for local SEO',
        steps: [
          'Go to Website Builder → Blog and click "New Article".',
          'Use AI drafts or write custom advice (e.g. "How to Prepare Your Pipes for Winter").',
          'Attach job photos and target local neighborhood keywords.',
          'Click "Draft & Publish Now" — NOTE: this publishes live immediately to your website with no staging delay.',
        ],
      },
      {
        title: 'Email suppression list handling',
        paragraphs: [
          'When an email recipient clicks "Unsubscribe", their address is automatically placed on the workspace suppression list. There is no manual un-suppression control, protecting your sender domain reputation.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Blog post published with a typo.', fix: 'Open the article in Website Builder → Blog, make your corrections, and click Save to update the live post immediately.' },
    ],
    related: ['build-and-publish-your-website', 'run-marketing-campaigns', 'manage-your-marketing-list-and-opt-outs'],
  },
  {
    slug: 'manage-your-marketing-list-and-opt-outs',
    chapterId: 'growth',
    order: 7,
    title: 'Manage your marketing list, opt-outs, and delivery limits',
    summary: 'Understand the opted-in customer audience, the 250-recipient batch cap, and TCPA/carrier STOP compliance.',
    outcome: 'You will run compliant promotional campaigns without risking carrier blocks or sending to opted-out contacts.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Campaigns', href: '/dashboard/marketing/campaigns' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Owner or Office staff access', 'Verified business mailing address saved'],
    keywords: ['opt in', 'opt out', 'stop compliance', 'sms marketing', 'max recipients', '250 limit', 'tcpa', 'email suppression'],
    sections: [
      {
        title: 'How contacts enter the marketing list',
        bullets: [
          'Transactional Opt-In: Contacts created through website intake, phone estimates, or quotes are marked with status = opted_in.',
          'Immediate Compliance: If a customer replies STOP to any message, carrier automation immediately locks their phone number into opted-out status.',
          'No Dashboard Override: Editing or saving a client profile in the dashboard CANNOT re-opt a stopped phone number. The customer must text START or UNSTOP from their mobile phone.',
        ],
      },
      {
        title: 'The 250-recipient batch cap',
        paragraphs: [
          'Every marketing campaign broadcast is sliced to MAX_RECIPIENTS = 250. If you have an audience of 500 contacts, plan your sends in segmented batches to ensure full reach.',
        ],
      },
      {
        title: 'Email suppression rules',
        paragraphs: [
          'Email unsubscribe clicks permanently add recipient emails to the suppression list. The platform suppresses future marketing emails automatically to maintain high inbox deliverability.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A customer wants to receive marketing texts again after texting STOP.', fix: 'Instruct the customer to text "START" or "UNSTOP" to your business phone number from their phone.' },
    ],
    related: ['run-marketing-campaigns', 'work-the-customer-text-inbox', 'set-up-business-texting'],
  },

  // ==========================================
  // CHAPTER 8: WEBSITE AND INTAKE CHANNELS
  // ==========================================
  {
    slug: 'build-and-publish-your-website',
    chapterId: 'intake',
    order: 1,
    title: 'Build and publish your SEO contractor website',
    summary: 'Design pages, connect custom domains via domains.letsgetquoted.com, and understand subdomain rename risks.',
    outcome: 'You will launch a high-converting contractor website that ranks locally and captures qualified leads 24/7.',
    audiences: ['Owner'],
    readMinutes: 8,
    routes: [{ label: 'Website Builder', href: '/dashboard/sites' }],
    prerequisites: ['Owner access'],
    keywords: ['website builder', 'custom domain', 'domains.letsgetquoted.com', 'cname', 'subdomain rename', 'ssl', 'seo'],
    sections: [
      {
        title: 'Customize trade content and branding',
        steps: [
          'Open Website Builder to select your trade layout, color scheme, logo, and photo gallery.',
          'Add your service pages, service area radius, and customer review showcases.',
          'Preview your site on desktop, tablet, and mobile viewports.',
        ],
      },
      {
        title: 'Connect your custom domain (e.g. www.yourcompany.com)',
        bullets: [
          'A Record: Point host "@" to IP address 76.76.21.21.',
          'CNAME Record: Point host "www" to domains.letsgetquoted.com (do not use outdated hostnames).',
          'Automatic SSL: Free Let’s Encrypt SSL certificates are provisioned automatically once DNS propagation is verified.',
        ],
      },
      {
        title: 'Subdomain renaming warning: No redirect',
        paragraphs: [
          'WARNING: If you use an LGQ subdomain (e.g. yourname.letsgetquoted.com) and rename it after launch, there is NO automatic redirect. All existing QR codes, vehicle wrap links, and search engine index links will immediately break.',
        ],
      },
    ],
    customerView: 'Homeowners experience a lightning-fast, mobile-friendly website with instant quote requests and booking widgets.',
    troubleshooting: [
      { problem: 'Domain shows DNS verification pending.', fix: 'Verify your CNAME points to domains.letsgetquoted.com and A record points to 76.76.21.21. DNS changes can take up to 24-48 hours to propagate.' },
      { problem: 'Subdomain was renamed and old links fail.', fix: 'Update external links, marketing materials, and Google Business Profile URLs to your new subdomain.' },
    ],
    related: ['configure-smart-intake', 'configure-online-booking', 'turn-on-the-customer-portal'],
  },
  {
    slug: 'configure-smart-intake',
    chapterId: 'intake',
    order: 2,
    title: 'Configure Smart Intake and lead capture forms',
    summary: 'Customize website intake questions, emergency tags, photo uploads, and instant lead scoring.',
    outcome: 'You will collect structured project requirements and photos on every incoming homeowner request.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Smart Intake', href: '/dashboard/automations#intake-ai' }],
    prerequisites: ['Intake access'],
    keywords: ['smart intake', 'lead forms', 'photo intake', 'emergency triage', 'embed forms'],
    sections: [
      {
        title: 'Customize trade intake questions',
        steps: [
          'Select trade-specific intake fields (e.g. pipe material for plumbing, unit age for HVAC).',
          'Enable photo and video uploads so homeowners submit pictures of their issue.',
          'Enable instant emergency triage questions (e.g. active water leaks, sparking panel).',
        ],
      },
      {
        title: 'Embed on external websites or use standalone links',
        paragraphs: [
          'Copy the Smart Intake iframe code to embed on WordPress, Squarespace, or Wix sites, or share your direct intake link in local ads.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Intake form submissions do not notify the owner.', fix: 'Verify Owner Alert Phone is configured under Settings → Business.' },
    ],
    related: ['build-and-publish-your-website', 'manage-the-lead-inbox', 'configure-text-to-job-and-field-intake'],
  },
  {
    slug: 'configure-online-booking',
    chapterId: 'intake',
    order: 3,
    title: 'Configure online booking and service windows',
    summary: 'Open self-service booking slots, buffer times, and appointment availability on your website.',
    outcome: 'Homeowners will book consultations and repair visits directly into your open schedule windows.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Online Booking', href: '/dashboard/automations#booking-availability' }],
    prerequisites: ['Booking settings access'],
    keywords: ['online booking', 'service windows', 'appointment slots', 'booking buffer', 'availability'],
    sections: [
      {
        title: 'Set up booking windows and technician availability',
        steps: [
          'Go to Website Builder → Online Booking.',
          'Configure bookable time windows (e.g. 8:00 AM–11:00 AM, 1:00 PM–4:00 PM).',
          'Set booking buffer times (e.g. minimum 4-hour advance notice).',
          'Specify which services allow direct booking versus estimate consultation requests.',
        ],
      },
      {
        title: 'Prevent overbooking',
        paragraphs: [
          'The booking engine automatically checks technician calendars and suppresses slots when capacity is full.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Customers cannot see available slots for tomorrow.', fix: 'Check your minimum advance notice buffer in booking settings.' },
    ],
    related: ['schedule-work-from-the-queue', 'configure-quick-stops', 'build-and-publish-your-website'],
  },
  {
    slug: 'configure-quick-stops',
    chapterId: 'intake',
    order: 4,
    title: 'Configure Quick Stops for minor repairs and diagnostic visits',
    summary: 'Offer fixed-price diagnostic visits and quick service repairs for same-day schedule filling.',
    outcome: 'You will fill calendar gaps between major projects with high-margin quick repair calls.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 5,
    routes: [{ label: 'Quick Stops', href: '/dashboard/quick-stops' }],
    prerequisites: ['Quick Stops access'],
    keywords: ['quick stops', 'diagnostic fee', 'minor repair', 'same day', 'gap filling'],
    sections: [
      {
        title: 'Set up fixed-price diagnostic options',
        steps: [
          'Define Quick Stop services (e.g. "$99 AC Diagnostic Check", "$125 Drain Inspection").',
          'Set maximum job duration (e.g. 45–60 minutes).',
          'Require upfront card authorization upon booking to prevent no-shows.',
        ],
      },
      {
        title: 'Route into open technician gaps',
        paragraphs: [
          'Quick Stops allow dispatchers to slot minor repairs into mid-day schedule openings without disrupting major jobs.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A Quick Stop required major unexpected repairs.', fix: 'Convert the Quick Stop into a full Job and issue a Change Order for additional scope.' },
    ],
    related: ['configure-online-booking', 'schedule-work-from-the-queue', 'manage-the-job-workspace'],
  },
  {
    slug: 'configure-ai-receptionist',
    chapterId: 'intake',
    order: 5,
    title: 'Configure AI receptionist and call routing',
    summary: 'Configure AI call answering on Voice Calls settings, business hours, and phone call routing.',
    outcome: 'Your incoming calls will be answered professionally 24/7 with call transcripts and lead logging.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [{ label: 'Voice Calls Settings', href: '/dashboard/voice-calls?view=settings' }],
    prerequisites: ['Owner access', 'settings.write permission'],
    keywords: ['ai receptionist', 'call routing', 'phone answering', 'automations', 'business hours', 'call transcripts', 'simultaneous calls', 'overflow calls', 'call capacity'],
    sections: [
      {
        title: 'Settings location on Voice Calls page',
        paragraphs: [
          'All AI Receptionist and call answering configurations are located on the Voice Calls workspace under Receptionist Settings (/dashboard/voice-calls?view=settings), requiring owner clearance.',
        ],
      },
      {
        title: 'Set greeting, business hours, and emergency escalation',
        steps: [
          'Customize your AI phone greeting and business description.',
          'Define operating hours and after-hours call behavior.',
          'Set the emergency transfer number for urgent calls requiring live owner pickup.',
        ],
      },
      {
        title: 'Understand simultaneous calls and overflow',
        paragraphs: [
          'Flex, Solo, and Growth include one simultaneous AI call. Scale includes three. When all available AI call slots are occupied, new callers follow your normal forwarding configuration. Without a forwarding number, they hear that the line is unavailable.',
        ],
      },
      {
        title: 'Call transcripts and lead logging',
        paragraphs: [
          'Incoming customer calls are transcribed and automatically logged into your Lead Inbox with summary notes and extracted homeowner contact details.',
        ],
      },
    ],
    customerView: 'Callers speak to a polite, articulate AI assistant that answers company questions and books appointments.',
    troubleshooting: [
      { problem: 'Emergency calls are not forwarding.', fix: 'Verify the emergency forwarding phone number in Voice Calls → Receptionist Settings.' },
    ],
    related: ['configure-text-to-job-and-field-intake', 'manage-the-lead-inbox', 'set-up-business-texting'],
  },
  {
    slug: 'configure-text-to-job-and-field-intake',
    chapterId: 'intake',
    order: 6,
    title: 'Configure Text-to-Job & hands-free field dictation',
    summary: 'Dictate change orders, punch lists, and receipt photos via SMS or voice memos with a 15-minute undo safety net.',
    outcome: 'You and your crew will keep job files updated in real time from the truck without typing on site.',
    audiences: ['Owner', 'Crew', 'Office staff'],
    readMinutes: 7,
    routes: [
      { label: 'Text-to-Job Dashboard', href: '/dashboard/text-to-job' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Authorized mobile phone number in settings', 'Active texting allowance'],
    keywords: ['text to job', 'voice memo', 'dictation', 'receipt photos', 'undo rollback', 'change order', '15 minutes'],
    sections: [
      {
        title: 'Save the business dispatch number in mobile contacts',
        steps: [
          'Open Text-to-Job Dashboard and copy your business texting number.',
          'Save the contact in your iOS or Android phone as "Job Intake".',
          'Use Siri or Google Assistant for hands-free voice dictation while driving.',
        ],
      },
      {
        title: 'Dictate core job updates from the road',
        bullets: [
          'Change Orders: Text "Add $450 to Miller job for extra 12/2 Romex" to stage an estimate change order.',
          'Milestones & Notes: Send a voice memo "Rough plumbing passed on Elm St" to log an audit timestamp.',
          'Receipt Photos: Snap a photo of a supply house register receipt to OCR itemize material costs.',
          'Punch List Tasks: Dictate checklist to-dos to push items directly to the crew field app.',
        ],
      },
      {
        title: 'Confirm what was filed, and correct a mistake',
        paragraphs: [
          'Every accepted update texts a confirmation back to the sender, so you can check what was filed without opening the dashboard. Updates file to the job timeline on receipt and are not held for approval.',
          'There is no revert-by-text. To fix a mistake, text a follow-up note describing the correction — it appends to the same timeline — then edit the underlying cost, task, or lead in the dashboard.',
        ],
      },
    ],
    customerView: 'Customers receive clean, formatted 1-tap quote approval SMS links when you text "SEND" after adding a change order.',
    troubleshooting: [
      { problem: 'Text-to-Job does not recognize your phone number.', fix: 'Add your mobile number to the Authorized Phone Numbers list in Settings.' },
      { problem: 'Dictated change order had a typo.', fix: 'Text a follow-up note with the correction, then edit the amount on the job in the dashboard. Texting cannot revert a filed update.' },
    ],
    related: ['document-work-and-change-orders', 'run-the-field-workflow', 'manage-the-job-workspace'],
  },
  {
    slug: 'voice-call-recordings-and-missed-call-sms',
    chapterId: 'intake',
    order: 7,
    title: 'Review voice call recordings, transcripts, and missed-call SMS',
    summary: 'Listen to customer call recordings, review AI transcriptions in Voice Calls, and configure instant speed-to-lead missed-call texts.',
    outcome: 'You will never lose a job lead from a missed phone call while on site or after hours.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Voice Calls', href: '/dashboard/voice-calls' },
      { label: 'Messages', href: '/dashboard/messages' },
    ],
    prerequisites: ['Voice phone line configured'],
    keywords: ['voice calls', 'call recordings', 'transcription', 'missed calls', 'speed to lead', 'sms follow-up', 'audio player'],
    sections: [
      {
        title: 'Review inbound calls and audio recordings',
        steps: [
          'Open Voice Calls in the dashboard to see all inbound customer calls, call durations, and caller IDs.',
          'Click any call row to play the audio recording directly in your browser.',
          'Read the AI-generated caller transcript and concise job scope summary.',
        ],
      },
      {
        title: 'Speed-to-lead automated text cards',
        bullets: [
          'Automated SMS Trigger: When a customer call goes unanswered or disconnects, the system automatically sends a friendly follow-up text within 60 seconds.',
          'Direct Estimate Link: The SMS includes your online booking or instant quote link so the homeowner can submit their project request without waiting.',
          'Thread Synchronization: Homeowner text replies instantly appear in your two-way Messages inbox.',
        ],
      },
      {
        title: 'Convert calls to active leads and jobs',
        paragraphs: [
          'With one click from the Voice Call detail card, promote any recorded call into an active lead or schedule an on-site consultation visit with the caller’s address pre-filled.',
        ],
      },
    ],
    customerView: 'Callers receive a prompt, professional SMS text offering instant online booking whenever their call cannot be answered immediately.',
    troubleshooting: [
      { problem: 'A recorded call audio player does not load.', fix: 'Ensure browser audio permissions are enabled and audio files have completed cloud processing.' },
      { problem: 'Missed-call SMS did not fire.', fix: 'Check your available SMS credits in Plan & Usage and verify automated missed-call texts are enabled.' },
    ],
    related: ['configure-ai-receptionist', 'manage-the-lead-inbox', 'work-the-customer-text-inbox'],
  },
  {
    slug: 'custom-forms-and-inspection-checklists',
    chapterId: 'intake',
    order: 8,
    title: 'Build custom intake forms and field inspection checklists',
    summary: 'Create dynamic conditional forms for customer website intake and safety/pre-trip inspection checklists for crew trucks.',
    outcome: 'You will capture exact project specifications upfront and enforce consistent jobsite quality control.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Forms', href: '/dashboard/forms' }],
    prerequisites: ['Forms access'],
    keywords: ['forms', 'custom forms', 'inspection checklist', 'conditional logic', 'intake questionnaire', 'quality control', 'pre-trip'],
    sections: [
      {
        title: 'Design conditional customer intake questionnaires',
        steps: [
          'Open Forms and click "Create New Form".',
          'Add question types: text fields, photo uploads, multiple-choice dropdowns, and date pickers.',
          'Configure conditional branching rules (e.g. "If project type is Roof Replacement, show roof slope and shingle type questions").',
        ],
      },
      {
        title: 'Deploy field safety and vehicle inspection checklists',
        bullets: [
          'Pre-Trip Vehicle Checks: Require technicians to check fluid levels, tire pressure, and ladder rack securement before morning roll-out.',
          'Jobsite Safety & Hazard Audits: Log electrical panel safety verifications or water shutoff valve locations before starting demo.',
          'Punch List Sign-Off: Technicians verify completed line items and attach inspection photos directly from the Field App.',
        ],
      },
      {
        title: 'Embed forms on your website or share direct links',
        paragraphs: [
          'Embed your custom questionnaires on any contractor website page or text direct form links to homeowners before on-site estimate visits.',
        ],
      },
    ],
    customerView: 'Homeowners experience a clean, mobile-optimized questionnaire that makes describing their home repair project effortless.',
    troubleshooting: [
      { problem: 'Conditional question rule does not trigger.', fix: 'Verify that the parent field option value in the Form Editor matches the trigger condition exactly.' },
      { problem: 'Field inspection checklist is not showing on active jobs.', fix: 'Ensure the checklist template is linked to the active job trade category in workflow settings.' },
    ],
    related: ['configure-smart-intake', 'run-the-field-workflow', 'build-and-publish-your-website'],
  },

  // ==========================================
  // CHAPTER 9: ACCOUNT, DATA, AND SUPPORT
  // ==========================================
  {
    slug: 'manage-office-access-and-security',
    chapterId: 'account',
    order: 1,
    title: 'Manage office access, sign-in, and account security',
    summary: 'Invite office teammates by email, manage secure sign-in methods, and remove access cleanly.',
    outcome: 'Your office team will collaborate securely with role-gated access to dashboard operations.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [
      { label: 'Team', href: '/dashboard/settings#office-team' },
      { label: 'Login & security', href: '/dashboard/settings' },
    ],
    prerequisites: ['Owner access to invite or remove office users', 'Available office seat allowance'],
    keywords: ['office user', 'team invite', 'email invitation', 'security', 'remove access', 'office roles'],
    sections: [
      {
        title: 'Invite an office team member by email',
        steps: [
          'Go to Settings → Team and click "Invite Office User".',
          'Enter the person’s email address ({ email }). Note: There is no capability picker in the UI; office users receive standard office dashboard access.',
          'Send the invitation. The user receives an email link to set up their password and log in.',
          'Office users can access Leads, Schedule, Messages, and Jobs, while owner-only actions (payouts, billing, plan changes) remain restricted.',
        ],
      },
      {
        title: 'Remove access cleanly without deleting history',
        paragraphs: [
          'When a team member leaves, remove their membership from Settings → Team. Historical audit logs, messages, and quote entries created by that user remain intact.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Office invite fails to send.', fix: 'Check your plan allowance to verify available office seats, and ensure the email is not already an active user.' },
      { problem: 'Office user cannot open billing or payouts.', fix: 'Billing and payout settings are strictly restricted to the workspace Owner.' },
    ],
    related: ['roles-permissions-and-feature-readiness', 'manage-plan-usage-and-credits', 'cancel-your-plan-or-delete-your-account'],
  },
  {
    slug: 'manage-plan-usage-and-credits',
    chapterId: 'account',
    order: 2,
    title: 'Manage your plan, usage, credits, and capacity',
    summary: 'Track credit allowances, understand immediate plan change billing, and manage overage authorization.',
    outcome: 'You will manage plan capacity and change tiers without billing surprises or interrupted client communications.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Plan & usage', href: '/dashboard/settings#plan-at-a-glance' }],
    prerequisites: ['Owner access'],
    keywords: ['plan', 'usage', 'credits', 'overage', 'plan change', 'billing', 'platform fee', 'flex', 'solo', 'growth', 'scale'],
    sections: [
      {
        title: 'Monitor active allowances and plan tiers',
        bullets: [
          'Flex: $0/mo base, 1.25% platform fee (125 bps), 1 Office + 2 Crew seats, 50 texts.',
          'Solo: $39/mo base, 0.50% platform fee (50 bps), 2 Office + 2 Crew seats, 500 texts, 250 AI credits.',
          'Growth: $129/mo base, 0.25% platform fee (25 bps), 5 Office + 10 Crew seats, 1,500 texts, 500 AI credits.',
          'Scale: $329/mo base, 0.10% platform fee (10 bps), 15 Office + 50 Crew seats, 3,000 texts, 1,000 AI credits.',
        ],
      },
      {
        title: 'Plan changes charge or credit immediately on click',
        paragraphs: [
          'When you upgrade or downgrade your plan in Settings, the plan change executes immediately. Prorated subscription charges or credits move funds immediately upon confirmation.',
        ],
      },
      {
        title: 'Overage authorization controls',
        paragraphs: [
          'If "Overage Authorization" is turned OFF, outgoing marketing sends or texts that exceed your plan allowance are refused (not billed silently). Turn overage authorization on if you prefer pay-as-you-go top-ups without service interruption.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Outgoing campaign failed due to allowance limit.', fix: 'Purchase a top-up credit pack or enable overage authorization in Settings → Plan & Usage.' },
    ],
    related: ['roles-permissions-and-feature-readiness', 'manage-office-access-and-security', 'cancel-your-plan-or-delete-your-account'],
  },
  {
    slug: 'import-existing-business-data',
    chapterId: 'account',
    order: 3,
    title: 'Import existing business data, clients, and price books',
    summary: 'Migrate client lists, leads, price book items, and past jobs from spreadsheets or legacy software.',
    outcome: 'You will import your historical client database and service catalog cleanly with zero data corruption.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [{ label: 'Import data', href: '/dashboard/settings#import' }],
    prerequisites: ['Owner access (all four importers are strictly owner-gated)'],
    keywords: ['data import', 'csv import', 'migrate clients', 'price book import', 'leads import'],
    sections: [
      {
        title: 'Owner-gated data import hub',
        paragraphs: [
          'Although the data hub is visible, all four importer actions (Clients, Leads, Price Book, and Past Jobs) are strictly gated by Owner security clearance (requireOwnerContext).',
        ],
      },
      {
        title: 'Prepare and upload your CSV files',
        steps: [
          'Download the sample CSV template for the data type you are importing.',
          'Format columns: ensure phone numbers have area codes and addresses are split into street, city, state, and zip.',
          'Upload your CSV and inspect the preview mapping table before confirming the import.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'An office user cannot run a CSV import.', fix: 'Data import actions require Owner role clearance to prevent accidental data overwrites.' },
      { problem: 'Import shows duplicate records.', fix: 'Clean and deduplicate your source spreadsheet before uploading.' },
    ],
    related: ['manage-client-records', 'manage-your-price-book', 'export-data-and-connect-apps'],
  },
  {
    slug: 'manage-your-price-book',
    chapterId: 'account',
    order: 4,
    title: 'Manage your price book and service catalog',
    summary: 'Organize flat-rate services, materials, standard labor hours, and tiered pricing options.',
    outcome: 'You will build consistent, high-margin estimates in seconds using standardized price book items.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [{ label: 'Price Book', href: '/dashboard/services' }],
    prerequisites: ['Price book access'],
    keywords: ['price book', 'flat rate', 'materials', 'labor rates', 'service catalog', 'tiers', 'ocr', 'import'],
    sections: [
      {
        title: 'Build standardized trade line items',
        steps: [
          'Open Price Book and click "Add Service".',
          'Enter item name, customer-facing scope description, category, and base price.',
          'Add estimated material costs and labor hours for accurate gross margin tracking.',
          'Create Good/Better/Best tiers for upsell recommendations.',
        ],
      },
      {
        title: 'Import spreadsheets or snap photos with AI OCR',
        steps: [
          'Go to Price Book → "Import CSV, Excel, or Photo / OCR".',
          'Upload a spreadsheet (.csv or .xlsx), paste rows directly, or snap a photo of a printed rate sheet / laminated service menu.',
          'AI OCR scans the photo and extracts service names, prices, units, and descriptions automatically.',
          'Preview the matched columns and click "Import services" to populate your catalog in one click.',
        ],
      },
      {
        title: 'Archive obsolete items safely',
        paragraphs: [
          'Archive outdated price book items rather than deleting them. Archiving preserves historical quoting records on past jobs while removing items from new quote builders.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Price change did not update on an existing quote.', fix: 'Existing sent quotes preserve their agreed pricing. New quotes will automatically pull the updated price book rate.' },
      { problem: 'Rate sheet photo OCR missed some items.', fix: 'Ensure good lighting, avoid glare on laminated sheets, or upload a clear high-resolution image.' },
    ],
    related: ['build-and-send-a-quote', 'read-reports-and-profitability', 'import-existing-business-data', 'manage-job-expenses-and-receipt-ocr'],
  },
  {
    slug: 'export-data-and-connect-apps',
    chapterId: 'account',
    order: 5,
    title: 'Export data and connect external business apps',
    summary: 'Export client, invoice, and job CSV reports, and connect QuickBooks or calendar sync tools.',
    outcome: 'You will keep your accounting and CRM records synced with full data portability.',
    audiences: ['Owner'],
    readMinutes: 5,
    routes: [{ label: 'Integrations & Export', href: '/dashboard/settings#export' }],
    prerequisites: ['Owner access'],
    keywords: ['export data', 'quickbooks', 'csv export', 'integrations', 'calendar sync', 'data backup'],
    sections: [
      {
        title: 'Export complete workspace records',
        steps: [
          'Go to Settings → Integrations & Export.',
          'Select the dataset to export: Clients, Invoices, Payments, Jobs, or Timecards.',
          'Choose your date range and click "Download CSV".',
        ],
      },
      {
        title: 'Connect accounting integrations',
        paragraphs: [
          'Connect QuickBooks Online to automatically sync paid invoices, customers, and payment fee records.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'QuickBooks sync shows an authentication error.', fix: 'Open Settings → Integrations, disconnect the QuickBooks connection, and reconnect to refresh OAuth tokens.' },
    ],
    related: ['read-reports-and-profitability', 'review-timecards-and-pay', 'import-existing-business-data'],
  },
  {
    slug: 'cancel-your-plan-or-delete-your-account',
    chapterId: 'account',
    order: 6,
    title: 'Cancel your plan or delete your account',
    summary: 'Understand the critical difference between cancelling your subscription and permanently deleting your account.',
    outcome: 'You will choose the right path for your business without accidental and irreversible loss of client, job, and financial records.',
    audiences: ['Owner'],
    readMinutes: 6,
    routes: [
      { label: 'Plan & usage', href: '/dashboard/settings#plan-at-a-glance' },
      { label: 'Account settings', href: '/dashboard/settings#account' },
    ],
    prerequisites: ['Owner access only'],
    keywords: ['cancel plan', 'delete account', 'danger zone', 'subscription', 'refund policy', 'data loss', 'irreversible', 'resumable'],
    sections: [
      {
        title: 'Cancel Plan vs Delete Account: Understand the difference',
        bullets: [
          'Cancel Plan (Resumable): Cancels subscription renewal at the end of the current billing period. All client records, jobs, invoices, and settings remain safely preserved. You can resume your subscription with one click at any time.',
          'Delete Account (IMMEDIATE & UNRECOVERABLE): WARNING: Account deletion cannot be undone. It immediately terminates your account, cancels billing without refund, and permanently hard-deletes all client records, jobs, quotes, timecards, and uploaded photos. This action is completely unrecoverable.',
        ],
      },
      {
        title: 'Recommended pre-deletion checklist',
        steps: [
          'Export all client, invoice, job, and timecard CSV data from Settings → Integrations & Export.',
          'Ensure all outstanding customer invoice payments have settled and transferred to your bank.',
          'Save any customer warranty records or completed job photos required for tax or legal compliance.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Accidentally deleted account.', fix: 'Account deletion is immediate and unrecoverable. Deleted data cannot be restored. If you wish to use Let’s Get Quoted again, you must create a new account.' },
      { problem: 'Plan was cancelled but you want to resume.', fix: 'Go to Settings → Plan & Usage and click "Resume Plan" to restore full workspace capabilities instantly.' },
    ],
    related: ['manage-plan-usage-and-credits', 'export-data-and-connect-apps', 'manage-office-access-and-security', 'restore-deleted-records-and-audit-logs'],
  },
  {
    slug: 'developer-api-and-webhooks',
    chapterId: 'account',
    order: 8,
    title: 'Connect custom tools with the Developer API and Webhooks',
    summary: 'Generate scoped REST API tokens, subscribe to real-time webhook event feeds, and import OpenAPI 3.1 definitions.',
    outcome: 'You will safely automate external CRMs, Zapier, Make, and internal servers with verified HMAC webhooks and scoped API keys.',
    audiences: ['Owner'],
    readMinutes: 7,
    routes: [{ label: 'Developer API & Webhooks', href: '/dashboard/settings#developers' }],
    prerequisites: ['Owner role access', 'HTTPS endpoint for webhook subscriptions'],
    keywords: ['developer api', 'webhooks', 'api tokens', 'openapi', 'rest api', 'zapier', 'make', 'hmac signature', 'dead letter queue', 'secret key'],
    sections: [
      {
        title: 'Create and manage scoped API tokens',
        steps: [
          'Go to Settings → Developer API & Webhooks.',
          'Click "Generate New Token", enter a descriptive label (e.g. "Zapier Lead Sync"), and select required role scopes (leads:read, leads:write, webhooks:manage, events:read).',
          'Copy your secret token (format: lgq_live_...) immediately upon generation. For security, secret tokens are hashed and never shown again.',
          'Pass tokens in external HTTP requests using standard authorization headers: Authorization: Bearer lgq_live_...',
        ],
      },
      {
        title: 'Set up real-time Webhook subscriptions',
        bullets: [
          'Event Feeds: Subscribe to live events including lead.created, quote.signed, invoice.paid, and job.completed.',
          'HTTPS & SSRF Protection: Webhook destinations must use secure HTTPS URLs; localhost and private intranet IP addresses are rejected by edge guards.',
          'HMAC SHA-256 Verification: Every outgoing webhook delivery includes an x-lgq-signature header calculated using your unique endpoint signing secret and a timestamp to prevent replay attacks.',
        ],
      },
      {
        title: 'Explore OpenAPI 3.1 schema and dead-letter retry',
        paragraphs: [
          'Access the interactive OpenAPI 3.1 JSON definition at /api/v1/openapi.json to import into Postman, Insomnia, or custom SDK generators. If your endpoint is temporarily down, the system retries with exponential backoff and provides a manual 1-click retry button in the Webhook Deliveries audit table.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Webhook deliveries fail with 5xx status or timeout.', fix: 'Ensure your server responds with a 2xx HTTP status within 10 seconds. Check endpoint SSL certificates and click "Retry Delivery" in the deliveries table.' },
      { problem: 'API returns 401 Unauthorized.', fix: 'Verify the token has not been revoked and that the Authorization: Bearer header is formatted correctly without extra quotes.' },
    ],
    related: ['export-data-and-connect-apps', 'manage-office-access-and-security', 'find-help-and-contact-support'],
  },
  {
    slug: 'restore-deleted-records-and-audit-logs',
    chapterId: 'account',
    order: 9,
    title: 'Restore deleted records from Trash and review audit logs',
    summary: 'Recover accidentally deleted leads, quotes, clients, and jobs from Trash within the retention grace period and inspect tamper-evident audit history.',
    outcome: 'You will protect your business from accidental data loss and maintain a complete compliance record of who changed or deleted what.',
    audiences: ['Owner', 'Office staff'],
    readMinutes: 6,
    routes: [
      { label: 'Trash & Recovery', href: '/dashboard/trash' },
      { label: 'Activity & Audit Log', href: '/dashboard/activity' },
    ],
    prerequisites: ['Dashboard access (Owner or Office staff role)'],
    keywords: ['trash', 'restore', 'soft delete', 'audit log', 'data recovery', 'grace period', 'activity feed', 'compliance'],
    sections: [
      {
        title: 'Soft deletion lifecycle and 30-day Trash grace period',
        paragraphs: [
          'When you delete a lead, quote draft, customer profile, or job, the item is soft-deleted and staged in /dashboard/trash for 30 days. Soft deletion prevents accidental loss from team misclicks while immediately removing items from active queues.',
        ],
      },
      {
        title: 'Restore records with intact historical relationships',
        steps: [
          'Open Trash from the sidebar or Settings.',
          'Filter by record type: Leads, Quotes, Jobs, or Clients.',
          'Click "Restore Record" on the desired item. The record instantly reappears in its original pipeline stage with all associated photo attachments, timecards, and message histories preserved.',
        ],
      },
      {
        title: 'Inspect tamper-evident Activity and Audit Logs',
        paragraphs: [
          'Open the Activity workspace to review chronological audit logs. Every creation, update, stage transition, payment collection, and deletion event records the initiating user email, timestamp, IP context, and change details for forensic compliance.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'A deleted record is not visible in Trash.', fix: 'Items past the 30-day retention grace period are permanently purged according to security compliance retention schedules.' },
      { problem: 'Non-owner user cannot access Trash restore buttons.', fix: 'Restoring sensitive client or financial records requires elevated Office or Owner clearance.' },
    ],
    related: ['manage-the-lead-inbox', 'manage-client-records', 'cancel-your-plan-or-delete-your-account'],
  },
  {
    slug: 'find-help-and-contact-support',
    chapterId: 'account',
    order: 10,
    title: 'Find help, search documentation, and contact support',
    summary: 'Search user guides, diagnose common issues with troubleshooting tools, and open support tickets.',
    outcome: 'You will resolve technical questions quickly with fast self-service guides and responsive support.',
    audiences: ['Owner', 'Office staff', 'Crew'],
    readMinutes: 4,
    routes: [{ label: 'Help', href: '/dashboard/help' }],
    prerequisites: ['Dashboard or help center access'],
    keywords: ['support', 'help center', 'user manual', 'troubleshooting', 'contact support', 'tickets'],
    sections: [
      {
        title: 'Search documentation and interactive troubleshooting',
        steps: [
          'Use the Manual Explorer (/help/manual) to search by task, keyword, or error message.',
          'Use the in-app Troubleshooter in the Help Center to diagnose quote delivery, Stripe payout, or SMS issues.',
        ],
      },
      {
        title: 'Submit a support case with evidence',
        paragraphs: [
          'If an issue requires support intervention, open a ticket from /dashboard/help. Include the affected record URL, timestamp, steps taken, and screenshots for rapid resolution.',
        ],
      },
    ],
    troubleshooting: [
      { problem: 'Urgent payment or chargeback issue.', fix: 'Email support@letsgetquoted.com with your business name, affected invoice ID, and dispute evidence.' },
    ],
    related: ['first-30-minutes', 'navigate-the-dashboard', 'manage-office-access-and-security'],
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
  return MANUAL_ARTICLES.map(({ sections, troubleshooting, routes: _routes, outcome: _outcome, customerView: _customerView, related: _related, ...summary }) => ({
    ...summary,
    searchText: [
      ...sections.map((s) => s.title),
      ...troubleshooting.map((t) => `${t.problem} ${t.fix}`),
    ].join(' '),
  }));
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
