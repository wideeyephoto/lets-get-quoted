/**
 * Help Center Data Definitions & Contractor Knowledge Base
 * Single source of truth for categories, trade playbooks, legal templates, and common fixes.
 */

export interface ArticleSource {
  title: string;
  url: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  readTime: string;
  audience?: string;
  category: string;
  lastUpdated?: string;
  lastReviewed?: string;
  applicableRegion?: string;
  author?: string;
  sources?: ArticleSource[];
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
  actionLabel?: string;
  actionTarget?: string;
}

export const LEGAL_TEMPLATES_DISCLAIMER =
  'These templates are starting points, not legal advice. Requirements vary by state and project. Have important agreements reviewed by a qualified local professional.';

// 6 Common-Fix Diagnostic Articles
export const COMMON_FIX_ARTICLES: Article[] = [
  {
    id: 'art-quote-send-troubleshooting',
    slug: 'quote-delivery-failures-quick-fix',
    title: 'Why Customer Quotes Fail to Deliver (and How to Fix Them in 2 Minutes)',
    category: 'Quoting',
    readTime: '2 min read',
    audience: 'Contractors & Estimators',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'US & Canada',
    author: 'LGQ Support & Estimating Engineering',
    sources: [
      { title: 'CTIA Messaging Principles & Best Practices', url: 'https://www.ctia.org' },
      { title: 'LGQ Quote Delivery Engine Overview', url: 'https://letsgetquoted.com/features/quotes' }
    ],
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
    slug: '10dlc-carrier-verification-pending-sms',
    title: 'Troubleshooting 10DLC Carrier Verification & Pending Text Messages',
    category: 'SMS & Messaging',
    readTime: '3 min read',
    audience: 'Owners & Administrators',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'US (10DLC Regulations)',
    author: 'LGQ Carrier Compliance Team',
    sources: [
      { title: 'The Campaign Registry 10DLC Guidelines', url: 'https://www.campaignregistry.com' },
      { title: 'FCC Consumer Texting Compliance', url: 'https://www.fcc.gov' }
    ],
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
    slug: 'stripe-payout-schedules-holds',
    title: 'Resolving Stripe Connect Deposit Schedules & Verification Holds',
    category: 'Payments & Banking',
    readTime: '3 min read',
    audience: 'Business Owners & Bookkeepers',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'US & Canada (Banking jurisdictions vary)',
    author: 'LGQ Payments & Billing Operations',
    sources: [
      { title: 'Stripe Connect Payout Documentation', url: 'https://docs.stripe.com/payouts' },
      { title: 'Stripe Express Identity Verification', url: 'https://support.stripe.com/express' }
    ],
    content: `
      <h3>Understanding Payout Timing &amp; Verification</h3>
      <p>Customer payments made via debit card, credit card, or ACH clear into your linked bank account via Stripe Connect. Deposit timing depends on your account age, country, payment method, and risk profile:</p>
      <ul>
        <li><strong>First Payout Timeline (7–14 Days):</strong> Stripe applies an initial 7 to 14-day holding period to your very first collected customer payment. This window is standard across payment processors to verify bank ownership, confirm business identity, and mitigate fraud risk.</li>
        <li><strong>Subsequent Rolling Schedule (2 Business Days in US):</strong> After initial account verification, subsequent card charges typically batch and transfer on a 2-business-day rolling schedule for standard US bank accounts. ACH direct debits typically take 4–5 business days to clear before payout.</li>
        <li><strong>Identity &amp; Document Verification:</strong> If a payout status is pending or held, open <em>Settings &gt; Payments &gt; Stripe Express Dashboard</em> to review whether a photo ID, tax document, or bank statement verification is required.</li>
        <li><strong>Weekend &amp; Holiday Banking Processing:</strong> Payments batched after Friday 5:00 PM ET bank cutoff windows roll over into Monday morning Federal Reserve processing.</li>
      </ul>
      <div class="calloutInfo">
        <strong>Official Documentation:</strong> For detailed country-specific payout schedules, instant payouts availability, and risk review guidelines, see <a href="https://docs.stripe.com/payouts" target="_blank" rel="noopener noreferrer">Stripe's Official Payout Documentation</a>.
      </div>
    `
  },
  {
    id: 'art-domain-offline-troubleshooting',
    slug: 'custom-domain-dns-ssl-troubleshooting',
    title: 'Fixing Custom Domain DNS Records & SSL Certificate Propagation',
    category: 'Custom Domains',
    readTime: '4 min read',
    audience: 'Administrators & Web Leads',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'Global DNS',
    author: 'LGQ Infrastructure & Edge Network',
    sources: [
      { title: 'Let’s Encrypt Certificate Automation Guide', url: 'https://letsencrypt.org/docs/' },
      { title: 'ICANN DNS Resolution Standards', url: 'https://www.icann.org' }
    ],
    content: `
      <h3>DNS Configuration Reference</h3>
      <p>To connect your own custom domain (e.g. <code>maplewoodplumbing.com</code>) to your contractor site:</p>
      <ol>
        <li>Log into your registrar (GoDaddy, Namecheap, Google Domains / Squarespace).</li>
        <li>Create an <strong>A Record</strong> with Host: <code>@</code> pointing to IP: <code>76.76.21.21</code>.</li>
        <li>Create a <strong>CNAME Record</strong> with Host: <code>www</code> pointing to <code>domains.letsgetquoted.com</code>.</li>
        <li>Remove any competing A records or domain parking redirects.</li>
      </ol>
      <h4>SSL Generation:</h4>
      <p>Our edge servers issue a free auto-renewing Let&apos;s Encrypt SSL certificate automatically once DNS propagation is verified.</p>
    `
  },
  {
    id: 'art-team-access-troubleshooting',
    slug: 'crew-login-role-permissions',
    title: 'Resolving Crew Sign-In Issues & Role Permission Settings',
    category: 'Team Management',
    readTime: '2 min read',
    audience: 'Owners & Field Managers',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'All Platforms',
    author: 'LGQ Identity & Security Team',
    sources: [
      { title: 'LGQ Role-Based Access Control Architecture', url: 'https://letsgetquoted.com/security' }
    ],
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
    slug: 'dispatched-job-missing-calendar',
    title: 'Why a Dispatched Job is Missing from the Crew Calendar',
    category: 'Scheduling & Dispatch',
    readTime: '2 min read',
    audience: 'Dispatchers & Technicians',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'All Platforms',
    author: 'LGQ Dispatch Operations Team',
    sources: [
      { title: 'LGQ Field Dispatch & Routing Overview', url: 'https://letsgetquoted.com/features/scheduling' }
    ],
    content: `
      <h3>Dispatch Synchronization Guide</h3>
      <p>When an approved quote or emergency service call is not showing on a technician&apos;s phone calendar:</p>
      <ul>
        <li><strong>Assigned Truck Filter:</strong> Verify the job has an assigned technician in the <em>Crew &amp; Equipment</em> dropdown. Unassigned jobs appear in the <em>Unscheduled Queue</em> on the left sidebar.</li>
        <li><strong>Confirmed Deposit Requirement:</strong> If your job setting requires a deposit before dispatch, the job remains in <em>Pending Approval</em> until Stripe confirms payment.</li>
        <li><strong>Timezone Alignment:</strong> Check that your company operating timezone in <em>Settings &gt; Profile</em> matches your local service territory.</li>
      </ul>
    `
  },
  {
    id: 'art-webhook-api-troubleshooting',
    slug: 'webhook-api-delivery-and-signature-troubleshooting',
    title: 'Troubleshooting Failed Webhook Deliveries & API Signature Verification',
    category: 'Developer & APIs',
    readTime: '3 min read',
    audience: 'Developers & Technical Admins',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'Global API',
    author: 'LGQ Platform API Engineering',
    sources: [
      { title: 'LGQ Developer API & OpenAPI 3.1 Documentation', url: 'https://letsgetquoted.com/api/v1/openapi.json' },
      { title: 'HMAC SHA-256 Webhook Verification Standards', url: 'https://tools.ietf.org/id/draft-ietf-httpbis-message-signatures-19.html' }
    ],
    content: `
      <h3>Diagnosing Failed Webhook Deliveries</h3>
      <p>If your webhook endpoint is not receiving real-time event feeds or deliveries show a failed status in <em>Settings &gt; Developer API</em>:</p>
      <ol>
        <li><strong>HTTPS Requirement:</strong> Webhook endpoints must use valid SSL/TLS HTTPS URLs. Localhost and private intranet IP ranges are blocked by edge SSRF guards.</li>
        <li><strong>10-Second Response Timeout:</strong> Your receiving server must return an HTTP <code>2xx</code> status code within 10 seconds. Long-running tasks should be queued asynchronously on your backend.</li>
        <li><strong>Consecutive Failure Circuit Breaker:</strong> Subscriptions with repeated 5xx errors or timeouts are paused automatically to protect server resources. After fixing the endpoint, click <em>Retry Delivery</em> in the dashboard.</li>
      </ol>
      <h4>HMAC Signature Verification:</h4>
      <p>Validate the <code>x-lgq-signature</code> header using your webhook secret to confirm the payload originated from Let’s Get Quoted and was not tampered with in transit.</p>
    `
  },
  {
    id: 'art-trash-recovery-troubleshooting',
    slug: 'recovering-deleted-records-from-trash',
    title: 'How to Restore Deleted Quotes, Leads, Clients, and Jobs from Trash',
    category: 'Account & Data Safety',
    readTime: '2 min read',
    audience: 'Owners & Office Staff',
    lastUpdated: 'August 2026',
    lastReviewed: 'August 2026',
    applicableRegion: 'All Workspaces',
    author: 'LGQ Data Integrity & Security Team',
    sources: [
      { title: 'LGQ Data Retention & Soft Deletion Lifecycle', url: 'https://letsgetquoted.com/security' }
    ],
    content: `
      <h3>30-Day Soft Deletion Grace Period</h3>
      <p>When a team member accidentally deletes a lead, draft quote, client profile, or job, the record is safely moved to the <strong>Trash</strong> workspace rather than being permanently destroyed.</p>
      <ol>
        <li>Navigate to <em>Dashboard &gt; Trash</em> in the sidebar.</li>
        <li>Filter by record type (Leads, Quotes, Jobs, or Clients) or search by customer name.</li>
        <li>Click <strong>Restore Record</strong> to instantly return the item to its original pipeline stage with all historical photos, notes, and timecards intact.</li>
      </ol>
      <h4>Permanent Deletion Schedule:</h4>
      <p>Records remain recoverable in Trash for <strong>30 days</strong>. After 30 days, soft-deleted records are permanently purged according to compliance retention rules.</p>
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
        slug: 'contractor-onboarding-checklist',
        title: 'Complete 10-Minute Onboarding Checklist for Contractors',
        category: 'Setup',
        readTime: '4 min read',
        audience: 'New Users',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US & Canada',
        author: 'LGQ Onboarding & Customer Success',
        sources: [
          { title: 'LGQ Quick Start Onboarding Hub', url: 'https://letsgetquoted.com/how-it-works' }
        ],
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
            <li><strong>Stripe Connect Banking:</strong> Link your business checking account in <em>Settings &gt; Payments</em> to enable automated card and bank deposits directly to your bank account.</li>
            <li><strong>Install Mobile PWA:</strong> Open <code>app.letsgetquoted.com</code> on your iPhone (Safari &gt; Share &gt; Add to Home Screen) or Android (Chrome &gt; Install App) for 1-tap truck dispatch.</li>
          </ol>
        `
      },
      {
        id: 'art-markup-pricing',
        slug: 'labor-rates-margin-markup-calculator',
        title: 'Configuring Hourly Rates, Overhead Multipliers, and Material Markup',
        category: 'Setup',
        readTime: '5 min read',
        audience: 'Owners & Estimators',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Standard Accounting',
        author: 'LGQ Estimating & Pricing Advisory',
        sources: [
          { title: 'Small Business Administration Financial Formula Guidelines', url: 'https://www.sba.gov' },
          { title: 'LGQ Hourly Rate & Margin Calculator', url: 'https://letsgetquoted.com/tools/hourly-rate-calculator' }
        ],
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
        slug: 'connect-custom-domain-ssl-guide',
        title: 'Connecting Custom Domains & Free SSL Setup Guide',
        category: 'Setup',
        readTime: '4 min read',
        audience: 'Admins',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Global DNS',
        author: 'LGQ Web & Edge Network Team',
        sources: [
          { title: 'Let’s Encrypt Certificate Automation Standards', url: 'https://letsencrypt.org' }
        ],
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
                <td><code>domains.letsgetquoted.com</code></td>
                <td>Automatic / 3600</td>
              </tr>
            </tbody>
          </table>

          <div class="calloutInfo">
            <strong>Automatic SSL Provisioning:</strong> Once DNS records propagate and are verified, our cloud edge automatically provisions and renews a free 256-bit Let's Encrypt SSL certificate.
          </div>
        `
      },
      COMMON_FIX_ARTICLES[7]
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
        slug: '3-tier-good-better-best-proposals',
        title: 'How to Build High-Converting 3-Option Proposals (Good / Better / Best)',
        category: 'Quoting',
        readTime: '5 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US & Canada',
        author: 'LGQ Sales & Estimating Engineering',
        sources: [
          { title: 'Behavioral Pricing & Decoy Effect in Field Services', url: 'https://letsgetquoted.com/tools/estimate-generator' }
        ],
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
        slug: 'mobile-extra-work-change-orders',
        title: 'Issuing On-Site Extra Work Orders & Instant Client Approvals',
        category: 'Quoting',
        readTime: '4 min read',
        audience: 'Field Techs',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US Construction Law',
        author: 'LGQ Legal & Field Workflow Team',
        sources: [
          { title: 'American Institute of Architects Change Order Principles', url: 'https://www.aia.org' }
        ],
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
        slug: 'automated-quote-followup-sequences',
        title: 'Setting Up 24-Hour & 72-Hour Quote Follow-Up Sequences',
        category: 'SMS & Messaging',
        readTime: '4 min read',
        audience: 'Sales & Dispatch',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US & Canada SMS Standards',
        author: 'LGQ Automation & Messaging Team',
        sources: [
          { title: 'CTIA Consumer Messaging Guidelines', url: 'https://www.ctia.org' }
        ],
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
        slug: 'automated-google-review-requests',
        title: 'Automated 5-Star Google Review Requests Upon Job Completion',
        category: 'SMS & Messaging',
        readTime: '3 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Google Business Profile Policy',
        author: 'LGQ Reputation Management Team',
        sources: [
          { title: 'Google Business Profile Review Policy & Guidelines', url: 'https://support.google.com/business/answer/3474122' },
          { title: 'FTC Endorsement and Review Guidelines', url: 'https://www.ftc.gov' }
        ],
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
      },
      {
        id: 'art-ai-voice-receptionist-guide',
        slug: '24-7-ai-phone-receptionist-and-voice-setup',
        title: 'Setting Up 24/7 AI Phone Answering and Sub-60-Second Missed-Call Texts',
        category: 'SMS & Messaging',
        readTime: '4 min read',
        audience: 'Owners & Dispatchers',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US & Canada',
        author: 'LGQ Voice Intelligence Team',
        sources: [
          { title: 'LGQ AI Voice Receptionist Architecture', url: 'https://letsgetquoted.com/features/ai-intake' }
        ],
        content: `
          <h3>Capturing Inbound Phone Leads 24/7</h3>
          <p>Never lose a high-value emergency job while you are on a ladder or driving between job sites. The AI Voice receptionist greets callers, gathers project requirements, and books consultations around the clock.</p>

          <h3>Speed-to-Lead Missed-Call Follow-Ups</h3>
          <p>When a homeowner calls your business line and hangs up before speaking with someone, Let’s Get Quoted automatically triggers a personalized text within <strong>60 seconds</strong> containing your instant quote link.</p>

          <h3>Key Voice Receptionist Capabilities:</h3>
          <ul>
            <li><strong>Live Audio Recordings &amp; Transcripts:</strong> Review audio recordings and structured caller summaries directly from <em>Dashboard &gt; Voice Calls</em>.</li>
            <li><strong>1-Click Lead Conversion:</strong> Convert any call transcript into an active lead with pre-filled scope notes in one click.</li>
            <li><strong>Emergency Escalation:</strong> Route true emergency repair calls directly to the owner’s mobile number based on custom keyword triggers.</li>
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
        slug: 'milestone-deposits-progress-billing',
        title: 'Enforcing 30% / 50% Milestone Deposits Prior to Job Dispatch',
        category: 'Payments',
        readTime: '4 min read',
        audience: 'Estimators',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US Residential Construction',
        author: 'LGQ Billing & Cash Flow Operations',
        sources: [
          { title: 'National Association of State Contractors Licensing Agencies', url: 'https://www.nascla.org' }
        ],
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
        slug: 'credit-card-surcharge-compliance-fees',
        title: 'Passing Credit Card Processing Fees Compliantly by State Law',
        category: 'Payments',
        readTime: '4 min read',
        audience: 'Owners',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US (State & Federal rules apply)',
        author: 'LGQ Compliance & Payment Operations',
        sources: [
          { title: 'Visa Core Rules & Surcharging Standards', url: 'https://usa.visa.com/support/small-business/regulations-fees.html' },
          { title: 'Mastercard Merchant Rules on Surcharging', url: 'https://www.mastercard.us/en-us/business/overview/support/merchant-surcharge-rules.html' },
          { title: 'Consumer Financial Protection Bureau Guidance', url: 'https://www.consumerfinance.gov' }
        ],
        content: `
          <h3>Credit Card Surcharging Rules, Convenience Fees &amp; ACH</h3>
          <p>Credit card processing fees (typically 2.9% + 30¢) can represent significant overhead on large residential jobs. Contractors often pass processing fees to customers or offer zero-fee ACH bank transfers. However, surcharging is subject to strict state laws and card network rules.</p>

          <h3>Key Compliance Requirements:</h3>
          <ul>
            <li><strong>State-Specific Prohibitions &amp; Restrictions:</strong> Credit card surcharging is prohibited or heavily restricted by statute in several jurisdictions (including Connecticut, Massachusetts, Maine, and New York under specific disclosure rules). Check your specific state and municipal commercial regulations before enabling surcharges.</li>
            <li><strong>Network Surcharge Caps:</strong> Major card networks (Visa, Mastercard) cap credit card surcharges at your actual cost of card acceptance or a maximum of 3% (whichever is lower). Surcharging debit cards is strictly prohibited nationwide under federal law (Dodd-Frank Act).</li>
            <li><strong>Pre-Transaction Disclosure:</strong> Surcharges must be clearly disclosed at your point of entry and on proposal quote summaries before the customer submits payment.</li>
            <li><strong>Zero-Fee ACH Bank Transfers:</strong> For large residential projects (over $2,000), offering direct bank-to-bank ACH transfers eliminates high card percentage fees while remaining fully compliant nationwide.</li>
          </ul>

          <div class="calloutWarning">
            <strong>Legal Disclaimer:</strong> This guide is for educational and operational information only and does not constitute formal legal or financial advice. Surcharging laws evolve frequently across jurisdictions. Consult with qualified legal counsel or your CPA regarding local commercial compliance.
          </div>
        `
      },
      {
        id: 'art-receipt-ocr-expense-tracking',
        slug: 'mobile-receipt-capture-and-expense-tracking',
        title: 'Snapping Material Receipts with AI OCR for Real-Time Job Costing',
        category: 'Payments & Accounting',
        readTime: '3 min read',
        audience: 'Owners, Estimators & Crew',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Standard Job Costing',
        author: 'LGQ Job Costing & Operations Team',
        sources: [
          { title: 'Construction Financial Management Association Job Costing Guidelines', url: 'https://cfma.org' }
        ],
        content: `
          <h3>Tracking True Job Costs from the Field</h3>
          <p>Profitable contracting depends on knowing your real material spend before sending the final invoice. Mobile receipt scanning removes lost paper slips and automates expense tracking.</p>

          <h3>How AI Receipt OCR Works:</h3>
          <ol>
            <li><strong>Snap the Register Receipt:</strong> In the mobile Field App, tap <em>Add Expense &gt; Scan Receipt</em> and snap a photo of the supply house slip.</li>
            <li><strong>Automatic Field Extraction:</strong> AI OCR automatically extracts the supplier name, purchase date, itemized materials, and sales tax.</li>
            <li><strong>Job &amp; Category Mapping:</strong> Select the active Job ID and cost category (Materials, Equipment Rental, Permits, Dump Fees).</li>
          </ol>

          <div class="calloutSuccess">
            <strong>Live Gross Margin Tracking:</strong> Logged expenses instantly update your job scorecard, comparing actual direct costs against quoted prices to protect your profit margin.
          </div>
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
        slug: 'route-density-neighborhood-dispatching',
        title: 'Optimizing Route Density & Grouping Jobs by Neighborhood',
        category: 'Team Management',
        readTime: '4 min read',
        audience: 'Dispatchers',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Field Operations',
        author: 'LGQ Fleet & Route Logistics Team',
        sources: [
          { title: 'LGQ Smart Dispatch & Scheduling Suite', url: 'https://letsgetquoted.com/features/scheduling' }
        ],
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
        slug: 'local-seo-ranking-landing-pages',
        title: 'How Local Service Landing Pages Rank on Google Search & Maps',
        category: 'Website & SEO',
        readTime: '5 min read',
        audience: 'Marketing Leads',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'United States & Global Search',
        author: 'LGQ SEO & Platform Team',
        sources: [
          { title: 'Google Business Profile Local Ranking Guidance', url: 'https://support.google.com/business/answer/7091' },
          { title: 'Schema.org LocalBusiness Structured Data', url: 'https://schema.org/LocalBusiness' }
        ],
        content: `
          <h3>How Local Service Landing Pages Rank on Google Search &amp; Maps</h3>
          <p>When high-intent homeowners search for residential contractors on Google (e.g. <em>"emergency plumber near me"</em>), Google evaluates three core ranking pillars:</p>
          <ol>
            <li><strong>Relevance:</strong> How closely your business profile and website match what the user is searching for. Having clear service descriptions, detailed service-area pages, and accurate categories ensures Google understands your specialties.</li>
            <li><strong>Distance:</strong> How far each potential search result is from the location term used in the search or the user's GPS location.</li>
            <li><strong>Prominence:</strong> How well known and reputable a business is, evaluated through online reviews, rating volume, citations, structured data markup, and active business profile updates.</li>
          </ol>

          <h3>Key Implementation Practices for Contractors:</h3>
          <ul>
            <li><strong>Schema.org LocalBusiness Microdata:</strong> Built-in JSON-LD structured data communicates your verified business name, license credentials, operating territory, and service offerings directly to search engine crawlers.</li>
            <li><strong>NAP Consistency:</strong> Ensure your legal Name, physical Address, and Phone number are formatted identically across your website, Google Business Profile, state licensing databases, and local directories.</li>
            <li><strong>Dedicated Service-Area Pages:</strong> Create high-quality, localized landing pages for the adjacent towns and municipalities you serve (e.g. <code>/plumbing-maplewood-nj</code>) with unique localized copy and real project references.</li>
            <li><strong>Authentic Project Photos &amp; Customer Reviews:</strong> Regularly posting authentic jobsite photos and collecting verified customer reviews builds consumer trust and signals ongoing business activity to prominence algorithms. (Note: Search engines strip photo EXIF/GPS metadata upon upload; authentic engagement and review velocity drive prominence).</li>
          </ul>
          <div class="calloutInfo">
            <strong>Google Guidance:</strong> For official criteria on improving local ranking, review <a href="https://support.google.com/business/answer/7091" target="_blank" rel="noopener noreferrer">Google's How to Improve Your Local Ranking on Google</a>.
          </div>
        `
      }
    ]
  },
  {
    id: 'cat-developer-integrations',
    topic: 'developer',
    title: 'Developer API, Webhooks & Integrations',
    desc: 'Public API tokens, OpenAPI 3.1 schema, webhook HMAC signatures, and QuickBooks sync.',
    icon: 'Terminal',
    articles: [
      COMMON_FIX_ARTICLES[6],
      {
        id: 'art-api-tokens-webhooks-guide',
        slug: 'developer-api-tokens-and-webhooks-guide',
        title: 'How to Generate Scoped API Tokens and Configure Webhook Feeds',
        category: 'Developer & APIs',
        readTime: '4 min read',
        audience: 'Technical Leads & Developers',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'Global API',
        author: 'LGQ Platform API Engineering',
        sources: [
          { title: 'LGQ OpenAPI 3.1 Specification', url: 'https://letsgetquoted.com/api/v1/openapi.json' }
        ],
        content: `
          <h3>Automating Your Business with the Developer API</h3>
          <p>Let’s Get Quoted provides a Public API and real-time webhook engine allowing you to connect custom CRMs, accounting systems, Zapier, Make, and internal servers.</p>

          <h3>Generating Your Secret API Token</h3>
          <ol>
            <li>Navigate to <strong>Settings &gt; Developer API &amp; Webhooks</strong>.</li>
            <li>Click <strong>Generate New Token</strong>, choose a label, and assign role scopes (e.g. <code>leads:read</code>, <code>leads:write</code>, <code>webhooks:manage</code>).</li>
            <li>Copy your <code>lgq_live_...</code> secret key immediately. For security, full keys are never shown again after creation.</li>
          </ol>

          <h3>Subscribing to Real-Time Webhooks</h3>
          <p>Register an HTTPS endpoint to receive instant JSON notifications for events like <code>lead.created</code>, <code>quote.signed</code>, and <code>invoice.paid</code>. Validate the <code>x-lgq-signature</code> HMAC SHA-256 header on your server to verify payload authenticity.</p>
        `
      },
      {
        id: 'art-quickbooks-sync-guide',
        slug: 'quickbooks-online-two-way-sync-guide',
        title: 'Connecting QuickBooks Online: Automatic Invoices, Payments, and Chart of Accounts',
        category: 'Integrations & Accounting',
        readTime: '4 min read',
        audience: 'Owners & Bookkeepers',
        lastUpdated: 'August 2026',
        lastReviewed: 'August 2026',
        applicableRegion: 'US Accounting Standards',
        author: 'LGQ Financial Operations Team',
        sources: [
          { title: 'Intuit Developer QuickBooks Online Sync Standards', url: 'https://developer.intuit.com' }
        ],
        content: `
          <h3>Automating Bookkeeping with QuickBooks Online</h3>
          <p>Eliminate double-entry bookkeeping by syncing invoices, customer records, and settled payments directly to your QuickBooks Online company file.</p>

          <h3>Setting Up the 2-Way Sync:</h3>
          <ol>
            <li>Navigate to <strong>Settings &gt; Integrations &amp; Export</strong> and click <strong>Connect to QuickBooks</strong>.</li>
            <li>Sign in with your Intuit credentials and authorize Let’s Get Quoted.</li>
            <li>Map your chart of accounts: assign default Income Accounts for service revenue and Expense Accounts for Stripe processing fees.</li>
          </ol>

          <div class="calloutSuccess">
            <strong>Automatic Reconciliation:</strong> When an invoice is paid online via Stripe, Let’s Get Quoted creates the corresponding customer payment in QuickBooks and net-records processing fees for 1-click bank reconciliation.
          </div>
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
      'Stripe Connect processes your first customer payment within an initial 7–14 business day verification period to confirm banking details. After initial verification, US card payments transfer on a standard 2-business-day rolling schedule into your linked checking account.'
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
  },
  {
    id: 'faq-7',
    category: 'developer',
    question: 'Can I connect my CRM, Zapier, or custom software with the API?',
    answer:
      'Yes. Let’s Get Quoted provides a Public API and real-time webhook engine with an OpenAPI 3.1 schema. You can generate scoped API tokens in Settings > Developer API and subscribe to real-time events for leads, signed quotes, and paid invoices.'
  },
  {
    id: 'faq-8',
    category: 'safety',
    question: 'What happens if I accidentally delete a quote, job, or client?',
    answer:
      'Deleted items are safely stored in your Trash workspace for 30 days. You can browse to Dashboard > Trash to search and restore any record with complete historical photos, notes, and activity timeline intact.'
  }
];

export const SUPPORT_CHANNELS: SupportChannel[] = [
  {
    id: 'chan-ticket',
    name: 'Help Desk Ticket',
    icon: 'LifeBuoy',
    bestUsedFor: 'DNS setup, 10DLC carrier approvals, and custom account troubleshooting.',
    availability: 'Monday – Saturday (8:00 AM – 8:00 PM ET)',
    responseTarget: 'Target response in under 2 hours',
    prepareInfo: ['Company registered name', 'Account login email', 'Relevant quote or job number'],
    actionLabel: 'Open Support Ticket'
  },
  {
    id: 'chan-community',
    name: 'Knowledge Base & Guides',
    icon: 'BookCheck',
    bestUsedFor: 'Self-service setup, rate card formulas, and trade playbooks.',
    availability: 'Available 24/7/365',
    responseTarget: 'Instant step-by-step guides',
    prepareInfo: ['Search keywords in the AI Troubleshooter above'],
    actionLabel: 'Browse Guides',
    actionTarget: '#knowledge-hub'
  }
];

/**
 * Helper to get all articles as a single flat array
 */
export function getAllArticles(): Article[] {
  const map = new Map<string, Article>();
  COMMON_FIX_ARTICLES.forEach(a => map.set(a.id, a));
  KNOWLEDGE_BASE.forEach(cat => cat.articles.forEach(a => map.set(a.id, a)));
  return Array.from(map.values());
}

/**
 * Helper to find article by slug or id
 */
export function findArticleBySlugOrId(slugOrId: string): Article | undefined {
  return getAllArticles().find(a => a.slug === slugOrId || a.id === slugOrId);
}
