'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext, requireOwnerContext, createAdminClient } from '@/lib/auth';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { normalizeUsPhone } from '@/lib/phone';
import {
  hasCurrentSmsConsent,
  recordOwnerSmsConsent,
  sendInboxReplySms,
  sendOwnerPhoneVerificationSms,
} from '@/lib/sms';
import {
  generateOwnerVerificationCode,
  ownerPhoneVerificationToken,
  isOwnerPhoneVerificationValid,
} from '@/lib/owner-phone-verification';
import { loadBusinessName } from '@/lib/business-name';
import { markThreadRead } from '@/lib/messages';
import { createMessageTemplate, deleteMessageTemplate } from '@/lib/message-templates';
import { loadOwnerAlerts, validateOwnerAlerts } from '@/lib/owner-sms';
import { OWNER_SMS_DISCLOSURE_VERSION } from '@/lib/owner-sms-disclosure';
import type { OwnerAlertsState } from '@/lib/owner-sms-state';
import { requireActiveDedicatedMessagingSender } from '@/lib/messaging-number-provisioning';
import { runSmsInboxVisibleQuery } from '@/lib/sms-inbox-visibility';


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function messageIntent(formData: FormData): string {
  const value = String(formData.get('intentId') ?? '').trim().toLowerCase();
  if (!UUID.test(value)) throw new Error('This message form expired. Refresh and try again.');
  return value;
}

export async function sendReplyAction(phone: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  const body = (formData.get('body') ?? '').toString().trim();
  const intentId = messageIntent(formData);
  const normalized = normalizeUsPhone(phone);
  if (!normalized) throw new Error('This message thread has an invalid phone number.');
  if (!body) redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);

  // A platform/shared number is never a fallback for traffic sent in a
  // contractor's name. Fail before consent writes or the delivery enqueue.
  await requireActiveDedicatedMessagingSender(accountId);

  // The SAME name every other text in the product signs with. This read
  // accounts.business_name on its own, which on a live account is the signup
  // placeholder "My Business" — the owner's real name is in sites.company_name,
  // where the builder writes it — and fell back to OUR name when even that was
  // blank. So a customer who booked BrokePipes got a reply from "My Business",
  // or from "Let's Get Quoted contractor", in the one thread where they are
  // most likely to reply. See lib/business-name for the ladder.
  const businessName = await loadBusinessName(supabase, accountId);

  // Consent and durable-thread evidence are locked and rechecked inside the
  // enqueue RPC. A hand-edited ?thread= URL can never create consent or work.
  const eventId = await sendInboxReplySms({
    phone: normalized,
    businessName,
    body,
    accountId,
    idempotencyKey: `inbox-reply:${accountId}:${intentId}`,
    requireExistingThread: true,
  });

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}&sent=reply&queued=${encodeURIComponent(eventId)}`);
}

/**
 * The owner's own notification number, and the consent that goes with it.
 *
 * WHAT MOVED HERE, AND WHY IT HAD TO. This was one text input and one checkbox
 * folded inside a <details> labelled "Advanced — lead priority & alerts" on the
 * automations page, and the whole disclosure at the point of capture was
 * "Standard rates apply." No message frequency, no STOP or HELP, no statement
 * that consent is not a condition of purchase, and no link to the SMS terms —
 * which do exist, on a public page the dashboard never linked to. And the
 * checkbox wrote a feature flag: there was no record that anyone had agreed to
 * anything, or when.
 *
 * THE CONSENT LEDGER IS THE POINT. Saving now writes an sms_consent row for the
 * owner's number, which is the row the inbound STOP handler flips — it only ever
 * UPDATEs, so a number with no row could not be suppressed. Owner alert texts
 * told people to "Reply STOP to opt out" and then ignored them; see the note on
 * sendOwnerHighValueLeadSms.
 *
 * recordOwnerSmsConsent rather than the generic attestation writer,
 * deliberately: its conditional update never overwrites an opted-out row, so
 * somebody who already texted STOP is not silently opted back in by pressing
 * Save. Only START from their handset can restore that state.
 */
export type SendVerificationCodeResult =
  | { status: 'sent'; token: string; expiresAt: number; phone: string }
  | { status: 'error'; message: string };

export type VerifyCodeResult =
  | { status: 'verified'; phone: string }
  | { status: 'error'; message: string };

/**

 * Sends a 6-digit OTP SMS verification code to confirm ownership of the contractor's mobile number.
 */
export async function sendOwnerPhoneVerificationCodeAction(
  phone: string,
): Promise<SendVerificationCodeResult> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) {
    return { status: 'error', message: 'Enter a valid 10-digit US mobile number.' };
  }

  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();
    const isAllowed = await checkRateLimitStrict(admin, `owner_otp_send:${accountId}`, 5, 600);
    if (!isAllowed) {
      return { status: 'error', message: 'Too many verification code requests. Please wait a few minutes before trying again.' };
    }

    const code = generateOwnerVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    const token = ownerPhoneVerificationToken(accountId, normalized, code, expiresAt);

    await sendOwnerPhoneVerificationSms({
      accountId,
      phone: normalized,
      code,
    });

    return { status: 'sent', token, expiresAt, phone: normalized };
  } catch (err) {
    console.error('Failed to send owner verification code:', err);
    return { status: 'error', message: 'Could not send verification text. Please try again.' };
  }
}

/**
 * Validates the 6-digit OTP SMS code against the HMAC token and records SMS consent upon success.
 */
export async function verifyOwnerPhoneVerificationCodeAction(
  phone: string,
  code: string,
  token: string,
  expiresAt: number,
): Promise<VerifyCodeResult> {
  const normalized = normalizeUsPhone(phone);
  if (!normalized) {
    return { status: 'error', message: 'Enter a valid 10-digit US mobile number.' };
  }
  const cleanCode = code.trim().replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    return { status: 'error', message: 'Please enter the full 6-digit confirmation code.' };
  }

  try {
    const { accountId } = await requireOfficeContext('settings.write');
    const admin = createAdminClient();
    const isAllowed = await checkRateLimitStrict(admin, `owner_otp_verify:${accountId}`, 5, 600);
    if (!isAllowed) {
      return { status: 'error', message: 'Too many verification attempts. Please request a new code and try again.' };
    }

    const isValid = isOwnerPhoneVerificationValid(accountId, normalized, cleanCode, expiresAt, token);
    if (!isValid) {
      return { status: 'error', message: 'The 6-digit code is incorrect or has expired. Please request a new code.' };
    }

    // Verification is not durable until the consent ledger confirms the write.
    // A prior STOP remains authoritative and a failed write must never be
    // presented to the client as a verified number.
    const outcome = await recordOwnerSmsConsent(accountId, normalized, OWNER_SMS_DISCLOSURE_VERSION);
    if (outcome === 'suppressed') {
      return {
        status: 'error',
        message: 'This number previously replied STOP. Text START from that phone before verifying it again.',
      };
    }
    if (outcome === 'failed') {
      return { status: 'error', message: 'We verified the code but could not save the phone verification. Please try again.' };
    }

    return { status: 'verified', phone: normalized };
  } catch (err) {
    console.error('Failed to verify owner phone code:', err);
    return { status: 'error', message: 'Failed to verify code. Please try again.' };
  }
}


export async function saveOwnerAlertsAction(
  _previous: OwnerAlertsState,
  formData: FormData,
): Promise<OwnerAlertsState> {
  const enabled = formData.get('alertsEnabled') === 'on';
  const consented = formData.get('alertsConsent') === 'on';
  const phone = (formData.get('alertPhone') ?? '').toString();

  const errors = validateOwnerAlerts({ phone, enabled, consented });
  if (errors.length > 0) return { status: 'error', errors };

  try {
    const { supabase, accountId } = await requireOwnerContext();

    // The same read the strip does, and it is a guard rather than a formality:
    // if the settings could not be read they cannot be written either, and a
    // form that accepts a submission it cannot store leaves somebody believing
    // they are set up. The dialog disables the button on this too — this is the
    // half that holds when the button is reached another way.
    const current = await loadOwnerAlerts(accountId);
    if (current.kind === 'unavailable') {
      return {
        status: 'error',
        errors: [{ field: 'form', message: 'We could not read your current settings, so nothing was saved. Try again in a moment.' }],
      };
    }

    const normalized = phone.trim() ? normalizeUsPhone(phone.trim()) : null;

    // A new, changed, or legacy number with no consent evidence cannot become
    // the field hotline whitelist merely by being typed into this form. It
    // must carry a valid, phone-bound OTP.
    const verificationCode = (formData.get('verificationCode') ?? '').toString().trim();
    const verificationToken = (formData.get('verificationToken') ?? '').toString().trim();
    const verificationExpiresAt = Number(formData.get('verificationExpiresAt') ?? 0);
    const phoneNeedsVerification = Boolean(
      normalized && (normalized !== current.phone || current.consent === 'none'),
    );

    if (normalized && phoneNeedsVerification) {
      if (!verificationCode || !verificationToken || !Number.isFinite(verificationExpiresAt) || verificationExpiresAt <= 0) {
        return {
          status: 'error',
          errors: [{ field: 'phone', message: 'Verify this number with the 6-digit text code before saving it.' }],
        };
      }
      const admin = createAdminClient();
      const isAllowed = await checkRateLimitStrict(admin, `owner_otp_verify:${accountId}`, 5, 600);
      if (!isAllowed) {
        return {
          status: 'error',
          errors: [{ field: 'phone', message: 'Too many verification attempts. Request a new code and try again.' }],
        };
      }
      const isValid = isOwnerPhoneVerificationValid(
        accountId,
        normalized,
        verificationCode,
        verificationExpiresAt,
        verificationToken,
      );
      if (!isValid) {
        return {
          status: 'error',
          errors: [{ field: 'phone', message: 'The 6-digit verification code is invalid or has expired. Request a new code to verify.' }],
        };
      }
    }

    /**
     * The tick is what gets recorded, and it is recorded WITH THE WORDING.
     *
     * Keyed on the box, not on the alert switch: the switch is a preference
     * about one kind of text, the box is the permission. Recording the version
     * is what lets the ledger answer the only question a carrier asks — not
     * "did they agree" but "did they agree to THIS".
     *
     * Consent is never inferred. Typing a number does not do it and neither
     * does flipping the switch; validateOwnerAlerts refuses the save without
     * the box, and this line is the only thing in the app that writes an
     * owner_alerts consent row.
     */
    if (normalized && consented) {
      const outcome = await recordOwnerSmsConsent(accountId, normalized, OWNER_SMS_DISCLOSURE_VERSION);
      // A STOP outranks a tick in our own UI. Say so instead of reporting a
      // success that did not happen — they would otherwise sit waiting for
      // texts that are correctly being suppressed.
      if (outcome === 'suppressed') {
        return {
          status: 'error',
          errors: [{
            field: 'consent',
            message: `${normalized} replied STOP to one of our texts, so nothing was saved. Text START from that phone before trying again.`,
          }],
        };
      }
      if (outcome === 'failed') {
        return {
          status: 'error',
          errors: [{ field: 'consent', message: 'We could not record your consent, so nothing was saved. Try again.' }],
        };
      }
    }

    const { error } = await supabase
      .from('accounts')
      .update({ alert_phone: normalized, high_value_sms_enabled: enabled })
      .eq('id', accountId);
    if (error) {
      return {
        status: 'error',
        errors: [{
          field: 'form',
          message: 'Your phone settings were not updated. The verification record may have saved; try again.',
        }],
      };
    }

    revalidatePath('/dashboard/messages');
    revalidatePath('/dashboard/automations');
    revalidatePath('/dashboard/text-to-job');
    revalidatePath('/dashboard/schedule/booking');
    return {
      status: 'saved',
      message: enabled && normalized
        ? `Alerts will text ${normalized}.`
        : normalized
          ? 'Saved. Text-to-Job remains locked while field alerts are off.'
          : 'Saved. Nothing will be texted to you.',
      ready: Boolean(enabled && normalized && consented),
      phone: normalized,
      enabled,
    };
  } catch {
    return { status: 'error', errors: [{ field: 'form', message: 'Could not save your notification settings.' }] };
  }
}

export async function createTemplateAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  const title = (formData.get('title') ?? '').toString().trim();
  const body = (formData.get('body') ?? '').toString().trim();
  if (!title || !body) throw new Error('Give the reply a label and some text.');
  await createMessageTemplate(supabase, accountId, { title, body });
  revalidatePath('/dashboard/messages');
}

export async function deleteTemplateAction(templateId: string) {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  await deleteMessageTemplate(supabase, accountId, templateId);
  revalidatePath('/dashboard/messages');
}

/**
 * Start a conversation with somebody who hasn't texted first.
 *
 * The inbox could only ever reply. Everything else in the product sends texts —
 * quotes, reminders, arrival — but there was no way to simply message a customer
 * you already have, which is the thing a contractor does twenty times a day.
 *
 * Consent is the reason this is not just "reply to an arbitrary number": a
 * contact who has never given a number to this business, or who replied STOP,
 * must not be textable from here. The opt-out check below is the same one every
 * other outbound path uses.
 */
export async function startConversationAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  const rawPhone = (formData.get('phone') ?? '').toString().trim();
  const body = (formData.get('body') ?? '').toString().trim();
  const intentId = messageIntent(formData);

  const normalized = normalizeUsPhone(rawPhone);
  if (!normalized) throw new Error('Enter a 10-digit US mobile number.');
  if (!body) throw new Error('Type a message to send.');

  // The worker also verifies sender readiness, but the owner action must tell
  // the truth immediately instead of accepting a message that cannot leave.
  await requireActiveDedicatedMessagingSender(accountId);

  if (!(await hasCurrentSmsConsent(accountId, normalized))) {
    throw new Error('We do not have current SMS consent for this contact. Record consent through the customer workflow, or have them send your business a message. If they previously opted out, they must text START before you can reply.');
  }

  // Same ladder as the reply above — and it matters more here, because this is
  // a text to somebody who has not messaged first and has only the name at the
  // top to decide whether it is spam.
  const businessName = await loadBusinessName(supabase, accountId);

  const eventId = await sendInboxReplySms({
    phone: normalized,
    businessName,
    body,
    accountId,
    idempotencyKey: `inbox-reply:${accountId}:${intentId}`,
    requireExistingThread: false,
  });

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}&sent=compose&queued=${encodeURIComponent(eventId)}`);
}

/** Opening a thread is what marks it read — see markThreadRead on why "as of now". */
export async function markThreadReadAction(phone: string, readThrough?: string) {
  const { supabase, accountId } = await requireOfficeContext('messages.read');
  const normalized = normalizeUsPhone(phone) ?? phone;
  const updated = await markThreadRead(supabase, accountId, normalized, readThrough);
  revalidatePath('/dashboard/messages');
  revalidatePath('/dashboard', 'layout');
  return updated;
}

/**
 * Put the number you are texting into the customer book.
 *
 * The rail already told anyone with an unknown number that "adding them as a
 * client links it up" — an instruction with nothing behind it. This is that
 * something. It stays on the inbox rather than redirecting to the new client:
 * you are mid-conversation, and being thrown onto another page to come back is
 * how you lose your place in it.
 *
 * Matching on the NORMALIZED number, the same key the thread itself is filed
 * under, so pressing this twice adopts the existing customer instead of making
 * a second one.
 */
export async function addPhoneAsClientAction(phone: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('clients.write');
  const normalized = normalizeUsPhone(phone) ?? phone;
  const name = (formData.get('name') ?? '').toString().trim().slice(0, 160);
  if (!name) throw new Error('Give them a name so the thread has somebody on it.');

  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', normalized)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('clients').insert({ account_id: accountId, name, phone: normalized });
    if (error) throw new Error('Could not add them to your customers.');
  }

  revalidatePath('/dashboard/messages');
  revalidatePath('/dashboard/clients');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);
}

/**
 * Generates 3 smart contextual reply chips for the active SMS conversation.
 */
export async function suggestSmartRepliesAction(phone: string): Promise<{ ok: true; suggestions: string[] } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  const normalized = normalizeUsPhone(phone) ?? phone;
  if (!normalized) return { ok: false, message: 'Invalid phone number.' };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, message: 'AI generation is not configured.' };

  const { data: messages } = await runSmsInboxVisibleQuery((includeVisibilityFilter) => {
    let query = supabase
      .from('sms_messages')
      .select('direction, body, created_at')
      .eq('account_id', accountId)
      .eq('phone_number', normalized);
    if (includeVisibilityFilter) query = query.eq('inbox_visible', true);
    return query.order('created_at', { ascending: false }).limit(5);
  });

  if (!messages || messages.length === 0) {
    return {
      ok: true,
      suggestions: [
        'Hi! How can we help you today?',
        'Thanks for reaching out! What type of work do you need done?',
        'Hi there! Are you looking for a quote?',
      ],
    };
  }

  const threadContext = messages
    .reverse()
    .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Contractor'}: ${m.body}`)
    .join('\n');

  const instructions = [
    'You are a smart SMS assistant for a home services contractor.',
    'Given the recent SMS conversation history, produce EXACTLY 3 short, natural, helpful suggested replies that the contractor can send with one tap.',
    'Keep each reply concise (under 120 characters).',
    'Return STRICT JSON only: {"suggestions": ["<reply 1>", "<reply 2>", "<reply 3>"]}',
  ].join('\n');

  try {
    const { callModel } = await import('@/lib/ai-model-call');
    const response = await callModel({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      instructions,
      input: `CONVERSATION:\n${threadContext}`,
      text: { format: { type: 'json_object' } },
    }, { accountId, kind: 'marketing_draft' });

    if (!response.ok) throw new Error(`Model error: ${response.status}`);
    const payload = await response.json();
    const rawText = typeof payload?.output_text === 'string' ? payload.output_text : JSON.stringify(payload);
    const parsed = JSON.parse(rawText) as { suggestions?: string[] };
    const suggestions = (parsed.suggestions ?? []).filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 3);

    return {
      ok: true,
      suggestions: suggestions.length > 0 ? suggestions : [
        'Got it, thank you!',
        'We will look into this and get back to you shortly.',
        'Sounds good, see you then!',
      ],
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not generate smart replies.' };
  }
}

