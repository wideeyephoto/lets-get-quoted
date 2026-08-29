export type ManualFieldNotes = {
  useWhen: string;
  bestPractice: string;
  watchFor: string;
  completionChecks: [string, string, string];
};

export const MANUAL_FIELD_NOTES: Record<string, ManualFieldNotes> = {
  'first-30-minutes': {
    useWhen: 'The workspace is new, has changed owners, or needs a clean readiness check before real customer work begins.',
    bestPractice: 'Test one complete lead-to-payment path with clearly labeled sample data before inviting the whole team.',
    watchFor: 'Turning on every automation at once can hide which prerequisite or message caused an issue.',
    completionChecks: [
      'Business identity, location, and customer-facing contact details are accurate.',
      'At least one lead, quote, and payment path has been tested safely.',
      'The people doing office and field work can reach only the areas they need.',
    ],
  },
  'navigate-the-dashboard': {
    useWhen: 'You or a teammate is learning where work lives, switching between desktop and mobile, or choosing a faster daily view.',
    bestPractice: 'Start from the workflow group in the sidebar, then choose the view that matches the decision you need to make.',
    watchFor: 'A badge is an attention signal, not a complete measure of workload or business health.',
    completionChecks: [
      'You can find each primary workspace without relying on browser history.',
      'You know when to use Inbox, Board, Table, calendar, and mobile navigation.',
      'You can use global actions without losing the record you were working on.',
    ],
  },
  'understand-dashboard-priorities': {
    useWhen: 'You are opening the dashboard at the start of a shift or deciding which customer, job, or cash issue deserves attention first.',
    bestPractice: 'Resolve customer-waiting and same-day operational risks before reviewing trend cards and longer-range recommendations.',
    watchFor: 'Totals can look healthy while one overdue response, blocked job, or failed payment still needs immediate action.',
    completionChecks: [
      'Every urgent customer-waiting item has an owner or a next action.',
      'Today’s schedule and readiness warnings have been reviewed.',
      'Cash and performance signals have been read in the context of their date range.',
    ],
  },
  'business-profile-and-locations': {
    useWhen: 'You are setting up the account, adding a location, moving, rebranding, or correcting information customers see.',
    bestPractice: 'Treat legal, service-area, reply-to, and public website details as separate facts and verify each at the source.',
    watchFor: 'Using a mailing address as a service location can distort routing, booking, and customer expectations.',
    completionChecks: [
      'Business name, contact details, trade, and timezone match current operations.',
      'Every active location has a correct address and service purpose.',
      'Public website and message details were previewed after the change.',
    ],
  },
  'roles-permissions-and-feature-readiness': {
    useWhen: 'A teammate cannot see a control, a feature appears unavailable, or you are deciding what access a new person should receive.',
    bestPractice: 'Grant access from job responsibility outward and review it whenever someone changes roles.',
    watchFor: 'Plan entitlement, account configuration, server role gates, and operational readiness are different gates.',
    completionChecks: [
      'Each teammate has the appropriate role and access level that supports their work.',
      'Feature prerequisites are complete before the feature is described as live.',
      'A second account with the affected role has been used to confirm the experience.',
    ],
  },
  'manage-the-lead-inbox': {
    useWhen: 'New requests are arriving, response work is getting buried, or the active lead queue no longer reflects reality.',
    bestPractice: 'Keep one primary view for the active queue and use snooze or archive rather than deleting valid past contacts.',
    watchFor: 'Deleting a lead is irreversible and permanently removes all stored inspection and intake photos.',
    completionChecks: [
      'New leads have an assigned owner and an initial response.',
      'Qualified work moves to quote or appointment stage without stalling.',
      'Closed, snoozed, or duplicate leads are cleared from the primary view.',
    ],
  },
  'qualify-and-contact-a-lead': {
    useWhen: 'A lead looks promising, details are missing, or you need to decide between a fast phone estimate and an on-site visit.',
    bestPractice: 'Ask the minimum qualifying questions that determine fit before spending time on complex estimates.',
    watchFor: 'Fast responses win jobs, but skipping address or scope verification can lead to under-quoted proposals.',
    completionChecks: [
      'Customer identity, service location, and core scope are documented.',
      'The lead has a clear status and assigned team member.',
      'Next step is booked or communicated with the homeowner.',
    ],
  },
  'schedule-estimate-and-start-date-options': {
    useWhen: 'An on-site visit is required, an estimator needs dispatching, or a customer wants a tentative start window held.',
    bestPractice: 'Give homeowners arrival windows rather than rigid times to accommodate traffic and job variability.',
    watchFor: 'Holding multiple overlapping start dates without confirmation can cause crew dispatch bottlenecks.',
    completionChecks: [
      'Estimate visit is placed on the calendar with assigned estimator.',
      'Customer received automated arrival window SMS confirmation.',
      'Tentative start dates are clearly labeled as provisional pending quote sign-off.',
    ],
  },
  'build-and-send-a-quote': {
    useWhen: 'You have gathered job requirements and need to present a professional, legally binding proposal to a homeowner.',
    bestPractice: 'Include clear scope inclusions, exclusions, good/better/best options, and required deposit amounts.',
    watchFor: 'Editing a sent quote voids the previous link and permanently deletes attached draft jobs, costs, and invoices.',
    completionChecks: [
      'All line items, quantities, rates, and deposit requirements are verified.',
      'Stripe Connect is connected and active before sending to client.',
      'Quote link is delivered via SMS and email with interactive approval enabled.',
    ],
  },
  'understand-the-customer-approval-flow': {
    useWhen: 'A customer is reviewing a proposal, asking clarifying scope questions, or ready to sign and submit a deposit.',
    bestPractice: 'Monitor quote question alerts closely and respond immediately while the buyer intent is high.',
    watchFor: 'Approval is interactive; customers may select optional upgrades or submit clarifying questions before signing.',
    completionChecks: [
      'Customer signature and deposit authorization are logged in the quote audit trail.',
      'Quote status automatically updates to Approved upon deposit payment.',
      'Linked Job file is generated automatically with approved scope items.',
    ],
  },
  'manage-the-job-workspace': {
    useWhen: 'Work has been sold and you need to coordinate execution, assign crew, track milestones, and log job costs.',
    bestPractice: 'Log labor hours and material receipts directly into the job workspace as they occur to monitor gross margins.',
    watchFor: 'Deleting a job cannot be undone and permanently erases all logged costs, time records, and milestone history.',
    completionChecks: [
      'Job milestones, site address, and customer contact info are current.',
      'Assigned crew members can see the job in their mobile field app.',
      'Direct costs and receipts are logged against the job file.',
    ],
  },
  'schedule-work-from-the-queue': {
    useWhen: 'Approved jobs are waiting in the queue, appointments need dispatching, or incoming booking requests need review.',
    bestPractice: 'Enable weather alerts in schedule settings to anticipate rain delays and group jobs geographically.',
    watchFor: 'Declining a customer booking request immediately sends an unrecallable cancellation text to the customer.',
    completionChecks: [
      'Unscheduled jobs are slotted onto the master dispatch calendar.',
      'Weather alerts are toggled on in Schedule Settings (/dashboard/schedule#settings).',
      'Customers receive automated booking confirmation and arrival notices.',
    ],
  },
  'plan-a-day-and-dispatch-crew': {
    useWhen: 'Organizing tomorrow’s field schedule, balancing workload across trucks, or communicating site instructions to crew.',
    bestPractice: 'Review drive times between job sites and provide gate codes and parking instructions in job notes.',
    watchFor: 'Unpublished schedule changes will not sync to technician mobile devices.',
    completionChecks: [
      'Technicians have balanced daily route assignments.',
      'Job site access notes, gate codes, and customer phone numbers are verified.',
      'Schedule is published and synced to the /field mobile app.',
    ],
  },
  'document-work-and-change-orders': {
    useWhen: 'Site conditions change, unexpected repairs are discovered, or before/after photos need to be recorded.',
    bestPractice: 'Use in-app voice notes and site photos to document defects before beginning additional work.',
    watchFor: 'Performing extra work without a signed change order risks non-payment and margin erosion.',
    completionChecks: [
      'Before/after photos and voice notes are attached to the job record.',
      'Change order scope and pricing are agreed upon with the customer.',
      'Customer digital signature is captured on the change order approval link.',
    ],
  },
  'manage-recurring-jobs': {
    useWhen: 'Setting up recurring maintenance agreements, seasonal tune-ups, or ongoing commercial service contracts.',
    bestPractice: 'Define clear recurrence intervals and automate reminder notices 7 days before each visit.',
    watchFor: 'Pausing a contract should clearly communicate whether pending invoices are held or processed.',
    completionChecks: [
      'Recurring service rules and intervals are configured in the client record.',
      'Upcoming visits populate automatically in the dispatch queue.',
      'Customer receives automated appointment reminders prior to each service cycle.',
    ],
  },
  'manage-client-records': {
    useWhen: 'Maintaining customer profiles, adding multiple property addresses, or managing duplicate records.',
    bestPractice: 'Designate the primary contact and property address accurately for multi-site commercial clients.',
    watchFor: 'Merging clients deletes duplicate profiles and detaches warranties; blocking a contact cannot be undone in the UI.',
    completionChecks: [
      'Client contact information, service properties, and equipment tags are accurate.',
      'Past quote and invoice history is properly linked to the master record.',
      'Owner clearance is used for destructive merge, delete, or portal revocation actions.',
    ],
  },
  'work-the-customer-text-inbox': {
    useWhen: 'Handling live customer inquiries, coordinating technician arrival, or answering quote questions via SMS.',
    bestPractice: 'Respond promptly to customer texts and use photos to clarify repair details.',
    watchFor: 'When a customer texts STOP, clicking Save in the dashboard will NOT re-opt them; they must text START from their phone.',
    completionChecks: [
      'Customer conversation history is organized in unified message threads.',
      'Opt-out status is respected and never overridden manually without an incoming START text.',
      'Team members are assigned to follow up on open customer questions.',
    ],
  },
  'set-up-business-texting': {
    useWhen: 'Registering a dedicated business number, completing 10DLC brand compliance, or activating SMS messaging.',
    bestPractice: 'Ensure company legal name matches IRS documentation exactly to expedite carrier verification.',
    watchFor: 'Operating without verified 10DLC registration risks carrier message filtering and delivery failures.',
    completionChecks: [
      'Legal business name, address, and EIN are verified in Settings → Business.',
      '10DLC carrier registration is approved and active.',
      'Test SMS sent from the dashboard delivers successfully to a mobile phone.',
    ],
  },
  'turn-on-the-customer-portal': {
    useWhen: 'Enabling self-service customer access for viewing estimates, paying invoices, and reviewing service records.',
    bestPractice: 'Enable the customer portal on the Automations page and verify the Client Login button appears on your site.',
    watchFor: 'Toggling the portal master switch off immediately strips the Client Login button from your public website header.',
    completionChecks: [
      'Customer Portal master toggle is turned on in Automations (#client-portal).',
      'Client Login link is visible and functional in the live website header.',
      'Homeowner can sign in via passwordless magic link to view quotes and pay invoices.',
    ],
  },
  'set-up-your-own-text-alerts': {
    useWhen: 'Configuring instant mobile text alerts for incoming leads, quote approvals, payments, or emergency repairs.',
    bestPractice: 'Verify your Owner Alert Phone number and select high-priority triggers for instant mobile dispatch.',
    watchFor: 'Incorrect mobile number formatting or missing verification codes will prevent alert delivery.',
    completionChecks: [
      'Owner Alert Phone is saved and verified in Settings → Alerts.',
      'Lead, payment, and urgent message notification toggles are active.',
      'Test lead submission generates an immediate SMS alert on your mobile phone.',
    ],
  },
  'manage-crew-and-field-access': {
    useWhen: 'Onboarding new technicians, sending magic link invites, setting labor rates, or updating field roles.',
    bestPractice: 'Send crew invites via emailed magic links and guide technicians to bookmark /field on their mobile browser.',
    watchFor: 'Crew members should be invited with the Crew role to prevent access to financial reporting.',
    completionChecks: [
      'Field technicians are added with accurate contact info and labor rates.',
      'Crew members receive their emailed magic link and sign in to /field.',
      'Technicians can view their assigned jobs and timecard punch controls.',
    ],
  },
  'run-the-field-workflow': {
    useWhen: 'Guiding technicians through daily clock-in, job navigation, in-app voice notes, and offline task completion.',
    bestPractice: 'Use the 🎙️ Voice Note button in /field/jobs/[id] to dictate site observations directly into job files.',
    watchFor: 'Offline queue items older than 12 hours are permanently refused by server sync; always sync before shift end.',
    completionChecks: [
      'Technician can clock in and view assigned job details in /field.',
      'In-app voice notes and milestone checklists sync properly to the job file.',
      'Technician clocks out at the end of the shift with captured hours recorded.',
    ],
  },
  'review-timecards-and-pay': {
    useWhen: 'Auditing crew shift punches, approving weekly pay periods, and exporting labor data for payroll processing.',
    bestPractice: 'Review open shifts and resolve anomaly flags before clicking Approve Pay Period.',
    watchFor: 'The payroll CSV export includes hourly shift punches and deliberately excludes salaried employees.',
    completionChecks: [
      'All open shifts are closed with verified start and end times.',
      'Pay period is approved with locked audit records.',
      'Payroll CSV export is generated and verified for accounting upload.',
    ],
  },
  'manage-subcontractor-coverage': {
    useWhen: 'Tracking 1099 trade partners, uploading Certificates of Insurance (COI), and managing policy expirations.',
    bestPractice: 'Set 30-day automated COI expiration alerts to ensure active liability coverage before dispatch.',
    watchFor: 'Dispatching uninsured subcontractors creates substantial legal and financial exposure.',
    completionChecks: [
      'Subcontractor contact profiles and trade specialties are recorded.',
      'Certificate of Insurance PDFs are uploaded with valid expiration dates.',
      'Automated COI renewal alerts are configured in Crew settings.',
    ],
  },
  'install-the-field-app-and-work-without-signal': {
    useWhen: 'Setting up the mobile web app on technician phones and working in basements or remote areas with no cell signal.',
    bestPractice: 'Add the app to the mobile home screen via Safari or Chrome for seamless full-screen operation.',
    watchFor: 'Offline queue entries must be synced within 12 hours of creation; older entries are permanently rejected.',
    completionChecks: [
      'Field app is installed on mobile home screen as a Progressive Web App.',
      'Offline indicator displays correctly when mobile data is disconnected.',
      'Offline job notes and time punches sync immediately upon reconnecting to signal.',
    ],
  },
  'connect-stripe-and-get-paid': {
    useWhen: 'Setting up merchant payment processing, reviewing platform transaction fees, or reconciling bank payouts.',
    bestPractice: 'Understand your plan fee basis (discount-adjusted subtotal before tax/tips) and separate Stripe fees.',
    watchFor: 'Platform fees range from 1.25% (Flex) down to 0.10% (Scale); fee rates lock at checkout creation.',
    completionChecks: [
      'Stripe Connect account is connected with active payout status.',
      'Platform fee rates and separate Stripe processing fees are understood.',
      'Test card transaction processes and displays in the Payments ledger.',
    ],
  },
  'create-and-send-an-invoice': {
    useWhen: 'Billing customers for completed projects, milestone stages, or service repairs with 1-tap payment links.',
    bestPractice: 'Generate invoices directly from approved job scopes with deposits automatically subtracted.',
    watchFor: 'Sending invoices with missing line item descriptions or incorrect sales tax rates.',
    completionChecks: [
      'Invoice line items, sales tax, and previous deposits reconcile accurately.',
      'Payment link is delivered via SMS and email to the customer.',
      'Invoice status tracks in real time from Sent to Overdue to Paid.',
    ],
  },
  'request-deposits-and-stage-payments': {
    useWhen: 'Structuring upfront deposits, progress billing milestones, or stage payments on large contracting jobs.',
    bestPractice: 'Require 30–50% upfront deposits on projects requiring significant material procurement.',
    watchFor: 'Platform application fees are allocated proportionally across each installment relative to total scope.',
    completionChecks: [
      'Milestone payment stages and trigger conditions are defined.',
      'Deposit invoice is issued and collected before major work begins.',
      'Subsequent progress invoices unlock as project milestones are completed.',
    ],
  },
  'read-cash-flow-and-forecasts': {
    useWhen: 'Projecting 30-day company revenue, tracking in-transit Stripe deposits, and managing supplier cash needs.',
    bestPractice: 'Review cash flow forecasts weekly to align material purchases and payroll with expected payout dates.',
    watchFor: 'Assuming completed work equals cash before invoices are sent and paid.',
    completionChecks: [
      'Projected inflows reflect signed quotes and pending milestone invoices.',
      'In-transit Stripe deposits display expected bank arrival dates.',
      'Cash flow trends are reviewed before committing to major equipment investments.',
    ],
  },
  'read-reports-and-profitability': {
    useWhen: 'Analyzing project gross margins, revenue by trade specialty, and crew labor efficiency.',
    bestPractice: 'Compare estimated vs actual labor hours on completed jobs to refine future price book rates.',
    watchFor: 'Inaccurate gross margin reporting when material costs or timecards are not logged against jobs.',
    completionChecks: [
      'Gross profit margins are tracked across individual jobs and overall trades.',
      'Labor hour variances between estimates and actuals are analyzed.',
      'Financial reports are exported for CPA and tax preparation.',
    ],
  },
  'manage-refunds-and-payment-problems': {
    useWhen: 'Processing customer refunds or responding to credit card chargebacks and disputed payments.',
    bestPractice: 'Email signed quotes, contracts, and completion photos to support@letsgetquoted.com immediately upon dispute.',
    watchFor: 'Stripe Express accounts cannot respond to disputes inside Stripe; evidence must be sent to LGQ support.',
    completionChecks: [
      'Refunds are processed with automatic proportional platform fee reversals.',
      'Chargeback dispute evidence is emailed to support before the dispute_due_by deadline.',
      'Payment records update status accurately in the dashboard ledger.',
    ],
  },
  'configure-automations-safely': {
    useWhen: 'Setting up automated follow-ups, review requests, appointment reminders, and setting quiet hours.',
    bestPractice: 'Enforce Quiet Hours (8 PM to 8 AM) so automated texts pause overnight and send in the morning.',
    watchFor: 'Sending too many automated messages can trigger carrier spam filters or homeowner opt-outs.',
    completionChecks: [
      'Automation event triggers and delay timers are configured.',
      'Quiet Hours are active to prevent late-night messaging.',
      'Test message sequences are verified on a private test phone.',
    ],
  },
  'configure-appointment-and-arrival-messages': {
    useWhen: 'Automating appointment confirmations, day-before reminders, and technician "On My Way" notifications.',
    bestPractice: 'Include arrival windows and company contact details in all automated reminder templates.',
    watchFor: 'Failing to include clear arrival windows leads to homeowner confusion and missed appointments.',
    completionChecks: [
      '24-hour and 2-hour automated appointment reminders are enabled.',
      'Technician "On My Way" button template is configured with dynamic tags.',
      'Customer replies to reminders route directly into the Messages inbox.',
    ],
  },
  'request-and-manage-reviews': {
    useWhen: 'Automating Google Business Profile review requests and choosing between Direct and Feedback filter modes.',
    bestPractice: 'Trigger review requests 1–2 hours after job completion while client satisfaction is freshest.',
    watchFor: 'In Direct-to-Google mode, no private negative feedback is collected; all users route straight to Google.',
    completionChecks: [
      'Google Business Review link is verified in Automations → Reviews.',
      'Preferred review mode (Direct-to-Google vs Private Feedback) is selected.',
      'Automated review requests trigger successfully upon job completion.',
    ],
  },
  'run-rebooking-and-customer-follow-up': {
    useWhen: 'Automating seasonal maintenance reminders, tune-up offers, and repeat service outreach to past clients.',
    bestPractice: 'Set trade-specific rebooking cadences (e.g. 6-month HVAC, 12-month plumbing inspection).',
    watchFor: 'Rebooking messages should link directly to your online booking page for frictionless conversion.',
    completionChecks: [
      'Seasonal rebooking triggers are active for relevant trade categories.',
      'Promotional message templates include valid online booking links.',
      'Past customer repeat booking conversions are tracked in reports.',
    ],
  },
  'run-marketing-campaigns': {
    useWhen: 'Broadcasting promotional offers, seasonal discounts, or service announcements via SMS or email.',
    bestPractice: 'Segment your audience and keep promotional texts concise with a direct call-to-action link.',
    watchFor: 'Marketing sends execute immediately with no delayed queue, and audiences are capped at 250 per run.',
    completionChecks: [
      'Campaign message copy is written with clear promotional terms and links.',
      'Audience size is verified within the 250-recipient batch limit.',
      'Campaign execution is monitored via runs, sent, and failed metrics.',
    ],
  },
  'customize-email-and-blog-content': {
    useWhen: 'Designing branded email templates, publishing local SEO blog articles, and managing email content.',
    bestPractice: 'Publish helpful homeowner tips to build local search authority and share on social media.',
    watchFor: 'Clicking "Draft & Publish Now" publishes blog posts live immediately with no staging delay.',
    completionChecks: [
      'Email templates match company branding, colors, and logo.',
      'Blog articles are published with localized trade keywords.',
      'Unsubscribed recipients are automatically placed on the suppression list.',
    ],
  },
  'manage-your-marketing-list-and-opt-outs': {
    useWhen: 'Managing marketing audience opt-in compliance, 250-recipient batch limits, and carrier STOP compliance.',
    bestPractice: 'Maintain strict TCPA compliance and respect carrier opt-outs across all promotional outreach.',
    watchFor: 'Pressing Save on a client profile will never re-opt a stopped number; the customer must text START.',
    completionChecks: [
      'Marketing audience list is reviewed for opted-in status compliance.',
      'Broadcast batches are planned within the 250-recipient maximum cap.',
      'Customer STOP opt-out invariant is strictly maintained across the workspace.',
    ],
  },
  'build-and-publish-your-website': {
    useWhen: 'Creating your contractor website, configuring DNS records, and launching custom domains.',
    bestPractice: 'Point CNAME to domains.letsgetquoted.com and root A record to 76.76.21.21 in your domain registrar.',
    watchFor: 'Renaming an LGQ subdomain after launch changes the URL with NO redirect, breaking existing links.',
    completionChecks: [
      'Website layout, services, photos, and branding are customized.',
      'CNAME record points to domains.letsgetquoted.com and verifies DNS.',
      'Free Let’s Encrypt SSL certificate is generated and website loads securely.',
    ],
  },
  'configure-smart-intake': {
    useWhen: 'Customizing online lead capture forms, photo uploads, emergency flags, and embed widgets.',
    bestPractice: 'Enable photo upload fields so homeowners provide visual evidence before quote creation.',
    watchFor: 'Forms with too many required fields decrease homeowner completion rates; keep questions focused.',
    completionChecks: [
      'Trade-specific intake questions and photo uploads are configured.',
      'Emergency intake flags are set for urgent repair inquiries.',
      'Intake widget is live on website and submits leads into the inbox.',
    ],
  },
  'configure-online-booking': {
    useWhen: 'Opening self-service appointment scheduling, configuring arrival windows, and setting lead-time buffers.',
    bestPractice: 'Set a minimum 4-hour advance booking buffer to prevent same-hour unexpected dispatch conflicts.',
    watchFor: 'Ensure technician calendar capacity is configured to prevent accidental overbooking.',
    completionChecks: [
      'Bookable service categories and arrival windows are configured.',
      'Advance notice buffer times prevent last-minute schedule conflicts.',
      'Online booking widget allows homeowners to reserve slots on the live site.',
    ],
  },
  'configure-quick-stops': {
    useWhen: 'Offering fixed-price diagnostic calls, minor repair packages, and filling mid-day schedule openings.',
    bestPractice: 'Require upfront card authorization upon booking to eliminate no-shows on diagnostic visits.',
    watchFor: 'Quick Stops are designed for minor repairs; convert to a full Job if major work is discovered.',
    completionChecks: [
      'Fixed-price diagnostic services and duration caps are established.',
      'Card pre-authorization is active for online Quick Stop bookings.',
      'Dispatchers can slot Quick Stops into daily calendar gaps.',
    ],
  },
  'configure-ai-receptionist': {
    useWhen: 'Setting up 24/7 AI call answering, voice greetings, call transcripts, and emergency forwarding.',
    bestPractice: 'Configure AI receptionist settings on Automations (#ai-receptionist) with a verified emergency number.',
    watchFor: 'Ensure settings.write clearance is available when modifying AI receptionist configurations.',
    completionChecks: [
      'AI phone greeting and business operating hours are configured on Automations.',
      'Emergency transfer phone number is verified for urgent live calls.',
      'Inbound call transcripts and lead extractions log into the Lead Inbox.',
    ],
  },
  'configure-text-to-job-and-field-intake': {
    useWhen: 'Enabling road dictation for change orders, voice memos, punch lists, and receipt photo OCR from mobile.',
    bestPractice: 'Save the business dispatch number in phone contacts as "Job Intake" for hands-free driving dictation.',
    watchFor: 'Reply "UNDO" within 15 minutes to atomically roll back any accidental voice or text updates.',
    completionChecks: [
      'Owner and crew mobile numbers are authorized in Settings.',
      'Dispatch number is saved in mobile contacts for Siri / Assistant dictation.',
      'Test voice memo and receipt photo process successfully with 15-minute undo safety.',
    ],
  },
  'manage-office-access-and-security': {
    useWhen: 'Inviting office staff by email, managing dashboard roles, and removing access safely.',
    bestPractice: 'Invite office members using their own email addresses and remove departing users promptly.',
    watchFor: 'There are no individual capability checkboxes in the UI; access is managed by role and server gates.',
    completionChecks: [
      'Office teammates receive email invitations and set up unique passwords.',
      'Office users can access operational workspaces while billing remains protected.',
      'Departed users are removed from Settings → Team with historical logs preserved.',
    ],
  },
  'manage-plan-usage-and-credits': {
    useWhen: 'Reviewing plan capacity, credit allowances, immediate plan change billing, and overage settings.',
    bestPractice: 'Understand platform fee structures (Flex 1.25% down to Scale 0.10%) and plan change billing.',
    watchFor: 'Plan changes charge or credit prorations immediately on click; overage off refuses excess sends.',
    completionChecks: [
      'Active plan allowances, seats, and credit balances are monitored.',
      'Platform fee rates and immediate plan change mechanics are understood.',
      'Overage authorization settings align with your company budget preferences.',
    ],
  },
  'import-existing-business-data': {
    useWhen: 'Migrating client lists, past leads, price book items, or jobs from spreadsheets or other CRM tools.',
    bestPractice: 'Format and clean CSV columns using provided sample templates before uploading to the import hub.',
    watchFor: 'All four importer actions are strictly gated by Owner security clearance (requireOwnerContext).',
    completionChecks: [
      'Source spreadsheets are cleaned, formatted, and backed up.',
      'Owner role executes the import with preview column mappings verified.',
      'Imported clients, leads, and price book items appear in the workspace.',
    ],
  },
  'manage-your-price-book': {
    useWhen: 'Standardizing flat-rate services, setting material costs, labor hours, and tiered upsell options.',
    bestPractice: 'Archive outdated line items rather than deleting them to preserve past quoting records.',
    watchFor: 'A price book rate is a baseline; site conditions and complexity still require estimator review.',
    completionChecks: [
      'Standard trade services, descriptions, and base rates are configured.',
      'Estimated material and labor hours are attached for gross margin tracking.',
      'New quote drafts populate items accurately from the price book catalog.',
    ],
  },
  'export-data-and-connect-apps': {
    useWhen: 'Exporting workspace records to CSV, backing up financial data, or connecting QuickBooks Online.',
    bestPractice: 'Export monthly financial CSVs for CPA bookkeeping and reconcile connected QuickBooks syncs.',
    watchFor: 'Ensure QuickBooks Online OAuth connections are refreshed if sync errors occur.',
    completionChecks: [
      'Client, invoice, job, and timecard CSV exports generate without error.',
      'QuickBooks Online integration is connected and mapping accounts.',
      'Exported financial figures reconcile with internal accounting records.',
    ],
  },
  'find-help-and-contact-support': {
    useWhen: 'Searching user documentation, running interactive troubleshooters, or submitting a support case.',
    bestPractice: 'Search the Manual Explorer and Troubleshooter first, then provide full record evidence if ticketing.',
    watchFor: 'For payment or chargeback issues, email evidence to support@letsgetquoted.com before deadlines.',
    completionChecks: [
      'Manual Explorer search is used to locate task-specific guides.',
      'In-app Troubleshooter is used to diagnose common delivery or payout questions.',
      'Support tickets are submitted with complete URLs, timestamps, and screenshots.',
    ],
  },
  'cancel-your-plan-or-delete-your-account': {
    useWhen: 'Deciding whether to pause/cancel a monthly subscription or permanently delete an entire business account.',
    bestPractice: 'Choose Cancel Plan to pause renewal while keeping all records safely preserved and resumable.',
    watchFor: 'Delete Account is IMMEDIATE, UNRECOVERABLE, cancels without refund, and hard-deletes all data.',
    completionChecks: [
      'Difference between resumable plan cancellation and irreversible account deletion is understood.',
      'All client records, invoices, and job files are exported to CSV prior to any deletion.',
      'Outstanding Stripe payments have settled and transferred to your bank account.',
    ],
  },
};

export function getManualFieldNotes(slug: string): ManualFieldNotes | undefined {
  return MANUAL_FIELD_NOTES[slug];
}
