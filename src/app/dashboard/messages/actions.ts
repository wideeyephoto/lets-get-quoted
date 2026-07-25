'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendInboxReplySms } from '@/lib/sms';
import { logOutboundMessage } from '@/lib/messages';
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
