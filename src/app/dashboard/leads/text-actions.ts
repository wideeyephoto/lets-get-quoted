'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { getLead, getLeadTriage } from '@/lib/leads';
import { loadBusinessName } from '@/lib/business-name';
import { normalizeUsPhone } from '@/lib/phone';
import {
  getMessagingCapability,
  formatClientDashboardSmsText,
  formatPrivateSmsText,
  type MessagingCapability,
} from '@/lib/dashboard-sms-dispatch';
import {
  isPhoneOptedOut,
  recordSmsConsent,
  sendInboxReplySms,
} from '@/lib/sms';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { requireActiveDedicatedMessagingSender } from '@/lib/messaging-number-provisioning';

import { createHash } from 'node:crypto';
import { findOrCreateClientId } from '@/lib/clients';
import { issuePortalLink } from '@/lib/client-portal-data';

export async function getAccountMessagingCapabilityAction(): Promise<MessagingCapability> {
  const { accountId } = await requireOfficeContext('messages.read');
  return getMessagingCapability(accountId);
}

/**
 * Sends a transactional SMS with the Client Dashboard / Portal link from the shared number.
 */
export async function sendLeadClientDashboardSmsAction(
  leadId: string,
  rawPhone: string,
  userIntentKey?: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { supabase, accountId } = await requireOfficeContext('leads.write');
  const admin = createAdminClient();

  const lead = await getLead(supabase, accountId, leadId);
  if (!lead) return { success: false, error: 'Lead not found.' };

  const phone = normalizeUsPhone(rawPhone);
  if (!phone) return { success: false, error: 'Invalid phone number.' };

  if (await isPhoneOptedOut(accountId, phone)) {
    return { success: false, error: 'This customer has opted out of text messages.' };
  }

  const businessName = await loadBusinessName(supabase, accountId);
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

  // Determine client dashboard link:
  // 1. If lead converted to job, use the job's client token link
  // 2. Otherwise ensure client record exists and use direct portal link or generic /portal
  let clientDashboardUrl = `${origin}/portal`;

  if (lead.converted_job) {
    const { data: job } = await admin
      .from('jobs')
      .select('client_token, ref')
      .eq('id', lead.converted_job)
      .eq('account_id', accountId)
      .maybeSingle();

    if (job?.client_token) {
      clientDashboardUrl = `${origin}/client/jobs/${job.client_token}`;
    }
  } else {
    try {
      await findOrCreateClientId(admin, accountId, {
        name: lead.name || 'there',
        phone,
        email: lead.email,
        address: lead.address,
      });
      const issued = await issuePortalLink(admin, accountId, { kind: 'sms', value: phone });
      if (issued) {
        clientDashboardUrl = `${origin}/portal/view/${issued.token}`;
      }
    } catch (e) {
      console.warn('Lead portal link generation fallback to /portal:', e);
    }
  }

  const messageText = formatClientDashboardSmsText({
    businessName,
    clientName: lead.name || 'there',
    clientDashboardUrl,
    nextActionPrompt: lead.converted_job ? 'Review Project & Next Steps' : 'Project Portal',
  });

  const bucket15m = Math.floor(Date.now() / (15 * 60 * 1000));
  const idempotencyKey = userIntentKey || `client-dash-sms:${lead.id}:${phone}:${bucket15m}`;

  try {
    await recordSmsConsent(accountId, phone, 'client_job_dashboard');
    await enqueueSmsDelivery({
      accountId,
      phoneNumber: phone,
      body: messageText,
      messageKind: 'client-job-dashboard',
      billingCategory: 'customer_message',
      context: 'customer',
      senderPurpose: 'lgq_shared',
      idempotencyKey,
    }, admin);

    // Log contact in lead triage as queued, preserving current status until delivery
    const triage = getLeadTriage(lead);
    const entry = {
      at: new Date().toISOString(),
      label: 'Client Dashboard Link Queued',
      note: `Queued for delivery to ${phone} from shared number.`,
    };
    const contactLog = [...(triage.contactLog ?? []), entry];

    await supabase
      .from('leads')
      .update({ triage: { ...triage, contactLog }, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', leadId);

    revalidatePath(`/dashboard/leads/${leadId}`);
    revalidatePath('/dashboard/leads');

    return {
      success: true,
      message: `Client Dashboard link queued for delivery to ${phone} via verified shared number.`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to send SMS.';
    console.error('sendLeadClientDashboardSmsAction error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Sends a private custom text message from the contractor's dedicated 2-way number.
 */
export async function sendLeadPrivateSmsAction(
  leadId: string,
  rawPhone: string,
  body: string,
  userIntentKey?: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { supabase, accountId } = await requireOfficeContext('messages.send');
  const admin = createAdminClient();

  const phone = normalizeUsPhone(rawPhone);
  if (!phone) return { success: false, error: 'Invalid phone number.' };

  const cleanBody = body.trim();
  if (!cleanBody) return { success: false, error: 'Please enter a message.' };

  // Require dedicated sender
  try {
    await requireActiveDedicatedMessagingSender(accountId, admin);
  } catch {
    return {
      success: false,
      error: 'A dedicated 2-way number is required for private custom texting. You can activate one in Messaging setup.',
    };
  }

  const businessName = await loadBusinessName(supabase, accountId);
  const formattedBody = formatPrivateSmsText({ businessName, body: cleanBody });
  const bodyHash = createHash('sha256').update(cleanBody).digest('hex').slice(0, 16);
  const bucket15m = Math.floor(Date.now() / (15 * 60 * 1000));
  const idempotencyKey = userIntentKey || `lead-private-sms:${leadId}:${phone}:${bodyHash}:${bucket15m}`;

  try {
    await sendInboxReplySms({
      phone,
      businessName,
      body: formattedBody,
      accountId,
      idempotencyKey,
      requireExistingThread: false,
    });

    const lead = await getLead(supabase, accountId, leadId);
    if (lead) {
      const triage = getLeadTriage(lead);
      const entry = {
        at: new Date().toISOString(),
        label: 'Private Text Queued',
        note: `Queued for delivery to ${phone} from dedicated number.`,
      };
      const contactLog = [...(triage.contactLog ?? []), entry];

      await supabase
        .from('leads')
        .update({ triage: { ...triage, contactLog }, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('id', leadId);
    }

    revalidatePath(`/dashboard/leads/${leadId}`);
    revalidatePath('/dashboard/leads');

    return {
      success: true,
      message: `Private text queued for delivery to ${phone} from your dedicated number.`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to send private SMS.';
    console.error('sendLeadPrivateSmsAction error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}
