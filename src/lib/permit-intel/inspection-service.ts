import type { SupabaseClient } from '@supabase/supabase-js';
import { createCost } from '../jobs';
import { createJobTask } from '../job-tasks';
import { createJobFeedEvent } from '../job-feed';
import { updatePermitCase } from './permit-workflow';
import type {
  JobPermitInspection,
  PermitInspectionStatus,
} from './types';

/**
 * Lists all inspection milestones tracked for a job.
 */
export async function listJobInspections(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<JobPermitInspection[]> {
  const { data, error } = await supabase
    .from('job_permit_inspections')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching job_permit_inspections:', error);
    return [];
  }

  return (data ?? []).map(shapePermitInspection);
}

/**
 * Initializes required inspection milestones derived from authority requirement rules.
 * Idempotently skips already registered milestones.
 */
export async function initializeRequiredInspections(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  requiredTitles: string[],
  permitCaseId?: string | null,
): Promise<JobPermitInspection[]> {
  const existing = await listJobInspections(supabase, accountId, jobId);
  const existingTitles = new Set(existing.map((i) => i.title.toLowerCase().trim()));

  for (const title of requiredTitles) {
    const normalized = title.toLowerCase().trim();
    if (!existingTitles.has(normalized)) {
      const typeKey = slugifyInspectionType(title);
      await supabase.from('job_permit_inspections').insert({
        account_id: accountId,
        job_id: jobId,
        permit_case_id: permitCaseId || null,
        inspection_type: typeKey,
        title,
        status: 'required',
      });
      existingTitles.add(normalized);
    }
  }

  return listJobInspections(supabase, accountId, jobId);
}

/**
 * Updates scheduling details for an inspection milestone.
 */
export async function scheduleInspection(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  inspectionId: string,
  schedule: {
    scheduledDate: string;
    inspectorName?: string | null;
    inspectorPhone?: string | null;
    notes?: string | null;
  },
  userEmail = 'Office',
): Promise<JobPermitInspection> {
  const { data, error } = await supabase
    .from('job_permit_inspections')
    .update({
      status: 'scheduled',
      scheduled_date: schedule.scheduledDate,
      inspector_name: schedule.inspectorName || null,
      inspector_phone: schedule.inspectorPhone || null,
      notes: schedule.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', inspectionId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to schedule inspection');
  }

  const inspection = shapePermitInspection(data);

  // Advance permit case status to inspection_scheduled
  await updatePermitCase(
    supabase,
    accountId,
    jobId,
    { applicationStatus: 'inspection_scheduled' },
    userEmail,
  );

  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'permit_inspection_scheduled',
      title: `Inspection Scheduled: ${inspection.title}`,
      body: `Scheduled for ${schedule.scheduledDate}${schedule.inspectorName ? ` with Inspector ${schedule.inspectorName}` : ''}.`,
      author: userEmail,
      visibility: 'internal',
    });
  } catch (feedErr) {
    console.warn('Failed to record inspection scheduled feed event:', feedErr);
  }

  return inspection;
}

/**
 * Records a final or rough inspection result (passed/failed), triggers follow-up
 * corrections if failed, or advances the permit case to completed if all passed.
 */
export async function recordInspectionResult(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  inspectionId: string,
  result: {
    status: 'passed' | 'failed';
    inspectorName?: string | null;
    notes?: string | null;
    failureReasons?: string[] | null;
    reinspectionFee?: number | null;
  },
  userEmail = 'Office',
): Promise<{ inspection: JobPermitInspection; allPassed: boolean }> {
  const completedDate = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('job_permit_inspections')
    .update({
      status: result.status,
      completed_date: completedDate,
      inspector_name: result.inspectorName || null,
      notes: result.notes || null,
      failure_reasons: result.failureReasons || null,
      reinspection_fee: result.reinspectionFee || null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', inspectionId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to record inspection result');
  }

  const inspection = shapePermitInspection(data);

  if (result.status === 'passed') {
    // Post timeline feed event
    try {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'permit_inspection_passed',
        title: `Inspection Passed: ${inspection.title} ✓`,
        body: result.inspectorName
          ? `Passed by Inspector ${result.inspectorName}.`
          : 'Inspection officially approved by building inspector.',
        author: userEmail,
        visibility: 'internal',
      });
    } catch (feedErr) {
      console.warn('Failed to record inspection passed feed event:', feedErr);
    }

    // Check if all inspections for the job are passed
    const allInspections = await listJobInspections(supabase, accountId, jobId);
    const allPassed =
      allInspections.length > 0 &&
      allInspections.every((i) => i.status === 'passed' || i.status === 'waived');

    if (allPassed) {
      await updatePermitCase(
        supabase,
        accountId,
        jobId,
        { applicationStatus: 'closed' },
        userEmail,
      );

      try {
        await createJobFeedEvent(supabase, accountId, jobId, {
          kind: 'permit_case_closed',
          title: 'Permit Closed & Complete 🏆',
          body: 'All required municipal inspections have passed. Permit successfully finalized.',
          author: userEmail,
          visibility: 'internal',
        });
      } catch (feedErr) {
        console.warn('Failed to record permit closed feed event:', feedErr);
      }
    }

    return { inspection, allPassed };
  } else {
    // FAILED inspection
    const reasonText = (result.failureReasons || []).join('; ') || result.notes || 'Inspector requested corrections';

    // 1. Post timeline warning
    try {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'permit_inspection_failed',
        title: `⚠️ Inspection Failed: ${inspection.title}`,
        body: `Corrections Required: ${reasonText}`,
        author: userEmail,
        visibility: 'internal',
      });
    } catch (feedErr) {
      console.warn('Failed to record inspection failed feed event:', feedErr);
    }

    // 2. Automatically generate remediation task in checklist
    await createJobTask(
      supabase,
      accountId,
      jobId,
      `Fix Inspection Corrections: ${inspection.title} (${reasonText.slice(0, 60)})`,
    );

    // 3. Log re-inspection fee if applicable
    if (result.reinspectionFee && result.reinspectionFee > 0) {
      await createCost(supabase, accountId, jobId, {
        type: 'other',
        amount: result.reinspectionFee,
        description: `Municipal Re-Inspection Fee — ${inspection.title}`,
        source: 'receipt',
      });
    }

    await updatePermitCase(
      supabase,
      accountId,
      jobId,
      { applicationStatus: 'corrections_required' },
      userEmail,
    );

    return { inspection, allPassed: false };
  }
}

function shapePermitInspection(row: Record<string, unknown>): JobPermitInspection {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    jobId: String(row.job_id),
    permitCaseId: row.permit_case_id ? String(row.permit_case_id) : null,
    inspectionType: String(row.inspection_type || ''),
    title: String(row.title || ''),
    status: row.status as PermitInspectionStatus,
    requestedDate: row.requested_date ? String(row.requested_date) : null,
    scheduledDate: row.scheduled_date ? String(row.scheduled_date) : null,
    completedDate: row.completed_date ? String(row.completed_date) : null,
    inspectorName: row.inspector_name ? String(row.inspector_name) : null,
    inspectorPhone: row.inspector_phone ? String(row.inspector_phone) : null,
    notes: row.notes ? String(row.notes) : null,
    failureReasons: Array.isArray(row.failure_reasons) ? (row.failure_reasons as string[]) : null,
    reinspectionFee: row.reinspection_fee ? Number(row.reinspection_fee) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function slugifyInspectionType(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
