// Exact, not rounded: every amount in this file names a charge, a receipt or a
// refund. "Requested a deposit of $438" against a $437.50 card charge is the
// same defect as the payment page's button. See formatMoneyExact.
import { formatJobSchedule, formatMoneyExact as formatMoney } from '@/lib/jobs';

/**
 * Declared here rather than in lib/sms, which imports this file — the words come
 * before the sending, so the type the words are keyed on does too. lib/sms
 * re-exports it, so every existing `import type { PaymentSmsEvent } from
 * '@/lib/sms'` keeps working.
 */
export type PaymentSmsEvent = 'payment_requested' | 'payment_paid' | 'payment_failed' | 'payment_refunded';

/**
 * The words of every text this app sends, separated from the sending of them.
 *
 * WHY THIS FILE EXISTS. The bodies used to be template literals inside each
 * sender in lib/sms.ts, which meant anything that wanted to SHOW a contractor
 * what goes out under their name had to retype it. Twice that copy drifted from
 * the real thing and nobody noticed until somebody read both:
 *
 *   - the review request preview still said "If we earned it", wording removed
 *     from the sender because it reads as a nudge that only happy customers
 *     should bother (see review-routing.ts)
 *   - the appointment reminder preview had lost the business-name prefix and
 *     the address clause entirely (see appointment-reminders.ts)
 *
 * Four messages were rescued one at a time that way — reviewRequestText,
 * quoteFollowupText, appointmentReminderText, missedCallTextBack — each with a
 * comment explaining the drift it had just fixed. This is that fix applied to
 * the rest, before the same thing happens a third time.
 *
 * Everything here is PURE: strings in, a string out. No network, no database,
 * no environment. That is what lets the outgoing-text catalogue on the messages
 * page render these with sample data and be showing the truth rather than an
 * artist's impression.
 *
 * THE FOUR THAT ARE NOT HERE live where their own logic does, and are re-exported
 * at the bottom so callers have one import: a message whose builder needs the
 * follow-up schedule, or the reminder window, or the review routing rules,
 * belongs beside those rules.
 */

/**
 * The opt-out line, and the reason it is a function rather than a suffix people
 * remember to type. Every message to a customer carries one — it is not a
 * courtesy, it is the thing that keeps the number deliverable.
 */
export function withOptOut(message: string): string {
  return `${message} Reply STOP to opt out.`;
}

// -- to the owner, on their own mobile ---------------------------------------

export function ownerHighValueLeadText(input: {
  businessName: string;
  leadName: string;
  estimate: { min: number; max: number } | null;
  dashboardUrl: string;
}): string {
  const range = input.estimate
    ? ` ($${input.estimate.min.toLocaleString()}-$${input.estimate.max.toLocaleString()})`
    : '';
  return `🔥 High-value lead for ${input.businessName}: ${input.leadName || 'New request'}${range}. Respond fast: ${input.dashboardUrl} — Reply STOP to opt out.`;
}

export function ownerVerificationCodeText(input: { code: string }): string {
  return `Your Let’s Get Quoted verification code is ${input.code}. Enter this code in your Texting Setup to verify your mobile number. Reply STOP to opt out.`;
}

export function crewPhoneVerificationCodeText(input: { businessName: string; code: string }): string {
  return `${input.businessName}: Your 6-digit verification code for Voice Assistant & Field Access is ${input.code}. Reply STOP to opt out.`;
}

export function ownerVoiceEmergencyAlertText(input: {
  businessName: string;
  callerNumber: string | null;
  hazardSummary: string;
  dashboardUrl: string;
}): string {
  const caller = input.callerNumber || 'Unknown caller';
  return `🚨 EMERGENCY CALL for ${input.businessName} from ${caller}: ${input.hazardSummary}. Review details & transcript: ${input.dashboardUrl} — Reply STOP to opt out.`;
}

export function callerVoiceBookingLinkText(input: {
  businessName: string;
  bookingUrl: string;
}): string {
  return `Thanks for calling ${input.businessName}! Here is the direct link to book an appointment or request an estimate: ${input.bookingUrl} — Reply STOP to opt out.`;
}

export function callerVoiceBookingConfirmationText(input: {
  businessName: string;
  whenLabel: string;
  serviceAddress?: string | null;
}): string {
  const atAddress = input.serviceAddress ? ` for ${input.serviceAddress}` : '';
  return `Thanks for calling ${input.businessName}! Your appointment request for ${input.whenLabel}${atAddress} has been received. Our team will follow up shortly to confirm details. Reply STOP to opt out.`;
}


// -- Quick Stop --------------------------------------------------------------

export function quickStopOfferText(input: {
  businessName: string;
  whenLabel: string;
  feeLabel: string;
  payUrl: string;
  minutes: number;
}): string {
  /* "for $145" read as the price of the visit. It is the price of getting the
     visit — the work is quoted and invoiced separately, and a homeowner who
     learns that at the door is a refund request we caused. Costs one segment
     boundary at most and prevents the argument. */
  return `Your Quick Stop offer from ${input.businessName}: arrive ${input.whenLabel} for a ${input.feeLabel}. This reserves the visit; service and parts are billed separately. Pay within ${input.minutes} min to hold this window: ${input.payUrl}. Reply STOP to opt out.`;
}

export function quickStopConfirmedText(input: {
  businessName: string;
  whenLabel: string;
  statusUrl?: string;
}): string {
  const manage = input.statusUrl ? ` Manage or cancel: ${input.statusUrl}.` : '';
  return `You're confirmed! ${input.businessName} will arrive ${input.whenLabel}. Your visit fee is paid; any service or parts are billed separately. We'll text updates on the way.${manage} Reply STOP to opt out.`;
}

// -- crew --------------------------------------------------------------------

export function crewAssignmentText(input: {
  crewName: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  scheduledFor: string | null;
  scheduledTime?: string | null;
}): string {
  const addressNote = input.address ? ` at ${input.address}` : '';
  const scheduledNote = input.scheduledFor
    ? ` Scheduled ${formatJobSchedule(input.scheduledFor, input.scheduledTime)}.`
    : '';
  return `Hi ${input.crewName}, ${input.businessName} assigned you to job ${input.jobRef} — ${input.clientName}${addressNote}.${scheduledNote} Reply STOP to opt out.`;
}

export function crewScheduleSelectedText(input: {
  crewName: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  scheduledFor: string;
  scheduledTime?: string | null;
}): string {
  const addressNote = input.address ? input.address : 'Address not set';
  const scheduledNote = formatJobSchedule(input.scheduledFor, input.scheduledTime);
  return `Hi ${input.crewName}, job ${input.jobRef} for ${input.clientName} is scheduled for ${scheduledNote}. Address: ${addressNote}. ${input.businessName}. Reply STOP to opt out.`;
}

// -- subcontractor dispatch ---------------------------------------------------
//
// The OFFER itself has no builder here on purpose. Its words are written (or at
// least approved) by the owner in the composer before anything is sent — see
// draftOfferMessage in lib/subcontractor-dispatch, which produces the draft they
// edit. What follows are the three messages the SYSTEM sends on its own, which
// is exactly the set that has to be worded once and stay worded that way.

/**
 * "Somebody else got there first."
 *
 * The three things a sub who lost needs, in this order: it is gone, it is not
 * personal, and they are still on the list. A firm that reads "unsuccessful" is
 * a firm that stops opening the next one.
 */
export function subcontractorCoveredText(input: {
  businessName: string;
  workDescription: string;
  location: string;
}): string {
  const where = input.location.trim() ? ` in ${input.location.trim()}` : '';
  return `${input.businessName}: the ${input.workDescription.trim()}${where} has been covered by another sub. Thanks for taking a look — we will send the next one. Reply STOP to opt out.`;
}

/** "It's yours." Carries the link, because the address is behind it. */
export function subcontractorWonText(input: {
  businessName: string;
  workDescription: string;
  whenLabel: string;
  link: string;
}): string {
  const when = input.whenLabel.trim() ? ` ${input.whenLabel.trim()}` : '';
  return `${input.businessName}: you are confirmed for the ${input.workDescription.trim()}${when}. Address and contact details: ${input.link} Reply STOP to opt out.`;
}

/** The owner pulled the job before anybody took it. */
export function subcontractorCancelledText(input: {
  businessName: string;
  workDescription: string;
}): string {
  return `${input.businessName}: the ${input.workDescription.trim()} we sent you has been cancelled. No action needed. Reply STOP to opt out.`;
}

// -- the job -----------------------------------------------------------------

export function jobUpdateText(input: {
  businessName: string;
  jobRef: string;
  title: string;
  body: string | null;
}): string {
  const updateBody = input.body ? ` ${input.body}` : '';
  return `${input.businessName} posted an update for job ${input.jobRef}: ${input.title}.${updateBody} Reply STOP to opt out.`;
}

/**
 * WRITTEN FROM THE HOMEOWNER'S SIDE, which it was not.
 *
 * It used to open "{business} created your client dashboard for job {ref}." —
 * three problems in eleven words. A homeowner does not have a client dashboard;
 * the contractor does, and "client" is what the software calls them, not what
 * they call themselves. It reported an internal event ("we created a record")
 * where the reader wants to know what they have been sent. And it led with a
 * job reference, which is how the two of them will refer to the work later but
 * means nothing in the first four words of a text from a number you may not
 * have saved.
 *
 * So: who it is from, what they are getting, what to do, the link. "X here —"
 * is the voice arrivalTimeChangedText already uses. Both branches came out
 * shorter than the one they replaced, which is not nothing at 160 characters.
 *
 * It surfaced because the /features hero now renders this message at full size
 * — a page showing a contractor what goes out under their name is also the
 * first place anybody reads it as a customer would.
 */
export function clientJobDashboardText(input: {
  businessName: string;
  jobRef: string;
  link: string;
  includesScheduleOptions?: boolean;
}): string {
  const invitation = input.includesScheduleOptions
    ? `your quote for job ${input.jobRef} is ready. Review it and choose a start date:`
    : `track job ${input.jobRef} any time. Updates, invoices and payments in one place:`;
  return `${input.businessName} here — ${invitation} ${input.link}. Reply STOP to opt out.`;
}

/**
 * The customer asked for their own portal link, by number.
 *
 * Sent only in direct answer to somebody typing their mobile into the
 * contractor's portal page. It leads with the business name because it arrives
 * unprompted-looking on a lock screen seconds later, and a bare link from an
 * unknown sender is indistinguishable from a phishing text — the name is the
 * only thing that makes it legible as the thing they just asked for.
 *
 * No job reference: this link is the customer's WHOLE history with the
 * business, not one job.
 */
export function portalLinkText(input: { businessName: string; link: string }): string {
  return `${input.businessName} here — your jobs, invoices and receipts in one place: ${input.link} The link works for 90 days. Reply STOP to opt out.`;
}

/**
 * The quote changed after it went out.
 *
 * WHY THIS EXISTS AT ALL. Saving an edit to a quote the homeowner has already
 * been sent changed the number on their screen and told them nothing — they
 * came back to a link they had already read and the total was different, with
 * no message anywhere saying so. Silence there is not neutral; it is the shape
 * of a bait and switch even when the edit is a correction in their favour.
 *
 * It names the direction and the number, because "your quote has been updated"
 * is the sentence that makes somebody open a link fearing the worst. Whether
 * the total went up, went down or stayed the same is the first thing they want
 * to know, and it costs eight words to say.
 */
export function quoteUpdatedText(input: {
  businessName: string;
  jobRef: string;
  link: string;
  /** Formatted, e.g. "$3,300.00". Omitted when the job has no itemized total. */
  total?: string | null;
  direction?: 'up' | 'down' | 'same';
}): string {
  const move =
    input.direction === 'up' ? 'went up to' : input.direction === 'down' ? 'came down to' : 'is now';
  const amount = input.total ? ` The total ${move} ${input.total}.` : '';
  return `${input.businessName} here — your quote for job ${input.jobRef} has been updated.${amount} Review and approve it here: ${input.link}. Reply STOP to opt out.`;
}

export function schedulingOptionsText(input: {
  businessName: string;
  jobRef: string;
  clientName: string;
  link: string;
}): string {
  return `${input.businessName} has 3 service times available for ${input.jobRef}. ${input.clientName}, choose one or request different times: ${input.link}. Reply STOP to opt out.`;
}

// -- the lead ----------------------------------------------------------------

/** No opt-out line: a code the person just asked for, expiring in minutes. */
export function verificationCodeText(input: { businessName: string; code: string }): string {
  return `Your ${input.businessName} verification code is ${input.code}. It expires in 10 minutes.`;
}

export function leadDeclineText(input: {
  leadName: string;
  businessName: string;
  reason: string;
}): string {
  return `Hi ${input.leadName}, thanks for reaching out to ${input.businessName}. Unfortunately ${input.reason}, so we won't be able to take this one on. We appreciate you thinking of us! Reply STOP to opt out.`;
}

export function leadQuoteVisitText(input: {
  businessName: string;
  leadName: string;
  address: string | null;
  scheduledFor: string;
  scheduledTime: string;
}): string {
  const addressNote = input.address ? ` at ${input.address}` : '';
  return `${input.businessName} scheduled your free in-person quote${addressNote} for ${formatJobSchedule(input.scheduledFor, input.scheduledTime)}. ${input.leadName}, reply STOP to opt out.`;
}

export function leadQuoteVisitOptionsText(input: {
  businessName: string;
  leadName: string;
  address: string | null;
  options: Array<{ date: string; time: string | null }>;
}): string {
  const addressNote = input.address ? ` for ${input.address}` : '';
  const optionText = input.options
    .map((option, index) => `${index + 1}) ${formatJobSchedule(option.date, option.time)}`)
    .join(' ');
  return `${input.businessName} has quote visit times available${addressNote}. ${input.leadName}, reply with 1, 2, or 3: ${optionText}. Reply STOP to opt out.`;
}

// -- money -------------------------------------------------------------------

/**
 * The four payment texts. HELP as well as STOP here, unlike everywhere else —
 * this family carries a payment link, and a carrier reviewing a money message
 * expects both keywords.
 */
export function paymentText(input: {
  contractor: string;
  label: string | null;
  amount: number;
  link: string;
  eventType: PaymentSmsEvent;
}): string {
  const amount = formatMoney(Number(input.amount));
  const label = input.label || 'payment';
  const optOut = 'Reply STOP to opt out or HELP for help.';
  if (input.eventType === 'payment_requested') return `${input.contractor} requested a ${label} of ${amount}. Pay securely: ${input.link}. ${optOut}`;
  if (input.eventType === 'payment_paid') return `Your ${label} of ${amount} to ${input.contractor} was received successfully. Thank you. ${optOut}`;
  if (input.eventType === 'payment_failed') return `Your ${label} of ${amount} to ${input.contractor} was not completed. Try again: ${input.link}. ${optOut}`;
  return `A refund of ${amount} from ${input.contractor} has been processed. ${optOut}`;
}

export function cardSetupText(input: { businessName: string; url: string }): string {
  return `${input.businessName} set up automatic billing for your recurring service. Save your card securely — no charge now: ${input.url}. Reply STOP to opt out.`;
}

export function cardUpdateText(input: { businessName: string; url: string }): string {
  return `Your saved card for ${input.businessName} was declined, so your recurring payment didn't go through. Update your card here to keep your service going: ${input.url}. Reply STOP to opt out.`;
}

// -- coming back -------------------------------------------------------------

export function rebookInviteText(input: {
  businessName: string;
  clientName: string;
  url: string;
}): string {
  return `Hi ${input.clientName}, it's ${input.businessName} — it's been a while! Ready to book us again? Request a time here: ${input.url}. Reply STOP to opt out.`;
}

/**
 * A WINDOW, not a time, and that is the whole message. One slow job turns a
 * promised "8:07 AM" into a text that was wrong the moment it was sent.
 */
export function arrivalTimeChangedText(input: {
  businessName: string;
  clientName: string;
  windowLabel: string;
}): string {
  return `${input.clientName}, ${input.businessName} here — your new arrival window is ${input.windowLabel}. Reply here if that doesn't work and we'll sort it out. Reply STOP to opt out.`;
}

/**
 * "Your choices are ready" — the board, shared by the contractor pressing send.
 *
 * Deliberately not the same words as the scheduled reminder in
 * lib/choice-reminders. This one announces a board that has just been shared and
 * has no deadline behind it; the reminder names what is still outstanding and
 * how late it is. One message doing both jobs is one message that is slightly
 * untrue half the time.
 *
 * Lived in lib/selections as `chaseMessage`, which is where a function that
 * sends a text should never have been: that file is the board's arithmetic, and
 * it is imported by the customer-facing job page.
 */
export function selectionRequestText(input: {
  businessName: string;
  clientName: string;
  count: number;
  overdue: boolean;
  url: string;
}): string {
  const first = input.clientName.trim().split(/\s+/)[0] || 'there';
  const what = input.count === 1 ? 'a choice' : `${input.count} choices`;
  const body = input.overdue
    ? `we're waiting on ${what} from you before we can order`
    : `${what} to make when you get a minute`;
  return `${first}, ${input.businessName} here — ${body}: ${input.url}. Reply STOP to opt out.`;
}

// -- the owner's own words, in our envelope ----------------------------------

/**
 * These two carry text the contractor typed. All this app contributes is the
 * envelope: who it is from, and the opt-out line. Worth keeping separate in the
 * catalogue — "we wrote this" and "we addressed this" are different promises.
 */
export function inboxReplyText(input: { businessName: string; body: string }): string {
  return `${input.businessName}: ${input.body}`;
}

export function campaignText(input: { businessName: string; body: string }): string {
  return `${input.businessName}: ${input.body} Reply STOP to opt out.`;
}

export function callerVoicePostCallFollowupText(input: {
  businessName: string;
  callerName?: string | null;
  scheduledTime?: string | null;
  portalUrl?: string | null;
  issueSummary?: string | null;
}): string {
  const greeting = input.callerName?.trim() ? `Hi ${input.callerName.trim()}, ` : '';
  if (input.scheduledTime) {
    const linkClause = input.portalUrl ? ` Details & manage: ${input.portalUrl}` : '';
    return withOptOut(
      `${greeting}thanks for calling ${input.businessName}! We've reserved your appointment for ${input.scheduledTime}.${linkClause}`
    );
  }
  const linkClause = input.portalUrl ? ` View status: ${input.portalUrl}` : '';
  const issueClause = input.issueSummary ? ` regarding ${input.issueSummary}` : '';
  return withOptOut(
    `${greeting}thanks for calling ${input.businessName}! We received your inquiry${issueClause}.${linkClause}`
  );
}

// -- the ones that live with their own logic ---------------------------------

/**
 * Re-exported rather than moved. A builder that needs the follow-up schedule,
 * the reminder window, the review routing rules or the offer envelope belongs
 * beside those rules — but every caller should still have one import for "the
 * words of a text message".
 */
export { appointmentReminderText } from '@/lib/appointment-reminders';
export { buildArrivalMessage } from '@/lib/arrival';
export { choiceReminderText } from '@/lib/choice-reminders';
export { composeOfferMessage } from '@/lib/estimate-offers';
export { missedCallTextBack } from '@/lib/missed-call';
export { quoteFollowupText } from '@/lib/quote-followups';
export { reviewRequestText } from '@/lib/review-routing';
