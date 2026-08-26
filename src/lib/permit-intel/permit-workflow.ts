import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob, createCost } from '@/lib/jobs';
import { createJobTask, listJobTasks, type JobTask } from '@/lib/job-tasks';
import { createJobFeedEvent } from '@/lib/job-feed';
import type {
  JobPermitCase,
  JobPermitDocument,
  PermitApplicationStatus,
  PermitRequirementVerdict,
} from './types';

/**
 * Loads or initializes the internal permit case for a job.
 */
export async function getOrCreatePermitCase(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  defaults?: {
    authorityId?: string | null;
    requirementVerdict?: PermitRequirementVerdict;
    estimatedFee?: number | null;
  },
): Promise<JobPermitCase> {
  const { data: existing, error: fetchErr } = await supabase
    .from('job_permit_cases')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (fetchErr) {
    console.error('Error fetching job_permit_cases:', fetchErr);
  }

  if (existing) {
    return shapePermitCase(existing);
  }

  // Create new permit case
  const { data: created, error: insertErr } = await supabase
    .from('job_permit_cases')
    .insert({
      account_id: accountId,
      job_id: jobId,
      authority_id: defaults?.authorityId || null,
      requirement_verdict: defaults?.requirementVerdict || 'verify',
      application_status: 'not_started',
      estimated_fee: defaults?.estimatedFee || null,
    })
    .select('*')
    .single();

  if (insertErr || !created) {
    throw insertErr ?? new Error('Failed to create permit case');
  }

  return shapePermitCase(created);
}

/**
 * Updates status, external permit number, or fees on a permit case and posts an audit feed event.
 */
export async function updatePermitCase(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  updates: {
    applicationStatus?: PermitApplicationStatus;
    externalPermitNumber?: string | null;
    actualFee?: number | null;
    notes?: string | null;
  },
  authorName = 'Owner',
): Promise<JobPermitCase> {
  const existing = await getOrCreatePermitCase(supabase, accountId, jobId);

  const { data, error } = await supabase
    .from('job_permit_cases')
    .update({
      ...(updates.applicationStatus ? { application_status: updates.applicationStatus } : {}),
      ...(updates.externalPermitNumber !== undefined ? { external_permit_number: updates.externalPermitNumber } : {}),
      ...(updates.actualFee !== undefined ? { actual_fee: updates.actualFee } : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to update permit case');
  }

  // If status changed, post a timeline feed event
  if (updates.applicationStatus && updates.applicationStatus !== existing.applicationStatus) {
    const statusLabel = formatStatusLabel(updates.applicationStatus);
    const body = updates.externalPermitNumber
      ? `Permit # ${updates.externalPermitNumber} · Status changed to ${statusLabel}`
      : `Permit status updated to ${statusLabel}`;

    try {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'permit_status_updated',
        title: `Permit: ${statusLabel}`,
        body,
        author: authorName,
        visibility: 'internal',
        meta: {
          previousStatus: existing.applicationStatus,
          newStatus: updates.applicationStatus,
          permitNumber: updates.externalPermitNumber || existing.externalPermitNumber,
        },
      });
    } catch (feedErr) {
      console.warn('Failed to record permit feed event:', feedErr);
    }
  }

  return shapePermitCase(data);
}

/**
 * Synchronizes required permit and inspection submittals into the job's checklist,
 * avoiding duplicate task titles.
 */
export async function syncPermitTasksToChecklist(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  authorityName: string,
  tasksToSync: {
    documents: string[];
    inspections: string[];
  },
  authorName = 'Owner',
): Promise<{ added: number; existing: number; tasks: JobTask[] }> {
  const currentTasks = await listJobTasks(supabase, accountId, jobId);
  const existingTitles = new Set(currentTasks.map((t) => t.title.toLowerCase().trim()));

  let addedCount = 0;

  // 1. Add application & document tasks
  const candidateTasks: string[] = [];
  candidateTasks.push(`Submit Building Permit Application (${authorityName})`);

  for (const doc of tasksToSync.documents) {
    if (!doc.toLowerCase().includes('application')) {
      candidateTasks.push(`Prepare: ${doc}`);
    }
  }

  // 2. Add inspection milestone tasks
  for (const insp of tasksToSync.inspections) {
    candidateTasks.push(`Schedule & Pass: ${insp}`);
  }

  for (const taskTitle of candidateTasks) {
    const normalized = taskTitle.toLowerCase().trim();
    if (!existingTitles.has(normalized)) {
      await createJobTask(supabase, accountId, jobId, taskTitle);
      existingTitles.add(normalized);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    try {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'permit_tasks_synced',
        title: 'Permit Checklist Generated',
        body: `Added ${addedCount} required municipal permit and inspection tasks for ${authorityName}.`,
        author: authorName,
        visibility: 'internal',
      });
    } catch (feedErr) {
      console.warn('Failed to record permit tasks feed event:', feedErr);
    }
  }

  const updatedTasks = await listJobTasks(supabase, accountId, jobId);
  return {
    added: addedCount,
    existing: currentTasks.length,
    tasks: updatedTasks,
  };
}

import { addInvoiceItem, listInvoices, selectPrimaryInvoice, type InvoiceItem } from '@/lib/invoices';

export type RecordPermitFeeInput = {
  feeAmount: number;
  markupAmount?: number;
  authorityName: string;
  receiptRef?: string | null;
  addToInvoice?: boolean;
  invoiceId?: string;
  authorName?: string;
};

/**
 * Records a government permit fee expense into the job's costs table,
 * with optional administrative markup and auto-invoicing.
 */
export async function recordPermitFeeExpense(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  feeOrInput: number | RecordPermitFeeInput,
  legacyAuthorityName?: string,
  legacyReceiptRef?: string | null,
  legacyAuthorName = 'Owner',
) {
  const input: RecordPermitFeeInput =
    typeof feeOrInput === 'number'
      ? {
          feeAmount: feeOrInput,
          authorityName: legacyAuthorityName || 'Municipality',
          receiptRef: legacyReceiptRef,
          authorName: legacyAuthorName,
        }
      : feeOrInput;

  const {
    feeAmount,
    markupAmount = 0,
    authorityName,
    receiptRef,
    addToInvoice,
    invoiceId,
    authorName = 'Owner',
  } = input;

  if (feeAmount <= 0) {
    throw new Error('Fee amount must be greater than zero.');
  }

  const cost = await createCost(supabase, accountId, jobId, {
    type: 'other',
    amount: feeAmount,
    description: receiptRef
      ? `Municipal Permit Fee — ${authorityName} (Ref: ${receiptRef})`
      : `Municipal Permit Fee — ${authorityName}`,
    source: 'receipt',
  });

  // Also update actual fee on permit case
  await updatePermitCase(
    supabase,
    accountId,
    jobId,
    { actualFee: feeAmount },
    authorName,
  );

  let createdInvoiceItem: InvoiceItem | null = null;
  const totalBilled = feeAmount + Math.max(0, markupAmount);

  if (addToInvoice) {
    try {
      let targetInvoiceId = invoiceId;
      if (!targetInvoiceId) {
        const invoices = await listInvoices(supabase, accountId, jobId);
        const primary = selectPrimaryInvoice(invoices);
        if (primary) targetInvoiceId = primary.id;
      }

      if (targetInvoiceId) {
        const desc =
          markupAmount > 0
            ? `Building Permit & Municipal Filing Fee (${authorityName})`
            : `Municipal Permit Fee (${authorityName})`;

        createdInvoiceItem = await addInvoiceItem(
          supabase,
          accountId,
          targetInvoiceId,
          {
            description: desc,
            amount: totalBilled,
          },
          jobId,
        );
      }
    } catch (invErr) {
      console.warn('Failed to add permit fee to invoice:', invErr);
    }
  }

  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'permit_fee_recorded',
      title: 'Permit Fee Recorded',
      body: `$${feeAmount.toFixed(2)} paid to ${authorityName} logged to job expenses.${
        addToInvoice && createdInvoiceItem ? ` Billed $${totalBilled.toFixed(2)} to customer invoice.` : ''
      }`,
      author: authorName,
      amount: feeAmount,
      visibility: 'internal',
    });
  } catch (feedErr) {
    console.warn('Failed to record permit fee feed event:', feedErr);
  }

  return {
    ...cost,
    cost,
    invoiceItem: createdInvoiceItem,
    totalBilled,
    markupAmount,
  };
}

/**
 * Lists all permit documents attached to a job.
 */
export async function listPermitDocuments(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<JobPermitDocument[]> {
  const { data, error } = await supabase
    .from('job_permit_documents')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching job_permit_documents:', error);
    return [];
  }

  return (data ?? []).map(shapePermitDocument);
}

/**
 * Registers an uploaded permit document metadata row.
 */
export async function registerPermitDocument(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: {
    permitCaseId?: string | null;
    documentType: string;
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    storagePath: string;
    sha256Hash?: string;
    uploadedBy?: string;
  },
): Promise<JobPermitDocument> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const { data, error } = await supabase
    .from('job_permit_documents')
    .insert({
      account_id: accountId,
      job_id: jobId,
      permit_case_id: input.permitCaseId || null,
      document_type: input.documentType,
      file_name: input.fileName,
      file_size_bytes: input.fileSizeBytes,
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      sha256_hash: input.sha256Hash || null,
      uploaded_by: input.uploadedBy || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to register permit document');
  }

  return shapePermitDocument(data);
}

function shapePermitCase(row: Record<string, unknown>): JobPermitCase {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    jobId: String(row.job_id),
    authorityId: String(row.authority_id),
    requirementVerdict: row.requirement_verdict as PermitRequirementVerdict,
    applicationStatus: row.application_status as PermitApplicationStatus,
    externalPermitNumber: row.external_permit_number ? String(row.external_permit_number) : null,
    estimatedFee: row.estimated_fee ? Number(row.estimated_fee) : null,
    actualFee: row.actual_fee ? Number(row.actual_fee) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function shapePermitDocument(row: Record<string, unknown>): JobPermitDocument {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    jobId: String(row.job_id),
    permitCaseId: row.permit_case_id ? String(row.permit_case_id) : null,
    documentType: String(row.document_type || 'other'),
    fileName: String(row.file_name),
    fileSizeBytes: Number(row.file_size_bytes || 0),
    mimeType: String(row.mime_type),
    storagePath: String(row.storage_path),
    createdAt: String(row.created_at),
  };
}

function formatStatusLabel(status: PermitApplicationStatus): string {
  switch (status) {
    case 'not_started':
      return 'Not Started';
    case 'draft':
      return 'Draft in Progress';
    case 'ready_for_review':
      return 'Ready for Review';
    case 'authorized':
      return 'Authorized for Submission';
    case 'submitting':
      return 'Submitting...';
    case 'submitted':
      return 'Submitted to Authority';
    case 'in_review':
      return 'Under Plan Review';
    case 'corrections_required':
      return 'Corrections Requested';
    case 'approved':
      return 'Approved by Authority';
    case 'issued':
      return 'Permit Issued';
    case 'rejected':
      return 'Application Rejected';
    case 'withdrawn':
      return 'Application Withdrawn';
    case 'inspection_scheduled':
      return 'Inspection Scheduled';
    case 'inspection_passed':
      return 'Inspection Passed';
    case 'inspection_failed':
      return 'Inspection Failed';
    case 'closed':
      return 'Permit Closed & Complete';
    default:
      return status;
  }
}
