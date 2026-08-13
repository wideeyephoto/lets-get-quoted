import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import {
  appointmentReminderText,
  arrivalTimeChangedText,
  campaignText,
  cardSetupText,
  cardUpdateText,
  clientJobDashboardText,
  quoteUpdatedText,
  crewAssignmentText,
  crewScheduleSelectedText,
  inboxReplyText,
  jobUpdateText,
  leadDeclineText,
  leadQuoteVisitOptionsText,
  leadQuoteVisitText,
  missedCallTextBack,
  ownerHighValueLeadText,
  paymentText,
  quickStopConfirmedText,
  quickStopOfferText,
  quoteFollowupText,
  rebookInviteText,
  reviewRequestText,
  schedulingOptionsText,
  verificationCodeText,
  withOptOut,
} from '@/lib/sms-templates';
// The WORDS of every message below live in lib/sms-templates; this file is the
// sending of them. That split is what lets the outgoing-text catalogue on the
// messages page show the real string rather than a retyped copy — see the note
// in that file about the two previews that had already drifted before it existed.
//
// And the PROVIDER lives in lib/sms-provider: the endpoint, the credentials,
// the signature algorithm. This file used to hold all three inline, which meant
// every consent rule and every ledger write in it was one file away from a
// vendor's REST URL. What is left here is provider-neutral by construction —
// who may be texted, what is recorded, and what happens when a send fails.
import { isSmsProviderConfigured, sendProviderMessage, smsProviderConfig } from '@/lib/sms-provider';
import type { PaymentSmsEvent } from '@/lib/sms-templates';

export type { PaymentSmsEvent };
export type CrewSmsEvent = 'crew_assigned' | 'crew_scheduled';

type SmsPayment = {
  id: string;
  account_id: string;
  amount: number;
  label: string | null;
  homeowner_phone: string | null;
  sms_consent: boolean;
  account: { business_name: string } | null;
};

function paymentLink(paymentId: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return `${origin}/pay/${paymentId}`;
}

function scheduleLink(token: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return `${origin}/schedule/${token}`;
}

function clientJobLink(token: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  return `${origin}/client/jobs/${token}`;
}

/**
 * `contractor` is passed in rather than read off the payment row.
 *
 * It used to be `payment.account?.business_name || 'Your contractor'` — the
 * account name alone, which on most live accounts is still the signup
 * placeholder "My Business". So the text asking a homeowner to pay named a
 * business nobody has heard of, at the exact moment they are deciding whether a
 * payment link is genuine. See src/lib/business-name.ts for the ladder.
 */
function messageFor(payment: SmsPayment, eventType: PaymentSmsEvent, contractor: string) {
  return paymentText({
    contractor,
    label: payment.label,
    amount: Number(payment.amount),
    link: paymentLink(payment.id),
    eventType,
  });
}

/**
 * Urgent alert texted to the OWNER's own mobile when a high-value lead lands.
 *
 * Not logged to the customer inbox — this is a self-alert, not a conversation
 * with anybody — but it DOES go through the consent ledger, and it did not.
 *
 * WHAT WAS WRONG, PLAINLY. The comment here used to say this "skips consent
 * tracking" because the owner opted in by typing their number into settings.
 * Two things followed from that, and both were bad. The message body appends
 * "Reply STOP to opt out" (see withOptOut) — so it told people they could stop
 * it. And the inbound STOP handler only ever UPDATEs an existing sms_consent
 * row; an alert_phone that had never been through ensureSmsConsentBaseline had
 * no row, so a STOP flipped nothing and the next lead texted them anyway. An
 * instruction to reply STOP that does not work is worse than no instruction.
 *
 * Now: the setup dialog writes the baseline row when consent is given, and this
 * checks it. isPhoneOptedOut FAILS CLOSED — an unreadable ledger skips the send
 * — which for a lead alert means an owner occasionally misses one rather than a
 * person who said stop being texted again.
 *
 * accountId is required for that check, and it is not optional in the way it
 * looks: consent rows are keyed (account_id, phone_number).
 *
 * Best-effort: never throws — a texting hiccup must not sink lead capture.
 */
export async function sendOwnerHighValueLeadSms(input: {
  accountId: string;
  alertPhone: string;
  businessName: string;
  leadName: string;
  estimate: { min: number; max: number } | null;
  dashboardUrl: string;
}): Promise<void> {
  try {
    if (!smsProviderConfig()) return;
    const to = normalizeUsPhone(input.alertPhone);
    if (!to) return;
    if (await isPhoneOptedOut(input.accountId, to)) return;
    const body = ownerHighValueLeadText(input);
    await sendProviderMessage(to, body);
  } catch (error) {
    console.error('Owner high-value lead SMS failed:', error instanceof Error ? error.message : error);
  }
}

// The one text that asks a lead whether they want the gap in today's route.
//
// The body was written (or at least approved) by the contractor before this ran
// — nothing here is composed on the fly, because a homeowner who never asked to
// hear from us should not receive a machine-generated pitch. The envelope with
// the YES/NO instruction and the opt-out line is added by composeOfferMessage(),
// so this delivers `message` verbatim. Consent is the caller's to resolve.
export async function sendEstimateOfferSms(input: {
  accountId: string;
  toPhone: string;
  message: string;
}): Promise<string> {
  const providerId = await sendProviderMessage(input.toPhone, input.message);
  await logOutboundToInbox(input.accountId, input.toPhone, input.message, providerId);
  return providerId;
}

// Booking confirmed / declined by the contractor → customer.
//
// Transactional and expected: this person chose a slot on the booking page and
// was told the time was not locked in until the contractor confirmed. This is
// that answer arriving, so it is account-scoped and mirrored to the inbox like
// any other customer conversation.
//
// Best-effort by design. A text that fails to send must not roll back the
// confirmation — the appointment is real either way, and the alternative is an
// owner who pressed Confirm, saw an error, and has no idea whether the job is on
// their calendar.
export async function sendBookingDecisionSms(input: {
  accountId: string;
  toPhone: string;
  message: string;
}): Promise<void> {
  try {
    if (await isPhoneOptedOut(input.accountId, input.toPhone)) return;
    const providerId = await sendProviderMessage(input.toPhone, withOptOut(input.message));
    await logOutboundToInbox(input.accountId, input.toPhone, input.message, providerId);
  } catch (error) {
    console.error('Booking decision SMS failed:', error instanceof Error ? error.message : error);
  }
}

// The customer's own portal link, texted, because they asked for it by number.
//
// TRANSACTIONAL AND SOLICITED IN THE STRICTEST SENSE: this is sent only in
// direct response to somebody typing their own number into the contractor's
// portal page and pressing a button labelled "send me a link". There is no
// sweep, no schedule, and no way for a contractor to trigger it.
//
// Opt-out is still honoured. Somebody who has replied STOP has said not to text
// them, and "but they asked" is exactly the argument every unwanted message
// makes — if the number is opted out this sends nothing, and the page's
// acknowledgement is the same either way, so a stranger cannot learn from the
// silence.
//
// Best-effort and never throws. The caller must return an identical answer
// whether or not anything was sent, so an exception escaping here would leak
// the match through a 500.
export async function sendClientPortalLinkSms(input: {
  accountId: string;
  toPhone: string;
  message: string;
}): Promise<void> {
  try {
    if (await isPhoneOptedOut(input.accountId, input.toPhone)) return;
    const providerId = await sendProviderMessage(input.toPhone, withOptOut(input.message));
    await logOutboundToInbox(input.accountId, input.toPhone, input.message, providerId);
  } catch (error) {
    console.error('Portal link SMS failed:', error instanceof Error ? error.message : error);
  }
}

// Tells the contractor, on their own mobile, that a lead answered. A self-alert
// to the number they gave in the texting-setup dialog — not a customer
// conversation, so it skips the inbox. It does NOT skip the consent ledger:
// withOptOut appends "Reply STOP to opt out" to this one too, and honoring that
// is the whole of the promise. See sendOwnerHighValueLeadSms for what was
// broken and why. Best-effort: never throws, because it runs inside a Twilio
// webhook.
export async function sendOwnerEstimateAcceptedSms(input: {
  accountId: string;
  alertPhone: string;
  message: string;
}): Promise<void> {
  try {
    if (!smsProviderConfig()) return;
    const to = normalizeUsPhone(input.alertPhone);
    if (!to) return;
    if (await isPhoneOptedOut(input.accountId, to)) return;
    await sendProviderMessage(to, withOptOut(input.message));
  } catch (error) {
    console.error('Owner estimate-offer alert SMS failed:', error instanceof Error ? error.message : error);
  }
}

// Quick Stop offer → customer: the pay link + arrival window + fee + the
// hard 15-minute reservation deadline. Transactional (the customer gave their
// number to request this), account-scoped, mirrored to the inbox. Best-effort.
export async function sendQuickStopOfferSms(input: {
  accountId: string;
  toPhone: string;
  businessName: string;
  whenLabel: string;
  feeLabel: string;
  payUrl: string;
  minutes: number;
}): Promise<void> {
  try {
    if (!smsProviderConfig()) return;
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = quickStopOfferText(input);
    const sid = await sendProviderMessage(to, body);
    await logOutboundToInbox(input.accountId, to, body, sid);
  } catch (error) {
    console.error('Quick Stop offer SMS failed:', error instanceof Error ? error.message : error);
  }
}

// Quick Stop confirmed (payment cleared) → customer.
export async function sendQuickStopConfirmedSms(input: {
  accountId: string;
  toPhone: string;
  businessName: string;
  whenLabel: string;
  statusUrl?: string;
}): Promise<void> {
  try {
    if (!smsProviderConfig()) return;
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = quickStopConfirmedText(input);
    const sid = await sendProviderMessage(to, body);
    await logOutboundToInbox(input.accountId, to, body, sid);
  } catch (error) {
    console.error('Quick Stop confirmed SMS failed:', error instanceof Error ? error.message : error);
  }
}

// Generic Quick Stop status text → customer (en route / arrived / canceled /
// refunded). One helper keeps the M6 lifecycle texts consistent.
export async function sendQuickStopStatusSms(input: {
  accountId: string;
  toPhone: string;
  message: string;
}): Promise<void> {
  try {
    if (!smsProviderConfig()) return;
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = withOptOut(input.message);
    const sid = await sendProviderMessage(to, body);
    await logOutboundToInbox(input.accountId, to, body, sid);
  } catch (error) {
    console.error('Quick Stop status SMS failed:', error instanceof Error ? error.message : error);
  }
}

// Mirror an outbound customer text into the two-way inbox so threads are
// complete (system texts + their replies in one place). Best-effort and
// account-scoped; crew/verification texts are intentionally NOT logged (not a
// customer conversation). Callers pass accountId when the text is customer-facing.
async function logOutboundToInbox(accountId: string, phone: string, body: string, providerId?: string | null): Promise<void> {
  try {
    const normalized = normalizeUsPhone(phone) ?? phone.trim();
    await createAdminClient().from('sms_messages').insert({
      account_id: accountId,
      phone_number: normalized,
      direction: 'outbound',
      body,
      provider_id: providerId ?? null,
    });
  } catch (error) {
    console.error('Inbox outbound log failed:', error instanceof Error ? error.message : error);
  }
}

export async function recordSmsConsent(accountId: string, phone: string, source = 'payment_request') {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.status === 'opted_out') {
    throw new Error('This homeowner opted out of texts. They must text START before receiving another message.');
  }

  const now = new Date().toISOString();
  const { error } = await admin.from('sms_consent').upsert({
    account_id: accountId,
    phone_number: phone,
    status: 'opted_in',
    source,
    consented_at: now,
    opted_out_at: null,
    updated_at: now,
  }, { onConflict: 'account_id,phone_number' });
  if (error) throw error;
}

// True if this account has recorded an opt-out (STOP) for the phone. Consent
// rows store the E.164-normalized number, so we normalize before matching.
export async function isPhoneOptedOut(accountId: string, phone: string): Promise<boolean> {
  const normalized = normalizeUsPhone(phone) ?? phone.trim();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', normalized)
    .maybeSingle();
  // Fail closed: if consent can't be read, treat as opted-out and skip the
  // send rather than risk texting someone who opted out.
  if (error) {
    console.error(`Consent check failed for ${normalized}; skipping crew send:`, error.message);
    return true;
  }
  return data?.status === 'opted_out';
}

// Records a baseline opted-in consent row the first time we see a crew phone,
// so a later STOP has a row to flip (the inbound handler only UPDATEs existing
// rows). Insert-if-absent: never overwrites an existing row — so a prior
// opt-out is preserved and this never re-opts-in — and never throws.
export async function ensureSmsConsentBaseline(accountId: string, phone: string, source = 'crew_added'): Promise<void> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) return; // can't track an unparseable number
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from('sms_consent').upsert({
    account_id: accountId,
    phone_number: normalized,
    status: 'opted_in',
    source,
    consented_at: now,
    updated_at: now,
  }, { onConflict: 'account_id,phone_number', ignoreDuplicates: true });
}

export type OwnerConsentOutcome = 'recorded' | 'suppressed' | 'failed';

/**
 * Records an owner ticking the consent box, stamped with the wording they saw.
 *
 * WHY NOT ensureSmsConsentBaseline. That one is insert-if-absent — it never
 * overwrites, which is exactly right for a crew number nobody explicitly
 * consented for, and exactly wrong here. This has to be able to UPDATE an
 * existing row, because re-agreeing to new wording is the whole point and the
 * old row already exists.
 *
 * WHY NOT recordSmsConsent. That one throws on an opted-out number and is
 * keyed to a different story (a contractor attesting on a homeowner's behalf).
 * Here a STOP is not an error to report as a failure — it is a real state with
 * its own sentence on screen.
 *
 * THE STOP GUARD IS THE UPDATE'S OWN WHERE CLAUSE, not a read-then-write.
 *
 *   update ... where account_id = ? and phone_number = ? and status <> 'opted_out'
 *
 * A read-then-upsert would have a window: STOP arrives between the two
 * statements and the upsert cheerfully sets the row back to opted_in. Narrow,
 * but the thing it would silently undo is somebody telling us to stop texting
 * them, so it gets closed properly rather than commented as unlikely. Zero rows
 * updated means either no row (insert one) or an opted-out row (leave it).
 *
 * Never throws — the caller is a form action that has to render a result.
 */
export async function recordOwnerSmsConsent(
  accountId: string,
  phone: string,
  disclosureVersion: string,
): Promise<OwnerConsentOutcome> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) return 'failed';
  const admin = createAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: updated, error: updateError } = await admin
      .from('sms_consent')
      .update({
        status: 'opted_in',
        source: 'owner_alerts',
        consented_at: now,
        opted_out_at: null,
        disclosure_version: disclosureVersion,
        updated_at: now,
      })
      .eq('account_id', accountId)
      .eq('phone_number', normalized)
      .neq('status', 'opted_out')
      .select('id');
    if (updateError) throw new Error(updateError.message);
    if (updated && updated.length > 0) return 'recorded';

    // Nothing updated. Either there is no row, or the row says opted_out.
    const { data: existing, error: readError } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', accountId)
      .eq('phone_number', normalized)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) return existing.status === 'opted_out' ? 'suppressed' : 'failed';

    const { error: insertError } = await admin.from('sms_consent').insert({
      account_id: accountId,
      phone_number: normalized,
      status: 'opted_in',
      source: 'owner_alerts',
      consented_at: now,
      disclosure_version: disclosureVersion,
      updated_at: now,
    });
    // 23505 means a row appeared between the update and the insert. The only
    // thing that writes one mid-flight is the inbound STOP handler, so the
    // honest answer is suppressed rather than a retry that would race it again.
    if (insertError) return insertError.code === '23505' ? 'suppressed' : 'failed';
    return 'recorded';
  } catch (error) {
    console.error('Owner SMS consent write failed:', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

// Sends a crew-directed text through the consent ledger: an opted-out number is
// skipped (and logged as opted_out); otherwise a pending sms_events row is
// written, the text is sent, and the row is marked sent/failed. The number is
// normalized to match how consent/STOP rows are stored.
async function deliverCrewSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  eventType: CrewSmsEvent;
  body: string;
}): Promise<{ status: 'sent' | 'opted_out' | 'failed' }> {
  const admin = createAdminClient();
  const normalized = normalizeUsPhone(params.phone) ?? params.phone.trim();

  const base = {
    account_id: params.accountId,
    crew_id: params.crewId,
    context: 'crew',
    event_type: params.eventType,
    phone_number: normalized,
    body: params.body,
  };

  if (await isPhoneOptedOut(params.accountId, normalized)) {
    await admin.from('sms_events').insert({ ...base, status: 'opted_out' });
    return { status: 'opted_out' };
  }

  const { data: event } = await admin.from('sms_events').insert({ ...base, status: 'pending' }).select('id').single();

  try {
    const providerId = await sendProviderMessage(normalized, params.body);
    if (event) await admin.from('sms_events').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('id', event.id);
    return { status: 'sent' };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
    if (event) await admin.from('sms_events').update({ status: 'failed', error_reason: reason }).eq('id', event.id);
    console.error(`Crew SMS ${params.eventType} failed for crew ${params.crewId}:`, reason);
    return { status: 'failed' };
  }
}

// -- subcontractor dispatch ----------------------------------------------------

export type SubcontractorSmsEvent = 'sub_offer' | 'sub_offer_covered' | 'sub_offer_won' | 'sub_offer_cancelled';

/**
 * May this deployment text a real phone?
 *
 * FOUR WAYS TO ANSWER NO, and every one of them is a place a real subcontractor
 * has nearly been texted by accident:
 *
 *   1. A test run. Vitest sets dummy provider credentials (see vitest.config.ts)
 *      so importing this module works.
 *   2. A preview deploy. Every branch on Vercel gets a full database connection
 *      and a full crew table; a dispatch demo on one would text the real firms.
 *   3. An explicit off switch, for a staging environment that has live-looking
 *      credentials and must not use them.
 *   4. No provider configured at all, which is the ordinary local case.
 *
 * Anything that returns false here is SIMULATED: the offer, the ledger row and
 * the whole flow still happen, so the feature is demonstrable, and the dashboard
 * says out loud that nothing was delivered. See DispatchSimulationNotice.
 *
 * TWO THINGS THIS DOES NOT DO, both worth knowing before you trust it.
 *
 * Reason 1 above used to claim isSmsConfigured() is TRUE under vitest and so
 * cannot be relied on alone. That has never been true: the test env sets an
 * account sid and a token but no sender, so the config predicate fails and
 * isSmsConfigured() is already false. The gate is real, the stated reason for
 * it was not, and a wrong reason is worse than none — it is what stops the next
 * person noticing that the protection is one `TWILIO_FROM_NUMBER=` away from
 * evaporating. test/sms-provider.test.ts now pins that, and a setup file blocks
 * the socket outright.
 *
 * And this guards ONE sender. sendSubcontractorSms is the only caller; the
 * other ~30 send functions in this file check nothing but whether a provider is
 * configured. So a preview deploy or a staging box holding live credentials
 * WILL text real customers payment reminders, arrival texts and crew
 * assignments while dutifully simulating subcontractor offers. That is a real
 * bug, it predates the provider seam, and fixing it changes send behavior
 * across the whole application — which is why it is not riding along with a
 * refactor whose entire claim is that it changes no behavior.
 */
export function isLiveMessagingEnvironment(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false;
  if (process.env.VERCEL_ENV === 'preview') return false;
  if (process.env.LGQ_DISABLE_OUTBOUND_SMS === '1') return false;
  return isSmsConfigured();
}

export type SubcontractorSmsResult = {
  status: 'sent' | 'failed' | 'opted_out' | 'simulated';
  providerId: string | null;
  error?: string;
};

/**
 * One subcontractor-directed text, through the same consent ledger every other
 * crew text uses.
 *
 * Deliberately routed through sms_events (context='subcontractor') rather than a
 * second delivery log: an owner asking "did that go out and what did it say"
 * should get the answer from the same table whether it was a payment reminder,
 * a crew assignment or a job offer.
 *
 * Never throws. The caller is mid-way through a dispatch or an acceptance, and
 * a provider having a bad minute must not undo either — the failure is recorded
 * on the offer and shown on the page instead.
 */
export async function sendSubcontractorSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  eventType: SubcontractorSmsEvent;
  body: string;
}): Promise<SubcontractorSmsResult> {
  const admin = createAdminClient();
  const normalized = normalizeUsPhone(params.phone) ?? params.phone.trim();
  const base = {
    account_id: params.accountId,
    crew_id: params.crewId,
    context: 'subcontractor',
    event_type: params.eventType,
    phone_number: normalized,
    body: params.body,
  };

  const record = async (values: Record<string, unknown>) => {
    try {
      await admin.from('sms_events').insert({ ...base, ...values });
    } catch (error) {
      console.error('Subcontractor SMS ledger write failed:', error instanceof Error ? error.message : error);
    }
  };

  if (await isPhoneOptedOut(params.accountId, normalized)) {
    await record({ status: 'opted_out' });
    return { status: 'opted_out', providerId: null };
  }

  if (!isLiveMessagingEnvironment()) {
    // Recorded as sent with an unmistakable provider id. The row is the honest
    // account of what happened: the message was composed, addressed and would
    // have gone — and 'simulated' is not a message id anybody will mistake for
    // a Twilio SID while reading the ledger.
    await record({ status: 'sent', provider_id: 'simulated', sent_at: new Date().toISOString() });
    return { status: 'simulated', providerId: 'simulated' };
  }

  try {
    const providerId = await sendProviderMessage(normalized, params.body);
    await record({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() });
    return { status: 'sent', providerId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'SMS delivery failed.';
    await record({ status: 'failed', error_reason: reason });
    console.error(`Subcontractor SMS ${params.eventType} failed for crew ${params.crewId}:`, reason);
    return { status: 'failed', providerId: null, error: reason };
  }
}

export async function sendPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .select('id, account_id, amount, label, homeowner_phone, sms_consent, account:accounts(business_name)')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) throw error ?? new Error('Payment not found for SMS.');
  const payment = data as unknown as SmsPayment;
  if (!payment.sms_consent || !payment.homeowner_phone) return { status: 'skipped' as const };

  const { data: consent } = await admin.from('sms_consent').select('status').eq('account_id', payment.account_id).eq('phone_number', payment.homeowner_phone).maybeSingle();
  // The site's name before the account's, and never the placeholder.
  const contractor = await loadBusinessName(admin, payment.account_id);
  const body = messageFor(payment, eventType, contractor);
  if (consent?.status === 'opted_out') {
    await admin.from('sms_events').upsert({ account_id: payment.account_id, payment_id: payment.id, event_type: eventType, phone_number: payment.homeowner_phone, status: 'opted_out', body }, { onConflict: 'payment_id,event_type', ignoreDuplicates: true });
    return { status: 'opted_out' as const };
  }

  const { data: event, error: eventError } = await admin.from('sms_events').insert({
    account_id: payment.account_id,
    payment_id: payment.id,
    event_type: eventType,
    phone_number: payment.homeowner_phone,
    status: 'pending',
    body,
  }).select('id').single();
  if (eventError) {
    if (eventError.code === '23505') return { status: 'duplicate' as const };
    throw eventError;
  }

  try {
    const providerId = await sendProviderMessage(payment.homeowner_phone, body);
    await admin.from('sms_events').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('id', event.id);
    await logOutboundToInbox(payment.account_id, payment.homeowner_phone, body, providerId);
    return { status: 'sent' as const };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
    await admin.from('sms_events').update({ status: 'failed', error_reason: reason }).eq('id', event.id);
    console.error(`SMS ${eventType} failed for payment ${payment.id}:`, reason);
    return { status: 'failed' as const, error: reason };
  }
}

export async function retryFailedPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('sms_events')
    .delete()
    .eq('payment_id', paymentId)
    .eq('event_type', eventType)
    .eq('status', 'failed');
  if (error) throw error;
  return sendPaymentSmsEvent(paymentId, eventType);
}

// Notifies a crew member they were assigned to a job. Routes through
// deliverCrewSms, so it respects opt-outs and is recorded in the sms_events
// ledger (context='crew'). Callers still catch/log failures without
// blocking the assignment itself.
export async function sendCrewAssignmentSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  crewName: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  scheduledFor: string | null;
  scheduledTime?: string | null;
}) {
  const body = crewAssignmentText(params);
  return deliverCrewSms({ accountId: params.accountId, crewId: params.crewId, phone: params.phone, eventType: 'crew_assigned', body });
}

export async function sendCrewScheduleSelectedSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  crewName: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  address: string | null;
  scheduledFor: string;
  scheduledTime?: string | null;
}) {
  const body = crewScheduleSelectedText(params);
  return deliverCrewSms({ accountId: params.accountId, crewId: params.crewId, phone: params.phone, eventType: 'crew_scheduled', body });
}

export async function sendJobUpdateSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  title: string;
  body: string | null;
  accountId?: string;
}) {
  const message = jobUpdateText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

export async function sendClientJobDashboardSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  token: string;
  includesScheduleOptions?: boolean;
  accountId?: string;
}) {
  const message = clientJobDashboardText({ ...params, link: clientJobLink(params.token) });
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

/**
 * The quote changed after the homeowner already had it.
 *
 * Deliberately separate from sendClientJobDashboardSms: that one announces a
 * quote for the first time, and re-using it for an edit would tell somebody
 * their quote "is ready" for the second time and say nothing about what moved.
 */
export async function sendQuoteUpdatedSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  token: string;
  total?: string | null;
  direction?: 'up' | 'down' | 'same';
  accountId?: string;
}) {
  const message = quoteUpdatedText({ ...params, link: clientJobLink(params.token) });
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// Whether an SMS provider is configured — features that depend on texting
// (phone verification, decline texts) degrade gracefully when it isn't.
export function isSmsConfigured(): boolean {
  return isSmsProviderConfigured();
}

// One-time code for verifying a lead's phone number before intake submits.
export async function sendVerificationCodeSms(params: { phone: string; businessName: string; code: string }) {
  const message = verificationCodeText(params);
  return sendProviderMessage(params.phone, message);
}

// One-tap polite decline for a lead that isn't a fit — closing the loop in one
// text protects reviews vs. ghosting. Caller checks opt-out state first.
export async function sendLeadDeclineSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  reason: string;
  accountId?: string;
}) {
  const message = leadDeclineText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

export async function sendLeadQuoteVisitSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  address: string | null;
  scheduledFor: string;
  scheduledTime: string;
  accountId?: string;
}) {
  const message = leadQuoteVisitText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

export async function sendLeadQuoteVisitOptionsSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  address: string | null;
  options: Array<{ date: string; time: string | null }>;
  accountId?: string;
}) {
  const message = leadQuoteVisitOptionsText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

export async function sendSchedulingOptionsSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  token: string;
  accountId?: string;
}) {
  const message = schedulingOptionsText({ ...params, link: scheduleLink(params.token) });
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// A free-form contractor reply from the two-way inbox. Prefixed with the
// business name so the client knows who's texting from the shared number.
// Returns the provider message id for the message log. Caller checks opt-out.
export async function sendInboxReplySms(params: { phone: string; businessName: string; body: string }): Promise<string> {
  return sendProviderMessage(params.phone, inboxReplyText(params));
}

// Gentle nudge on a quote the client hasn't approved yet. Sent by the follow-up
// cron; the caller enforces consent (opted-in ledger) before this runs.
export async function sendQuoteFollowupSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId?: string;
}) {
  // Shared with the settings preview so the contractor is shown the message
  // their client actually receives.
  const message = quoteFollowupText({
    businessName: params.businessName,
    clientName: params.clientName,
    url: params.url,
  });
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// "Book again" nudge to a past customer — turns a finished job into the next
// one. Caller enforces consent (opted-in ledger). Mirrored into the inbox.
export async function sendRebookInviteSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId?: string;
}) {
  const message = rebookInviteText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// Day-before reminder for a scheduled job — cuts no-shows. Sent by the reminders
// cron; the caller enforces consent (opted-in ledger) before this runs. Mirrored
// into the two-way inbox like other customer texts.
export async function sendAppointmentReminderSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  whenLabel: string;
  address: string | null;
  accountId?: string;
}) {
  // Composed by appointmentReminderText, not here. It was written inline — the
  // one message in this family without a builder — so the settings preview was
  // a hand-typed copy beside it, and it had already drifted: no "Let's Get
  // Quoted:" prefix, no address clause. Now the card renders this exact string.
  const message = appointmentReminderText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

/**
 * Arrival texts — "on my way", a revised ETA, arrived, cancelled.
 *
 * Returns an OUTCOME instead of throwing or silently swallowing, because the
 * one thing a tech about to knock on a door needs to know is whether the
 * customer was actually told they were coming. "It says sent" and "it sent"
 * are different claims; every branch below is one the field app renders
 * differently.
 *
 * The body is composed by the caller (see buildArrivalMessage) — nothing is
 * written on the fly here, so what the tech approved in the preview is what
 * goes out, verbatim.
 */
export async function sendArrivalSms(params: {
  accountId: string;
  phone: string | null;
  message: string;
}): Promise<{ status: 'sent' | 'failed' | 'no_phone' | 'opted_out' | 'not_configured'; sid?: string; error?: string }> {
  if (!params.phone) return { status: 'no_phone' };
  const to = normalizeUsPhone(params.phone);
  if (!to) return { status: 'no_phone' };
  if (!smsProviderConfig()) return { status: 'not_configured' };
  if (await isPhoneOptedOut(params.accountId, to)) return { status: 'opted_out' };
  try {
    const sid = await sendProviderMessage(to, params.message);
    await logOutboundToInbox(params.accountId, to, params.message, sid);
    return { status: 'sent', sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Arrival SMS failed:', message);
    return { status: 'failed', error: message };
  }
}

// Tells a customer their arrival time shifted — sent only when the contractor
// opts to after re-planning a day's route. Never automatic: a silent time change
// is how you lose a customer. Caller resolves consent; mirrored to the inbox.
export async function sendArrivalTimeChangedSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  /** A RANGE, not a single time — see arrivalWindow(). "7:10 AM to 9:10 AM". */
  windowLabel: string;
  accountId?: string;
}) {
  // A window rather than a time on purpose: one slow job turns a promised
  // "8:07 AM" into a text that was wrong the moment it was sent.
  const message = arrivalTimeChangedText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// Auto text-back after a missed call. The caller reached out first, so a single
// reply is solicited; still honors opt-out + STOP, and mirrors to the inbox so
// the owner can reply. Returns null when the number is opted out.
export async function sendMissedCallTextBack(params: { accountId: string; phone: string; businessName: string }): Promise<string | null> {
  if (await isPhoneOptedOut(params.accountId, params.phone)) return null;
  // Shared with the settings preview, so the words an owner reads there are the
  // words their caller gets. See lib/missed-call.
  const message = missedCallTextBack(params.businessName);
  const providerId = await sendProviderMessage(params.phone, message);
  await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

/**
 * "There are choices waiting for you."
 *
 * The message is built by the caller — selectionRequestText in lib/sms-templates
 * for the contractor's own send, choiceReminderText in lib/choice-reminders for
 * the scheduled one — so the words that go out and the words the contractor
 * previews are the same string. Caller resolves consent; mirrored to the inbox
 * so a reply lands somewhere a human will see it.
 */
export async function sendSelectionRequestSms(params: {
  phone: string;
  accountId: string;
  message: string;
}): Promise<string | null> {
  if (await isPhoneOptedOut(params.accountId, params.phone)) return null;
  const providerId = await sendProviderMessage(params.phone, params.message);
  await logOutboundToInbox(params.accountId, params.phone, params.message, providerId);
  return providerId;
}

// Sends a client the link to save a card for automatic billing on a recurring
// plan. No charge happens at this step — it just collects the card + mandate.
// Caller resolves consent; mirrored into the inbox like other customer texts.
export async function sendCardSetupSms(params: {
  phone: string;
  businessName: string;
  url: string;
  accountId?: string;
}) {
  const message = cardSetupText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// Dunning: the saved card was declined on a recurring charge. Ask the client to
// update it (same hosted setup flow, different framing). Caller resolves consent.
export async function sendCardUpdateSms(params: {
  phone: string;
  businessName: string;
  url: string;
  accountId?: string;
}) {
  const message = cardUpdateText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// One-off broadcast to a past client (a seasonal offer, a "we're booking now"
// note). Consent is enforced by the caller (opted-in ledger only); this prefixes
// the sender so the shared-number recipient knows who it's from, appends the
// required opt-out line, and mirrors into the two-way inbox like every other
// customer text.
export async function sendCampaignSms(params: {
  phone: string;
  businessName: string;
  body: string;
  accountId?: string;
}) {
  const message = campaignText(params);
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}

// Post-job ask for a Google review — the loop that turns a finished job back
// into the next lead. Sent one-tap from the job page after the work's done and
// the client's happy. Job-context text (like job updates): consent is enforced
// by the caller via isPhoneOptedOut, so this just delivers.
export async function sendReviewRequestSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  reviewUrl: string;
  accountId?: string;
}) {
  // Ask everyone the same way. "If we earned it" reads as a nudge that only
  // happy customers should bother, which is the same selective solicitation
  // Google's review policy prohibits — just worded politely.
  //
  // Shared with the settings preview so a contractor reads the words that go
  // out under their name, not an approximation of them.
  const message = reviewRequestText({
    businessName: params.businessName,
    clientName: params.clientName,
    reviewUrl: params.reviewUrl,
  });
  const providerId = await sendProviderMessage(params.phone, message);
  if (params.accountId) await logOutboundToInbox(params.accountId, params.phone, message, providerId);
  return providerId;
}