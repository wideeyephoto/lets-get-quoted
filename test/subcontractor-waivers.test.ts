import { describe, expect, it } from 'vitest';
import {
  auditJobSubcontractorCompliance,
  describeSubcontractorWaiverStatus,
  type SubcontractorWaiverRecord,
} from '@/lib/subcontractor-waivers';

describe('auditJobSubcontractorCompliance', () => {
  const verifiedSub: SubcontractorWaiverRecord = {
    id: 'sub-1',
    jobId: 'job-1',
    subcontractorName: 'Apex Electric',
    trade: 'Electrical',
    contractAmount: 3000,
    amountPaid: 3000,
    waiverType: 'unconditional_final',
    status: 'verified',
  };

  const pendingSub: SubcontractorWaiverRecord = {
    id: 'sub-2',
    jobId: 'job-1',
    subcontractorName: 'Metro Drywall',
    trade: 'Drywall',
    contractAmount: 2500,
    amountPaid: 2500,
    waiverType: 'unconditional_final',
    status: 'requested',
  };

  it('reports fully compliant when all sub waivers are verified', () => {
    const result = auditJobSubcontractorCompliance([verifiedSub]);
    expect(result.isFullyCompliant).toBe(true);
    expect(result.totalCount).toBe(1);
    expect(result.verifiedCount).toBe(1);
    expect(result.pendingCount).toBe(0);
    expect(result.missingFinalWaivers).toHaveLength(0);
  });

  it('flags missing waivers during final job closeout', () => {
    const result = auditJobSubcontractorCompliance([verifiedSub, pendingSub], true);
    expect(result.isFullyCompliant).toBe(false);
    expect(result.totalCount).toBe(2);
    expect(result.verifiedCount).toBe(1);
    expect(result.pendingCount).toBe(1);
    expect(result.missingFinalWaivers).toHaveLength(1);
    expect(result.missingFinalWaivers[0].subcontractorName).toBe('Metro Drywall');
    expect(result.summaryMessage).toContain('1 subcontractor final lien waiver(s) still outstanding');
  });

  it('handles empty subcontractor roster gracefully', () => {
    const result = auditJobSubcontractorCompliance([]);
    expect(result.isFullyCompliant).toBe(true);
    expect(result.totalCount).toBe(0);
  });
});

describe('describeSubcontractorWaiverStatus', () => {
  it('maps tones and labels accurately', () => {
    expect(describeSubcontractorWaiverStatus('verified')).toEqual({ label: 'Verified & Cleared', tone: 'success' });
    expect(describeSubcontractorWaiverStatus('received')).toEqual({ label: 'Received (Needs Review)', tone: 'warn' });
    expect(describeSubcontractorWaiverStatus('requested')).toEqual({ label: 'Requested from Sub', tone: 'warn' });
    expect(describeSubcontractorWaiverStatus('pending_request')).toEqual({ label: 'Not Yet Requested', tone: 'neutral' });
  });
});
