'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { createLead } from '@/lib/leads';
import { detectCallEmergency } from '@/lib/voice/triage';
import type { VoiceCallDisposition } from '@/lib/voice/call-workspace';

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
  const summary = call.summary || 'AI receptionist call';
  const emergency = detectCallEmergency(summary);
  const flags = emergency.isEmergency ? ['emergency_hazard', emergency.hazardType].filter(Boolean) as string[] : [];
  const score = emergency.isEmergency ? 'hot' : 'warm';

  const lead = await createLead(supabase, accountId, {
    source: 'ai_voice',
    name: phone ? `AI call — ${phone}` : 'AI call — caller unknown',
    phone,
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
