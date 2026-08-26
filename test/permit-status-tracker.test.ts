import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncPermitCaseStatus,
  syncAllActivePermits,
  processInboundPermitWebhook,
} from '../src/lib/permit-intel/status-tracker';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'job-1',
    account_id: 'acc-1',
    address: '211 S Williams St, Royal Oak, MI',
    scope: 'Tear off and replace roof',
  }),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn().mockResolvedValue({ id: 'feed-1' }),
}));

vi.mock('../src/lib/permit-intel/permit-service', () => ({
  getPermitIntelligence: vi.fn().mockResolvedValue({
    authority: { id: 'mi-royal-oak', name: 'City of Royal Oak' },
  }),
}));

vi.mock('../src/lib/permit-intel/permit-history-service', () => ({
  getPropertyPermitHistory: vi.fn().mockResolvedValue({
    address: '211 S Williams St, Royal Oak, MI',
    records: [
      {
        permitNumber: 'PB26-0899',
        permitType: 'Residential Roofing',
        status: 'issued',
        description: 'Tear off & shingle replacement',
        issueDate: '2026-08-26',
        provider: 'bsa',
        confidence: 'high',
      },
    ],
  }),
}));

vi.mock('../src/lib/permit-intel/permit-workflow', () => {
  let inMemoryCase: any = {
    id: 'case-1',
    accountId: 'acc-1',
    jobId: 'job-1',
    applicationStatus: 'submitted',
    externalPermitNumber: 'SUB-20260826-JOB1',
  };

  return {
    getOrCreatePermitCase: vi.fn().mockImplementation(async () => inMemoryCase),
    updatePermitCase: vi.fn().mockImplementation(async (_s, _acc, _job, updates) => {
      inMemoryCase = {
        ...inMemoryCase,
        applicationStatus: updates.applicationStatus || inMemoryCase.applicationStatus,
        externalPermitNumber: updates.externalPermitNumber || inMemoryCase.externalPermitNumber,
      };
      return inMemoryCase;
    }),
    __resetCase: () => {
      inMemoryCase = {
        id: 'case-1',
        accountId: 'acc-1',
        jobId: 'job-1',
        applicationStatus: 'submitted',
        externalPermitNumber: 'SUB-20260826-JOB1',
      };
    },
  };
});

import { createJobFeedEvent } from '@/lib/job-feed';
import * as permitWorkflowModule from '../src/lib/permit-intel/permit-workflow';

describe('Permit Status Tracking Engine & Webhooks', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';
  const mockSupabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ job_id: mockJobId, application_status: 'submitted' }],
            error: null,
          }),
          single: vi.fn().mockResolvedValue({
            data: {
              account_id: mockAccountId,
              job_id: mockJobId,
              application_status: 'submitted',
              external_permit_number: 'PB26-0899',
            },
            error: null,
          }),
        }),
      }),
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (permitWorkflowModule as any).__resetCase();
  });

  it('detects when submitted permit is issued by municipality and creates audit feed event', async () => {
    const result = await syncPermitCaseStatus(mockSupabase, mockAccountId, mockJobId, 'Manual Refresh');

    expect(result.changed).toBe(true);
    expect(result.previousStatus).toBe('submitted');
    expect(result.currentStatus).toBe('issued');
    expect(result.externalPermitNumber).toBe('PB26-0899');
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_status_updated',
        title: expect.stringContaining('Permit Issued'),
      }),
    );
  });

  it('batch syncs active permits across account', async () => {
    const results = await syncAllActivePermits(mockSupabase, mockAccountId);
    expect(results.length).toBe(1);
    expect(results[0].jobId).toBe(mockJobId);
  });

  it('processes inbound municipal webhook and updates permit case', async () => {
    const webhookRes = await processInboundPermitWebhook(
      mockSupabase,
      'bsa',
      {
        jobId: mockJobId,
        permitNumber: 'PB26-0899',
        status: 'approved_issued',
      },
    );

    expect(webhookRes.success).toBe(true);
    expect(webhookRes.jobId).toBe(mockJobId);
  });
});
