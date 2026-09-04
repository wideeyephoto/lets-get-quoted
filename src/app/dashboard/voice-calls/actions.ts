'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { getOrCreateSite } from '@/lib/sites';
import { displayPhone } from '@/lib/phone';
import { loadVoiceEntitlement } from '@/lib/voice/entitlement';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { createLead } from '@/lib/leads';
import { detectCallEmergency } from '@/lib/voice/triage';
import { parseVoiceCallSummary, type VoiceCallDisposition } from '@/lib/voice/call-workspace';

const VALID_DISPOSITIONS: Set<VoiceCallDisposition> = new Set([
  'unreviewed',
  'needs_callback',
  'callback_scheduled',
  'contacted',
  'qualified',
  'converted',
  'not_a_fit',
  'spam',
  'resolved',
]);

export async function updateVoiceCallDispositionAction(formData: FormData): Promise<void> {
  const { supabase, accountId, userId } = await requireOfficeContext('leads.write');

  const callId = (formData.get('callId') ?? '').toString().trim();
  const disposition = (formData.get('disposition') ?? '').toString().trim() as VoiceCallDisposition;

  if (!callId) throw new Error('Call ID is required.');
  if (!VALID_DISPOSITIONS.has(disposition)) throw new Error('Invalid disposition.');

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('voice_call_workflows')
    .upsert({
      call_id: callId,
      account_id: accountId,
      disposition,
      reviewed_at: nowIso,
      reviewed_by: userId,
    }, { onConflict: 'call_id' });

  if (error) {
    console.error('Failed to update voice call disposition:', error);
    throw new Error('Failed to update disposition.');
  }

  revalidatePath('/dashboard/voice-calls');
  revalidatePath(`/dashboard/voice-calls/${callId}`);
}

export async function scheduleVoiceCallCallbackAction(formData: FormData): Promise<void> {
  const { supabase, accountId, userId } = await requireOfficeContext('leads.write');

  const callId = (formData.get('callId') ?? '').toString().trim();
  const callbackDueAt = (formData.get('callbackDueAt') ?? '').toString().trim();

  if (!callId) throw new Error('Call ID is required.');
  if (!callbackDueAt) throw new Error('Callback due date/time is required.');

  const dueDate = new Date(callbackDueAt);
  if (Number.isNaN(dueDate.getTime())) throw new Error('Invalid callback date/time format.');

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('voice_call_workflows')
    .upsert({
      call_id: callId,
      account_id: accountId,
      disposition: 'callback_scheduled',
      callback_due_at: dueDate.toISOString(),
      reviewed_at: nowIso,
      reviewed_by: userId,
    }, { onConflict: 'call_id' });

  if (error) {
    console.error('Failed to schedule voice call callback:', error);
    throw new Error('Failed to schedule callback.');
  }

  revalidatePath('/dashboard/voice-calls');
  revalidatePath(`/dashboard/voice-calls/${callId}`);
}

export async function addVoiceCallNoteAction(formData: FormData): Promise<void> {
  const { supabase, accountId, userId, userEmail } = await requireOfficeContext('leads.write');

  const callId = (formData.get('callId') ?? '').toString().trim();
  const note = (formData.get('note') ?? '').toString().trim();

  if (!callId) throw new Error('Call ID is required.');
  if (!note) throw new Error('Note content cannot be empty.');
  if (note.length > 4000) throw new Error('Note cannot exceed 4000 characters.');

  const authorName = userEmail ? userEmail.split('@')[0]! : 'Staff Member';

  const { error } = await supabase
    .from('voice_call_notes')
    .insert({
      call_id: callId,
      account_id: accountId,
      author_user_id: userId,
      author_name: authorName,
      note,
    });

  if (error) {
    console.error('Failed to add voice call note:', error);
    throw new Error('Failed to add note.');
  }

  revalidatePath(`/dashboard/voice-calls/${callId}`);
}

export async function createLeadFromVoiceCallAction(formData: FormData): Promise<{ leadId: string }> {
  const { supabase, accountId } = await requireOfficeContext('leads.write');

  const callId = (formData.get('callId') ?? '').toString().trim();
  if (!callId) throw new Error('Call ID is required.');

  const { data: call, error: callError } = await supabase
    .from('voice_calls')
    .select('id, caller_number, summary, lead_id')
    .eq('id', callId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (callError || !call) throw new Error('Voice call not found.');
  if (call.lead_id) return { leadId: call.lead_id };

  const phone = call.caller_number;
  const parsed = parseVoiceCallSummary(call.summary);
  const summary = parsed.displaySummary || call.summary || 'AI receptionist call';
  const emergency = detectCallEmergency(call.summary || summary);
  const flags = emergency.isEmergency ? ['emergency_hazard', emergency.hazardType].filter(Boolean) as string[] : [];
  const score = emergency.isEmergency ? 'hot' : 'warm';

  const lead = await createLead(supabase, accountId, {
    source: 'ai_voice',
    name: parsed.callerName ?? (phone ? `AI call — ${phone}` : 'AI call — caller unknown'),
    phone,
    address: parsed.serviceAddress || undefined,
    message: summary,
    sourcePage: '/call',
    triage: { score, flags, contactPreference: 'any' },
  });

  await supabase
    .from('voice_calls')
    .update({ lead_id: lead.id })
    .eq('id', callId)
    .eq('account_id', accountId);

  revalidatePath('/dashboard/voice-calls');
  revalidatePath(`/dashboard/voice-calls/${callId}`);
  return { leadId: lead.id };
}

export async function convertVoiceCallToQuoteDraftAction(formData: FormData): Promise<{ jobId: string }> {
  const { supabase, accountId, userId } = await requireOfficeContext('leads.write');

  const callId = (formData.get('callId') ?? '').toString().trim();
  if (!callId) throw new Error('Call ID is required.');

  const { data: call, error: callError } = await supabase
    .from('voice_calls')
    .select('id, caller_number, summary, lead_id')
    .eq('id', callId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (callError || !call) throw new Error('Voice call not found.');

  let leadId = call.lead_id;
  if (!leadId) {
    const phone = call.caller_number;
    const parsed = parseVoiceCallSummary(call.summary);
    const summary = parsed.displaySummary || call.summary || 'AI receptionist call';
    const emergency = detectCallEmergency(call.summary || summary);
    const flags = emergency.isEmergency ? ['emergency_hazard', emergency.hazardType].filter(Boolean) as string[] : [];
    const score = emergency.isEmergency ? 'hot' : 'warm';

    const lead = await createLead(supabase, accountId, {
      source: 'ai_voice',
      name: parsed.callerName ?? (phone ? `AI call — ${phone}` : 'AI call — caller unknown'),
      phone,
      address: parsed.serviceAddress || undefined,
      message: summary,
      sourcePage: '/call',
      triage: { score, flags, contactPreference: 'any' },
    });
    leadId = lead.id;

    await supabase
      .from('voice_calls')
      .update({ lead_id: lead.id })
      .eq('id', callId)
      .eq('account_id', accountId);
  }

  const { convertLeadToJob } = await import('@/lib/leads');
  const job = await convertLeadToJob(supabase, accountId, leadId, 0, null);

  const nowIso = new Date().toISOString();
  await supabase
    .from('voice_call_workflows')
    .upsert({
      call_id: callId,
      account_id: accountId,
      disposition: 'converted',
      reviewed_at: nowIso,
      reviewed_by: userId,
    }, { onConflict: 'call_id' });

  revalidatePath('/dashboard/voice-calls');
  revalidatePath(`/dashboard/voice-calls/${callId}`);
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/jobs');
  return { jobId: job.id };
}

/**
 * Toggles whether the contractor's website funnels inbound customers to:
 * 1. AI Receptionist Phone Calls (publishAiNumber = true) — publishes the dedicated
 *    AI receptionist number on headers, hero CTA, sticky call bar, and footer.
 * 2. Online Intake Forms Only (publishAiNumber = false) — hides phone numbers from
 *    the website, funneling 100% of visitors into instant estimates and bookings.
 */
export async function toggleWebsitePhoneFunnelAction(publishAiNumber: boolean): Promise<{
  success: boolean;
  phonePublic: boolean;
  phone: string | null;
}> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  // Retrieve current site row or create default if none exists yet
  let { data: site } = await supabase
    .from('sites')
    .select('id, phone, content, subdomain')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    const created = await getOrCreateSite(supabase, accountId);
    site = { id: created.id, phone: created.phone, content: created.content, subdomain: created.subdomain };
  }

  const existingContent = (site.content as Record<string, unknown> | null) || {};
  let targetPhone = site.phone;

  const updatedContent: Record<string, unknown> = {
    ...existingContent,
    phonePublic: publishAiNumber,
  };

  const updatePayload: Record<string, unknown> = {
    content: updatedContent,
    updated_at: new Date().toISOString(),
  };

  if (publishAiNumber) {
    const admin = createAdminClient();
    const entitlement = await loadVoiceEntitlement(admin, accountId);
    if (!entitlement.available || !entitlement.enabled) {
      throw new Error('AI Voice is not included in this workspace or an active add-on.');
    }

    const { data: voiceSettings } = await admin
      .from('voice_settings')
      .select('status')
      .eq('account_id', accountId)
      .maybeSingle();

    if (voiceSettings?.status !== 'active') {
      throw new Error('AI Voice must be active before publishing the number on your website.');
    }

    const route = await loadVoiceRouteReadiness(admin, accountId);
    if (route.kind !== 'ready') {
      throw new Error('The AI Voice phone number route is not ready.');
    }

    const { data: account } = await admin
      .from('accounts')
      .select('call_tracking_number')
      .eq('id', accountId)
      .maybeSingle();

    const dedicatedNumber = account?.call_tracking_number || null;
    if (!dedicatedNumber) {
      throw new Error('No dedicated AI Voice phone number configured for this workspace.');
    }

    targetPhone = displayPhone(dedicatedNumber);
    if (site.phone && site.phone !== targetPhone && !existingContent.originalPhone) {
      updatedContent.originalPhone = site.phone;
    }
    updatePayload.phone = targetPhone;
  } else {
    // If disabling AI number publishing, restore the original phone number if one was saved
    if (existingContent.originalPhone) {
      targetPhone = String(existingContent.originalPhone);
      updatePayload.phone = targetPhone;
    }
  }

  const { error: updateError } = await supabase
    .from('sites')
    .update(updatePayload)
    .eq('id', site.id)
    .eq('account_id', accountId);

  if (updateError) {
    console.error('Failed to update website lead funnel:', updateError);
    throw new Error('Failed to update website phone visibility.');
  }

  revalidatePath('/dashboard/voice-calls');
  revalidatePath('/dashboard/sites');
  revalidatePath('/dashboard/settings');
  if (site.subdomain) {
    revalidatePath(`/site/${site.subdomain}`);
    revalidatePath(`/book/${site.subdomain}`);
  }
  revalidatePath('/');

  return {
    success: true,
    phonePublic: publishAiNumber,
    phone: publishAiNumber ? targetPhone : null,
  };
}

