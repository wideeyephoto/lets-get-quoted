import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreatePermitCase,
  updatePermitCase,
  syncPermitTasksToChecklist,
  recordPermitFeeExpense,
  listPermitDocuments,
  registerPermitDocument,
} from '../src/lib/permit-intel/permit-workflow';

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({ id: 'job-1', account_id: 'acc-1' }),
  createCost: vi.fn().mockResolvedValue({ id: 'cost-1', amount: 155, category: 'Permit & Government Fees' }),
}));

vi.mock('@/lib/job-tasks', () => {
  let inMemoryTasks: any[] = [];
  return {
    listJobTasks: vi.fn().mockImplementation(async () => inMemoryTasks),
    createJobTask: vi.fn().mockImplementation(async (_supabase, accountId, jobId, title) => {
      const task = {
        id: `task-${inMemoryTasks.length + 1}`,
        account_id: accountId,
        job_id: jobId,
        title,
        done: false,
      };
      inMemoryTasks.push(task);
      return task;
    }),
    __resetTasks: () => {
      inMemoryTasks = [];
    },
  };
});

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn().mockResolvedValue({ id: 'feed-1' }),
}));

import { createCost } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import * as jobTasksModule from '@/lib/job-tasks';

describe('Permit Workflow Domain Logic', () => {
  const mockAccountId = 'acc-1';
  const mockJobId = 'job-1';

  beforeEach(() => {
    vi.clearAllMocks();
    (jobTasksModule as any).__resetTasks();
  });

  it('creates or retrieves a permit case for a job', async () => {
    const mockCase = {
      id: 'case-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      authority_id: 'mi-royal-oak',
      requirement_verdict: 'required',
      application_status: 'not_started',
      estimated_fee: 155,
      actual_fee: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockCase, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    const result = await getOrCreatePermitCase(mockSupabase, mockAccountId, mockJobId);
    expect(result.id).toBe('case-1');
    expect(result.requirementVerdict).toBe('required');
    expect(result.applicationStatus).toBe('not_started');
  });

  it('updates permit status and posts a timeline feed event', async () => {
    const existingCase = {
      id: 'case-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      requirement_verdict: 'required',
      application_status: 'not_started',
    };

    const updatedRow = {
      ...existingCase,
      application_status: 'issued',
      external_permit_number: 'PB-2026-099',
      updated_at: new Date().toISOString(),
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'job_permit_cases') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existingCase, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const res = await updatePermitCase(mockSupabase, mockAccountId, mockJobId, {
      applicationStatus: 'issued',
      externalPermitNumber: 'PB-2026-099',
    });

    expect(res.applicationStatus).toBe('issued');
    expect(res.externalPermitNumber).toBe('PB-2026-099');
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_status_updated',
        title: 'Permit: Permit Issued',
      }),
    );
  });

  it('idempotently syncs checklist tasks without duplicating existing titles', async () => {
    const mockSupabase = {} as any;

    // First sync: adds application and inspection tasks
    const firstSync = await syncPermitTasksToChecklist(
      mockSupabase,
      mockAccountId,
      mockJobId,
      'City of Royal Oak',
      {
        documents: ['Building Permit Application', 'Certificate of Insurance'],
        inspections: ['Mid-Roof Inspection', 'Final Inspection'],
      },
    );

    expect(firstSync.added).toBe(4);
    expect(firstSync.tasks.length).toBe(4);

    // Second sync: zero new tasks added
    const secondSync = await syncPermitTasksToChecklist(
      mockSupabase,
      mockAccountId,
      mockJobId,
      'City of Royal Oak',
      {
        documents: ['Building Permit Application', 'Certificate of Insurance'],
        inspections: ['Mid-Roof Inspection', 'Final Inspection'],
      },
    );

    expect(secondSync.added).toBe(0);
    expect(secondSync.tasks.length).toBe(4);
  });

  it('records a permit fee expense and posts a feed event', async () => {
    const existingCase = {
      id: 'case-1',
      account_id: mockAccountId,
      job_id: mockJobId,
      application_status: 'issued',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingCase, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingCase, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any;

    const cost = await recordPermitFeeExpense(
      mockSupabase,
      mockAccountId,
      mockJobId,
      155,
      'City of Royal Oak',
      'REC-9942',
    );

    expect(cost.amount).toBe(155);
    expect(createCost).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        type: 'other',
        amount: 155,
        source: 'receipt',
      }),
    );
    expect(createJobFeedEvent).toHaveBeenCalledWith(
      mockSupabase,
      mockAccountId,
      mockJobId,
      expect.objectContaining({
        kind: 'permit_fee_recorded',
        amount: 155,
      }),
    );
  });
});
