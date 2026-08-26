import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializeRequiredInspections,
  scheduleInspection,
  recordInspectionResult,
} from '../src/lib/permit-intel/inspection-service';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({ id: 'job-1', account_id: 'acc-1' }),
  createCost: vi.fn().mockResolvedValue({ id: 'cost-1', amount: 50 }),
}));

vi.mock('@/lib/job-tasks', () => ({
  createJobTask: vi.fn().mockResolvedValue({ id: 'task-1', title: 'Fix corrections' }),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn().mockResolvedValue({ id: 'feed-1' }),
}));

vi.mock('../src/lib/permit-intel/permit-workflow', () => ({
  getOrCreatePermitCase: vi.fn().mockResolvedValue({ id: 'case-1', applicationStatus: 'issued' }),
  updatePermitCase: vi.fn().mockResolvedValue({ id: 'case-1', applicationStatus: 'closed' }),
}));

import { createJobTask } from '@/lib/job-tasks';
import { createCost } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { updatePermitCase } from '../src/lib/permit-intel/permit-workflow';

describe('Permit Inspection Lifecycle Service', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules an inspection milestone and updates permit status', async () => {
    const mockRow = {
      id: 'insp-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      title: 'Mid-Roof Inspection',
      status: 'scheduled',
      scheduled_date: '2026-08-28',
      inspector_name: 'Bob Inspector',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any;

    const result = await scheduleInspection(
      mockSupabase,
      mockAccountId,
      mockJobId,
      'insp-1',
      {
        scheduledDate: '2026-08-28',
        inspectorName: 'Bob Inspector',
      },
    );

    expect(result.status).toBe('scheduled');
    expect(result.scheduledDate).toBe('2026-08-28');
    expect(updatePermitCase).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      { applicationStatus: 'inspection_scheduled' },
      expect.any(String),
    );
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_inspection_scheduled',
      }),
    );
  });

  it('records passed inspection result and closes permit when all inspections pass', async () => {
    const passedRow = {
      id: 'insp-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      title: 'Final Building Inspection',
      status: 'passed',
      completed_date: '2026-08-29',
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'job_permit_inspections') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: passedRow, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [passedRow], // all passed
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const { inspection, allPassed } = await recordInspectionResult(
      mockSupabase,
      mockAccountId,
      mockJobId,
      'insp-1',
      {
        status: 'passed',
        inspectorName: 'Jim Inspector',
      },
    );

    expect(inspection.status).toBe('passed');
    expect(allPassed).toBe(true);
    expect(updatePermitCase).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      { applicationStatus: 'closed' },
      expect.any(String),
    );
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_case_closed',
      }),
    );
  });

  it('records failed inspection, creates remediation checklist task, and logs fee', async () => {
    const failedRow = {
      id: 'insp-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      title: 'Mid-Roof Inspection',
      status: 'failed',
      notes: 'Need 6 more nails per shingle in high wind zone',
      failure_reasons: ['Fastener schedule deficiency'],
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: failedRow, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any;

    const { inspection, allPassed } = await recordInspectionResult(
      mockSupabase,
      mockAccountId,
      mockJobId,
      'insp-1',
      {
        status: 'failed',
        failureReasons: ['Fastener schedule deficiency'],
        notes: 'Need 6 more nails per shingle',
        reinspectionFee: 75,
      },
    );

    expect(inspection.status).toBe('failed');
    expect(allPassed).toBe(false);
    expect(createJobTask).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.stringContaining('Fix Inspection Corrections'),
    );
    expect(createCost).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        amount: 75,
      }),
    );
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_inspection_failed',
      }),
    );
  });
});
