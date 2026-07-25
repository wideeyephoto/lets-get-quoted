'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { sendCampaign, type CampaignAudience, type CampaignChannel } from '@/lib/campaigns';
import { sendCampaignEmail } from '@/lib/email';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';

const CHANNELS: CampaignChannel[] = ['email', 'sms', 'both'];
const AUDIENCES: CampaignAudience[] = ['all', 'past', 'repeat', 'lapsed'];

// Resolve the sender identity shown in marketing email: the display name and the
// CAN-SPAM physical mailing address (contractor's own, else platform fallback).
async function resolveSenderIdentity(
  supabase: Awaited<ReturnType<typeof requireOwnerContext>>['supabase'],
  accountId: string,
): Promise<{ businessName: string; mailingAddress: string | null }> {
  const [{ data: account }, { data: site }] = await Promise.all([
    // Defensive select: mailing_address may not exist on an un-migrated DB, so
    // read it in its own query that can degrade instead of failing the action.
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const { data: addressRow } = await supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle();
  return {
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    mailingAddress: resolveMarketingMailingAddress(addressRow?.mailing_address as string | null),
  };
}

export async function sendCampaignAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const channel = String(formData.get('channel') ?? '') as CampaignChannel;
  const audience = String(formData.get('audience') ?? '') as CampaignAudience;
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!CHANNELS.includes(channel)) throw new Error('Pick how you want to reach people.');
  if (!AUDIENCES.includes(audience)) throw new Error('Pick who this goes to.');
  if (!body) throw new Error('Write a message before sending.');
  if ((channel === 'email' || channel === 'both') && !subject) {
    throw new Error('Add a subject line for the email.');
  }

  const { businessName, mailingAddress } = await resolveSenderIdentity(supabase, accountId);
  // CAN-SPAM: a marketing email must carry a physical postal address. Block the
  // email broadcast until one is on file (their own, or a platform fallback).
  if ((channel === 'email' || channel === 'both') && !mailingAddress) {
    throw new Error('Add your business mailing address in Settings before sending marketing emails — it’s required by anti-spam law.');
  }
  const result = await sendCampaign(supabase, accountId, { channel, audience, subject, body, businessName, mailingAddress });

  revalidatePath('/dashboard/campaigns');
  const params = new URLSearchParams({
    sent: String(result.emailSent + result.smsSent),
    recipients: String(result.recipientCount),
    skipped: String(result.skipped),
    failed: String(result.failed),
  });
  redirect(`/dashboard/campaigns?${params.toString()}`);
}

// Send just the email version to the owner's own inbox so they can eyeball it
// before broadcasting. No audience, no SMS — a preview, not a send.
export async function sendTestEmailAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const subject = String(formData.get('subject') ?? '').trim() || 'Test message';
  const body = String(formData.get('body') ?? '').trim();
  if (!body) throw new Error('Write a message first.');

  const { data: userData } = await supabase.auth.getUser();
  const to = userData.user?.email;
  if (!to) throw new Error('No email on file to send a test to.');

  const { businessName, mailingAddress } = await resolveSenderIdentity(supabase, accountId);
  await sendCampaignEmail({ recipientEmail: to, businessName, subject: `[Test] ${subject}`, body, accountId, mailingAddress });

  revalidatePath('/dashboard/campaigns');
  redirect('/dashboard/campaigns?test=1');
}
