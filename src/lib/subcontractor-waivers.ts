import type { LienWaiverType } from '@/lib/lien-waiver';

export type SubcontractorWaiverStatus =
  | 'pending_request'
  | 'requested'
  | 'received'
  | 'verified';

export type SubcontractorWaiverRecord = {
  id: string;
  jobId: string;
  subcontractorName: string;
  trade: string;
  scopeSummary?: string | null;
  contractAmount: number;
  amountPaid: number;
  waiverType: LienWaiverType;
  status: SubcontractorWaiverStatus;
  requestedAt?: string | null;
  receivedAt?: string | null;
  verifiedAt?: string | null;
  documentPath?: string | null;
  notes?: string | null;
};

export type JobSubcontractorCompliance = {
  totalCount: number;
  verifiedCount: number;
  pendingCount: number;
  isFullyCompliant: boolean;
  missingFinalWaivers: SubcontractorWaiverRecord[];
  summaryMessage: string;
};

/**
 * Evaluates the subcontractor lien waiver compliance for a job.
 */
export function auditJobSubcontractorCompliance(
  records: SubcontractorWaiverRecord[],
  isJobFinalCloseout = false,
): JobSubcontractorCompliance {
  const totalCount = records.length;
  const verifiedCount = records.filter((r) => r.status === 'verified').length;
  const pendingCount = totalCount - verifiedCount;

  const missingFinalWaivers = records.filter(
    (r) => r.status !== 'verified' && (r.waiverType === 'unconditional_final' || isJobFinalCloseout),
  );

  let isFullyCompliant = true;
  let summaryMessage = 'All subcontractor lien waivers are verified and in good standing.';

  if (totalCount === 0) {
    summaryMessage = 'No subcontractors assigned to this job.';
  } else if (missingFinalWaivers.length > 0 && isJobFinalCloseout) {
    isFullyCompliant = false;
    summaryMessage = `⚠️ ${missingFinalWaivers.length} subcontractor final lien waiver(s) still outstanding before closeout.`;
  } else if (pendingCount > 0) {
    isFullyCompliant = false;
    summaryMessage = `${pendingCount} of ${totalCount} subcontractor waiver(s) pending verification.`;
  }

  return {
    totalCount,
    verifiedCount,
    pendingCount,
    isFullyCompliant,
    missingFinalWaivers,
    summaryMessage,
  };
}

/**
 * Creates a formatted status badge description for UI rendering.
 */
export function describeSubcontractorWaiverStatus(status: SubcontractorWaiverStatus): {
  label: string;
  tone: 'neutral' | 'warn' | 'success';
} {
  switch (status) {
    case 'verified':
      return { label: 'Verified & Cleared', tone: 'success' };
    case 'received':
      return { label: 'Received (Needs Review)', tone: 'warn' };
    case 'requested':
      return { label: 'Requested from Sub', tone: 'warn' };
    case 'pending_request':
    default:
      return { label: 'Not Yet Requested', tone: 'neutral' };
  }
}
