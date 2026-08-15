'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordOwnerSmsConsent, recordSmsConsent, sendInboxReplySms } from '@/lib/sms';
import { loadBusinessName } from '@/lib/business-name';
import { logOutboundMessage, markThreadRead } from '@/lib/messages';
import { createMessageTemplate, deleteMessageTemplate } from '@/lib/message-templates';
import { loadOwnerAlerts, validateOwnerAlerts } from '@/lib/owner-sms';
import { OWNER_SMS_DISCLOSURE_VERSION } from '@/lib/owner-sms-disclosure';
import type { OwnerAlertsState } from '@/lib/owner-sms-state';

export async function sendReplyAction(phone: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const body = (formData.get('body') ?? '').toString().trim();
  const normalized = normalizeUsPhone(phone) ?? phone;
  if (!body) redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);

  // Respect opt-outs: a contact who replied STOP can't be messaged until they
  // text START, exactly like every other outbound path.
  if (await isPhoneOptedOut(accountId, normalized)) {
    throw new Error('This contact opted out of texts (replied STOP). They must text START before you can message them again.');
  }

  // The SAME name every other text in the product signs with. This read
  // accounts.business_name on its own, which on a live account is the signup
  // placeholder "My Business" — the owner's real name is in sites.company_name,
  // where the builder writes it — and fell back to OUR name when even that was
  // blank. So a customer who booked BrokePipes got a reply from "My Business",
  // or from "Let's Get Quoted contractor", in the one thread where they are
  // most likely to reply. See lib/business-name for the ladder.
  const businessName = await loadBusinessName(supabase, accountId);

  const providerId = await sendInboxReplySms({ phone: normalized, businessName, body });
  // The contact texted first, so consent is implied — keep the ledger current.
  await recordSmsConsent(accountId, normalized, 'inbox_reply');
  await logOutboundMessage(supabase, accountId, normalized, body, providerId);

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);
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
 * ensureSmsConsentBaseline rather than recordSmsConsent, deliberately: the
 * former never overwrites an existing row, so somebody who has already texted
 * STOP is not silently opted back in by pressing Save on a settings form. Only
 * a START from their own handset can do that, which is the entire point of an
 * opt-out.
 */
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

    const { error } = await supabase
      .from('accounts')
      .update({ alert_phone: normalized, high_value_sms_enabled: enabled })
      .eq('id', accountId);
    if (error) return { status: 'error', errors: [{ field: 'form', message: 'Could not save your notification settings.' }] };

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
    let suppressed = false;
    if (normalized && consented) {
      const outcome = await recordOwnerSmsConsent(accountId, normalized, OWNER_SMS_DISCLOSURE_VERSION);
      // A STOP outranks a tick in our own UI. Say so instead of reporting a
      // success that did not happen — they would otherwise sit waiting for
      // texts that are correctly being suppressed.
      if (outcome === 'suppressed') suppressed = true;
      if (outcome === 'failed') {
        return {
          status: 'error',
          errors: [{ field: 'consent', message: 'Your settings saved, but we could not record your consent. Try saving again.' }],
        };
      }
    }

    revalidatePath('/dashboard/messages');
    revalidatePath('/dashboard/automations');
    if (suppressed) {
      return {
        status: 'error',
        errors: [{
          field: 'consent',
          message: `Saved, but ${normalized} replied STOP to one of our texts. Text START from that phone to start them again — ticking this box cannot.`,
        }],
      };
    }
    return {
      status: 'saved',
      message: enabled && normalized ? `Alerts will text ${normalized}.` : 'Saved. Nothing will be texted to you.',
    };
  } catch {
    return { status: 'error', errors: [{ field: 'form', message: 'Could not save your notification settings.' }] };
  }
}

export async function createTemplateAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const title = (formData.get('title') ?? '').toString().trim();
  const body = (formData.get('body') ?? '').toString().trim();
  if (!title || !body) throw new Error('Give the reply a label and some text.');
  await createMessageTemplate(supabase, accountId, { title, body });
  revalidatePath('/dashboard/messages');
}

export async function deleteTemplateAction(templateId: string) {
  const { supabase, accountId } = await requireOwnerContext();
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
  const { supabase, accountId } = await requireOwnerContext();
  const rawPhone = (formData.get('phone') ?? '').toString().trim();
  const body = (formData.get('body') ?? '').toString().trim();

  const normalized = normalizeUsPhone(rawPhone);
  if (!normalized) throw new Error('Enter a 10-digit US mobile number.');
  if (!body) throw new Error('Type a message to send.');

  if (await isPhoneOptedOut(accountId, normalized)) {
    throw new Error('This contact opted out of texts (replied STOP). They must text START before you can message them again.');
  }

  // Same ladder as the reply above — and it matters more here, because this is
  // a text to somebody who has not messaged first and has only the name at the
  // top to decide whether it is spam.
  const businessName = await loadBusinessName(supabase, accountId);

  const providerId = await sendInboxReplySms({ phone: normalized, businessName, body });
  await recordSmsConsent(accountId, normalized, 'inbox_compose');
  await logOutboundMessage(supabase, accountId, normalized, body, providerId);

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);
}

/** Opening a thread is what marks it read — see markThreadRead on why "as of now". */
export async function markThreadReadAction(phone: string, readThrough?: string) {
  const { supabase, accountId } = await requireOwnerContext();
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
  const { supabase, accountId } = await requireOwnerContext();
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
