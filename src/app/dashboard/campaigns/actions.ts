'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { sendCampaign, type CampaignAudience, type CampaignChannel } from '@/lib/campaigns';
import { sendCampaignEmail } from '@/lib/email';

const CHANNELS: CampaignChannel[] = ['email', 'sms', 'both'];
const AUDIENCES: CampaignAudience[] = ['all', 'past', 'repeat', 'lapsed'];

async function resolveBusinessName(supabase: Awaited<ReturnType<typeof requireOwnerContext>>['supabase'], accountId: string): Promise<string> {
  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  return site?.company_name || account?.business_name || "Let's Get Quoted contractor";
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

  const businessName = await resolveBusinessName(supabase, accountId);
  const result = await sendCampaign(supabase, accountId, { channel, audience, subject, body, businessName });

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

  const businessName = await resolveBusinessName(supabase, accountId);
  await sendCampaignEmail({ recipientEmail: to, businessName, subject: `[Test] ${subject}`, body });

  revalidatePath('/dashboard/campaigns');
  redirect('/dashboard/campaigns?test=1');
}
