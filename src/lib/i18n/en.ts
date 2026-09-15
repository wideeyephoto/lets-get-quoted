/**
 * English strings for the client job dashboard (/client/jobs/[token]).
 *
 * This is the canonical key set — every key here MUST exist in every other
 * locale file. The Spanish file (es.ts) mirrors this structure exactly.
 */
const en = {
  // --- Status labels ---
  'payment.status.requested': 'Awaiting payment',
  'payment.status.processing': 'Processing',
  'payment.status.paid': 'Paid',
  'payment.status.failed': 'Failed',
  'payment.status.refunded': 'Refunded',

  'invoice.status.draft': 'Draft',
  'invoice.status.sent': 'Sent',
  'invoice.status.signed': 'Signed',
  'invoice.status.paid': 'Paid',
  'invoice.status.void': 'Void',

  'freq.label.weekly': '/wk',
  'freq.label.biweekly': '/2wk',
  'freq.label.monthly': '/mo',
  'freq.word.weekly': 'weekly',
  'freq.word.biweekly': 'every two weeks',
  'freq.word.monthly': 'monthly',

  // --- Flash messages ---
  'flash.approved': 'Thanks — your approval is recorded and your contractor has been notified.',
  'flash.scheduled': 'Your start date is confirmed. Your contractor can see it now.',
  'flash.schedule-requested': 'Sent. Your contractor will send different dates to choose from.',
  'flash.asked': 'Your question is on its way. The quote stays open while they reply.',
  'flash.ask-failed': 'That question did not send. Please try again, or call the number at the top of this page.',
  'flash.options-updated': 'Your options are updated and your contractor has been told. Your new total is below.',
  'flash.options-failed': 'We could not change those options. Your quote is unchanged — please call your contractor.',

  // --- Expired / dead-link screen ---
  'expired.eyebrow': 'This link has closed',
  'expired.title': 'This quote link is no longer active',
  'expired.body1': 'Links expire, and a contractor can close one at any time — usually because the quote was replaced with a newer one, or the job is finished.',
  'expired.body2': 'Nothing is lost. Reply to the text or email you received it in and ask for a fresh link, and it will open right where this one did.',

  // --- Section headings & labels ---
  'section.quote': 'Your quote',
  'section.scopeAndPricing': 'Scope and pricing',
  'section.approveAndBook': 'Approve and book a date',
  'section.payments': 'Payment requests',
  'section.invoices': 'Invoices',
  'section.paymentPlan': 'Payment Plan',
  'section.changeOrders': 'Change orders',
  'section.selections': 'Selections',
  'section.forms': 'Forms & documents',

  // --- Common UI ---
  'ui.view': 'View',
  'ui.pay': 'Pay',
  'ui.call': 'Call',
  'ui.approve': 'Approve',
  'ui.decline': 'Decline',
  'ui.submit': 'Submit',
  'ui.cancel': 'Cancel',
  'ui.sendQuestion': 'Send a question',
  'ui.questionPlaceholder': 'Type your question here…',
  'ui.total': 'Total',
  'ui.deposit': 'Deposit',
  'ui.balanceDue': 'Balance due',
  'ui.paidInFull': 'Paid in full',
  'ui.scheduledFor': 'Scheduled for',
  'ui.requestNewDates': 'Request new dates',
} as const;

export type TranslationKey = keyof typeof en;
export default en;
