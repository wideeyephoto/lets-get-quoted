'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { createLead, getLead, getLeadTriage, scheduleLeadQuoteVisit, updateLeadDetails } from '@/lib/leads';
import { getJob, parseQuoteItems, saveQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { createJobTask } from '@/lib/job-tasks';
import { normalizeUsPhone } from '@/lib/phone';
import type { ParsedJobVoiceData, ParsedLeadVoiceData } from '@/lib/contractor-voice-ai';

/**
 * Server action to apply parsed voice data to a Lead (create new or update existing).
 */
export async function applyVoiceLeadAction(payload: {
  leadId?: string | null;
  leadData: ParsedLeadVoiceData;
}): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.write');
    const { leadId, leadData } = payload;

    if (leadId) {
      // Update existing lead
      const existing = await getLead(supabase, accountId, leadId);
      if (!existing) {
        return { ok: false, error: 'Lead not found.' };
      }

      await updateLeadDetails(supabase, accountId, leadId, {
        name: (leadData.name && leadData.name.trim()) || existing.name || 'Client',
        phone: leadData.phone !== undefined ? (leadData.phone?.trim() || null) : (existing.phone || null),
        email: leadData.email !== undefined ? (leadData.email?.trim() || null) : (existing.email || null),
        address: leadData.address !== undefined ? (leadData.address?.trim() || null) : (existing.address || null),
        projectType: leadData.projectType !== undefined ? (leadData.projectType?.trim() || null) : (existing.project_type || null),
        estimatedHours: leadData.estimatedHours !== undefined ? leadData.estimatedHours : existing.estimated_hours,
        message: leadData.message !== undefined ? (leadData.message?.trim() || null) : (existing.message || null),
      });

      // Update triage if score or flags provided
      if (leadData.score || leadData.flags?.length) {
        const triage = getLeadTriage(existing);
        if (leadData.score) triage.score = leadData.score;
        if (leadData.flags?.length) {
          triage.flags = Array.from(new Set([...triage.flags, ...leadData.flags]));
        }
        await supabase
          .from('leads')
          .update({ triage, updated_at: new Date().toISOString() })
          .eq('account_id', accountId)
          .eq('id', leadId);
      }

      // Schedule visit if requestedDate provided
      if (leadData.requestedDate) {
        await scheduleLeadQuoteVisit(supabase, accountId, leadId, {
          scheduledFor: leadData.requestedDate,
          scheduledTime: leadData.requestedTime || '09:00',
          durationMinutes: 60,
          notes: null,
          confirmationTextSentAt: null,
        });
      }

      revalidatePath(`/dashboard/leads/${leadId}`);
      revalidatePath('/dashboard/leads');
      return { ok: true, leadId };
    } else {
      // Create new lead
      const name = (leadData.name && leadData.name.trim()) || 'New Voice Lead';
      const phone = leadData.phone ? (normalizeUsPhone(leadData.phone) || leadData.phone.trim()) : null;

      const created = await createLead(supabase, accountId, {
        source: 'ai_voice',
        name,
        phone,
        email: leadData.email?.trim() || null,
        address: leadData.address?.trim() || null,
        projectType: leadData.projectType?.trim() || 'General Inquiry',
        estimatedHours: leadData.estimatedHours || null,
        message: leadData.message?.trim() || null,
        triage: {
          score: leadData.score || 'warm',
          flags: leadData.flags || ['voice_intake'],
          contactPreference: 'any',
        },
      });

      if (leadData.requestedDate) {
        await scheduleLeadQuoteVisit(supabase, accountId, created.id, {
          scheduledFor: leadData.requestedDate,
          scheduledTime: leadData.requestedTime || '09:00',
          durationMinutes: 60,
          notes: null,
          confirmationTextSentAt: null,
        });
      }

      revalidatePath('/dashboard/leads');
      return { ok: true, leadId: created.id };
    }
  } catch (err) {
    console.error('applyVoiceLeadAction error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to apply lead voice update.' };
  }
}

/**
 * Server action to apply parsed voice data to an existing Job.
 */
export async function applyVoiceJobAction(payload: {
  jobId: string;
  jobData: ParsedJobVoiceData;
}): Promise<{ ok: boolean; jobId?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOfficeContext('jobs.write');
    const { jobId, jobData } = payload;

    const existingJob = await getJob(supabase, accountId, jobId);
    if (!existingJob) {
      return { ok: false, error: 'Job not found.' };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Scope update or addition
    if (jobData.scope) {
      updates.scope = jobData.scope.trim();
    } else if (jobData.scopeAddition) {
      const currentScope = existingJob.scope ? `${existingJob.scope.trim()}\n` : '';
      updates.scope = `${currentScope}• ${jobData.scopeAddition.trim()}`;
    }

    // Schedule update
    if (jobData.scheduledFor) {
      updates.scheduled_for = jobData.scheduledFor;
      if (jobData.scheduledTime) {
        updates.scheduled_time = jobData.scheduledTime;
      }
    }

    // Status update
    if (jobData.status && ['new_lead', 'in_progress', 'complete'].includes(jobData.status)) {
      updates.status = jobData.status;
    }

    // Apply job table updates if any
    if (Object.keys(updates).length > 1) {
      const { error: jobUpdateErr } = await supabase
        .from('jobs')
        .update(updates)
        .eq('account_id', accountId)
        .eq('id', jobId);
      if (jobUpdateErr) throw jobUpdateErr;
    }

    // Quote items update
    if (Array.isArray(jobData.quoteItems) && jobData.quoteItems.length > 0) {
      const existingItems = parseQuoteItems(existingJob.quote_items);
      const newItems: QuoteItem[] = jobData.quoteItems.map((item, idx) => ({
        id: `voice-${Date.now()}-${idx}`,
        label: item.label.trim(),
        amount: Number(item.amount) || (Number(item.quantity || 1) * Number(item.unitPrice || 0)) || 0,
        kind: 'base',
        selected: true,
        recommended: false,
      }));

      // Combine quote items
      const combinedItems = [...existingItems, ...newItems];
      await saveQuoteItems(supabase, accountId, jobId, combinedItems);
    }

    // Add tasks
    if (Array.isArray(jobData.tasks) && jobData.tasks.length > 0) {
      for (const task of jobData.tasks) {
        if (task.title?.trim()) {
          await createJobTask(supabase, accountId, jobId, task.title.trim()).catch(() => {});
        }
      }
    }

    // Feed event / Activity note
    if (jobData.feedNote && jobData.feedNote.trim()) {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'job_update',
        title: 'Voice update',
        body: jobData.feedNote.trim(),
        visibility: 'internal',
      }).catch((err) => console.error('Feed event write failed:', err));
    }

    // Cost / Material log
    if (jobData.costEstimate && (jobData.costEstimate.amount || jobData.costEstimate.hours)) {
      const { error: costErr } = await supabase.from('costs').insert({
        account_id: accountId,
        job_id: jobId,
        type: jobData.costEstimate.type,
        description: jobData.costEstimate.description || 'Voice logged cost',
        amount: jobData.costEstimate.amount || null,
        hours: jobData.costEstimate.hours || null,
      });
      if (costErr) console.error('Cost write failed:', costErr);
    }

    // Change order
    if (jobData.changeOrder && jobData.changeOrder.title) {
      const { error: coErr } = await supabase.from('change_orders').insert({
        account_id: accountId,
        job_id: jobId,
        title: jobData.changeOrder.title.trim(),
        description: jobData.changeOrder.note?.trim() || null,
        status: 'draft',
      });
      if (coErr) console.error('Change order write failed:', coErr);
    }

    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard/jobs');
    revalidatePath(`/field/jobs/${jobId}`);
    return { ok: true, jobId };
  } catch (err) {
    console.error('applyVoiceJobAction error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to apply job voice update.' };
  }
}
