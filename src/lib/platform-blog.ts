import { createAdminClient } from '@/lib/supabase-admin';
import { DEFAULT_AUTHOR, type PlatformBlogAuthor } from './platform-blog-author';
export { DEFAULT_AUTHOR, type PlatformBlogAuthor } from './platform-blog-author';

export type PlatformBlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string; id?: string }
  | { type: 'h3'; text: string; id?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; title?: string; text: string; kind?: 'info' | 'warning' | 'tip' }
  | { type: 'quote'; quote: string; author?: string };

export interface PlatformBlogLink {
  href: string;
  label: string;
  blurb: string;
}

export interface PlatformBlogPost {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  category: string;
  author: PlatformBlogAuthor;
  coverImage?: string;
  coverAlt?: string;
  readMinutes: number;
  datePublished: string; // ISO date YYYY-MM-DD
  dateModified?: string;
  status: 'published' | 'draft' | 'scheduled';
  tags: string[];
  blocks: PlatformBlogBlock[];
  featured?: boolean;
  targetKeyword?: string;
  metaTitle?: string;
  metaDescription?: string;
  featureLinks?: PlatformBlogLink[];
}

export const BLOG_CATEGORIES = [
  'Software Economics',
  'Lead Acquisition',
  'Speed-to-Lead',
  'Cash Flow & Margin',
  'Reputation & SEO',
  'Operations & Crew',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

/**
 * High-impact Wave 1 editorial articles pre-loaded for the public blog.
 */
export const SEED_BLOG_POSTS: PlatformBlogPost[] = [
  {
    id: 'post-per-seat-trap',
    slug: 'per-seat-software-trap-field-crew',
    title: 'Contractor Software Pricing: What Adding a Crew Member Actually Costs',
    subtitle: 'A practical seat-audit worksheet comparing user roles, license overhead, and field team access.',
    excerpt:
      'Field service platforms often charge per user seat. When you bring on seasonal helpers or apprentices, adding basic calendar access can raise your monthly overhead significantly. Here is an actionable roster audit to evaluate what each seat actually costs.',
    category: 'Software Economics',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/per-seat-pricing.jpg',
    coverAlt: 'Digital tablet showing a contractor seat-audit worksheet with role-based licensing calculations',
    readMinutes: 6,
    datePublished: '2026-09-12',
    dateModified: '2026-09-13',
    status: 'published',
    featured: true,
    tags: ['software pricing', 'per-seat pricing', 'contractor overhead', 'field crew', 'margins'],
    targetKeyword: 'field service management per seat pricing',
    metaTitle: 'Contractor Software Pricing: What Adding Crew Costs (Worksheet)',
    metaDescription:
      'Stop paying extra software fees for apprentices. Use our contractor seat-audit worksheet and role matrix to eliminate per-seat licensing bloat.',
    blocks: [
      {
        type: 'p',
        text: 'When a residential contracting business expands, bringing on an apprentice or an extra seasonal laborer is a milestone. You calculate wages, workers’ compensation, and tool allowances. But when you add them to your dispatch calendar, many trade management platforms add an unexpected line item: an additional $29 to $49 per user every single month.',
      },
      {
        type: 'h2',
        text: 'The contractor seat-audit worksheet: Mapping software use to actual roles',
        id: 'contractor-seat-audit',
      },
      {
        type: 'p',
        text: 'A flat per-seat charge treats every team member as an equal software consumer. In practice, software utilization varies drastically across your roster. Before adding or paying for additional user licenses, audit how each role interacts with your system:',
      },
      {
        type: 'ul',
        items: [
          'Owner / Estimator (High Usage): Builds multi-tier proposals, configures pricing catalogs, runs financial reports, and issues change orders. Interacts with software 3–5 hours daily. Requires full administrative permissions.',
          'Office Dispatcher / CSR (High Usage): Handles inbound calls, assigns technician routes, confirms arrival windows, and processes payments. Interacts with software continuously throughout the workday. Requires scheduling and customer management access.',
          'Lead Field Technician (Moderate Usage): Checks daily route, updates job statuses, logs parts used, and captures completed site photos. Interacts with software for 15–30 minutes across a typical workday.',
          'Apprentice / Seasonal Helper (Minimal Usage): Primarily performs physical installation and material staging. Only needs to know the morning job address and punch an accurate timesheet. Software interaction is under 5 minutes daily.',
        ],
      },
      {
        type: 'callout',
        kind: 'warning',
        title: 'Illustrative Scenario: The Seasonal Helper Cost Penalty',
        text: 'Consider a 3-truck plumbing business with an owner, an office dispatcher, two lead techs, and two summer apprentices (6 total users). On a plan charging $45/user/month, the business pays $270/month ($3,240/year). Paying $90/month for two apprentices who only check an address and clock in adds $1,080 annually in software overhead for basic operational communication.',
      },
      {
        type: 'h2',
        text: 'The operational risks of credential sharing',
        id: 'risks-of-credential-sharing',
      },
      {
        type: 'p',
        text: 'When software charges steep per-seat fees, trade owners frequently try to work around the cost by sharing logins across multiple trucks or texting customer details via SMS. While understandable, credential sharing introduces concrete business liabilities:',
      },
      {
        type: 'ul',
        items: [
          'Compromised Audit Trails: If multiple technicians share a single “Tech Truck” login, determining who captured customer sign-off or recorded specific material quantities becomes guesswork.',
          'Security & Access Gaps: When a temporary employee or subcontractor leaves, shared passwords must be changed across every company device to prevent unauthorized access to customer records.',
          'Communication Delays: Field technicians without individual accounts cannot receive direct job notes, attachment updates, or automated route arrival alerts.',
        ],
      },
      {
        type: 'h2',
        text: 'Comparing pricing structures: Per-seat vs. capacity vs. platform pricing',
        id: 'pricing-models-compared',
      },
      {
        type: 'p',
        text: 'Different software providers structure their costs to fit different business types. Evaluating the fit requires calculating your annual expense under your expected staffing variations:',
      },
      {
        type: 'ul',
        items: [
          'Per-Seat Subscription: Charges a fixed monthly fee per active user login. Predictable if headcount never changes, but can penalize businesses that bring on seasonal helpers or apprentices.',
          'Tiered User Bundles: Software includes a set allocation of users (e.g., up to 5 users on a mid-tier plan) before tier upgrades are required. Economical if your team count sits comfortably within the threshold.',
          'Platform-Aligned Pricing: Base software includes unlimited field and dispatch logins without per-head surcharges, pairing core tooling with activity- or transaction-based platform fees as revenue is collected.',
        ],
      },
      {
        type: 'p',
        text: 'At Let’s Get Quoted, we believe operational communication should never be rationed. Every plan includes unlimited field crew and office logins so your entire team stays aligned on schedules, customer notes, and site photos without per-head subscription penalties.',
      },
    ],
    featureLinks: [
      {
        href: '/pricing',
        label: 'Transparent Platform Pricing',
        blurb: 'Equip your entire field crew with dispatch accounts without per-seat monthly license bloat.',
      },
      {
        href: '/features/crew',
        label: 'Crew GPS & Dispatch Workbench',
        blurb: 'Mobile dispatch portals, job site photo logging, and geofenced timesheets for your field team.',
      },
    ],
  },
  {
    id: 'post-shared-lead-trap',
    slug: 'shared-lead-trap-angie-thumbtack-margins',
    title: 'Are Paid Contractor Leads Profitable? Calculate Your Cost per Won Job',
    subtitle: 'Track valid inquiries, close rates, and owner labor time to measure true lead acquisition cost.',
    excerpt:
      'Shared lead marketplaces sell homeowner inquiries to multiple contractors simultaneously. Measuring your true cost per won job—including contact rate, estimates, and administrative labor—reveals whether paid lead sources generate profit or erode margins.',
    category: 'Lead Acquisition',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/paid-leads-profitability.jpg',
    coverAlt: 'Financial model comparing contractor lead acquisition costs and cost per won job on a laptop display',
    readMinutes: 7,
    datePublished: '2026-09-10',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['lead generation', 'angi', 'thumbtack', 'marketing', 'cost per won job', 'margins'],
    targetKeyword: 'are paid contractor leads profitable',
    metaTitle: 'Are Paid Contractor Leads Profitable? True Cost per Won Job',
    metaDescription:
      'Calculate your real cost per won job from Angi, Thumbtack, and shared lead brokers. Includes contact rate, estimate drive time, and profit formulas.',
    blocks: [
      {
        type: 'p',
        text: 'Every trade contractor has experienced the phone alert from a lead marketplace: a homeowner submitted a project request, and the countdown begins. You drop your tape measure, dial immediately, and often hear: “You’re the third person who called me in the last five minutes.”',
      },
      {
        type: 'h2',
        text: 'The true formula: Calculating cost per won job',
        id: 'cost-per-won-job-formula',
      },
      {
        type: 'p',
        text: 'Marketplace directories such as Angi and Thumbtack use varied distribution models—from shared leads routed to several contractors to pay-per-contact programs. Evaluating whether any lead source makes financial sense requires tracking the complete funnel from raw spend to collected profit, rather than looking only at invoice cost per lead:',
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'Cost per Won Job Formula',
        text: 'Cost per Won Job = (Gross Lead Spend + Estimator Labor Hours × Burdened Rate − Approved Lead Credits) ÷ Number of Won Jobs',
      },
      {
        type: 'h2',
        text: 'An illustrative scenario: Small repair vs. major replacement',
        id: 'illustrative-lead-scenario',
      },
      {
        type: 'p',
        text: 'To understand how lead acquisition economics scale across different trade ticket sizes, consider an illustrative monthly batch of 10 shared inquiries in a competitive metro market:',
      },
      {
        type: 'ul',
        items: [
          'Raw Purchase: 10 leads at $80 each = $800 total lead spend.',
          'Lead Quality & Disposition: 2 inquiries are out of service area or invalid contacts ($160 credited back after filing disputes); 4 inquiries are unreachable or already hired another vendor; 4 inquiries result in scheduled estimates.',
          'Estimator Labor: 4 estimates at 1.5 hours each (drive, scoping, and follow-up) = 6 labor hours. At a $50/hour fully burdened labor rate, this represents $300 in sales labor overhead.',
          'Total Acquisition Investment: $800 gross spend − $160 credits + $300 sales labor = $940 net direct acquisition cost.',
          'Won Contracts: 1 job closed out of the 4 scheduled estimates.',
        ],
      },
      {
        type: 'p',
        text: 'Whether this $940 acquisition cost is profitable depends entirely on the scope of work won:',
      },
      {
        type: 'ul',
        items: [
          'Scenario A: $2,400 Water Heater Repair. If direct labor and materials cost $1,500 (leaving $900 in gross profit), subtracting the $940 acquisition cost leaves a $40 net deficit on the job.',
          'Scenario B: $14,000 High-Efficiency System Replacement. If direct labor and equipment cost $8,400 (leaving $5,600 in gross profit), subtracting the $940 acquisition cost leaves $4,660 in solid contribution margin toward company overhead and profit.',
        ],
      },
      {
        type: 'h2',
        text: 'Building owned lead capture alongside third-party sources',
        id: 'building-owned-lead-capture',
      },
      {
        type: 'p',
        text: 'Paid lead marketplaces can provide immediate volume when launching a new business or filling an unexpected slow week. However, building long-term equity requires establishing owned acquisition channels where prospective homeowners contact you exclusively:',
      },
      {
        type: 'ul',
        items: [
          'Direct Website Ballpark Scoping: Giving homeowners transparent estimated ranges on your website filters out low-intent inquiries and captures direct contact info before they look elsewhere.',
          'Verified Google Business Profile Prominence: Consistent collection of authentic post-job reviews and clear category listings helps you earn placement in the Google Maps Local Pack.',
          'Customer Referral & Proximity Marketing: When working on a residential street, providing neighboring homeowners with scheduled service updates builds neighborhood density without broker fees.',
        ],
      },
      {
        type: 'p',
        text: 'Owned channels require upfront setup and 3 to 6 months of consistent execution, but they generate exclusive inquiries with significantly lower ongoing acquisition costs. Let’s Get Quoted gives contractors high-converting web tools and automated review requests to grow their direct customer base.',
      },
    ],
    featureLinks: [
      {
        href: '/features/website-builder',
        label: 'Contractor Website & Estimator',
        blurb: 'Turn local search visitors into exclusive, qualified leads with instant estimate calculators.',
      },
      {
        href: '/features/reviews',
        label: 'Automated Review Collection',
        blurb: 'Collect verified customer reviews to strengthen your local Google Maps presence.',
      },
    ],
  },
  {
    id: 'post-after-hours-intake',
    slug: 'after-hours-intake-8pm-homeowner',
    title: 'After-Hours Contractor Leads: What Your Website Should Collect',
    subtitle: 'A structured intake flow with project photos and next-day dispatch scripts captures evening inquiries without false promises.',
    excerpt:
      'Homeowners frequently research home repairs and renovations during evening hours when trade office phones are closed. Here is a 5-step intake flow and next-morning dispatch script that captures qualified leads while setting honest expectations.',
    category: 'Speed-to-Lead',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/after-hours-intake.jpg',
    coverAlt: 'Smartphone in a workshop displaying an evening contractor intake flow with photo upload prompts',
    readMinutes: 6,
    datePublished: '2026-09-08',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['speed to lead', 'lead capture', 'intake', 'customer experience', 'dispatching'],
    targetKeyword: 'after hours contractor lead capture',
    metaTitle: 'After-Hours Contractor Leads: High-Converting Intake Guide',
    metaDescription:
      'Capture evening homeowner repair inquiries without answering 9 PM calls. 5-step structured intake flow, photo prompts, and morning dispatch scripts.',
    blocks: [
      {
        type: 'p',
        text: 'When a homeowner discovers a damp ceiling spot or plans a bathroom remodel, they often do their research after dinner while sitting on the couch. Because trade offices are closed in the evening, contractors without an automated digital intake path lose those inquiries to competitors who acknowledge requests immediately.',
      },
      {
        type: 'h2',
        text: 'Why generic “Contact Us” forms drop the ball',
        id: 'generic-contact-forms',
      },
      {
        type: 'p',
        text: 'A standard website contact form asking for “Name, Email, Message” creates friction on both sides. The homeowner does not know if you service their specific neighborhood or equipment, and your dispatch desk receives vague messages like “Need quote on plumbing ASAP.” A structured after-hours intake flow solves both problems by gathering actionable scoping data.',
      },
      {
        type: 'h2',
        text: 'The 5-step contractor digital intake flow',
        id: 'five-step-intake-flow',
      },
      {
        type: 'p',
        text: 'Rather than an open-ended comment box, guide evening visitors through five quick, focused steps designed for mobile completion:',
      },
      {
        type: 'ul',
        items: [
          '1. Service Category & Equipment Type: Dropdowns for specific trade issues (e.g., Electrical: Panel Upgrade vs. EV Charger; HVAC: No Cooling vs. Seasonal Tune-up; Plumbing: Water Heater vs. Drain Clearing).',
          '2. Urgency & Project Timeline: Categorizes needs into immediate emergency, within the next 2–3 days, or planning an estimate for next month.',
          '3. Project Photo / Video Upload: Prompts homeowners to snap a photo of the electrical panel label, water heater rating plate, or under-sink valve. Having visual context eliminates unnecessary discovery trips.',
          '4. Property Context: Street address, gate codes, and property type (single-family home, condo, or commercial unit).',
          '5. Automated Acknowledgment & Expectation Setting: An immediate confirmation screen and SMS stating exactly when dispatch will follow up.',
        ],
      },
      {
        type: 'callout',
        kind: 'tip',
        title: 'Sample Automated Evening Confirmation Message',
        text: '“Thanks for submitting your project photos, Sarah. We’ve received your water heater inquiry. Our dispatch desk opens tomorrow at 7:30 AM. Mike will review your tank photos and call you between 7:30 AM and 8:15 AM with available arrival windows.”',
      },
      {
        type: 'h2',
        text: 'The 7:45 AM morning dispatch handoff script',
        id: 'morning-dispatch-handoff',
      },
      {
        type: 'p',
        text: 'Capturing after-hours intake is only effective if your morning follow-up demonstrates you actually reviewed their information. When your dispatcher calls the homeowner the following morning, use a structured script referencing the submitted details:',
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'Next-Morning Dispatch Phone Script',
        text: '“Good morning Sarah, this is Mike from Apex Mechanical. I’m calling regarding the photos you sent through our website last night of your 50-gallon Bradford White water heater. I see the valve tag indicates a 2014 install with corrosion at the cold inlet. We have a technician in your neighborhood today with an arrival slot between 9:30 AM and 11:30 AM. Would you like us to dispatch Dave to inspect the connection?”',
      },
      {
        type: 'p',
        text: 'This level of operational precision sets your business apart from competitors who call hours later asking the customer to repeat everything from scratch. Let’s Get Quoted’s smart intake tools organize evening submissions directly into your morning dispatch queue.',
      },
    ],
    featureLinks: [
      {
        href: '/features/ai-intake',
        label: 'Smart Digital Intake & Photo Capture',
        blurb: 'Capture trade inquiries with structured equipment questions and photo uploads 24/7.',
      },
      {
        href: '/features/scheduling',
        label: 'Visual Dispatch Workbench',
        blurb: 'Turn after-hours intake into confirmed morning schedule windows with travel buffers.',
      },
    ],
  },
  {
    id: 'post-zero-conflict-change-order',
    slug: 'zero-conflict-change-orders-contractor-guide',
    title: 'How to Handle a Change Order Before the Extra Work Starts',
    subtitle: 'A practical change order template with scope, materials, schedule impact, and customer sign-off.',
    excerpt:
      'Scope creep happens on almost every trade project. When hidden damage or customer requests arise mid-job, pausing to document scope, labor, materials, and schedule changes protects your margin and customer trust. Here is a complete worked example and decline protocol.',
    category: 'Cash Flow & Margin',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/contractor-change-orders.jpg',
    coverAlt: 'Rugged construction tablet resting on 2x4 framing displaying an approved digital change order with signature',
    readMinutes: 6,
    datePublished: '2026-09-05',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['change orders', 'cash flow', 'margin', 'pricing', 'contracts'],
    targetKeyword: 'contractor change order process',
    metaTitle: 'Contractor Change Orders: Free Template & Sign-Off Process',
    metaDescription:
      'Protect your margins from mid-job scope creep. A complete trade change order guide with itemized costs, labor impact, and customer e-signature protocol.',
    blocks: [
      {
        type: 'p',
        text: 'During an active project, unexpected conditions inevitably surface: hidden pipe corrosion behind drywall, rotted subflooring beneath old tile, or a homeowner asking, “While you’re here, can we also replace that lighting fixture?” Handling these moments professionally requires a transparent change order workflow before any extra labor or materials are committed.',
      },
      {
        type: 'h2',
        text: 'Why informal verbal approvals lead to billing friction',
        id: 'why-verbal-approvals-fail',
      },
      {
        type: 'p',
        text: 'Contractors often hesitate to introduce written documentation mid-project out of fear of slowing down work or seeming overly bureaucratic. However, when extra work is agreed to verbally in passing, both parties easily misunderstand the financial or schedule impact. By the time the final invoice arrives with an unapproved $750 line item, the homeowner feels surprised, and the contractor faces delayed payment or unrecoverable labor costs.',
      },
      {
        type: 'h2',
        text: 'A worked example: Bathroom subfloor structural repair',
        id: 'worked-change-order-example',
      },
      {
        type: 'p',
        text: 'To see how a professional change order protects both the project budget and the customer relationship, consider a real-world scenario from a residential bathroom renovation:',
      },
      {
        type: 'ul',
        items: [
          'Original Contract: Guest bathroom tile and vanity installation ($4,200 contract, scheduled for 3 days).',
          'Discovered Condition: Upon removing existing tile and mortar bed, the crew uncovers 32 square feet of water-damaged, rotted 3/4" subflooring and decayed joist edges around the toilet flange.',
          'Materials Required: 2 sheets 3/4" CDX tongue-and-groove underlayment ($90), framing lumber and structural fasteners ($60), new PVC closet flange and hardware ($35) = $185 direct material cost.',
          'Labor Allocation: 5 technician crew-hours for demolition, sistering two 2x8 joists, and installing subflooring. At a $65/hour burdened labor rate = $325 direct labor cost.',
          'Direct Cost & Pricing: Total direct cost is $510 ($185 + $325). Priced at $780, generating a 34.6% gross margin ($270 gross profit) consistent with the base contract.',
          'Schedule Impact: Adds 1 business day to completion. Tile setting shifts from Thursday afternoon to Friday morning.',
        ],
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'Sample Digital Change Order Copy',
        text: '“Change Order #1 — Guest Bathroom Renovation. Description: Remove rotted subfloor around toilet flange; sister two damaged 2x8 floor joists; install 32 sq ft 3/4” CDX subfloor; reset toilet flange. Materials & Labor: $780.00. Schedule adjustment: +1 business day (revised completion: Friday, Oct 16). Approval requested before beginning structural repairs.”',
      },
      {
        type: 'h2',
        text: 'The decline protocol: What happens when a customer says no',
        id: 'change-order-decline-protocol',
      },
      {
        type: 'p',
        text: 'A change order is an offer, not an ultimatum. If a customer declines the additional work, follow a structured decline protocol to safeguard both parties:',
      },
      {
        type: 'ul',
        items: [
          'Document the Decline in Writing: Record the customer’s decision directly in the project file, noting the date, time, and specific items discussed.',
          'State Warranty Boundaries Clearly: If declining the change order affects other components, explain the consequences objectively (e.g., “Installing finished porcelain tile over compromised subflooring voids the tile installation warranty against cracking”).',
          'Adjust Original Scope if Necessary: If the discovered condition creates a structural or code hazard that legally prevents continuing original work, pause the affected phase until a safe resolution is agreed upon.',
        ],
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted lets field technicians and estimators create mobile change orders in under two minutes, complete with itemized costs, schedule updates, and digital e-signatures that keep everyone on the same page.',
      },
    ],
    featureLinks: [
      {
        href: '/features/quotes',
        label: 'Digital Quotes & Change Orders',
        blurb: 'Create and send itemized digital change orders with instant mobile e-signatures.',
      },
      {
        href: '/features/payments',
        label: 'Milestone & Change Order Payments',
        blurb: 'Automatically link approved change orders to your project payment schedule.',
      },
    ],
  },
  {
    id: 'post-ai-voice-receptionist',
    slug: 'ai-phone-receptionist-stop-losing-jobs-to-voicemail',
    title: 'AI Receptionist for Contractors: What It Can Handle and When to Escalate',
    subtitle: 'Practical triage workflows, human escalation rules, and a realistic scenario model for trade businesses.',
    excerpt:
      'Contractors can’t answer the phone while working on a ladder or running a crew. An AI phone agent can capture caller details and triage urgent inquiries, but clear human escalation rules are critical. Here is what AI can handle, when to route to an owner, and a defensible financial model.',
    category: 'Speed-to-Lead',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/ai-voice-receptionist.jpg',
    coverAlt: 'Smartphone showing an AI receptionist call transcript with emergency triage alert on a contractor desk',
    readMinutes: 7,
    datePublished: '2026-09-13',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['ai voice', 'receptionist', 'speed to lead', 'customer service', 'emergency dispatch', 'operations'],
    targetKeyword: 'ai phone receptionist for contractors',
    metaTitle: 'AI Receptionist for Contractors: Call Triage & Escalation Rules',
    metaDescription:
      'Stop losing high-value jobs to voicemail. Learn how AI call intake triages urgent calls, gathers job details, and escalates emergency dispatch to crew leads.',
    blocks: [
      {
        type: 'p',
        text: 'When an unexpected plumbing leak or AC failure occurs, homeowners want to speak with a human or receive immediate acknowledgment. If a phone rings to an unmonitored voicemail, many callers simply hang up and dial the next local contractor on Google Maps. However, answering every incoming call while pulling wire or operating machinery is dangerous and impractical.',
      },
      {
        type: 'h2',
        text: 'A transparent scenario model: Measuring the financial impact',
        id: 'financial-scenario-model',
      },
      {
        type: 'p',
        text: 'Software vendors often advertise dramatic revenue recoveries without showing the underlying funnel. To understand the realistic financial impact of an answering solution, examine an illustrative monthly scenario based on conservative conversion rates:',
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'Illustrative Scenario: Answering Funnel Math',
        text: 'Consider an active residential contractor who misses 20 inbound calls in a month. Assume half (10) are legitimate new project inquiries (the remainder being vendor solicitations, spam, or existing project status checks). If an automated triage workflow successfully engages 60% of those inquiries (6 engaged callers) and your sales process converts 30% of engaged inquiries into completed jobs, the model yields 1.8 additional won jobs. At an average collected invoice of $1,500, this produces $2,700 in gross revenue. At a 35% contribution margin before the answering expense, it generates $945 toward overhead and software tools. These figures are illustrative assumptions rather than universal performance guarantees; actual results depend on local market demand and available crew capacity.',
      },
      {
        type: 'h2',
        text: 'What an AI phone agent handles effectively',
        id: 'what-ai-handles',
      },
      {
        type: 'p',
        text: 'Modern conversational AI is not a generic chatbot. When properly configured for residential service trades, it performs four essential front-desk tasks:',
      },
      {
        type: 'ul',
        items: [
          'Inbound Call Capture & Transcription: Answers on ring one, transcribing the customer’s issue and contact information cleanly into your CRM.',
          'Structured Scoping: Inquires about equipment age, brand, problem severity, and specific symptoms (e.g. “Is the water heater leaking from the tank bottom or the top fittings?”).',
          'Automated SMS Follow-Up: Texts the caller an immediate link to submit job photos or select an arrival window while the dispatcher is in the field.',
          'Spam & Vendor Filtering: Screens out cold sales calls and robo-dialers so your personal phone only alerts you for genuine homeowner opportunities.',
        ],
      },
      {
        type: 'h2',
        text: 'Sample call transcript: Emergency triage vs. standard booking',
        id: 'sample-call-transcript',
      },
      {
        type: 'callout',
        kind: 'tip',
        title: 'Sample Triage Interaction',
        text: 'Caller: “Hi, water is spraying under my kitchen sink and I can’t get the shutoff valve to turn.”\nAI Agent: “I understand this is an active emergency, David. First, please locate your main house shutoff valve, typically where the main water pipe enters near your water heater or front hose bib. I am immediately alerting our on-call technician, Marcus, to call your cell phone right now. What is your home address?”',
      },
      {
        type: 'h2',
        text: 'Non-negotiable human escalation rules',
        id: 'human-escalation-rules',
      },
      {
        type: 'p',
        text: 'An AI assistant should never attempt to handle every scenario autonomously. Establish strict rules where the system must transfer the call directly to an on-call manager or flag an immediate mobile alert:',
      },
      {
        type: 'ul',
        items: [
          'Immediate Safety & Property Hazards: Any mention of active flooding, gas odors, burning electrical smells, or sparks.',
          'Warranty & Customer Escalations: Existing clients expressing frustration regarding an open job or billing concern require human empathy and management resolution.',
          'Commercial or Multi-Unit Scopes: High-liability commercial properties requiring specialized insurance and formal bidding processes.',
        ],
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted includes configurable AI phone reception that operates within strict trade guardrails, ensuring urgent calls reach your phone immediately while routine inquiries are scoped and scheduled cleanly.',
      },
    ],
    featureLinks: [
      {
        href: '/features/ai-voice',
        label: '24/7 AI Phone Receptionist',
        blurb: 'Capture inbound calls, qualify homeowner inquiries, and triage emergencies with trade guardrails.',
      },
      {
        href: '/features/scheduling',
        label: 'Visual Dispatch Workbench',
        blurb: 'Turn caller inquiries into scheduled arrival windows with automated technician routing.',
      },
    ],
  },
  {
    id: 'post-route-quick-stops',
    slug: 'route-quick-stops-extra-revenue-no-drive-time',
    title: 'What Driving Between Jobs Costs—and When a Nearby Stop Pays',
    subtitle: 'Calculate true vehicle and crew drive costs, and evaluate when a short detour adds genuine contribution.',
    excerpt:
      'Driving across town burns fuel, vehicle wear, and billable labor. Clustering short service calls near active job sites can boost daily efficiency, but not every detour is profitable. Here is a before-and-after route analysis, cost-per-mile math, and when to decline a stop.',
    category: 'Operations & Crew',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/route-quick-stops.jpg',
    coverAlt: 'Service van dashboard tablet displaying an optimized multi-stop route map with a high-margin quick stop',
    readMinutes: 6,
    datePublished: '2026-09-13',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['quick stops', 'route density', 'scheduling', 'field operations', 'travel time', 'profitability'],
    targetKeyword: 'contractor route density quick stops',
    metaTitle: 'Contractor Route Density: Drive-Time Costs & Quick Stops Guide',
    metaDescription:
      'Cut windshield time and fuel expenses. Calculate vehicle wear and technician hourly cost per mile, and evaluate high-margin quick stops along active routes.',
    blocks: [
      {
        type: 'p',
        text: 'Windshield time is one of the most persistent drains on trade margins. When technicians spend hours crossing congested metro corridors, you pay full hourly labor and vehicle wear without billing a dollar. However, attempting to squeeze minor repair stops into a packed day without calculating travel and buffer costs can backfire, causing missed arrival windows on major projects.',
      },
      {
        type: 'h2',
        text: 'The true arithmetic of travel time and mileage',
        id: 'travel-time-arithmetic',
      },
      {
        type: 'p',
        text: 'To evaluate whether a detour is profitable, you must track both vehicle operating costs and fully burdened labor rates rather than fuel alone:',
      },
      {
        type: 'ul',
        items: [
          'Burdened Crew Labor: A two-person technician team earning $30/hour and $20/hour has a combined fully burdened cost (including payroll taxes, workers’ comp, and benefits) of roughly $88/hour, or $1.47 per minute of travel.',
          'Vehicle Fleet Expense: Fuel, maintenance, tires, commercial auto insurance, and vehicle depreciation average approximately $0.75 per mile for standard service vans and utility trucks.',
          'Cross-Town Trip Cost: A 15-mile, 30-minute transit across town incurs $11.25 in vehicle wear and $44.10 in crew labor—a total of $55.35 in unbillable travel cost before the technician steps out of the cab.',
        ],
      },
      {
        type: 'h2',
        text: 'A worked before-and-after route comparison',
        id: 'worked-route-comparison',
      },
      {
        type: 'p',
        text: 'Consider an electrical contractor with two scheduled installations on a Tuesday:',
      },
      {
        type: 'ul',
        items: [
          'Base Schedule: Morning 200A panel upgrade (8:00 AM – 1:00 PM) in Oak Hills. Afternoon EV charger installation (2:00 PM – 4:30 PM) in Northwood, 10 miles away.',
          'The Opportunity: A homeowner 1.2 miles from the morning job submits an online request for a GFCI outlet diagnostic and replacement.',
          'Incremental Detour Cost: 1.2 miles additional driving ($0.90 vehicle cost) + 8 minutes transit ($11.76 labor) + 35 minutes on-site service ($51.45 labor) + $15 in materials = $79.11 total incremental cost.',
          'Collected Invoice & Net Contribution: $185 diagnostic and receptacle replacement fee. Subtracting $79.11 incremental cost yields $105.89 in positive contribution margin toward overhead, completed inside the midday transit window without disrupting the afternoon project.',
        ],
      },
      {
        type: 'h2',
        text: 'When to decline a stop: The rush-hour trap',
        id: 'when-to-decline-stops',
      },
      {
        type: 'callout',
        kind: 'warning',
        title: 'Illustrative Example: A Detour to Decline',
        text: 'A request arrives for a $95 single-switch replacement located 4.5 miles off route. However, reaching the address requires navigating a notorious highway bottleneck during 4:15 PM rush hour. The detour would add 35 minutes of transit time plus 25 minutes on site (60 minutes total). The incremental labor cost alone ($88) plus vehicle expense ($3.38) wipes out the $95 ticket, while risking crew overtime or delaying a scheduled $8,000 whole-home rewire walkthrough. In this scenario, declining or rescheduling the call to a dedicated service day is the correct operational choice.',
      },
      {
        type: 'h2',
        text: 'Why human approval must remain in the dispatch loop',
        id: 'human-approval-dispatch',
      },
      {
        type: 'p',
        text: 'Automated dispatch tools can identify geographic proximity, but software cannot see whether your truck has the exact replacement parts in stock or whether a morning technician is running behind schedule. Software should flag high-margin proximity opportunities, but your dispatcher or lead technician must retain final one-click approval before altering active routes.',
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted’s Quick-Stops tool highlights nearby service opportunities within your customizable mileage radius, providing travel time estimates and margin calculations so your team can make informed scheduling decisions.',
      },
    ],
    featureLinks: [
      {
        href: '/features/quick-stops',
        label: 'Quick-Stops Neighbor Fills',
        blurb: 'Identify high-margin proximity service calls along active crew routes with travel calculations.',
      },
      {
        href: '/features/scheduling',
        label: 'Visual Dispatch Workbench',
        blurb: 'Drag-and-drop calendar scheduling with auto-calculated driving buffers and crew tracking.',
      },
    ],
  },
  {
    id: 'post-instant-estimate-calculators',
    slug: 'instant-estimates-convert-after-hours-homeowners',
    title: 'Contractor Instant Estimates: How to Scope Ballpark Ranges on Your Website',
    subtitle: 'Provide transparent pricing ranges without locking your business into an uninspected bid.',
    excerpt:
      'Homeowners seek immediate price guidance before inviting a contractor to their home. Providing interactive ballpark ranges filters out unqualified leads and builds trust without binding you to fixed figures before an on-site inspection. Here is the exact calculator formula, a 200A panel upgrade example, and required site disclaimers.',
    category: 'Lead Acquisition',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/instant-estimate-calculators.jpg',
    coverAlt: 'Laptop on a planning desk displaying an interactive website estimate calculator for electrical panel upgrades',
    readMinutes: 6,
    datePublished: '2026-09-12',
    dateModified: '2026-09-13',
    status: 'published',
    featured: false,
    tags: ['instant estimates', 'website builder', 'lead conversion', 'pricing calculator', 'estimating'],
    targetKeyword: 'instant estimate calculator contractor website',
    metaTitle: 'Contractor Instant Estimates: Website Ballpark Calculator Guide',
    metaDescription:
      'Convert evening website visitors with interactive ballpark estimates. Includes exact pricing formulas, electrical panel upgrade model, and disclaimers.',
    blocks: [
      {
        type: 'p',
        text: 'Most contractor websites feature a generic “Contact Us” form asking for name, email, and project description. When a homeowner submits the form, they have no indication whether your company charges $800 or $5,000. Uncertain whether they can afford your services, they frequently open three more browser tabs and fill out competitors’ forms simultaneously.',
      },
      {
        type: 'h2',
        text: 'The exact calculator formula: Building defensible ballpark ranges',
        id: 'calculator-formula',
      },
      {
        type: 'p',
        text: 'An instant estimate widget should never quote a single binding number over the web. Instead, it calculates an asymmetric ballpark range that reflects realistic trade variability:',
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'The Ballpark Estimator Formula',
        text: 'Baseline Direct Cost = (Estimated Crew Hours × Burdened Shop Rate) + Estimated Material Cost + Required Permit Fees\nTarget Baseline Price = Baseline Direct Cost ÷ (1 − Target Gross Margin)\nLow-End Display Range = Target Baseline Price × 0.95 (−5%)\nHigh-End Display Range = Target Baseline Price × 1.25 (+25%)',
      },
      {
        type: 'p',
        text: 'Notice that the range is intentionally asymmetric. In residential service and remodeling, projects rarely complete 20% below standard labor and material costs. However, unforeseen field conditions—such as extended wire pulls, accessibility issues, or older non-compliant components—routinely add 15% to 25% to project scope.',
      },
      {
        type: 'h2',
        text: 'A worked example: 200A electrical service panel upgrade',
        id: 'electrical-panel-example',
      },
      {
        type: 'p',
        text: 'Consider an electrical contractor configuring an instant ballpark widget on their website for standard residential panel replacements:',
      },
      {
        type: 'ul',
        items: [
          'Customer Selections: Upgrading from 100A to 200A service, exterior meter base, overhead service drop, whole-home surge protector included.',
          'Labor Allocation: 8 technician crew-hours @ $85/hour fully burdened labor rate = $680.',
          'Direct Materials: 200A 40-space panel, breakers, exterior meter socket, service entrance cabling, two ground rods, and Type 2 surge protective device = $950.',
          'Municipal Permit & Utility Inspection: $220 local permit and administrative fee.',
          'Total Direct Cost: $680 labor + $950 materials + $220 permits = $1,850 direct cost.',
          'Target Gross Margin: At a 35% target margin, Baseline Target Price = $1,850 ÷ (1 − 0.35) = $2,846.',
          'Display Range: Low end ($2,846 × 0.95) = $2,704 (rounded to $2,700). High end ($2,846 × 1.25) = $3,558 (rounded to $3,550).',
          'Homeowner Website Output: “Estimated Range: $2,700 – $3,550 (Includes equipment, permits, and professional installation).”',
        ],
      },
      {
        type: 'h2',
        text: 'Mandatory inspection disclaimers and scope boundaries',
        id: 'inspection-disclaimers',
      },
      {
        type: 'p',
        text: 'A ballpark estimate must protect your business from customer misunderstandings. Always pair online calculations with prominent, plain-English terms before capturing customer contact details:',
      },
      {
        type: 'callout',
        kind: 'tip',
        title: 'Mandatory Estimator Disclaimer',
        text: '“Ballpark estimate for planning purposes only. Final firm quotation is confirmed following an on-site inspection of service entrance wire routing, grounding electrode system, and utility connection points. Does not include trenching or utility company infrastructure fees if required.”',
      },
      {
        type: 'p',
        text: 'This transparent approach filters out tire-kickers who expected a $500 patch, while giving serious homeowners the pricing context they need to book an in-person site consultation with confidence.',
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted gives contractors customizable Instant Estimate widgets for over 20 residential trades. You set your labor rates, equipment costs, and target margins; your website delivers instant ballpark ranges that convert visitors into exclusive leads.',
      },
    ],
    featureLinks: [
      {
        href: '/features/website-builder',
        label: 'Contractor Website Builder',
        blurb: 'Launch a modern trade website with interactive instant estimate calculators built in.',
      },
      {
        href: '/tools/estimate-generator',
        label: 'Interactive Estimate Calculator',
        blurb: 'Configure custom trade pricing formulas and test the homeowner estimate experience.',
      },
    ],
  },
  {
    id: 'post-good-better-best-quoting',
    slug: 'good-better-best-tiered-quoting-clean-energy-rebates',
    title: 'Good, Better, Best Contractor Quotes: A Worked Example',
    subtitle: 'Compare three distinct equipment tiers with real labor, materials, and gross margin calculations.',
    excerpt:
      'Sending a single price forces a binary take-it-or-leave-it decision. Presenting three clearly scoped options—Good, Better, and Best—gives homeowners control over budget and quality while protecting your target margins. Here is a complete worked example.',
    category: 'Cash Flow & Margin',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/good-better-best-quoting.jpg',
    coverAlt: 'Tablet on a workshop bench displaying a 3-column Good Better Best HVAC quote with warranty tiers',
    readMinutes: 7,
    datePublished: '2026-09-11',
    status: 'published',
    featured: false,
    tags: ['tiered quotes', 'good better best', 'estimating', 'hvac pricing', 'gross margin'],
    targetKeyword: 'good better best contractor quotes',
    metaTitle: 'Good Better Best Contractor Quotes: 3-Tier Proposal Example',
    metaDescription:
      'Win bigger jobs and protect margins with 3-tier proposals. Complete worked 3-ton heat pump replacement example with equipment, labor, and profit margins.',
    blocks: [
      {
        type: 'p',
        text: 'When you present a homeowner with a single take-it-or-leave-it quote—say, $8,500 for a heat pump replacement—their decision naturally centers on price: “Is this company worth $8,500, or should I call two more contractors?” Presenting three clearly scoped tiers (Good, Better, and Best) shifts the conversation from price alone to value and choice: “Which level of efficiency, warranty, and comfort fits our home best?”',
      },
      {
        type: 'h2',
        text: 'A worked 3-ton heat pump replacement: Scope, costs, and margins',
        id: 'worked-heat-pump-example',
      },
      {
        type: 'p',
        text: 'To make tiered quoting work, every tier must be a code-compliant, durable installation that you stand behind. Here is a realistic breakdown for a residential 3-ton heat pump replacement:',
      },
      {
        type: 'ul',
        items: [
          'Base Tier (Good) — $7,400 Selling Price: 14.3 SEER2 single-stage heat pump, reconnection to existing ductwork, digital non-programmable thermostat, 5-year parts warranty. Direct Costs: Equipment ($3,400) + Labor (14 crew-hours @ $65/hr fully burdened rate = $910) + Permits & materials ($490) = $4,800 total direct cost. Gross Profit: $2,600 (35.1% gross margin).',
          'Enhanced Tier (Better) — $10,200 Selling Price: 16 SEER2 two-stage heat pump, new composite outdoor equipment pad and electrical disconnect, Wi-Fi smart touchscreen thermostat, 10-year parts warranty and 2-year labor guarantee. Direct Costs: Equipment ($4,600) + Labor (16 crew-hours = $1,040) + Supplies, pad, disconnect & permit ($660) = $6,300 total direct cost. Gross Profit: $3,900 (38.2% gross margin).',
          'Premium Tier (Best) — $14,100 Selling Price: 18.5 SEER2 variable-speed inverter system, high-efficiency 4-inch media air cleaner cabinet, whole-home surge protector, 10-year parts and 10-year full labor warranty, plus two annual maintenance tune-ups included. Direct Costs: Equipment ($6,200) + Labor (18 crew-hours = $1,170) + Filter cabinet, surge, electrical & permit ($930) = $8,300 total direct cost. Gross Profit: $5,800 (41.1% gross margin).',
        ],
      },
      {
        type: 'h2',
        text: 'Evaluating the customer selection assumptions',
        id: 'selection-assumptions',
      },
      {
        type: 'p',
        text: 'Contractors frequently hear about an idealized “20-60-20 rule” where 20% select the base, 60% select the middle, and 20% choose the premium option. While that provides a convenient modeling benchmark, actual selection distributions depend on your local market, customer demographics, and how effectively your proposal communicates long-term value.',
      },
      {
        type: 'callout',
        kind: 'info',
        title: 'Illustrative Selection Mix Model',
        text: 'Under an assumed mix where 20% pick Good ($7,400), 60% pick Better ($10,200), and 20% pick Best ($14,100), the weighted average ticket is $10,420 with a weighted gross profit of $3,720 per job. This is an illustrative model, not a guarantee. If presenting extra tiers causes an estimator to appear confusing or unorganized and lowers your overall close rate, higher potential tickets will not translate into more net profit. Track both signed win rate and gross margin together.',
      },
      {
        type: 'h2',
        text: 'Rules for building defensible, high-converting tiers',
        id: 'rules-defensible-tiers',
      },
      {
        type: 'ul',
        items: [
          'Never create a “dummy” base tier: If a homeowner chooses your Good tier, you must be fully confident installing and honoring its warranty.',
          'Focus upgrades on customer-facing benefits: Homeowners readily pay for lower sound levels (decibels), longer labor guarantees, or better indoor air quality, but rarely value internal part numbers they cannot see or hear.',
          'Allow standalone add-ons: Let homeowners customize any tier with optional line items (such as a surge protector or UV purifier) before signing.',
        ],
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted’s proposal builder allows contractors to generate interactive Good/Better/Best estimates in minutes. Homeowners compare specifications side-by-side on mobile, check optional line-item upgrades, and e-sign directly without waiting for a re-drafted PDF.',
      },
    ],
    featureLinks: [
      {
        href: '/features/quotes',
        label: 'Interactive Tiered Quotes',
        blurb: 'Build side-by-side Good/Better/Best proposals with instant mobile e-signatures.',
      },
      {
        href: '/features/client-portal',
        label: 'Client Approval Hub',
        blurb: 'Let homeowners review options, select add-ons, and approve bids on their phone.',
      },
    ],
  },
  {
    id: 'post-deposit-gated-scheduling',
    slug: 'deposit-gated-scheduling-ends-no-shows-late-invoices',
    title: 'Should You Require a Deposit Before Scheduling?',
    subtitle: 'How diagnostic fees, material deposits, and saved payment methods protect crew calendars without alienating customers.',
    excerpt:
      'Holding installation dates on verbal promises leaves crews idle when customers cancel last-minute. Here is how to structure deposits, payment authorizations, and cancellation policies fairly.',
    category: 'Cash Flow & Margin',
    author: DEFAULT_AUTHOR,
    coverImage: '/blog/deposit-gated-scheduling.jpg',
    coverAlt: 'Office computer monitor showing a dispatch calendar with a deposit secured appointment confirmation',
    readMinutes: 6,
    datePublished: '2026-09-10',
    status: 'published',
    featured: false,
    tags: ['deposit scheduling', 'card on file', 'stripe payments', 'cash flow', 'cancellation policy'],
    targetKeyword: 'contractor deposit before scheduling',
    metaTitle: 'Contractor Deposit Before Scheduling: Policies & Booking Rules',
    metaDescription:
      'Eliminate no-shows and cash flow strain. How to structure diagnostic dispatch fees, 50% material deposits, and card-on-file policies that homeowners accept.',
    blocks: [
      {
        type: 'p',
        text: 'Every trade business owner knows the frustration of an uncommitted calendar hold: a homeowner confirms a scheduled installation over the phone, but texts an hour before arrival on Monday morning saying they decided to postpone. The crew sits idle, equipment remains on the truck, and the lost billable hours cannot be recovered.',
      },
      {
        type: 'h2',
        text: 'Matching deposit requirements to the job type',
        id: 'matching-deposit-to-job',
      },
      {
        type: 'p',
        text: 'A blanket deposit policy can deter callers if applied clumsily. Instead, match your payment requirement to the operational risk of each visit:',
      },
      {
        type: 'ul',
        items: [
          'Diagnostic Service Calls ($89–$149): Collect or authorize the diagnostic fee at booking. Clearly state that this fee reserves the technician’s arrival window and can be credited toward approved repairs.',
          'Minor Repairs ($250–$1,000): Collect a card on file during scheduling. Pre-authorize a nominal scheduling hold ($50) or authorize the card without charging it until the technician completes the work walkthrough.',
          'Major Installations & Replacements ($2,500+): Require a milestone deposit (such as 20% to 33% upon signing) before ordering custom equipment or allocating full-day crew capacity. Always verify state-specific limits: for example, California law caps home improvement down payments at 10% of the contract price or $1,000, whichever is less.',
        ],
      },
      {
        type: 'h2',
        text: 'Understanding payment timing: Authorization, capture, and bank payouts',
        id: 'payment-timing-mechanics',
      },
      {
        type: 'p',
        text: 'When moving from paper checks to digital processing, contractors sometimes assume card payments equal immediate cash in the bank. In modern payment processors like Stripe, these are distinct events:',
      },
      {
        type: 'ul',
        items: [
          'Authorization: Validates the card and holds the required amount without charging it immediately. Useful for diagnostic appointments where the final repair cost is unknown.',
          'Capture & Settlement: The card is officially charged upon digital sign-off. Funds settle through card networks into your payment processing balance.',
          'Bank Payout: Processed funds transfer to your business checking account according to your payout schedule (typically rolling 2 business days). Digital payments dramatically reduce collection friction, but settlement timing must still be reflected in your weekly cash flow planning.',
        ],
      },
      {
        type: 'h2',
        text: 'A transparent customer cancellation policy template',
        id: 'cancellation-policy-template',
      },
      {
        type: 'callout',
        kind: 'tip',
        title: 'Sample Customer Booking Notice',
        text: '“Your installation appointment is reserved for Thursday, October 15 between 8:00 AM and 10:00 AM. To confirm this crew window, please submit your $150 scheduling deposit at the secure link below. Cancellations made with at least 24 hours notice are 100% refundable. Cancellations within 24 hours forfeit the deposit to cover technician dispatch allocation.”',
      },
      {
        type: 'p',
        text: 'Let’s Get Quoted links calendar dispatch directly with Stripe card-on-file tokenization. Customers confirm their appointment window by submitting their deposit online, protecting your schedule while keeping communication professional and transparent.',
      },
    ],
    featureLinks: [
      {
        href: '/features/scheduling',
        label: 'Deposit-Gated Scheduling',
        blurb: 'Reserve calendar bookings with cleared Stripe deposit payments and automated reminders.',
      },
      {
        href: '/features/payments',
        label: 'Stripe Card-on-File Settlements',
        blurb: 'Collect deposits and settle completed balances with transparent payment tracking.',
      },
    ],
  },
];

import { DRAFT_BLOG_POSTS } from './platform-blog-drafts';
export { DRAFT_BLOG_POSTS };

export const ALL_INITIAL_BLOG_POSTS: PlatformBlogPost[] = [
  ...SEED_BLOG_POSTS,
  ...DRAFT_BLOG_POSTS,
];

// In-memory store for runtime post modifications in environments without DB tables
const memoryPostStore = new Map<string, PlatformBlogPost>();

// Initialize memory store with seed posts and planned drafts
for (const post of ALL_INITIAL_BLOG_POSTS) {
  memoryPostStore.set(post.id, { ...post });
}

export interface ListBlogOptions {
  status?: 'all' | 'published' | 'draft' | 'scheduled';
  category?: string;
  search?: string;
  tag?: string;
  limit?: number;
}

/**
 * Synchronous in-memory lookup for static generation, sitemap, and test runner.
 */
export function getPlatformBlogPostsSync(options: ListBlogOptions = {}): PlatformBlogPost[] {
  const { status = 'published', category, search, tag, limit } = options;
  const todayKey = new Date().toISOString().slice(0, 10);
  const allPosts = Array.from(memoryPostStore.values()).sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  let filtered = allPosts;
  if (status === 'published') {
    filtered = filtered.filter(
      (p) => p.status === 'published' || (p.status === 'scheduled' && p.datePublished <= todayKey),
    );
  } else if (status !== 'all') {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (category) {
    filtered = filtered.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  filtered = filterPosts(filtered, { search, tag });

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

/**
 * Promotes any scheduled platform blog posts whose target date has arrived to 'published'.
 * Updates both Supabase (if configured) and the in-memory fallback store.
 */
export async function publishDuePlatformBlogPosts(
  todayKey = new Date().toISOString().slice(0, 10),
): Promise<{ count: number; publishedSlugs: string[] }> {
  const publishedSlugs: string[] = [];

  // 1) Update in-memory store
  for (const post of memoryPostStore.values()) {
    if (post.status === 'scheduled' && post.datePublished <= todayKey) {
      post.status = 'published';
      post.dateModified = todayKey;
      publishedSlugs.push(post.slug);
    }
  }

  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return {
      count: publishedSlugs.length,
      publishedSlugs,
    };
  }

  // 2) Update Supabase platform_blog_posts table
  try {
    const admin = createAdminClient();
    const { data: duePosts, error: selectError } = await admin
      .from('platform_blog_posts')
      .select('id, slug')
      .eq('status', 'scheduled')
      .lte('date_published', todayKey);

    if (!selectError && duePosts && duePosts.length > 0) {
      const ids = duePosts.map((p) => p.id);
      const { error: updateError } = await admin
        .from('platform_blog_posts')
        .update({
          status: 'published',
          date_modified: todayKey,
          updated_at: new Date().toISOString(),
        })
        .in('id', ids);

      if (!updateError) {
        for (const p of duePosts) {
          if (!publishedSlugs.includes(p.slug)) {
            publishedSlugs.push(p.slug);
          }
        }
      }
    }
  } catch (err) {
    console.warn('publishDuePlatformBlogPosts Supabase sweep failed:', err);
  }

  return {
    count: publishedSlugs.length,
    publishedSlugs,
  };
}

export interface BatchQueueResult {
  count: number;
  queue: Array<{
    id: string;
    slug: string;
    title: string;
    datePublished: string;
  }>;
}

/**
 * Calculates the next available scheduling slot.
 * Finds the latest datePublished among existing scheduled/published posts,
 * or starts from today, and adds intervalDays (default: 3).
 */
export function getNextScheduleDate(intervalDays = 3, fromDate?: string): string {
  const todayKey = new Date().toISOString().slice(0, 10);
  let baseDate = fromDate || todayKey;

  if (!fromDate) {
    const allDates = Array.from(memoryPostStore.values())
      .map((p) => p.datePublished)
      .filter(Boolean)
      .sort();

    const latestExisting = allDates[allDates.length - 1];
    if (latestExisting && latestExisting > baseDate) {
      baseDate = latestExisting;
    }
  }

  const d = new Date(`${baseDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + intervalDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Sequentially queues an array of platform blog posts to release every N days (default: 3 days).
 * Sets each post's status to 'scheduled' with sequential publication dates.
 */
export async function batchQueuePlatformBlogPosts(
  postIds: string[],
  options: { intervalDays?: number; startDate?: string } = {},
): Promise<BatchQueueResult> {
  const { intervalDays = 3, startDate } = options;
  const queue: BatchQueueResult['queue'] = [];

  let nextDate = startDate || getNextScheduleDate(intervalDays);

  for (const id of postIds) {
    const post = await getPlatformBlogPostById(id);
    if (!post) continue;

    const updatedPost: PlatformBlogPost = {
      ...post,
      status: 'scheduled',
      datePublished: nextDate,
      dateModified: new Date().toISOString().slice(0, 10),
    };

    await savePlatformBlogPost(updatedPost);

    queue.push({
      id: updatedPost.id,
      slug: updatedPost.slug,
      title: updatedPost.title,
      datePublished: updatedPost.datePublished,
    });

    // Advance by intervalDays for the next post
    const d = new Date(`${nextDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + intervalDays);
    nextDate = d.toISOString().slice(0, 10);
  }

  return {
    count: queue.length,
    queue,
  };
}

/**
 * Fetch blog posts, reading from Supabase table `platform_blog_posts` if present,
 * otherwise falling back cleanly to in-memory/seed catalog.
 */
export async function getPlatformBlogPosts(options: ListBlogOptions = {}): Promise<PlatformBlogPost[]> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostsSync(options);
  }

  const { status = 'published', category, search, tag, limit } = options;
  const todayKey = new Date().toISOString().slice(0, 10);

  try {
    const admin = createAdminClient();
    let query = admin
      .from('platform_blog_posts')
      .select('*')
      .order('date_published', { ascending: false });

    if (status === 'published') {
      query = query.or(`status.eq.published,and(status.eq.scheduled,date_published.lte.${todayKey})`);
    } else if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (!error && data && data.length > 0) {
      const posts: PlatformBlogPost[] = data.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle || undefined,
        excerpt: row.excerpt,
        category: row.category,
        author: (row.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: row.cover_image || undefined,
        coverAlt: row.cover_alt || undefined,
        readMinutes: row.read_minutes || 5,
        datePublished: row.date_published,
        dateModified: row.date_modified || undefined,
        status: row.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(row.tags) ? row.tags : [],
        blocks: Array.isArray(row.blocks) ? row.blocks : [],
        featured: Boolean(row.featured),
        targetKeyword: row.target_keyword || undefined,
        featureLinks: Array.isArray(row.feature_links) ? row.feature_links : [],
      }));

      // Apply in-memory search and tag filter if needed
      return filterPosts(posts, { search, tag });
    }
  } catch {
    // Database read fallback
  }

  // Resilient fallback to memory/seed posts
  const allPosts = Array.from(memoryPostStore.values()).sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  let filtered = allPosts;
  if (status === 'published') {
    filtered = filtered.filter(
      (p) => p.status === 'published' || (p.status === 'scheduled' && p.datePublished <= todayKey),
    );
  } else if (status !== 'all') {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (category) {
    filtered = filtered.filter((p) => p.category.toLowerCase() === category.toLowerCase());
  }

  filtered = filterPosts(filtered, { search, tag });

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

function filterPosts(
  posts: PlatformBlogPost[],
  opts: { search?: string; tag?: string },
): PlatformBlogPost[] {
  let res = posts;
  if (opts.search) {
    const q = opts.search.toLowerCase().trim();
    res = res.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (opts.tag) {
    const t = opts.tag.toLowerCase().trim();
    res = res.filter((p) => p.tags.some((item) => item.toLowerCase() === t));
  }
  return res;
}

/**
 * Synchronous slug lookup from memory store.
 */
export function getPlatformBlogPostBySlugSync(
  slug: string,
  options: { preview?: boolean } = {},
): PlatformBlogPost | undefined {
  const cleanSlug = slug.toLowerCase().trim();
  const post = Array.from(memoryPostStore.values()).find((p) => p.slug === cleanSlug);
  if (!post) return undefined;
  if (options.preview) return post;
  const todayKey = new Date().toISOString().slice(0, 10);
  const isLive =
    post.status === 'published' || (post.status === 'scheduled' && post.datePublished <= todayKey);
  if (!isLive) return undefined;
  return post;
}

/**
 * Synchronous id lookup from memory store.
 */
export function getPlatformBlogPostByIdSync(id: string): PlatformBlogPost | undefined {
  return memoryPostStore.get(id);
}

/**
 * Find a blog post by its URL slug.
 */
export async function getPlatformBlogPostBySlug(
  slug: string,
  options: { preview?: boolean } = {},
): Promise<PlatformBlogPost | undefined> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostBySlugSync(slug, options);
  }

  const cleanSlug = slug.toLowerCase().trim();
  const todayKey = new Date().toISOString().slice(0, 10);

  try {
    const admin = createAdminClient();
    let query = admin.from('platform_blog_posts').select('*').eq('slug', cleanSlug);

    if (!options.preview) {
      query = query.or(`status.eq.published,and(status.eq.scheduled,date_published.lte.${todayKey})`);
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle || undefined,
        excerpt: data.excerpt,
        category: data.category,
        author: (data.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: data.cover_image || undefined,
        coverAlt: data.cover_alt || undefined,
        readMinutes: data.read_minutes || 5,
        datePublished: data.date_published,
        dateModified: data.date_modified || undefined,
        status: data.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(data.tags) ? data.tags : [],
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        featured: Boolean(data.featured),
        targetKeyword: data.target_keyword || undefined,
        featureLinks: Array.isArray(data.feature_links) ? data.feature_links : [],
      };
    }
  } catch {
    // Database lookup fallback
  }

  return getPlatformBlogPostBySlugSync(cleanSlug, options);
}

/**
 * Find a blog post by internal ID (for admin editing).
 */
export async function getPlatformBlogPostById(id: string): Promise<PlatformBlogPost | undefined> {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return getPlatformBlogPostByIdSync(id);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('platform_blog_posts').select('*').eq('id', id).maybeSingle();
    if (!error && data) {
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle || undefined,
        excerpt: data.excerpt,
        category: data.category,
        author: (data.author as PlatformBlogAuthor) || DEFAULT_AUTHOR,
        coverImage: data.cover_image || undefined,
        coverAlt: data.cover_alt || undefined,
        readMinutes: data.read_minutes || 5,
        datePublished: data.date_published,
        dateModified: data.date_modified || undefined,
        status: data.status as 'published' | 'draft' | 'scheduled',
        tags: Array.isArray(data.tags) ? data.tags : [],
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        featured: Boolean(data.featured),
        targetKeyword: data.target_keyword || undefined,
        featureLinks: Array.isArray(data.feature_links) ? data.feature_links : [],
      };
    }
  } catch {
    // Fallback
  }

  return getPlatformBlogPostByIdSync(id);
}

/**
 * Save (create or update) a blog post.
 */
export async function savePlatformBlogPost(post: PlatformBlogPost): Promise<PlatformBlogPost> {
  const now = new Date().toISOString().slice(0, 10);
  const updatedPost: PlatformBlogPost = {
    ...post,
    dateModified: now,
  };

  memoryPostStore.set(updatedPost.id, updatedPost);

  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return updatedPost;
  }

  try {
    const admin = createAdminClient();
    const row = {
      id: updatedPost.id,
      slug: updatedPost.slug,
      title: updatedPost.title,
      subtitle: updatedPost.subtitle ?? null,
      excerpt: updatedPost.excerpt,
      category: updatedPost.category,
      author: updatedPost.author,
      cover_image: updatedPost.coverImage ?? null,
      cover_alt: updatedPost.coverAlt ?? null,
      read_minutes: updatedPost.readMinutes,
      date_published: updatedPost.datePublished,
      date_modified: updatedPost.dateModified ?? now,
      status: updatedPost.status,
      tags: updatedPost.tags,
      blocks: updatedPost.blocks,
      featured: Boolean(updatedPost.featured),
      target_keyword: updatedPost.targetKeyword ?? null,
      feature_links: updatedPost.featureLinks ?? [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from('platform_blog_posts').upsert(row);
    if (error) {
      console.warn('Could not write blog post to Supabase platform_blog_posts:', error.message);
    }
  } catch (err) {
    console.warn('Supabase upsert failed, retaining in memory store:', err);
  }

  return updatedPost;
}

/**
 * Delete a blog post.
 */
export async function deletePlatformBlogPost(id: string): Promise<boolean> {
  const deleted = memoryPostStore.delete(id);
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return deleted;
  }

  try {
    const admin = createAdminClient();
    await admin.from('platform_blog_posts').delete().eq('id', id);
  } catch {
    // Ignore DB error and proceed
  }
  return deleted;
}

/**
 * Find related articles for an article.
 */
export async function getRelatedPlatformBlogPosts(
  slug: string,
  limit = 3,
): Promise<PlatformBlogPost[]> {
  const all = await getPlatformBlogPosts({ status: 'published' });
  const current = all.find((p) => p.slug === slug);
  if (!current) return all.slice(0, limit);

  return all
    .filter((p) => p.slug !== slug)
    .sort((a, b) => {
      const aSameCat = a.category === current.category ? 0 : 1;
      const bSameCat = b.category === current.category ? 0 : 1;
      if (aSameCat !== bSameCat) return aSameCat - bSameCat;
      return b.datePublished.localeCompare(a.datePublished);
    })
    .slice(0, limit);
}

/**
 * Helper to generate RSS 2.0 XML.
 */
export async function generateBlogRssXml(origin = 'https://letsgetquoted.com'): Promise<string> {
  const posts = await getPlatformBlogPosts({ status: 'published' });
  const nowRfc822 = new Date().toUTCString();

  const itemsXml = posts
    .map((post) => {
      const postUrl = `${origin}/blog/${post.slug}`;
      const pubDate = new Date(`${post.datePublished}T12:00:00Z`).toUTCString();
      const escapedTitle = escapeXml(post.title);
      const escapedExcerpt = escapeXml(post.excerpt);
      const author = escapeXml(post.author.name);
      const category = escapeXml(post.category);
      const mediaTag = post.coverImage
        ? `\n      <media:content url="${origin}${post.coverImage}" medium="image" type="image/jpeg" width="1280" height="720"/>\n      <enclosure url="${origin}${post.coverImage}" length="750000" type="image/jpeg"/>`
        : '';
      const tagsXml = (post.tags || [])
        .map((t) => `\n      <category>${escapeXml(t)}</category>`)
        .join('');

      return `    <item>
      <title>${escapedTitle}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <description>${escapedExcerpt}</description>
      <pubDate>${pubDate}</pubDate>
      <author>${author}</author>
      <category>${category}</category>${tagsXml}${mediaTag}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Let's Get Quoted Contractor Blog</title>
    <link>${origin}/blog</link>
    <description>Practical, no-fluff playbooks for trade contractors: cash flow, quoting, crew operations, speed-to-lead, and local SEO.</description>
    <language>en-us</language>
    <lastBuildDate>${nowRfc822}</lastBuildDate>
    <atom:link href="${origin}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
