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
    watchFor: 'Turning on every automation at once can hide which prerequisite or message caused a problem.',
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
    watchFor: 'Plan entitlement, account configuration, permission, and operational readiness are different gates.',
    completionChecks: [
      'Each teammate has the smallest role and capability set that supports their work.',
      'Feature prerequisites are complete before the feature is described as live.',
      'A second account with the affected role has been used to confirm the experience.',
    ],
  },
  'manage-the-lead-inbox': {
    useWhen: 'New requests are arriving, response work is getting buried, or the active lead queue no longer reflects reality.',
    bestPractice: 'Process the queue in a repeatable order: new, waiting on you, scheduled, snoozed, then closed exceptions.',
    watchFor: 'Closing, snoozing, and archiving solve different problems; using the wrong one can hide a live opportunity.',
    completionChecks: [
      'Every active lead has a current stage and a clear next action.',
      'Waiting customers are visible and assigned to someone.',
      'Closed and snoozed work is out of the active queue without being duplicated.',
    ],
  },
  'qualify-and-contact-a-lead': {
    useWhen: 'A new request needs a response, route-fit decision, estimate decision, or a clear reason not to pursue it.',
    bestPractice: 'Use intake signals to prepare the conversation, then verify scope and urgency with the customer directly.',
    watchFor: 'A qualification score is decision support, not permission to ignore consent, safety, or incomplete customer context.',
    completionChecks: [
      'Contact permission and the preferred reply channel are clear.',
      'Scope, timing, service area, and next step have been confirmed.',
      'The lead timeline records what was promised and who owns the follow-up.',
    ],
  },
  'schedule-estimate-and-start-date-options': {
    useWhen: 'A customer is ready for an estimate visit or needs realistic choices for when approved work could begin.',
    bestPractice: 'Offer windows that protect travel, crew capacity, and existing commitments rather than the first empty calendar slot.',
    watchFor: 'A proposed start date is not a confirmed production date until prerequisites and capacity are verified.',
    completionChecks: [
      'The estimate visit has a location, owner, and customer-facing arrival window.',
      'Proposed work dates reflect real capacity and readiness.',
      'The customer understands which dates are tentative and which are confirmed.',
    ],
  },
  'build-and-send-a-quote': {
    useWhen: 'Scope and pricing are understood well enough to present a clear offer to the customer.',
    bestPractice: 'Write line items so a customer can understand the outcome, boundaries, and choices without a phone explanation.',
    watchFor: 'Optional upgrades, allowances, tax, deposit terms, and exclusions can change the total or commitment if left ambiguous.',
    completionChecks: [
      'Required work, optional choices, pricing, and terms match the agreed scope.',
      'The customer preview has been checked on a narrow screen.',
      'The sent quote has one clear owner and follow-up path.',
    ],
  },
  'understand-the-customer-approval-flow': {
    useWhen: 'A quote is ready for acceptance, a customer approved verbally, or the team needs to understand why a job did or did not appear.',
    bestPractice: 'Use the online approval path whenever possible so choices, signature, deposit, and timestamps stay together.',
    watchFor: 'Verbal acceptance needs deliberate documentation and may not satisfy every signature or payment prerequisite.',
    completionChecks: [
      'Accepted options, signature state, and deposit state match the customer’s decision.',
      'The resulting job contains the approved scope and customer details.',
      'The next scheduling or payment action is assigned and visible.',
    ],
  },
  'manage-the-job-workspace': {
    useWhen: 'Approved work needs to be prepared, scheduled, completed, reviewed, or traced after the fact.',
    bestPractice: 'Keep decisions, evidence, and lifecycle actions on the job so the full story survives handoffs.',
    watchFor: 'Changing a status without completing the underlying operational step creates misleading queues and reports.',
    completionChecks: [
      'The job status matches what is physically happening.',
      'Scope, schedule, assignees, files, and customer communication are current.',
      'The feed explains important decisions and changes without relying on memory.',
    ],
  },
  'schedule-work-from-the-queue': {
    useWhen: 'Approved or tentative work is waiting for a calendar date, crew assignment, or readiness decision.',
    bestPractice: 'Clear blockers before committing the slot, then schedule from constrained work outward.',
    watchFor: 'Tentative placement helps planning but should not be communicated as a confirmed promise.',
    completionChecks: [
      'Scope, material, payment, and staffing blockers are visible or resolved.',
      'The calendar entry has a realistic duration, location, and assignee.',
      'The customer-facing schedule state matches the internal commitment.',
    ],
  },
  'plan-a-day-and-dispatch-crew': {
    useWhen: 'Tomorrow or today’s work needs to be ordered, assigned, routed, and communicated to the field.',
    bestPractice: 'Freeze the practical plan close to dispatch, then record changes instead of silently reshuffling the day.',
    watchFor: 'Route optimization cannot compensate for missing addresses, unrealistic durations, or incompatible crew skills.',
    completionChecks: [
      'Every stop has an owner, valid address, duration, and readiness state.',
      'Travel and arrival windows are achievable for the whole route.',
      'Crew received the latest plan and exceptions are documented.',
    ],
  },
  'document-work-and-change-orders': {
    useWhen: 'Field conditions, customer selections, progress, damage, or extra scope must be recorded and agreed upon.',
    bestPractice: 'Capture evidence at the moment of discovery and separate original scope from added work.',
    watchFor: 'A note or photo proves context, but it does not replace customer approval for a priced scope change.',
    completionChecks: [
      'Photos and notes are attached to the correct job and stage.',
      'Every added cost or duration change has a documented approval path.',
      'Closeout records show what was completed and what remains.',
    ],
  },
  'manage-recurring-jobs': {
    useWhen: 'A service repeats on a schedule and should produce predictable visits, customer expectations, and billing.',
    bestPractice: 'Define the repeat promise in customer language before automating future visits or charges.',
    watchFor: 'A recurring schedule can keep generating bad work if price, scope, seasonality, or customer status changes.',
    completionChecks: [
      'Frequency, start date, service scope, and price are explicit.',
      'Upcoming visits fit real capacity and customer availability.',
      'Pause, cancellation, and billing behavior have been explained.',
    ],
  },
  'manage-client-records': {
    useWhen: 'You need the complete customer history, need to correct contact details, or suspect duplicate records.',
    bestPractice: 'Search before creating and treat one client record as the durable identity behind all work.',
    watchFor: 'Merging or editing records without checking history can separate payments, messages, and portal access.',
    completionChecks: [
      'The primary contact and service details are current.',
      'Leads, jobs, quotes, invoices, and messages point to the intended client.',
      'Potential duplicates have been reviewed before new records are added.',
    ],
  },
  'work-the-customer-text-inbox': {
    useWhen: 'Customers are replying by text, unread conversations are accumulating, or multiple office users share response work.',
    bestPractice: 'Read the record context before replying and leave the conversation in a state the next teammate can trust.',
    watchFor: 'A technically deliverable number does not override opt-out, consent, quiet-hour, or identity concerns.',
    completionChecks: [
      'Every open conversation has a useful response or a visible owner.',
      'Customer identity and consent state were checked before sending.',
      'Unresolved promises are recorded on the related lead, job, or client record.',
    ],
  },
  'set-up-business-texting': {
    useWhen: 'The business needs a dedicated texting number or carrier registration is pending, rejected, or unclear.',
    bestPractice: 'Submit business and messaging-use details exactly as they appear in authoritative records.',
    watchFor: 'Number ownership, registration approval, and outbound readiness are separate states with different remedies.',
    completionChecks: [
      'Business identity and messaging use case are accurate and complete.',
      'Registration status has no unresolved action request.',
      'A compliant test message confirms the number is operational.',
    ],
  },
  'manage-crew-and-field-access': {
    useWhen: 'A worker joins, changes responsibilities, needs field access, changes pay details, or leaves the business.',
    bestPractice: 'Maintain one complete worker record and make access changes on the same day responsibilities change.',
    watchFor: 'Archiving access should preserve historical time, pay, and job evidence.',
    completionChecks: [
      'Contact, role, pay, and emergency details are current.',
      'The worker can reach assigned field work but not office-only data.',
      'Archived workers cannot sign in and remain visible in historical records.',
    ],
  },
  'run-the-field-workflow': {
    useWhen: 'Crew members are starting the day, opening assigned work, recording progress, or sending arrival updates.',
    bestPractice: 'Update the job while the facts are fresh instead of reconstructing the day after clock-out.',
    watchFor: 'Location, voice, and arrival tools assist operations but should never imply monitoring or promises the crew cannot meet.',
    completionChecks: [
      'Clock, assignment, and arrival states reflect the real day.',
      'Notes, photos, materials, and exceptions are attached to the correct job.',
      'The office can understand progress without calling the crew for basic context.',
    ],
  },
  'review-timecards-and-pay': {
    useWhen: 'A pay period is closing, a timecard has an anomaly, or job labor needs review before payroll.',
    bestPractice: 'Resolve exceptions with the worker and job evidence before approving the period.',
    watchFor: 'Submitted, approved, paid, and exported are distinct states; do not use one as proof of another.',
    completionChecks: [
      'Missing punches, overlaps, and unexplained edits are resolved.',
      'Approved hours match job and worker evidence.',
      'The export and approval trail are retained for payroll reconciliation.',
    ],
  },
  'manage-subcontractor-coverage': {
    useWhen: 'A job needs outside capacity, a specialty trade, or backup coverage that employees cannot provide.',
    bestPractice: 'Request coverage with enough scope, timing, location, and compensation context to support a real commitment.',
    watchFor: 'An interested response is not an assignment until terms, availability, and responsibility are confirmed.',
    completionChecks: [
      'Subcontractor contact, trade, coverage, and compliance details are current.',
      'The accepted request matches the job scope and schedule.',
      'Assignment, communication, and post-job performance are recorded.',
    ],
  },
  'connect-stripe-and-get-paid': {
    useWhen: 'Payments need to be activated, verification is requested, or a paid invoice has not reached the bank.',
    bestPractice: 'Complete onboarding with the real business owner and reconcile customer payment, Stripe balance, and bank payout separately.',
    watchFor: 'A successful customer charge does not guarantee an immediate or unrestricted bank payout.',
    completionChecks: [
      'Stripe shows no unresolved identity, bank, or business requirement.',
      'A controlled payment confirms checkout and receipt behavior.',
      'Payout timing and destination account are understood and documented.',
    ],
  },
  'create-and-send-an-invoice': {
    useWhen: 'Completed or billable work needs a clear balance, due date, and customer payment request.',
    bestPractice: 'Reconcile approved scope, prior payments, tax, credits, and change orders before sending one authoritative invoice.',
    watchFor: 'Sending duplicate links or revised totals without context can make the customer unsure which balance is real.',
    completionChecks: [
      'The invoice total and remaining balance reconcile to the job.',
      'Recipient, due terms, and payment methods are correct.',
      'The customer received one clear request and its status is visible.',
    ],
  },
  'request-deposits-and-stage-payments': {
    useWhen: 'A job requires money before scheduling, at a milestone, over time, or before final closeout.',
    bestPractice: 'Tie each request to a plain-language milestone and show how it reduces the remaining contract balance.',
    watchFor: 'Manual and automated requests can overlap if the payment schedule is not reviewed first.',
    completionChecks: [
      'The requested amount matches the contract rule or completed milestone.',
      'Prior payments and the remaining balance reconcile.',
      'The customer understands amount, timing, and what happens next.',
    ],
  },
  'read-cash-flow-and-forecasts': {
    useWhen: 'You are planning near-term cash, deciding when to spend, or comparing expected inflows with scheduled obligations.',
    bestPractice: 'Separate confirmed money from probability-weighted work and update scheduled expenses before making a decision.',
    watchFor: 'Forecast precision does not make uncertain leads, dates, or collection timing certain.',
    completionChecks: [
      'The planning window matches the decision being made.',
      'Known expenses and payment timing are current.',
      'Confirmed, expected, and speculative cash are interpreted separately.',
    ],
  },
  'read-reports-and-profitability': {
    useWhen: 'You need to evaluate sales, operations, labor, margin, or bookkeeping activity over a defined period.',
    bestPractice: 'Begin with one business question, select the matching report, and keep filters consistent when comparing periods.',
    watchFor: 'Incomplete cost, time, or status records can make precise-looking profitability figures misleading.',
    completionChecks: [
      'Date range, status, and location filters match the question.',
      'Source records are complete enough to support the conclusion.',
      'Exports reconcile to the on-screen totals before they are shared.',
    ],
  },
  'manage-refunds-and-payment-problems': {
    useWhen: 'A charge failed, appears duplicated, has an uncertain status, or needs a partial or full refund.',
    bestPractice: 'Identify the processor state and original payment before retrying, refunding, or promising an outcome.',
    watchFor: 'Retries during an uncertain result can create a second charge, while refunds can take time to appear at the bank.',
    completionChecks: [
      'The original charge, amount, customer, and processor state are confirmed.',
      'Only the intended amount was retried or refunded once.',
      'The invoice, job, and customer communication reflect the final outcome.',
    ],
  },
  'configure-automations-safely': {
    useWhen: 'You are enabling or changing intake, reminder, follow-up, confirmation, review, or briefing automations.',
    bestPractice: 'Activate one customer-journey stage at a time and observe real results before expanding.',
    watchFor: 'Two overlapping automations can send duplicate or contradictory messages from the same event.',
    completionChecks: [
      'Every enabled automation has its prerequisite, audience, trigger, and owner defined.',
      'Templates and timing were tested with an internal record.',
      'The next real sends are scheduled to be reviewed for delivery and relevance.',
    ],
  },
  'configure-appointment-and-arrival-messages': {
    useWhen: 'Customers need timely reminders, confirmation requests, or honest on-the-way updates around scheduled work.',
    bestPractice: 'Align message timing with how the office and crew actually manage the calendar.',
    watchFor: 'An automatic arrival message can damage trust if the crew has not truly departed or the schedule changed.',
    completionChecks: [
      'Reminder timing and wording match the service promise.',
      'Confirmation status is visible to the person managing the schedule.',
      'Arrival updates are triggered from real dispatch behavior.',
    ],
  },
  'request-and-manage-reviews': {
    useWhen: 'Completed customers are eligible for a review request or private feedback needs a response.',
    bestPractice: 'Ask consistently after a genuine completion milestone and route every customer through the same fair choice.',
    watchFor: 'Filtering who receives a public review option based on sentiment can become review-gating.',
    completionChecks: [
      'The connected public review destination belongs to the business.',
      'Request timing, audience, and message are appropriate and consistent.',
      'Private feedback has an owner and a documented resolution path.',
    ],
  },
  'run-rebooking-and-customer-follow-up': {
    useWhen: 'Past customers are due for seasonal, maintenance, repeat, or related work based on actual service history.',
    bestPractice: 'Use a narrow, explainable due signal and write the invitation around the prior service relationship.',
    watchFor: 'A broad blast can contact customers whose work, preferences, or timing no longer fits.',
    completionChecks: [
      'The audience is supported by service history and contact permission.',
      'The message explains why the outreach is relevant now.',
      'Replies and new opportunities flow into an owned follow-up queue.',
    ],
  },
  'run-marketing-campaigns': {
    useWhen: 'A defined customer group should receive a timely offer, update, or educational message by email or text.',
    bestPractice: 'Design from the audience and desired action backward, then preview every channel before sending.',
    watchFor: 'Large reach is not useful when the audience, consent, offer, or measurement plan is unclear.',
    completionChecks: [
      'Audience criteria and estimated recipient count are intentional.',
      'Content, links, sender identity, and mobile previews are correct.',
      'Delivery, replies, and conversions have a planned review date.',
    ],
  },
  'customize-email-and-blog-content': {
    useWhen: 'Outbound email needs consistent branding or a useful article is moving from draft to publication.',
    bestPractice: 'Prioritize readable customer value, clear ownership, and a deliberate call to action over decorative complexity.',
    watchFor: 'Publishing or scheduling without previewing can expose unfinished copy, weak contrast, or stale links.',
    completionChecks: [
      'Email identity and appearance remain readable across screen sizes.',
      'Article status, author, date, links, and imagery are ready for the selected stage.',
      'Published content has been opened from the customer-facing destination.',
    ],
  },
  'build-and-publish-your-website': {
    useWhen: 'The business is creating, revising, previewing, connecting, or publishing its public website.',
    bestPractice: 'Build in passes: trustworthy business facts, persuasive service content, then visual and search polish.',
    watchFor: 'A polished preview can still fail if contact paths, domain state, mobile layout, or unpublished changes are overlooked.',
    completionChecks: [
      'Brand, services, service area, proof, policies, and contact paths are accurate.',
      'Desktop and mobile previews have been reviewed with real content.',
      'The public domain resolves securely and every primary action works.',
    ],
  },
  'configure-smart-intake': {
    useWhen: 'Website lead forms need better qualification, clearer expectations, or more useful context for the first response.',
    bestPractice: 'Ask only for information that changes routing, safety, qualification, preparation, or the next customer step.',
    watchFor: 'Long forms can increase detail while reducing completion and excluding otherwise valuable requests.',
    completionChecks: [
      'Every question has a defined operational use.',
      'The public form works on mobile and sets accurate response expectations.',
      'Real submissions are being reviewed to tune signals and drop-off.',
    ],
  },
  'configure-online-booking': {
    useWhen: 'Customers should be able to request realistic appointment windows without waiting for an office reply.',
    bestPractice: 'Publish less availability than theoretical capacity so travel, overruns, and urgent work still fit.',
    watchFor: 'A booking request should not look like a final commitment when office review or readiness is still required.',
    completionChecks: [
      'Open days, windows, notice, limits, and time off reflect real capacity.',
      'The public page clearly explains request versus confirmation.',
      'A mobile test request reaches the correct office queue.',
    ],
  },
  'configure-quick-stops': {
    useWhen: 'The business wants to offer small, time-sensitive work that can fit profitably into an active route.',
    bestPractice: 'Define narrow eligible work and let route fit, deadline, and capacity protect the promise.',
    watchFor: 'Speed or visit fees do not make unclear, unsafe, or out-of-area scope suitable for a Quick Stop.',
    completionChecks: [
      'Eligible work, service area, limits, deadlines, and fees are explicit.',
      'Today’s requests are reviewed against the live route before acceptance.',
      'Accepted customers receive a realistic commitment and next step.',
    ],
  },
  'configure-ai-receptionist': {
    useWhen: 'The business wants calls answered after hours or needs to review how AI-handled calls become follow-up work.',
    bestPractice: 'Give the receptionist narrow, accurate instructions and review early calls frequently before relying on it broadly.',
    watchFor: 'AI should not make safety, price, legal, or scheduling commitments that require a qualified person.',
    completionChecks: [
      'Greeting, business facts, escalation rules, and prohibited promises are clear.',
      'Test calls produce usable transcripts, recordings, and follow-up records.',
      'Someone owns the live call inbox and unresolved caller requests.',
    ],
  },
  'manage-office-access-and-security': {
    useWhen: 'An office teammate joins, changes responsibility, has sign-in trouble, or no longer needs account access.',
    bestPractice: 'Use named accounts, least privilege, and same-day removal instead of shared credentials.',
    watchFor: 'Removing a role or login should not erase the historical ownership of customer and financial actions.',
    completionChecks: [
      'Every active office user has a named account and current capability set.',
      'Sign-in and recovery methods work for the intended user.',
      'Departed users cannot access the account and historical attribution remains.',
    ],
  },
  'manage-plan-usage-and-credits': {
    useWhen: 'Usage is approaching a limit, credits or capacity need explanation, or a plan change is being considered.',
    bestPractice: 'Connect each limit to the workflow it affects before buying capacity or changing plans.',
    watchFor: 'Included allowance, purchased capacity, overage permission, renewal, and billing status are different controls.',
    completionChecks: [
      'Current plan, renewal timing, usage window, and active limits are understood.',
      'The operational effect of any change has been reviewed with affected teammates.',
      'Credits, capacity, and billing state reflect the intended choice after confirmation.',
    ],
  },
  'import-existing-business-data': {
    useWhen: 'Customers, services, jobs, or invoice history need to move from another system into the dashboard.',
    bestPractice: 'Clean and deduplicate the source, import the smallest useful batch, then verify before expanding.',
    watchFor: 'An accepted file can still create bad records when columns, dates, identities, or historical balances are ambiguous.',
    completionChecks: [
      'Source data is backed up, scoped, and mapped to the correct fields.',
      'Preview counts and sample records match expectations.',
      'Imported totals and relationships were checked before another batch.',
    ],
  },
  'manage-your-price-book': {
    useWhen: 'The team needs reusable service descriptions, consistent starting prices, or a cleaner quoting workflow.',
    bestPractice: 'Write for customer understanding and review costs and assumptions on a regular cadence.',
    watchFor: 'A saved price is a starting point; site conditions, scope, tax, and margin still require judgment.',
    completionChecks: [
      'Active services have clear names, descriptions, units, and current prices.',
      'Duplicates and outdated starter items are archived or corrected.',
      'A test quote loads the intended language and pricing behavior.',
    ],
  },
  'export-data-and-connect-apps': {
    useWhen: 'Records need to leave the platform, an accounting or calendar connection is being added, or sync results need reconciliation.',
    bestPractice: 'Define the source of truth, data scope, owner, and reconciliation routine before connecting an app.',
    watchFor: 'Connection success does not prove every historical or future record syncs in both directions.',
    completionChecks: [
      'Export filters and columns match the intended use.',
      'The connected app’s direction, scope, and limitations are documented.',
      'Sample records reconcile on both sides without duplicate creation.',
    ],
  },
  'find-help-and-contact-support': {
    useWhen: 'A workflow is unclear, a known fix did not work, or the support team needs evidence to investigate an issue.',
    bestPractice: 'Search by the task first, then send one reproducible issue with record, timing, expectation, and observed result.',
    watchFor: 'Passwords, full payment details, and unrelated problems should never be bundled into a support request.',
    completionChecks: [
      'The relevant guide and troubleshooting steps were reviewed.',
      'The request identifies the affected record, time, steps, and safe evidence.',
      'One support thread contains one issue and a clear desired outcome.',
    ],
  },
};

export function getManualFieldNotes(slug: string): ManualFieldNotes | undefined {
  return MANUAL_FIELD_NOTES[slug];
}
