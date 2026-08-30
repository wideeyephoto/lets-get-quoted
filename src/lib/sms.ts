import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import {
  adWalletRefillText,
  appointmentReminderText,
  arrivalTimeChangedText,
  campaignText,
  cardSetupText,
  cardUpdateText,
  clientJobDashboardText,
  quoteUpdatedText,
  crewAssignmentText,
  crewWelcomeText,
  crewPhoneVerificationCodeText,
  crewScheduleSelectedText,
  inboxReplyText,
  intakeConfirmationText,
  jobUpdateText,
  leadDeclineText,
  leadQuoteVisitOptionsText,
  leadQuoteVisitText,
  missedCallTextBack,
  ownerHighValueLeadText,
  ownerVerificationCodeText,
  ownerVoiceEmergencyAlertText,
  callerVoiceBookingLinkText,
  callerVoiceBookingConfirmationText,
  callerVoicePostCallFollowupText,
  paymentText,
  quickStopConfirmedText,
  quickStopOfferText,
  quoteFollowupText,
  rebookInviteText,
  reviewRequestText,
  schedulingOptionsText,
  upcomingAdPaymentAlertText,
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
import {
  isSmsProviderConfigured,
  outboundSmsSuppression,
} from '@/lib/sms-provider';
import {
  enqueueSmsDelivery,
  type SmsDeliveryContext,
  type SmsSenderPurpose,
} from '@/lib/sms-delivery';
import type { SmsBillingCategory } from '@/lib/sms-billing-policy';
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

type QueueAccountSmsInput = Readonly<{
  accountId: string;
  phone: string;
  body: string;
  messageKind: string;
  category: SmsBillingCategory;
  context?: SmsDeliveryContext;
  eventType?: string;
  idempotencyKey?: string;
  paymentId?: string;
  crewId?: string;
  senderPurpose?: SmsSenderPurpose;
  senderNumberId?: string;
}>;

const SMS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Queue an account-scoped text and return its durable event id. */
async function queueAccountSms(input: QueueAccountSmsInput): Promise<string> {
  const phoneNumber = normalizeUsPhone(input.phone) ?? input.phone.trim();
  const queued = await enqueueSmsDelivery({
    accountId: input.accountId,
    phoneNumber,
    body: input.body,
    messageKind: input.messageKind,
    billingCategory: input.category,
    context: input.context ?? 'customer',
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    paymentId: input.paymentId,
    crewId: input.crewId,
    senderPurpose: input.senderPurpose,
    senderNumberId: input.senderNumberId,
  });
  return queued.eventId;
}

async function queueAuthorizedInboxMessage(input: {
  accountId: string;
  phone: string;
  body: string;
  idempotencyKey: string;
  requireExistingThread: boolean;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('enqueue_authorized_inbox_message', {
    p_account_id: input.accountId,
    p_phone_number: input.phone,
    p_body: input.body,
    p_idempotency_key: input.idempotencyKey,
    p_require_existing_thread: input.requireExistingThread,
  });
  if (error) {
    if (error.code === 'P5110') throw new Error('This is not an existing message thread. Start a new conversation instead.');
    if (error.code === 'P5111') throw new Error('This contact does not have current SMS consent.');
    if (error.code === 'P5112') throw new Error('This contact does not have customer-scoped SMS consent. Record consent through a customer workflow before texting them.');
    throw new Error(`Inbox message enqueue failed (${error.code || 'unknown'}).`);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || typeof result.sms_event_id !== 'string' || !SMS_UUID.test(result.sms_event_id)
      || typeof result.task_state !== 'string' || typeof result.created !== 'boolean') {
    throw new Error('Inbox message enqueue returned an invalid result.');
  }
  return result.sms_event_id.toLowerCase();
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.alertPhone);
    if (!to) return;
    if (await isPhoneOptedOut(input.accountId, to)) return;
    const body = ownerHighValueLeadText(input);
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'owner-high-value-lead',
      category: 'owner_alert',
      context: 'owner',
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    console.error('Owner high-value lead SMS failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Sends an urgent emergency SMS alert to the contractor owner whenever a caller
 * reports an emergency hazard (gas leak, flooding, burst pipe, electrical fire).
 *
 * Best-effort: never throws so voice call settlement is never interrupted.
 */
export async function sendOwnerVoiceEmergencyAlertSms(input: {
  accountId: string;
  alertPhone: string;
  businessName: string;
  callerPhone: string | null;
  hazardSummary: string;
  dashboardUrl: string;
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.alertPhone);
    if (!to) return;
    if (await isPhoneOptedOut(input.accountId, to)) return;
    const body = ownerVoiceEmergencyAlertText({
      businessName: input.businessName,
      callerNumber: input.callerPhone,
      hazardSummary: input.hazardSummary,
      dashboardUrl: input.dashboardUrl,
    });
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'owner-voice-emergency-alert',
      category: 'owner_alert',
      context: 'owner',
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    console.error('Owner voice emergency alert SMS failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Sends an instant SMS containing the business booking link to a caller during an AI voice call.
 */
export async function sendCallerVoiceBookingLinkSms(input: {
  accountId: string;
  callerPhone: string;
  bookingUrl: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const to = normalizeUsPhone(input.callerPhone);
    if (!to) return { ok: false, error: 'Invalid phone number' };
    if (await isPhoneOptedOut(input.accountId, to)) {
      return { ok: false, error: 'Caller opted out of SMS' };
    }

    const admin = createAdminClient();
    const businessName = await loadBusinessName(admin, input.accountId);
    const body = callerVoiceBookingLinkText({
      businessName,
      bookingUrl: input.bookingUrl,
    });

    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'caller-voice-booking-link',
      category: 'customer_message',
      context: 'customer',
      senderPurpose: 'contractor_dedicated',
      idempotencyKey: input.idempotencyKey,
    });

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Caller voice booking link SMS failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Sends an instant SMS confirmation to a caller after an appointment slot is held/scheduled during an AI voice call.
 */
export async function sendCallerVoiceBookingConfirmationSms(input: {
  accountId: string;
  callerPhone: string;
  whenLabel: string;
  serviceAddress?: string | null;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const to = normalizeUsPhone(input.callerPhone);
    if (!to) return { ok: false, error: 'Invalid phone number' };
    if (await isPhoneOptedOut(input.accountId, to)) {
      return { ok: false, error: 'Caller opted out of SMS' };
    }

    const admin = createAdminClient();
    const businessName = await loadBusinessName(admin, input.accountId);
    const body = callerVoiceBookingConfirmationText({
      businessName,
      whenLabel: input.whenLabel,
      serviceAddress: input.serviceAddress,
    });

    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'caller-voice-booking-confirmation',
      category: 'customer_message',
      context: 'customer',
      senderPurpose: 'contractor_dedicated',
      idempotencyKey: input.idempotencyKey,
    });

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Caller voice booking confirmation SMS failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Sends an automated post-call follow-up SMS to a caller after an AI voice receptionist call completes.
 */
export async function sendCallerVoicePostCallFollowupSms(input: {
  accountId: string;
  callerPhone: string;
  callerName?: string | null;
  scheduledTime?: string | null;
  portalUrl?: string | null;
  issueSummary?: string | null;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const to = normalizeUsPhone(input.callerPhone);
    if (!to) return { ok: false, error: 'Invalid phone number' };
    if (await isPhoneOptedOut(input.accountId, to)) {
      return { ok: false, error: 'Caller opted out of SMS' };
    }

    const admin = createAdminClient();
    const businessName = await loadBusinessName(admin, input.accountId);
    const body = callerVoicePostCallFollowupText({
      businessName,
      callerName: input.callerName,
      scheduledTime: input.scheduledTime,
      portalUrl: input.portalUrl,
      issueSummary: input.issueSummary,
    });

    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'caller-voice-post-call-followup',
      category: 'customer_message',
      context: 'customer',
      senderPurpose: 'contractor_dedicated',
      idempotencyKey: input.idempotencyKey,
    });

    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Caller voice post-call follow-up SMS failed:', msg);
    return { ok: false, error: msg };
  }
}

/**
 * Sends a one-time 6-digit verification code to the contractor's alert phone number.
 */
export async function sendOwnerPhoneVerificationSms(input: {
  accountId: string;
  phone: string;
  code: string;
  idempotencyKey?: string;
}): Promise<string> {
  const to = normalizeUsPhone(input.phone);
  if (!to) throw new Error('Invalid phone number.');
  const body = ownerVerificationCodeText({ code: input.code });
  return queueAccountSms({
    accountId: input.accountId,
    phone: to,
    body,
    messageKind: 'owner-phone-verification',
    category: 'verification',
    context: 'owner',
    idempotencyKey: input.idempotencyKey ?? `owner-verify:${input.accountId}:${to}:${Date.now()}`,
  });
}

/**
 * Sends a one-time 6-digit verification code to a crew member's phone number.
 */
export async function sendCrewPhoneVerificationCodeSms(input: {
  accountId: string;
  phone: string;
  code: string;
  businessName: string;
  idempotencyKey?: string;
}): Promise<string> {
  const to = normalizeUsPhone(input.phone);
  if (!to) throw new Error('Invalid phone number.');
  const body = crewPhoneVerificationCodeText({ businessName: input.businessName, code: input.code });
  return queueAccountSms({
    accountId: input.accountId,
    phone: to,
    body,
    messageKind: 'crew-phone-verification',
    category: 'verification',
    context: 'crew',
    idempotencyKey: input.idempotencyKey ?? `crew-verify:${input.accountId}:${to}:${Date.now()}`,
  });
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
  idempotencyKey?: string;
}): Promise<string> {
  return queueAccountSms({
    accountId: input.accountId,
    phone: input.toPhone,
    body: input.message,
    messageKind: 'estimate-offer',
    category: 'customer_message',
    idempotencyKey: input.idempotencyKey,
  });
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    if (await isPhoneOptedOut(input.accountId, input.toPhone)) return;
    await queueAccountSms({
      accountId: input.accountId,
      phone: input.toPhone,
      body: withOptOut(input.message),
      messageKind: 'booking-decision',
      category: 'customer_message',
      idempotencyKey: input.idempotencyKey,
    });
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
    // The recipient is requesting this exact text from the public portal.
    // Establish an insert-only ledger row before enqueue; a prior/concurrent
    // STOP still wins and the worker rechecks it at egress.
    if (!(await ensureSmsConsentBaseline(input.accountId, input.toPhone, 'portal_link_request'))) return;
    await queueAccountSms({
      accountId: input.accountId,
      phone: input.toPhone,
      body: withOptOut(input.message),
      messageKind: 'portal-link',
      category: 'customer_message',
    });
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.alertPhone);
    if (!to) return;
    if (await isPhoneOptedOut(input.accountId, to)) return;
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body: withOptOut(input.message),
      messageKind: 'owner-estimate-accepted',
      category: 'owner_alert',
      context: 'owner',
      idempotencyKey: input.idempotencyKey,
    });
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = quickStopOfferText(input);
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'quick-stop-offer',
      category: 'payment_message',
      idempotencyKey: input.idempotencyKey,
    });
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = quickStopConfirmedText(input);
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'quick-stop-confirmed',
      category: 'payment_message',
      idempotencyKey: input.idempotencyKey,
    });
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
  idempotencyKey: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(input.toPhone);
    if (!to || (await isPhoneOptedOut(input.accountId, to))) return;
    const body = withOptOut(input.message);
    await queueAccountSms({
      accountId: input.accountId,
      phone: to,
      body,
      messageKind: 'quick-stop-status',
      category: 'payment_message',
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    console.error('Quick Stop status SMS failed:', error instanceof Error ? error.message : error);
  }
}

export async function recordSmsConsent(accountId: string, phone: string, source = 'payment_request') {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) throw new Error('A valid US phone number is required to record SMS consent.');
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // Keep the STOP guard in the write itself. A read followed by an upsert has
  // a race where an inbound STOP can land between the two statements and then
  // be overwritten back to opted_in.
  const { data: updated, error: updateError } = await admin
    .from('sms_consent')
    .update({
      status: 'opted_in',
      source,
      consented_at: now,
      opted_out_at: null,
      updated_at: now,
    })
    .eq('account_id', accountId)
    .eq('phone_number', normalized)
    .neq('status', 'opted_out')
    .select('id');
  if (updateError) throw updateError;
  if (updated && updated.length > 0) return;

  const { data: existing, error: lookupError } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', normalized)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.status === 'opted_out') {
    throw new Error('This homeowner opted out of texts. They must text START before receiving another message.');
  }
  if (existing) return;

  const { error: insertError } = await admin.from('sms_consent').insert({
    account_id: accountId,
    phone_number: normalized,
    status: 'opted_in',
    source,
    consented_at: now,
    updated_at: now,
  });
  if (!insertError) return;

  // A unique conflict means START/STOP or another consent writer won the
  // insert race. Re-read once and honor the state that actually won; never
  // retry with an upsert that could erase STOP.
  if (insertError.code === '23505') {
    const { data: raced, error: racedReadError } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', accountId)
      .eq('phone_number', normalized)
      .maybeSingle();
    if (racedReadError) throw racedReadError;
    if (raced?.status === 'opted_out') {
      throw new Error('This homeowner opted out of texts. They must text START before receiving another message.');
    }
    if (raced?.status === 'opted_in') return;
  }
  throw insertError;
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

// Manual compose is different from replying to an inbound message: the app
// must already have affirmative, current consent and may not manufacture it
// merely because an owner typed a phone number. Read failures fail closed.
export async function hasCurrentSmsConsent(accountId: string, phone: string): Promise<boolean> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) return false;
  const admin = createAdminClient();
  const [baseResult, scopeResult] = await Promise.all([
    admin
      .from('sms_consent')
      .select('status,consented_at,opted_out_at')
      .eq('account_id', accountId)
      .eq('phone_number', normalized)
      .maybeSingle(),
    admin
      .from('sms_consent_scopes')
      .select('consent_scope')
      .eq('account_id', accountId)
      .eq('phone_number', normalized)
      .eq('consent_scope', 'customer')
      .maybeSingle(),
  ]);
  if (baseResult.error || scopeResult.error) {
    console.error(
      `Current customer SMS consent check failed for ${normalized}; refusing manual compose:`,
      baseResult.error?.message ?? scopeResult.error?.message,
    );
    return false;
  }
  const base = baseResult.data;
  return scopeResult.data?.consent_scope === 'customer'
    && base?.status === 'opted_in'
    && Boolean(base.consented_at)
    && !base.opted_out_at;
}

// Atomically establishes the approved audience scope for an insert-if-absent
// baseline. The DB boundary never overwrites STOP and still adds customer scope
// when a portal/call request shares a phone with an older crew/owner row.
// Storage failures throw so callers about to enqueue fail honestly; legacy
// best-effort setup callers explicitly catch where that is acceptable.
export type SmsConsentBaselineSource =
  | 'crew_added'
  | 'subcontractor_added'
  | 'portal_link_request'
  | 'missed_call_text_back';

export async function ensureSmsConsentBaseline(
  accountId: string,
  phone: string,
  source: SmsConsentBaselineSource = 'crew_added',
): Promise<boolean> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) return false; // can't track an unparseable number
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('ensure_sms_consent_baseline_scope', {
    p_account_id: accountId,
    p_phone_number: normalized,
    p_source: source,
  });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('SMS consent baseline returned an invalid result.');
  return data;
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

// Sends a crew-directed text through the consent ledger. An opted-out number is
// skipped; otherwise the atomic enqueue RPC creates both sms_events and its
// delivery task. Producers never write orphan ledger rows for preflight skips.
async function deliverCrewSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  eventType: CrewSmsEvent;
  body: string;
  idempotencyKey: string;
}): Promise<{ status: 'queued' | 'opted_out' | 'failed'; eventId?: string }> {
  const normalized = normalizeUsPhone(params.phone) ?? params.phone.trim();

  if (await isPhoneOptedOut(params.accountId, normalized)) {
    return { status: 'opted_out' };
  }

  try {
    const eventId = await queueAccountSms({
      accountId: params.accountId,
      phone: normalized,
      body: params.body,
      messageKind: params.eventType === 'crew_assigned' ? 'crew-assignment' : 'crew-scheduled',
      category: 'crew_message',
      context: 'crew',
      eventType: params.eventType,
      crewId: params.crewId,
      senderPurpose: 'lgq_dispatch',
      idempotencyKey: params.idempotencyKey,
    });
    return { status: 'queued', eventId };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
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
 * Reason 1 above used to claim isSmsConfigured() is TRUE under vitest and so
 * cannot be relied on alone. That has never been true: the test env sets an
 * account sid and a token but no sender, so the config predicate fails and
 * isSmsConfigured() is already false. The gate is real, the stated reason for
 * it was not, and a wrong reason is worse than none — it is what stops the next
 * person noticing that the protection is one `TWILIO_FROM_NUMBER=` away from
 * evaporating. test/sms-provider.test.ts now pins that, and a setup file blocks
 * the socket outright.
 *
 * THIS NO LONGER GUARDS ONE SENDER. It used to, and that was the bug: this
 * predicate had exactly one caller — sendSubcontractorSms — while the other
 * ~30 send functions in this file checked nothing but whether a provider was
 * configured. A preview deploy or a staging box holding live credentials would
 * text real customers payment reminders, arrival texts and crew assignments
 * while dutifully simulating subcontractor offers.
 *
 * The answer was not to add a call to twenty-nine functions and hope the
 * thirtieth remembers. outboundSmsSuppression() now sits at the single fetch in
 * sendProviderMessage, so nothing reaches a carrier without passing it. What is
 * left here is the same question asked for a different purpose — the DASHBOARD
 * needs to know, so it can say out loud that a dispatch was simulated — and it
 * reads the one predicate rather than restating its four clauses.
 */
export function isLiveMessagingEnvironment(): boolean {
  return outboundSmsSuppression() === null;
}

export type SubcontractorSmsResult = {
  status: 'queued' | 'failed' | 'opted_out' | 'simulated';
  /** Durable local event identity. Carrier provider_id arrives asynchronously. */
  smsEventId: string | null;
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
  /** Stable identity of the domain notification, for crash-safe queue retries. */
  idempotencyKey: string;
}): Promise<SubcontractorSmsResult> {
  const normalized = normalizeUsPhone(params.phone) ?? params.phone.trim();

  if (await isPhoneOptedOut(params.accountId, normalized)) {
    return { status: 'opted_out', smsEventId: null };
  }

  // sendProviderMessage now refuses to reach a carrier in any of these
  // environments on its own, so this is no longer the thing standing between a
  // preview deploy and a real subcontractor's phone. It stays because this
  // caller needs a distinct STATUS — the dashboard prints "simulated" from it
  // — and because there is no reason to compose a request nobody will send.
  if (!isLiveMessagingEnvironment()) {
    // Simulation is a domain result, not carrier evidence. In particular it
    // must not manufacture a `sent` sms_events row without a delivery task.
    return { status: 'simulated', smsEventId: null };
  }

  try {
    const smsEventId = await queueAccountSms({
      accountId: params.accountId,
      phone: normalized,
      body: params.body,
      messageKind: params.eventType.replace(/_/g, '-'),
      category: 'crew_message',
      context: 'subcontractor',
      eventType: params.eventType,
      crewId: params.crewId,
      senderPurpose: 'lgq_dispatch',
      idempotencyKey: params.idempotencyKey,
    });
    return { status: 'queued', smsEventId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'SMS delivery failed.';
    console.error(`Subcontractor SMS ${params.eventType} failed for crew ${params.crewId}:`, reason);
    return { status: 'failed', smsEventId: null, error: reason };
  }
}

export async function sendPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('payments')
    .select('id, account_id, amount, label, homeowner_phone, sms_consent, account:accounts!payments_account_id_fkey(business_name)')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) throw error ?? new Error('Payment not found for SMS.');
  const payment = data as unknown as SmsPayment;
  if (!payment.sms_consent || !payment.homeowner_phone) return { status: 'skipped' as const };
  const phoneNumber = normalizeUsPhone(payment.homeowner_phone);
  if (!phoneNumber) return { status: 'failed' as const, error: 'SMS destination is invalid.' };

  const { data: consent } = await admin.from('sms_consent').select('status').eq('account_id', payment.account_id).eq('phone_number', phoneNumber).maybeSingle();
  // The site's name before the account's, and never the placeholder.
  const contractor = await loadBusinessName(admin, payment.account_id);
  const body = messageFor(payment, eventType, contractor);
  if (consent?.status === 'opted_out') {
    return { status: 'opted_out' as const };
  }

  try {
    const queued = await enqueueSmsDelivery({
      accountId: payment.account_id,
      phoneNumber,
      body,
      messageKind: eventType.replace(/_/g, '-'),
      billingCategory: 'payment_message',
      senderPurpose: 'contractor_dedicated',
      context: 'payment',
      eventType,
      idempotencyKey: `payment:${payment.id}:${eventType}`,
      paymentId: payment.id,
    }, admin);
    return {
      status: queued.created ? 'queued' as const : 'duplicate' as const,
      eventId: queued.eventId,
      deliveryState: queued.state,
    };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
    console.error(`SMS ${eventType} could not be queued for payment ${payment.id}:`, reason);
    return { status: 'failed' as const, error: reason };
  }
}

export async function retryFailedPaymentSmsEvent(paymentId: string, eventType: PaymentSmsEvent) {
  // Delivery history is immutable. Reusing the business key returns the exact
  // existing event; a terminal or indeterminate task belongs in operator
  // review instead of being deleted and blindly sent again.
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
  idempotencyKey: string;
}) {
  const body = crewAssignmentText(params);
  return deliverCrewSms({ accountId: params.accountId, crewId: params.crewId, phone: params.phone, eventType: 'crew_assigned', body, idempotencyKey: params.idempotencyKey });
}

/**
 * Sends a welcome/onboarding SMS to a newly registered crew member or subcontractor
 * letting them know they can text/voice in job updates, site notes, and receipt photos.
 */
export async function sendCrewWelcomeSms(params: {
  accountId: string;
  crewId: string;
  phone: string;
  crewName: string;
  businessName: string;
}): Promise<{ status: 'queued' | 'opted_out' | 'failed'; eventId?: string }> {
  const normalized = normalizeUsPhone(params.phone) ?? params.phone.trim();
  if (await isPhoneOptedOut(params.accountId, normalized)) {
    return { status: 'opted_out' };
  }

  const body = crewWelcomeText({
    crewName: params.crewName,
    businessName: params.businessName,
  });

  try {
    const eventId = await queueAccountSms({
      accountId: params.accountId,
      phone: normalized,
      body,
      messageKind: 'crew-welcome',
      category: 'crew_message',
      context: 'crew',
      eventType: 'crew_welcome',
      crewId: params.crewId,
      senderPurpose: 'lgq_shared',
      idempotencyKey: `crew-welcome:${params.crewId}`,
    });
    return { status: 'queued', eventId };
  } catch (sendError) {
    const reason = sendError instanceof Error ? sendError.message : 'SMS delivery failed.';
    console.error(`Crew welcome SMS failed for crew ${params.crewId}:`, reason);
    return { status: 'failed' };
  }
}

/**
 * Returns the company's active shared field texting line, or null if unprovisioned.
 */
export async function getSharedFieldPhoneNumber(admin = createAdminClient()): Promise<string | null> {
  const { data } = await admin
    .from('sms_sender_numbers')
    .select('e164_number')
    .eq('purpose', 'lgq_shared')
    .eq('provisioning_status', 'active')
    .eq('assignment_state', 'assigned')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.e164_number ? String(data.e164_number) : null;
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
  idempotencyKey: string;
}) {
  const body = crewScheduleSelectedText(params);
  return deliverCrewSms({ accountId: params.accountId, crewId: params.crewId, phone: params.phone, eventType: 'crew_scheduled', body, idempotencyKey: params.idempotencyKey });
}

export async function sendJobUpdateSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  title: string;
  body: string | null;
  accountId: string;
  idempotencyKey: string;
}) {
  const message = jobUpdateText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'job-update',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

export async function sendClientJobDashboardSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  token: string;
  includesScheduleOptions?: boolean;
  accountId: string;
  idempotencyKey: string;
}) {
  const message = clientJobDashboardText({ ...params, link: clientJobLink(params.token) });
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'client-job-dashboard',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
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
  accountId: string;
  idempotencyKey: string;
}) {
  const message = quoteUpdatedText({ ...params, link: clientJobLink(params.token) });
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'quote-updated',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// Whether an SMS provider is configured — features that depend on texting
// (phone verification, decline texts) degrade gracefully when it isn't.
export function isSmsConfigured(): boolean {
  return isSmsProviderConfigured();
}

// One-time code for verifying a lead's phone number before intake submits.
// Although the visitor has not become a lead yet, the public site belongs to a
// real workspace. Pin this traffic to that contractor's active dedicated
// sender and durable queue; it must never borrow LGQ's shared Campaign.
export async function sendVerificationCodeSms(params: {
  accountId: string;
  senderNumberId: string;
  phone: string;
  businessName: string;
  code: string;
  idempotencyKey: string;
}) {
  const message = verificationCodeText(params);
  // Entering the code request is affirmative consent for this transactional
  // message. recordSmsConsent preserves an existing STOP and fails closed.
  await recordSmsConsent(params.accountId, params.phone, 'lead_verification_request');
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'lead-verification',
    category: 'verification',
    context: 'customer',
    senderPurpose: 'contractor_dedicated',
    senderNumberId: params.senderNumberId,
    idempotencyKey: params.idempotencyKey,
  });
}

// One-tap polite decline for a lead that isn't a fit — closing the loop in one
// text protects reviews vs. ghosting. Caller checks opt-out state first.
export async function sendLeadDeclineSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  reason: string;
  accountId: string;
  idempotencyKey: string;
}) {
  const message = leadDeclineText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'lead-decline',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

export async function sendLeadQuoteVisitSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  address: string | null;
  scheduledFor: string;
  scheduledTime: string;
  accountId: string;
  idempotencyKey: string;
}) {
  const message = leadQuoteVisitText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'lead-quote-visit',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

export async function sendLeadQuoteVisitOptionsSms(params: {
  phone: string;
  businessName: string;
  leadName: string;
  address: string | null;
  options: Array<{ date: string; time: string | null }>;
  accountId: string;
  idempotencyKey: string;
}) {
  const message = leadQuoteVisitOptionsText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'lead-quote-visit-options',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

export async function sendSchedulingOptionsSms(params: {
  phone: string;
  businessName: string;
  jobRef: string;
  clientName: string;
  token: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  const message = schedulingOptionsText({ ...params, link: scheduleLink(params.token) });
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'scheduling-options',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// A free-form contractor reply from the two-way inbox. Prefixed with the
// business name so the client knows who's texting from the shared number.
// Returns the provider message id for the message log. Caller checks opt-out.
//
// accountId is REQUIRED here, unlike most helpers in this file, and this is the
// first caller of the text-credit meter. Both for the same reason: it is the one
// outbound message whose billing is not in question. A contractor typing a reply
// to their own customer is unambiguously their workspace's own text -- it is not
// a self-alert, not a payment message, and not a lead-verification code, which
// are the three categories with distinct billing policy. See 1.2 in
// docs/entitlement-gap-roadmap-2026-08-19.md.
export async function sendInboxReplySms(params: {
  phone: string;
  businessName: string;
  body: string;
  accountId: string;
  idempotencyKey: string;
  /** Replies require an existing durable thread; compose intentionally does not. */
  requireExistingThread: boolean;
}): Promise<string> {
  const phone = normalizeUsPhone(params.phone);
  if (!phone) throw new Error('Inbox message destination must be a valid US phone number.');
  return queueAuthorizedInboxMessage({
    accountId: params.accountId,
    phone,
    body: inboxReplyText(params),
    idempotencyKey: params.idempotencyKey,
    requireExistingThread: params.requireExistingThread,
  });
}

// Gentle nudge on a quote the client hasn't approved yet. Sent by the follow-up
// cron; the caller enforces consent (opted-in ledger) before this runs.
export async function sendQuoteFollowupSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  // Shared with the settings preview so the contractor is shown the message
  // their client actually receives.
  const message = quoteFollowupText({
    businessName: params.businessName,
    clientName: params.clientName,
    url: params.url,
  });
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'quote-followup',
    category: 'customer_message',
    context: 'automation',
    idempotencyKey: params.idempotencyKey,
  });
}

// "Book again" nudge to a past customer — turns a finished job into the next
// one. Caller enforces consent (opted-in ledger). Mirrored into the inbox.
export async function sendRebookInviteSms(params: {
  phone: string;
  businessName: string;
  clientName: string;
  url: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  const message = rebookInviteText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'rebook-invite',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
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
  accountId: string;
  idempotencyKey?: string;
}) {
  // Composed by appointmentReminderText, not here. It was written inline — the
  // one message in this family without a builder — so the settings preview was
  // a hand-typed copy beside it, and it had already drifted: no "Let's Get
  // Quoted:" prefix, no address clause. Now the card renders this exact string.
  const message = appointmentReminderText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'appointment-reminder',
    category: 'customer_message',
    context: 'automation',
    idempotencyKey: params.idempotencyKey,
  });
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
  idempotencyKey: string;
}): Promise<{ status: 'queued' | 'failed' | 'no_phone' | 'opted_out'; eventId?: string; error?: string }> {
  if (!params.phone) return { status: 'no_phone' };
  const to = normalizeUsPhone(params.phone);
  if (!to) return { status: 'no_phone' };
  if (await isPhoneOptedOut(params.accountId, to)) return { status: 'opted_out' };
  try {
    const eventId = await queueAccountSms({
      accountId: params.accountId,
      phone: to,
      body: params.message,
      messageKind: 'arrival',
      category: 'customer_message',
      idempotencyKey: params.idempotencyKey,
    });
    return { status: 'queued', eventId };
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
  accountId: string;
  idempotencyKey: string;
}) {
  // A window rather than a time on purpose: one slow job turns a promised
  // "8:07 AM" into a text that was wrong the moment it was sent.
  const message = arrivalTimeChangedText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'arrival-time-changed',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// Auto text-back after a missed call. The caller reached out first, so a single
// reply is solicited; still honors opt-out + STOP, and mirrors to the inbox so
// the owner can reply. Returns null when the number is opted out.
export async function sendMissedCallTextBack(params: {
  accountId: string;
  phone: string;
  businessName: string;
  idempotencyKey?: string;
}): Promise<string | null> {
  if (await isPhoneOptedOut(params.accountId, params.phone)) return null;
  // Shared with the settings preview, so the words an owner reads there are the
  // words their caller gets. See lib/missed-call.
  const message = missedCallTextBack(params.businessName);
  // The call itself is the recipient initiating contact. Preserve any STOP
  // with insert-only consent and do it before enqueue so the worker sees a
  // complete ledger rather than cancelling an otherwise solicited reply.
  if (!(await ensureSmsConsentBaseline(params.accountId, params.phone, 'missed_call_text_back'))) return null;
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'missed-call',
    category: 'customer_message',
    context: 'automation',
    idempotencyKey: params.idempotencyKey,
  });
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
  idempotencyKey?: string;
}): Promise<string | null> {
  if (await isPhoneOptedOut(params.accountId, params.phone)) return null;
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: params.message,
    messageKind: 'selection-request',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// Sends a client the link to save a card for automatic billing on a recurring
// plan. No charge happens at this step — it just collects the card + mandate.
// Caller resolves consent; mirrored into the inbox like other customer texts.
export async function sendCardSetupSms(params: {
  phone: string;
  businessName: string;
  url: string;
  accountId: string;
  /** Explicit resend actions intentionally use a fresh one-off identity. */
  idempotencyKey?: string;
}) {
  const message = cardSetupText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'card-setup',
    category: 'payment_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// Dunning: the saved card was declined on a recurring charge. Ask the client to
// update it (same hosted setup flow, different framing). Caller resolves consent.
export async function sendCardUpdateSms(params: {
  phone: string;
  businessName: string;
  url: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  const message = cardUpdateText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'card-update',
    category: 'payment_message',
    context: 'automation',
    idempotencyKey: params.idempotencyKey,
  });
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
  accountId: string;
  idempotencyKey: string;
}) {
  const message = campaignText(params);
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'campaign',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
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
  accountId: string;
  idempotencyKey?: string;
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
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: message,
    messageKind: 'review-request',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

// Instant speed-to-lead auto-SMS response for paid ad-acquired leads.
export async function sendSpeedToLeadSms(params: {
  phone: string;
  businessName: string;
  body: string;
  accountId: string;
  idempotencyKey?: string;
}) {
  return queueAccountSms({
    accountId: params.accountId,
    phone: params.phone,
    body: params.body,
    messageKind: 'speed-to-lead',
    category: 'customer_message',
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Dispatches an SMS alert when an advertising wallet balance auto-refills.
 */
export async function sendAdWalletRefillSms(params: {
  accountId: string;
  phone: string;
  businessName: string;
  refillDollars: string;
  newBalanceDollars: string;
  previousBalanceDollars: string;
  idempotencyKey?: string;
}): Promise<void> {
  try {
    const to = normalizeUsPhone(params.phone);
    if (!to) return;
    if (await isPhoneOptedOut(params.accountId, to)) return;
    const body = adWalletRefillText({
      businessName: params.businessName,
      refillDollars: params.refillDollars,
      newBalanceDollars: params.newBalanceDollars,
      previousBalanceDollars: params.previousBalanceDollars,
    });
    await queueAccountSms({
      accountId: params.accountId,
      phone: to,
      body,
      messageKind: 'ad-wallet-refill',
      category: 'payment_message',
      context: 'owner',
      idempotencyKey: params.idempotencyKey,
    });
  } catch (error) {
    console.error('Ad wallet refill SMS alert failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Dispatches a 24-hour advance SMS notification for an upcoming ad budget subscription renewal.
 */
export async function sendUpcomingAdPaymentSms(params: {
  accountId: string;
  phone: string;
  businessName: string;
  amountDollars: number;
  renewalDateStr: string;
  idempotencyKey?: string;
}): Promise<boolean> {
  try {
    const to = normalizeUsPhone(params.phone);
    if (!to) return false;
    if (await isPhoneOptedOut(params.accountId, to)) return false;
    const body = upcomingAdPaymentAlertText({
      businessName: params.businessName,
      amountDollars: params.amountDollars,
      renewalDateStr: params.renewalDateStr,
    });
    await queueAccountSms({
      accountId: params.accountId,
      phone: to,
      body,
      messageKind: 'ad-upcoming-payment-alert',
      category: 'payment_message',
      context: 'owner',
      idempotencyKey: params.idempotencyKey,
    });
    return true;
  } catch (error) {
    console.error('Failed to send upcoming payment SMS alert:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Instant SMS confirmation sent to the homeowner upon completing an intake request.
 * Metered under 'customer_message' (costs 1 text message credit).
 */
export async function sendIntakeConfirmationSms(params: {
  accountId: string;
  phone: string;
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  estimate?: { min: number; max: number } | null;
  idempotencyKey?: string;
}): Promise<boolean> {
  try {
    const to = normalizeUsPhone(params.phone);
    if (!to) return false;
    if (await isPhoneOptedOut(params.accountId, to)) return false;

    const body = intakeConfirmationText({
      businessName: params.businessName,
      leadName: params.leadName,
      projectType: params.projectType,
      estimate: params.estimate,
    });

    await queueAccountSms({
      accountId: params.accountId,
      phone: to,
      body,
      messageKind: 'intake-confirmation',
      category: 'customer_message',
      idempotencyKey: params.idempotencyKey,
    });
    return true;
  } catch (error) {
    console.error('Intake confirmation SMS failed:', error instanceof Error ? error.message : error);
    return false;
  }
}


