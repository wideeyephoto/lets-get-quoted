import type { SupabaseClient } from '@supabase/supabase-js';
import { getJob } from '../jobs';
import { createJobFeedEvent } from '../job-feed';
import { getPermitIntelligence } from './permit-service';
import { getPropertyPermitHistory } from './permit-history-service';
import { updatePermitCase, getOrCreatePermitCase } from './permit-workflow';
import type { PermitApplicationStatus } from './types';

export type PermitStatusSyncResult = {
  jobId: string;
  previousStatus: PermitApplicationStatus;
  currentStatus: PermitApplicationStatus;
  changed: boolean;
  externalPermitNumber?: string | null;
  authorityName: string;
  notes?: string | null;
  lastCheckedAt: string;
};

/**
 * Checks the municipal provider or property permit archive for status updates
 * on a job's permit case and synchronizes the state.
 */
export async function syncPermitCaseStatus(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  userEmail = 'System Poller',
): Promise<PermitStatusSyncResult> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const permitCase = await getOrCreatePermitCase(supabase, accountId, jobId);
  const previousStatus = permitCase.applicationStatus;
  const lastCheckedAt = new Date().toISOString();

  // If permit is not yet submitted or already closed, no remote transition to poll
  if (previousStatus === 'draft' || previousStatus === 'not_started') {
    return {
      jobId,
      previousStatus,
      currentStatus: previousStatus,
      changed: false,
      externalPermitNumber: permitCase.externalPermitNumber,
      authorityName: 'Municipal Building Authority',
      lastCheckedAt,
    };
  }

  // Look up permit intelligence & historical records for the property
  const intel = await getPermitIntelligence({
    address: job.address,
    rawScope: job.scope,
    supabase,
    accountId,
    jobId,
    permitCase,
  });

  const history = await getPropertyPermitHistory(job.address);
  const records = history.records || [];

  // Match remote record by external permit number or recent roofing permit
  let matchedRecord = records.find(
    (r) =>
      permitCase.externalPermitNumber &&
      (r.permitNumber.toLowerCase() === permitCase.externalPermitNumber.toLowerCase() ||
        r.permitNumber.includes(permitCase.externalPermitNumber)),
  );

  if (!matchedRecord && records.length > 0) {
    // If exact reference isn't matched, check if a newly issued permit appears for the trade
    matchedRecord = records.find(
      (r) =>
        r.permitType.toLowerCase().includes('roof') ||
        r.permitType.toLowerCase().includes('building') ||
        (r.description && r.description.toLowerCase().includes('roof')),
    );
  }

  let newStatus: PermitApplicationStatus = previousStatus;
  let newPermitNumber = permitCase.externalPermitNumber;

  if (matchedRecord) {
    newPermitNumber = matchedRecord.permitNumber;
    if (matchedRecord.status === 'issued' || matchedRecord.status === 'active') {
      newStatus = 'issued';
    } else if (matchedRecord.status === 'finaled' || matchedRecord.status === 'closed') {
      newStatus = 'closed';
    } else if (matchedRecord.status === 'in_review' || matchedRecord.status === 'applied') {
      newStatus = 'in_review';
    } else if (matchedRecord.status === 'inspection_phase') {
      newStatus = 'inspection_scheduled';
    }
  }

  const changed = newStatus !== previousStatus;

  if (changed) {
    await updatePermitCase(
      supabase,
      accountId,
      jobId,
      {
        applicationStatus: newStatus,
        externalPermitNumber: newPermitNumber,
      },
      userEmail,
    );

    try {
      await createJobFeedEvent(supabase, accountId, jobId, {
        kind: 'permit_status_updated',
        title: `Permit Status Updated: ${formatStatus(newStatus)}`,
        body: `Municipal status for ${intel.authority.name} transitioned from ${formatStatus(previousStatus)} to ${formatStatus(newStatus)}.${newPermitNumber ? ` Official Permit #: ${newPermitNumber}` : ''}`,
        author: userEmail,
        visibility: 'internal',
        meta: {
          previousStatus,
          currentStatus: newStatus,
          permitNumber: newPermitNumber,
          authorityId: intel.authority.id,
        },
      });
    } catch (feedErr) {
      console.warn('Failed to record status update feed event:', feedErr);
    }
  }

  return {
    jobId,
    previousStatus,
    currentStatus: newStatus,
    changed,
    externalPermitNumber: newPermitNumber,
    authorityName: intel.authority.name,
    lastCheckedAt,
  };
}

/**
 * Batch polls all active permit cases across an account.
 */
export async function syncAllActivePermits(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PermitStatusSyncResult[]> {
  const { data: cases, error } = await supabase
    .from('job_permit_cases')
    .select('job_id, application_status')
    .eq('account_id', accountId)
    .in('application_status', ['submitted', 'in_review', 'inspection_scheduled']);

  if (error || !cases) {
    console.error('Error fetching active permit cases for polling:', error);
    return [];
  }

  const results: PermitStatusSyncResult[] = [];

  for (const c of cases) {
    try {
      const res = await syncPermitCaseStatus(supabase, accountId, c.job_id, 'Scheduled Poller');
      results.push(res);
    } catch (err) {
      console.warn(`Failed to sync permit status for job ${c.job_id}:`, err);
    }
  }

  return results;
}

/**
 * Processes an inbound municipal webhook notification and synchronizes the permit case.
 */
export async function processInboundPermitWebhook(
  supabase: SupabaseClient,
  provider: string,
  payload: Record<string, unknown>,
  secretHeader?: string | null,
): Promise<{ success: boolean; message: string; jobId?: string }> {
  // Validate secret if configured
  const expectedSecret = process.env.PERMIT_WEBHOOK_SECRET;
  if (expectedSecret && secretHeader !== expectedSecret) {
    throw new Error('Unauthorized permit webhook secret.');
  }

  const externalPermitNumber = payload.permitNumber || payload.externalReference || payload.id;
  const statusString = String(payload.status || '').toLowerCase();
  const jobId = payload.jobId;

  if (!jobId && !externalPermitNumber) {
    throw new Error('Webhook payload must include jobId or permitNumber.');
  }

  // Look up permit case
  let query = supabase.from('job_permit_cases').select('*');
  if (jobId) {
    query = query.eq('job_id', jobId);
  } else {
    query = query.eq('external_permit_number', externalPermitNumber);
  }

  const { data: permitCase, error } = await query.single();
  if (error || !permitCase) {
    return { success: false, message: 'Permit case not found for webhook payload.' };
  }

  let newStatus: PermitApplicationStatus = permitCase.application_status;
  if (statusString.includes('issue') || statusString.includes('approve')) {
    newStatus = 'issued';
  } else if (statusString.includes('review')) {
    newStatus = 'in_review';
  } else if (statusString.includes('final') || statusString.includes('close')) {
    newStatus = 'closed';
  }

  if (newStatus !== permitCase.application_status) {
    await updatePermitCase(
      supabase,
      permitCase.account_id,
      permitCase.job_id,
      {
        applicationStatus: newStatus,
        externalPermitNumber: externalPermitNumber || permitCase.external_permit_number,
      },
      `Webhook (${provider})`,
    );

    try {
      await createJobFeedEvent(supabase, permitCase.account_id, permitCase.job_id, {
        kind: 'permit_status_webhook',
        title: `Permit Status Updated via ${provider.toUpperCase()}`,
        body: `Municipal update received: status is now ${formatStatus(newStatus)}.`,
        author: `Webhook (${provider})`,
        visibility: 'internal',
      });
    } catch (feedErr) {
      console.warn('Failed to log webhook feed event:', feedErr);
    }
  }

  return { success: true, message: 'Webhook processed successfully.', jobId: permitCase.job_id };
}

function formatStatus(status: PermitApplicationStatus): string {
  switch (status) {
    case 'draft':
      return 'Drafting';
    case 'submitted':
      return 'Submitted';
    case 'in_review':
      return 'In Review';
    case 'issued':
      return 'Permit Issued';
    case 'inspection_scheduled':
      return 'Inspection Scheduled';
    case 'closed':
      return 'Closed & Finaled';
    default:
      return status;
  }
}
