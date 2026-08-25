/**
 * Help Center Data Definitions & Contractor Knowledge Base
 * Single source of truth for categories, trade playbooks, legal templates, and common fixes.
 */

export interface Article {
  id: string;
  title: string;
  readTime: string;
  audience?: string;
  category: string;
  lastUpdated?: string;
  content: string;
}

export interface KnowledgeCategory {
  id: string;
  topic: string;
  title: string;
  desc: string;
  icon: string;
  articles: Article[];
}

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export interface TradePlaybook {
  id: string;
  name: string;
  icon: string;
  badge: string;
  headline: string;
  description: string;
  keyWorkflows: { title: string; desc: string }[];
}

export interface DownloadableTemplate {
  id: string;
  name: string;
  description: string;
  fileSize: string;
  fileName: string;
}

export interface SupportChannel {
  id: string;
  name: string;
  icon: string;
  bestUsedFor: string;
  availability: string;
  responseTarget: string;
  prepareInfo: string[];
}

export const LEGAL_TEMPLATES_DISCLAIMER =
  'These templates are starting points, not legal advice. Requirements vary by state and project. Have important agreements reviewed by a qualified local professional.';

// 6 Common-Fix Diagnostic Articles
export const COMMON_FIX_ARTICLES: Article[] = [
  {
    id: 'art-quote-send-troubleshooting',
    title: 'Why Customer Quotes Fail to Deliver (and How to Fix Them in 2 Minutes)',
    category: 'Quoting',
    readTime: '2 min read',
    audience: 'Contractors & Estimators',
    lastUpdated: 'August 2026',
    content: `
      <h3>Diagnosing Quote Delivery Issues</h3>
      <p>When an estimate or quote fails to reach your customer, it is almost always caused by one of three issues:</p>
      <ol>
        <li><strong>Invalid or Landline Phone Number:</strong> SMS delivery automatically detects landlines and stops sending to protect your carrier trust score. If a number fails, toggle the delivery method to Email in the Quote Actions drawer.</li>
        <li><strong>Expired Magic Token:</strong> If a customer reports the quote link is expired, click <em>Regenerate Link</em> on the quote summary screen to extend access by 30 days.</li>
        <li><strong>Pending 10DLC Verification:</strong> New accounts sending high-volume SMS must have their EIN name matching IRS records exactly.</li>
      </ol>
      <h4>Quick Fix Checklist:</h4>
      <ul>
        <li>Verify the recipient phone number includes 10 digits without international country codes.</li>
        <li>Check the live delivery log in <em>Settings &gt; SMS Logs</em>.</li>
        <li>Use <em>Copy Private Link</em> to paste the quote directly into WhatsApp or personal iMessage if urgency is critical.</li>
      </ul>
    `
  },
  {
    id: 'art-sms-delivery-troubleshooting',
    title: 'Troubleshooting 10DLC Carrier Verification & Pending Text Messages',
    category: 'SMS & Messaging',
    readTime: '3 min read',
    audience: 'Owners & Administrators',
    lastUpdated: 'August 2026',
    content: `
      <h3>10DLC Carrier Brand Approval Workflow</h3>
      <p>US telecom regulations require all business texting to be verified under 10DLC (10-Digit Long Code). Here is how to unblock pending status:</p>
      <ol>
        <li><strong>Legal Entity Name Mismatch:</strong> Your legal business name in <em>Settings &gt; SMS</em> must match word-for-word with your IRS CP-575 or Form 147C letter.</li>
        <li><strong>EIN Validation:</strong> Ensure your 9-digit Employer Identification Number contains no hyphens or spaces in the verification form.</li>
        <li><strong>Website Privacy Policy:</strong> Carriers require a visible SMS opt-in privacy clause. If you use our website builder, this is hosted automatically at <code>/privacy</code>.</li>
      </ol>
      <h4>Delivery Timelines:</h4>
      <p>Standard carrier verification completes in <strong>2 to 24 hours</strong>. While pending, all quote notifications automatically route via priority transactional email.</p>
    `
  },
  {
    id: 'art-stripe-payout-troubleshooting',
    title: 'Resolving Stripe Connect Deposit Schedules & Verification Holds',
    category: 'Payments & Banking',
    readTime: '2 min read',
    audience: 'Business Owners & Bookkeepers',
    lastUpdated: 'August 2026',
    content: `
      <h3>Understanding Payout Timing</h3>
      <p>Customer deposits and credit card payments clear through Stripe Connect directly into your linked checking account on a <strong>2-business-day rolling basis</strong>.</p>
      <h4>Common Reasons for Delayed Deposits:</h4>
      <ul>
        <li><strong>First Payout Delay:</strong> Stripe applies a one-time 5-7 business day holding period on your very first collected customer payment for fraud prevention.</li>
        <li><strong>Identity Verification Needed:</strong> Check <em>Settings &gt; Payments &gt; Stripe Express Dashboard</em> to see if a photo ID or bank statement upload is requested.</li>
        <li><strong>Weekend &amp; Bank Holiday Rollover:</strong> Payments processed after 5:00 PM EST on Fridays batch into Monday morning bank processing.</li>
      </ul>
    `
  },
  {
    id: 'art-domain-offline-troubleshooting',
    title: 'Fixing Custom Domain DNS Records & SSL Certificate Propagation',
    category: 'Custom Domains',
    readTime: '4 min read',
    audience: 'Administrators & Web Leads',
    lastUpdated: 'August 2026',
    content: `
      <h3>DNS Configuration Reference</h3>
      <p>To connect your own custom domain (e.g. <code>maplewoodplumbing.com</code>) to your contractor site:</p>
      <ol>
        <li>Log into your registrar (GoDaddy, Namecheap, Google Domains / Squarespace).</li>
        <li>Create an <strong>A Record</strong> with Host: <code>@</code> pointing to IP: <code>76.76.21.21</code>.</li>
        <li>Create a <strong>CNAME Record</strong> with Host: <code>www</code> pointing to <code>cname.letsgetquoted.com</code>.</li>
        <li>Remove any competing A records or domain parking redirects.</li>
      </ol>
      <h4>SSL Generation:</h4>
      <p>Our edge servers issue a free auto-renewing Let&apos;s Encrypt SSL certificate within <strong>15 minutes</strong> of DNS propagation.</p>
    `
  },
  {
    id: 'art-team-access-troubleshooting',
    title: 'Resolving Crew Sign-In Issues & Role Permission Settings',
    category: 'Team Management',
    readTime: '2 min read',
    audience: 'Owners & Field Managers',
    lastUpdated: 'August 2026',
    content: `
      <h3>Managing Team Invitations</h3>
      <p>If a technician or office manager cannot access their dashboard, follow these verification steps:</p>
      <ol>
        <li><strong>Resend Activation Invite:</strong> Navigate to <em>Settings &gt; Team</em>, locate the member, and click <em>Resend Invite Link</em>.</li>
        <li><strong>Check Seat Entitlements:</strong> Ensure your subscription plan has available active crew seats before adding new field workers.</li>
        <li><strong>Role Permissions:</strong> Technicians assigned the <em>Field Crew</em> role only see jobs dispatched directly to their schedule.</li>
      </ol>
    `
  },
  {
    id: 'art-schedule-sync-troubleshooting',
    title: 'Why a Dispatched Job is Missing from the Crew Calendar',
    category: 'Scheduling & Dispatch',
    readTime: '2 min read',
    audience: 'Dispatchers & Technicians',
    lastUpdated: 'August 2026',
    content: `
      <h3>Dispatch Synchronization Guide</h3>
      <p>When an approved quote or emergency service call is not showing on a technician&apos;s phone calendar:</p>
      <ul>
        <li><strong>Assigned Truck Filter:</strong> Verify the job has an assigned technician in the <em>Crew &amp; Equipment</em> dropdown. Unassigned jobs appear in the <em>Unscheduled Queue</em> on the left sidebar.</li>
        <li><strong>Confirmed Deposit Requirement:</strong> If your job setting requires a deposit before dispatch, the job remains in <em>Pending Approval</em> until Stripe confirms payment.</li>
        <li><strong>Timezone Alignment:</strong> Check that your company operating timezone in <em>Settings &gt; Profile</em> matches your local service territory.</li>
      </ul>
    `
  }
];

export const KNOWLEDGE_BASE: KnowledgeCategory[] = [
  {
    id: 'cat-getting-started',
    topic: 'onboarding',
    title: 'Getting Started & Workspace Setup',
    desc: 'Company branding, default labor rates, material markups, and contractor profiles.',
    icon: 'Rocket',
    articles: [
      {
        id: 'art-quickstart-guide',
        title: 'Complete 10-Minute Onboarding Checklist for Contractors',
        category: 'Setup',
        readTime: '4 min read',
        audience: 'New Users',
        lastUpdated: 'August 2026',
        content: `
          <h3>Fast-Tracking Your Live Contractor Workspace</h3>
          <p>Setting up your workspace properly ensures every outgoing estimate, invoice, SMS alert, and customer agreement reflects your verified business credentials and brand identity.</p>

          <div class="calloutSuccess">
            <strong>Pro Tip:</strong> Upload a high-resolution PNG logo with a transparent background (recommended 800x400px). Our PDF proposal generator formats it automatically for 300 DPI print receipts.
          </div>

          <h3>The 5-Step Workspace Checklist:</h3>
          <ol>
            <li><strong>Company Profile &amp; Trade License:</strong> Navigate to <em>Settings &gt; Profile</em> and enter your legal business name, state contractor license number, and general liability insurance policy details.</li>
            <li><strong>10DLC SMS Phone Line:</strong> Submit your 9-digit IRS EIN in <em>Settings &gt; SMS</em> to provision a dedicated local area code number for two-way client texting.</li>
            <li><strong>Labor Rates &amp; Default Markup:</strong> In <em>Settings &gt; Pricing</em>, set your baseline hourly labor rate and target gross profit margin.</li>
            <li><strong>Stripe Connect Banking:</strong> Link your business checking account in <em>Settings &gt; Payments</em> for automatic next-business-day deposits.</li>
            <li><strong>Install Mobile PWA:</strong> Open <code>app.letsgetquoted.com</code> on your iPhone (Safari &gt; Share &gt; Add to Home Screen) or Android (Chrome &gt; Install App) for 1-tap truck dispatch.</li>
          </ol>
        `
      },
      {
        id: 'art-markup-pricing',
        title: 'Configuring Hourly Rates, Overhead Multipliers, and Material Markup',
        category: 'Setup',
        readTime: '5 min read',
        audience: 'Owners & Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>The Core Difference Between Margin and Markup</h3>
          <p>Marking up job costs by 30% does <strong>NOT</strong> yield a 30% gross profit margin. If direct costs are $10,000 and you add a 30% markup ($13,000 total), your actual margin is only <strong>23.08%</strong> ($3,000 ÷ $13,000). That missing 7% often wipes out net profits after business overhead.</p>

          <div class="callout">
            <strong>The Golden Contractor Margin Formula:</strong><br />
            <code>Quote Price = Total Direct Job Costs ÷ (1 - Desired Gross Margin)</code>
          </div>

          <h3>Margin to Markup Reference Table</h3>
          <table>
            <thead>
              <tr>
                <th>Target Margin</th>
                <th>Cost Multiplier</th>
                <th>Equivalent Markup Needed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>25% Margin</strong></td>
                <td><code>÷ 0.75 (x 1.33)</code></td>
                <td><strong>33.3% Markup</strong></td>
              </tr>
              <tr>
                <td><strong>35% Margin</strong></td>
                <td><code>÷ 0.65 (x 1.54)</code></td>
                <td><strong>53.8% Markup</strong></td>
              </tr>
              <tr>
                <td><strong>45% Margin</strong></td>
                <td><code>÷ 0.55 (x 1.82)</code></td>
                <td><strong>81.8% Markup</strong></td>
              </tr>
              <tr>
                <td><strong>50% Margin</strong></td>
                <td><code>÷ 0.50 (x 2.00)</code></td>
                <td><strong>100.0% Markup (2x Cost)</strong></td>
              </tr>
            </tbody>
          </table>

          <h3>Setting Up Your Rate Card</h3>
          <ol>
            <li>Go to <strong>Settings &gt; Pricing &amp; Markups</strong>.</li>
            <li>Input your loaded labor rate (wage + payroll taxes + insurance + vehicle burden).</li>
            <li>Set your default material markup multiplier (e.g. <code>1.45</code> for 45% markup on retail supplies).</li>
            <li>Enable line-item margin alerts to flag any estimates falling below your target profitability threshold.</li>
          </ol>
        `
      },
      {
        id: 'art-domain-setup',
        title: 'Connecting Custom Domains & Free SSL Setup Guide',
        category: 'Setup',
        readTime: '4 min read',
        audience: 'Admins',
        lastUpdated: 'August 2026',
        content: `
          <h3>Connecting Your Own Domain in 3 Minutes</h3>
          <p>Connect your custom registered domain (e.g. <code>www.maplewoodpro.com</code>) to your contractor website by adding two standard DNS records in your domain registrar.</p>

          <h3>Required DNS Records</h3>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Host / Name</th>
                <th>Value / Target</th>
                <th>TTL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>A Record</strong></td>
                <td><code>@</code> (root)</td>
                <td><code>76.76.21.21</code></td>
                <td>Automatic / 3600</td>
              </tr>
              <tr>
                <td><strong>CNAME</strong></td>
                <td><code>www</code></td>
                <td><code>cname.letsgetquoted.com</code></td>
                <td>Automatic / 3600</td>
              </tr>
            </tbody>
          </table>

          <div class="calloutInfo">
            <strong>Automatic SSL Provisioning:</strong> Once DNS records propagate, our cloud edge automatically provisions and renews a free 256-bit Let's Encrypt SSL certificate within 15 minutes.
          </div>
        `
      }
    ]
  },
  {
    id: 'cat-instant-quoting',
    topic: 'quoting',
    title: 'Instant Multi-Tier Quoting',
    desc: '3-tier Good / Better / Best packages, change orders, and instant customer signature approval.',
    icon: 'FileSpreadsheet',
    articles: [
      COMMON_FIX_ARTICLES[0],
      {
        id: 'art-good-better-best',
        title: 'How to Build High-Converting 3-Option Proposals (Good / Better / Best)',
        category: 'Quoting',
        readTime: '5 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>Why Multi-Tier Quoting Lifts Average Job Size by 35%+</h3>
          <p>Sending a homeowner a single quote price forces a binary <strong>"Yes vs. No"</strong> decision where they compare your number to low-bid competitors. Providing three curated options shifts their internal evaluation to <strong>"Which level of quality best fits our home?"</strong></p>

          <h3>The 20 / 65 / 15 Rule</h3>
          <ul>
            <li><strong>Good (Baseline Option · ~20% select):</strong> Meets standard building codes, standard fixtures/materials, 1-year workmanship warranty. Protects against losing cost-conscious homeowners.</li>
            <li><strong>Better (The Sweet Spot · ~65% select):</strong> Architectural-grade durability, enhanced energy efficiency, upgraded aesthetic finishes, and 5–10 year extended warranty. Priced 25–40% above Good. This is where your highest net profit lives.</li>
            <li><strong>Best (Executive Premium · ~15% select):</strong> Commercial-grade materials, lifetime transferable warranty, annual inspections, and priority 24/7 emergency dispatch. Priced 70–100% above Good.</li>
          </ul>

          <div class="calloutSuccess">
            <strong>Building in 60 Seconds:</strong> In the Quote Builder, toggle on <strong>Multi-Option Tiers</strong>. Load a trade playbook or duplicate your base line items and add warranty and material upgrades to Tiers 2 &amp; 3.
          </div>
        `
      },
      {
        id: 'art-change-orders',
        title: 'Issuing On-Site Extra Work Orders & Instant Client Approvals',
        category: 'Quoting',
        readTime: '4 min read',
        audience: 'Field Techs',
        lastUpdated: 'August 2026',
        content: `
          <h3>Preventing Unpaid Scope Creep</h3>
          <p>Unforeseen issues happen on every remodel: rotted subfloors, corroded cast-iron pipes, or customer-requested fixture additions. Performing extra work without written sign-off is the leading cause of contractor-homeowner payment disputes.</p>

          <h3>The 3-Minute Mobile Change Order Workflow</h3>
          <ol>
            <li><strong>Capture Jobsite Photos:</strong> Take 2 photos of the uncovered unforeseen condition directly in the mobile app.</li>
            <li><strong>Draft Additional Scope:</strong> Open the active job, tap <strong>+ Add Change Order</strong>, and enter itemized additional labor and materials.</li>
            <li><strong>Send Instant SMS Authorization:</strong> Send the 1-click approval link to the homeowner. They review the photo evidence, approve the cost adjustment, and authorize the charge from their phone before you purchase additional materials.</li>
          </ol>
        `
      }
    ]
  },
  {
    id: 'cat-sms-messaging',
    topic: 'sms',
    title: 'Dedicated SMS & Two-Way Client Chat',
    desc: '10DLC carrier compliance, automated quote follow-ups, and review request automations.',
    icon: 'Smartphone',
    articles: [
      COMMON_FIX_ARTICLES[1],
      {
        id: 'art-automated-followups',
        title: 'Setting Up 24-Hour & 72-Hour Quote Follow-Up Sequences',
        category: 'SMS & Messaging',
        readTime: '4 min read',
        audience: 'Sales & Dispatch',
        lastUpdated: 'August 2026',
        content: `
          <h3>Recovering Stalled Quotes on Autopilot</h3>
          <p>Contractors lose over 40% of winnable projects simply due to lack of timely follow-up. Homeowners get busy; automated text sequences bring your proposal back to the top of their mind without sounding aggressive.</p>

          <h3>Proven High-Converting 3-Touch Follow-Up Cadence</h3>
          <table>
            <thead>
              <tr>
                <th>Timing</th>
                <th>Objective</th>
                <th>Proven Message Template</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>24 Hours Post-Quote</strong></td>
                <td>Clarity &amp; Questions</td>
                <td><em>"Hi [Name], Brett here from [Company]. Just wanted to make sure you received the quote for your [Project]. Did you have any questions on the options?"</em></td>
              </tr>
              <tr>
                <td><strong>72 Hours Post-Quote</strong></td>
                <td>Schedule Lock</td>
                <td><em>"Hey [Name], our installation crew is planning next week’s route in [Town]. If you’d like to lock in your preferred start date, you can approve the quote online here: [Link]"</em></td>
              </tr>
              <tr>
                <td><strong>5 Days Post-Quote</strong></td>
                <td>Courtesy Close-Out</td>
                <td><em>"Hi [Name], following up one last time on the [Project] proposal before we release reserved material pricing. Let us know if your timing changed!"</em></td>
              </tr>
            </tbody>
          </table>

          <div class="calloutSuccess">
            <strong>Auto-Halt Intelligence:</strong> The instant the customer replies with a text or signs the quote, the automated follow-up sequence instantly stops.
          </div>
        `
      },
      {
        id: 'art-review-requests',
        title: 'Automated 5-Star Google Review Requests Upon Job Completion',
        category: 'SMS & Messaging',
        readTime: '3 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        content: `
          <h3>Why Timing Decides 80% of Customer Reviews</h3>
          <p>Asking for a review 3 days after a job yields under 10% response rates. Sending an automated SMS review link within <strong>20 minutes</strong> of the technician marking the work order complete generates <strong>65%+ review submission rates</strong> while customer satisfaction is highest.</p>

          <h3>Review Request Best Practices</h3>
          <ul>
            <li><strong>Direct Deep-Link:</strong> The SMS message links directly to your Google Business Profile review dialog so homeowners do not have to search for your company.</li>
            <li><strong>Personalized Signature:</strong> The automated text mentions the technician's name (e.g. <em>"Dave loved working on your home today!"</em>) to increase emotional connection.</li>
            <li><strong>Automated Review Gate:</strong> If a customer reports an issue, the system alerts the office dispatcher immediately before negative feedback is posted publicly.</li>
          </ul>
        `
      }
    ]
  },
  {
    id: 'cat-payments-invoicing',
    topic: 'invoicing',
    title: 'Stripe Connect, Deposits & Invoicing',
    desc: 'Deposit milestones, credit card processing fees, next-day bank transfers, and receipts.',
    icon: 'CreditCard',
    articles: [
      COMMON_FIX_ARTICLES[2],
      {
        id: 'art-deposit-schedules',
        title: 'Enforcing 30% / 50% Milestone Deposits Prior to Job Dispatch',
        category: 'Payments',
        readTime: '4 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        content: `
          <h3>Protecting Cash Flow with Milestone Billing</h3>
          <p>Never front high-ticket materials or crew payroll out of your personal pocket. Requiring an upfront deposit before reserving calendar dates ensures projects are fully funded from day one.</p>

          <h3>Standard Residential Milestone Framework</h3>
          <table>
            <thead>
              <tr>
                <th>Milestone Stage</th>
                <th>Percent Due</th>
                <th>Trigger Event &amp; Deliverable</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Deposit / Booking</strong></td>
                <td><strong>50%</strong></td>
                <td>Required upon contract signing to lock calendar date and purchase materials.</td>
              </tr>
              <tr>
                <td><strong>Rough-In Progress</strong></td>
                <td><strong>40%</strong></td>
                <td>Due upon completion of framing, plumbing/electrical rough-in, or major mechanical milestone.</td>
              </tr>
              <tr>
                <td><strong>Final Completion</strong></td>
                <td><strong>10%</strong></td>
                <td>Due upon final walkthrough, punch-list sign-off, and delivery of lien waiver.</td>
              </tr>
            </tbody>
          </table>

          <div class="calloutSuccess">
            <strong>Calendar Gating:</strong> Jobs can be configured to require the initial 50% deposit before dates are confirmed on the master crew dispatch schedule.
          </div>
        `
      },
      {
        id: 'art-convenience-fees',
        title: 'Passing Credit Card Processing Fees Compliantly by State Law',
        category: 'Payments',
        readTime: '4 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        content: `
          <h3>Surcharging Compliance &amp; Zero-Fee Bank Transfers</h3>
          <p>Credit card processing fees (typically 2.9% + 30¢) can erode significant net margins on large projects. You can configure convenience fees or offer zero-fee ACH bank transfers to keep 100% of your earnings.</p>

          <h3>Compliance Rules:</h3>
          <ul>
            <li><strong>Clear Disclosure:</strong> Surcharges must be displayed transparently on client quote summaries before checkout.</li>
            <li><strong>State Regulations:</strong> Surcharging credit cards is prohibited or restricted in certain states (e.g. Connecticut, Massachusetts). Check your local state commerce regulations.</li>
            <li><strong>Instant ACH Bank Transfers:</strong> Enable direct bank-to-bank transfers for large contract amounts (over $5,000) with capped low-fee processing.</li>
          </ul>
        `
      }
    ]
  },
  {
    id: 'cat-crew-scheduling',
    topic: 'team',
    title: 'Crew Management & Route Dispatch',
    desc: 'GPS technician dispatching, time tracking, crew seat permissions, and calendar sync.',
    icon: 'Users',
    articles: [
      COMMON_FIX_ARTICLES[4],
      COMMON_FIX_ARTICLES[5],
      {
        id: 'art-route-density',
        title: 'Optimizing Route Density & Grouping Jobs by Neighborhood',
        category: 'Team Management',
        readTime: '4 min read',
        audience: 'Dispatchers',
        lastUpdated: 'August 2026',
        content: `
          <h3>Cutting Windshield Time &amp; Increasing Daily Billable Hours</h3>
          <p>Technicians spending 2.5 hours per day driving between distant zip codes lose 1 to 2 billable service calls daily. Grouping appointments by geographic clusters maximizes revenue per truck.</p>

          <h3>The Route Density Strategy:</h3>
          <ol>
            <li><strong>Neighborhood Zone Days:</strong> Assign specific days of the week to specific town clusters (e.g., North County on Tuesdays/Thursdays, South County on Mondays/Wednesdays).</li>
            <li><strong>2-Hour Arrival Windows:</strong> Use 2-hour arrival windows with automated "Tech is en route" SMS alerts to eliminate customer arrival anxiety.</li>
            <li><strong>Buffer Zones:</strong> Schedule 30-minute buffer windows between major jobs to accommodate traffic and supply house runs without running late.</li>
          </ol>
        `
      }
    ]
  },
  {
    id: 'cat-contractor-website',
    topic: 'website',
    title: 'Contractor Website Builder & SEO',
    desc: 'Service area landing pages, instant intake forms, logo branding, and local search SEO.',
    icon: 'Globe',
    articles: [
      COMMON_FIX_ARTICLES[3],
      {
        id: 'art-local-seo-ranking',
        title: 'How Local Service Landing Pages Rank on Google Search',
        category: 'Website & SEO',
        readTime: '5 min read',
        audience: 'Marketing Leads',
        lastUpdated: 'August 2026',
        content: `
          <h3>Dominating Google Maps &amp; Local Search</h3>
          <p>Over 60% of high-intent homeowners searching for contractors on Google click the top 3 map results. Having dedicated town landing pages with localized schema microdata helps you outrank competitors.</p>

          <h3>The 4 Essential Local SEO Factors:</h3>
          <ul>
            <li><strong>Schema.org LocalBusiness Microdata:</strong> Built-in JSON-LD microdata tells Google your exact license number, service radius, and operating hours automatically.</li>
            <li><strong>NAP Consistency:</strong> Ensure your Name, Address, and Phone number are formatted identically across your website, Google Business Profile, and licensing registries.</li>
            <li><strong>Hyper-Local Service Area Pages:</strong> Generate automated landing pages for adjacent towns and suburbs you service (e.g. <code>/plumbing-maplewood-nj</code>).</li>
            <li><strong>Geotagged Jobsite Photos:</strong> Uploading 3–5 project photos weekly signals active local commercial activity to Google's ranking crawlers.</li>
          </ul>
        `
      }
    ]
  }
];

export const TRADE_PLAYBOOKS: TradePlaybook[] = [
  {
    id: 'plumbing',
    name: 'Plumbing',
    icon: 'Wrench',
    badge: 'Master Plumber Playbook',
    headline: 'Emergency Diagnostic Fees & Water Heater Replacements',
    description:
      'Standardized pricing for sewer camera inspections, emergency after-hours dispatches, and Good/Better/Best water heater packages.',
    keyWorkflows: [
      { title: 'Emergency Dispatch Fee', desc: 'Pre-authorize $149 diagnostic fee before rolling the truck.' },
      { title: '3-Tier Water Heater Quote', desc: 'Standard tank, hybrid high-efficiency, or tankless instant-hot packages.' },
      { title: 'Camera Inspection Add-On', desc: 'Attach video inspection clips directly to customer proposal links.' }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical',
    icon: 'Zap',
    badge: 'Master Electrician Playbook',
    headline: 'Panel Upgrades, EV Chargers & Whole-Home Rewiring',
    description:
      'Milestone deposit structures for 200A service panel upgrades, Level 2 EV charging circuits, and generator hookups.',
    keyWorkflows: [
      { title: 'Panel Upgrade Scope', desc: 'Break down utility disconnect, main panel, and permit pass-through fees.' },
      { title: 'EV Charger Installation', desc: 'Standardize 40A vs 50A breaker runs by distance from main panel.' },
      { title: 'Safety Inspection Checklist', desc: 'Deliver printable home electrical compliance report cards.' }
    ]
  },
  {
    id: 'roofing',
    name: 'Roofing',
    icon: 'Home',
    badge: 'Roofing Contractor Playbook',
    headline: 'Insurance Claim Supplements & Architectural Shingle Tiers',
    description:
      'Capture square footage estimates, aerial roof pitch measurements, and 3-option shingle replacement warranties.',
    keyWorkflows: [
      { title: '3-Tier Shingle Package', desc: '3-Tab Economy, Architectural Lifetime, and Premium Designer Shingles.' },
      { title: 'Decking Replacement Clause', desc: 'Standard per-sheet plywood replacement rates for rotted sub-roofing.' },
      { title: 'Lien Waiver Generation', desc: 'Issue unconditional partial and final lien waivers on progress draws.' }
    ]
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    icon: 'Trees',
    badge: 'Landscape Specialist Playbook',
    headline: 'Recurring Maintenance Agreements & Hardscape Proposals',
    description:
      'Automate monthly seasonal maintenance contracts, spring cleanups, and multi-stage patio hardscaping bids.',
    keyWorkflows: [
      { title: 'Recurring Monthly Billing', desc: 'Auto-charge credit cards on the 1st of every month for weekly lawn care.' },
      { title: 'Hardscape Progress Draw', desc: 'Collect 40% material deposit, 40% base prep draw, and 20% on completion.' },
      { title: 'Mulch & Bed Calculation', desc: 'Instant yards-of-mulch calculator embedded in client proposals.' }
    ]
  },
  {
    id: 'hvac',
    name: 'HVAC',
    icon: 'Hammer',
    badge: 'HVAC Contractor Playbook',
    headline: 'Seasonal Maintenance Clubs & Heat Pump Conversions',
    description:
      'Offer biannual system tune-up subscriptions, SEER2 efficiency tiers, and multi-zone mini-split packages.',
    keyWorkflows: [
      { title: 'Annual Maintenance Plan', desc: 'Subscription model for spring AC and fall heating tune-ups.' },
      { title: 'SEER2 Comparison Matrix', desc: 'Compare annual energy savings side-by-side on client approval screens.' },
      { title: 'Ductwork Inspection Add-On', desc: 'Upsell air quality filtration and duct sealing on equipment changeouts.' }
    ]
  }
];

export const DOWNLOADABLE_TEMPLATES: DownloadableTemplate[] = [
  {
    id: 'tpl-progress-deposit',
    name: 'Contractor Milestone Deposit Agreement',
    description: 'Printable 3-stage progress payment terms with mobilization and material release clauses.',
    fileSize: '48 KB',
    fileName: 'contractor-milestone-deposit-agreement.pdf'
  },
  {
    id: 'tpl-extra-work-order',
    name: 'On-Site Extra Work Order & Scope Change Form',
    description: 'Instant change order template with customer signature acknowledgment and material markup line items.',
    fileSize: '42 KB',
    fileName: 'extra-work-order-form.pdf'
  },
  {
    id: 'tpl-unconditional-lien-waiver',
    name: 'Progress & Final Unconditional Lien Waiver',
    description: 'Standard statutory lien release form for residential general contractors and trade subcontractors.',
    fileSize: '36 KB',
    fileName: 'lien-waiver-progress-final.pdf'
  }
];

export const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'quotes',
    question: 'How does instant quote approval work for homeowners?',
    answer:
      'Homeowners receive a private secure link via SMS and email. They can compare Good, Better, and Best options, select package upgrades, accept legal agreement terms, and pay their deposit via credit card or Apple Pay in under 60 seconds.'
  },
  {
    id: 'faq-2',
    category: 'messaging',
    question: 'What is 10DLC registration and why is it mandatory for SMS?',
    answer:
      '10DLC (10-Digit Long Code) is a telecommunications standard required by US carriers (AT&T, Verizon, T-Mobile) to eliminate spam. We guide you through automated brand verification using your legal EIN in Settings > SMS.'
  },
  {
    id: 'faq-3',
    category: 'payments',
    question: 'How fast do customer payments reach my bank account?',
    answer:
      'Credit card and debit card payments clear directly into your business checking account on a 2-business-day rolling schedule via Stripe Connect. First-time payouts have a one-time verification period of 5-7 business days.'
  },
  {
    id: 'faq-4',
    category: 'website',
    question: 'Can I use my existing domain name like maplewoodpros.com?',
    answer:
      'Yes. You can point your existing root domain or www subdomain to our cloud edge servers by adding an A record (76.76.21.21) and CNAME in your DNS registrar. SSL certificates are provisioned automatically.'
  },
  {
    id: 'faq-5',
    category: 'team',
    question: 'How do technician and crew permissions work?',
    answer:
      'Crew members with the Field Tech role only see the jobs and addresses dispatched directly to their schedule. Financial revenue reports, bank payouts, and client payment details remain restricted to Owners and Office Managers.'
  },
  {
    id: 'faq-6',
    category: 'billing',
    question: 'Is there a contract or can I cancel anytime?',
    answer:
      'All plans are month-to-month with no long-term lock-in. You can upgrade, downgrade, or cancel your subscription at any time directly in Settings > Billing.'
  }
];

export const SUPPORT_CHANNELS: SupportChannel[] = [
  {
    id: 'chan-ticket',
    name: 'Help Desk Ticket',
    icon: 'LifeBuoy',
    bestUsedFor: 'DNS setup, 10DLC carrier approvals, and custom account troubleshooting.',
    availability: 'Monday – Saturday (8:00 AM – 8:00 PM EST)',
    responseTarget: 'Target response in under 2 hours',
    prepareInfo: ['Company registered name', 'Account login email', 'Relevant quote or job number']
  },
  {
    id: 'chan-community',
    name: 'Knowledge Base & Guides',
    icon: 'BookCheck',
    bestUsedFor: 'Self-service setup, rate card formulas, and trade playbooks.',
    availability: 'Available 24/7/365',
    responseTarget: 'Instant step-by-step guides',
    prepareInfo: ['Search keywords in the AI Troubleshooter above']
  }
];
