'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendInboxReplySms } from '@/lib/sms';
import { logOutboundMessage, markThreadRead } from '@/lib/messages';
import { createMessageTemplate, deleteMessageTemplate } from '@/lib/message-templates';

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

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).single();
  const businessName = account?.business_name || "Let's Get Quoted contractor";

  const providerId = await sendInboxReplySms({ phone: normalized, businessName, body });
  // The contact texted first, so consent is implied — keep the ledger current.
  await recordSmsConsent(accountId, normalized, 'inbox_reply');
  await logOutboundMessage(supabase, accountId, normalized, body, providerId);

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);
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

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).single();
  const businessName = account?.business_name || "Let's Get Quoted contractor";

  const providerId = await sendInboxReplySms({ phone: normalized, businessName, body });
  await recordSmsConsent(accountId, normalized, 'inbox_compose');
  await logOutboundMessage(supabase, accountId, normalized, body, providerId);

  revalidatePath('/dashboard/messages');
  redirect(`/dashboard/messages?thread=${encodeURIComponent(normalized)}`);
}

/** Opening a thread is what marks it read — see markThreadRead on why "as of now". */
export async function markThreadReadAction(phone: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const normalized = normalizeUsPhone(phone) ?? phone;
  await markThreadRead(supabase, accountId, normalized);
  revalidatePath('/dashboard/messages');
  revalidatePath('/dashboard', 'layout');
}
