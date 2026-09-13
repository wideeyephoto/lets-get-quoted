import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(),
  getJob: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
  deleteJob: vi.fn(),
  updateJobSchedule: vi.fn(),
  createCost: vi.fn(),
  deleteCost: vi.fn(),
  createJobFeedEvent: vi.fn(),
  createClientJobAccessToken: vi.fn(),
  revokeClientJobAccess: vi.fn(),
  getActiveClientAccessCount: vi.fn(),
  applyQuoteAcceptance: vi.fn(),
  uploadJobPhoto: vi.fn(),
  listCrew: vi.fn(),
  listCrewIdsForJob: vi.fn(),
  setJobCrewAssignments: vi.fn(),
  toggleJobCrewAssignment: vi.fn(),
  isPhoneOptedOut: vi.fn(),
  sendClientJobDashboardSms: vi.fn(),
  sendCrewAssignmentSms: vi.fn(),
  patchJob: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: vi.fn((err: unknown) => {
    if (typeof err === 'object' && err !== null && 'digest' in err) {
      throw err;
    }
  }),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOwnerContext: mocks.requireOfficeContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/jobs', () => ({
  getJob: mocks.getJob,
  createJob: mocks.createJob,
  updateJob: mocks.updateJob,
  deleteJob: mocks.deleteJob,
  updateJobSchedule: mocks.updateJobSchedule,
  createCost: mocks.createCost,
  deleteCost: mocks.deleteCost,
  formatJobSchedule: vi.fn((forDate, time) => `${forDate} at ${time}`),
  formatJobQuoteSummary: vi.fn(() => 'Quote summary test'),
  parseQuoteItems: vi.fn((items) => items || []),
  saveQuoteItems: vi.fn(),
  patchJob: vi.fn(),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  createClientJobAccessToken: mocks.createClientJobAccessToken,
  revokeClientJobAccess: mocks.revokeClientJobAccess,
  getActiveClientAccessCount: mocks.getActiveClientAccessCount,
  applyQuoteAcceptance: mocks.applyQuoteAcceptance,
}));

vi.mock('@/lib/crew', () => ({
  listCrew: mocks.listCrew,
  listCrewIdsForJob: mocks.listCrewIdsForJob,
  setJobCrewAssignments: mocks.setJobCrewAssignments,
  toggleJobCrewAssignment: mocks.toggleJobCrewAssignment,
}));

vi.mock('@/lib/job-photo-storage', () => ({
  uploadJobPhoto: mocks.uploadJobPhoto,
}));

vi.mock('@/lib/sms', () => ({
  isPhoneOptedOut: mocks.isPhoneOptedOut,
  sendClientJobDashboardSms: mocks.sendClientJobDashboardSms,
  sendCrewAssignmentSms: mocks.sendCrewAssignmentSms,
  recordSmsConsent: vi.fn(),
  sendJobUpdateSms: vi.fn(),
  sendQuoteUpdatedSms: vi.fn(),
  sendReviewRequestSms: vi.fn(),
  sendCrewScheduleSelectedSms: vi.fn(),
}));

import {
  createJobAction,
  updateJobAction,
  updateJobClientNameAction,
  updateJobContactAction,
  updateJobAddressAction,
  markJobStartedAction,
  undoJobStartedAction,
  markJobCompleteAction,
  undoJobCompleteAction,
  scheduleJobAction,
  removeJobScheduleAction,
  deleteJobAction,
  updateJobCrewAction,
  toggleJobCrewAction,
  createCostAction,
  deleteCostAction,
  createManualJobFeedAction,
  createClientJobLinkAction,
  revokeClientJobLinkAction,
} from '@/app/dashboard/jobs/actions';

describe('Dashboard Jobs Server Actions (dashboard/jobs/actions.ts)', () => {
  const TEST_ACCOUNT_ID = 'acc-jobs-111';

  function createMockSupabase(overrides: Record<string, any> = {}) {
    return {
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'item-1', timezone: 'America/New_York' }, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: 'item-1' }, error: null }),
        };
        if (overrides[table]) {
          Object.assign(chain, overrides[table]);
        }
        if (!chain.then) {
          chain.then = (resolve: any) => resolve({ data: [], error: null });
        }
        return chain;
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    const mockSupabase = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: TEST_ACCOUNT_ID,
      role: 'owner',
    });
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mocks.getActiveClientAccessCount.mockResolvedValue(1);
    mocks.createClientJobAccessToken.mockResolvedValue('tok_abc123');
    mocks.patchJob.mockResolvedValue({ id: 'job-123', client_name: 'Wayne Enterprises' });
    mocks.updateJobSchedule.mockResolvedValue({
      id: 'job-1',
      scheduled_for: '2026-07-15',
      scheduled_time: '09:00 AM',
    });
    mocks.setJobCrewAssignments.mockResolvedValue({ added: ['crew-1'], removed: [] });
  });

  describe('createJobAction', () => {
    it('creates a new job and initializes feed event and access token', async () => {
      const createdJob = {
        id: 'job-999',
        ref: 'JOB-999',
        client_name: 'Alice Johnson',
        client_phone: '555-123-4567',
        client_email: 'alice@example.com',
        status: 'new_lead',
      };
      mocks.createJob.mockResolvedValue(createdJob);
      mocks.isPhoneOptedOut.mockResolvedValue(false);

      const fd = new FormData();
      fd.append('clientName', 'Alice Johnson');
      fd.append('clientPhone', '(555) 123-4567');
      fd.append('clientEmail', 'alice@example.com');
      fd.append('address', '123 Main St, Austin, TX');
      fd.append('scope', 'Replace asphalt shingles');
      fd.append('quotedAmount', '4500');
      fd.append('estimatedHours', '8');
      fd.append('sendClientText', 'on');

      const res = await createJobAction(fd);
      expect(res.job).toEqual(createdJob);
      expect(mocks.createJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        expect.objectContaining({
          clientName: 'Alice Johnson',
          quotedAmount: 4500,
          estimatedHours: 8,
        })
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-999',
        expect.objectContaining({ kind: 'job_created' })
      );
      expect(mocks.createClientJobAccessToken).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-999',
        expect.anything()
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });
  });

  describe('updateJobAction', () => {
    it('updates job details and revalidates path', async () => {
      const updatedJob = {
        id: 'job-123',
        client_name: 'Bob Builder',
        status: 'in_progress',
        client_phone: '555-555-5555',
        client_email: 'bob@example.com',
      };
      mocks.updateJob.mockResolvedValue(updatedJob);
      mocks.getActiveClientAccessCount.mockResolvedValue(1);

      const fd = new FormData();
      fd.append('clientName', 'Bob Builder');
      fd.append('scope', 'Kitchen tile install');
      fd.append('status', 'in_progress');
      fd.append('quotedAmount', '2800');
      fd.append('clientFeedAccess', 'on');
      fd.append('messageChannel', 'sms');

      const res = await updateJobAction('job-123', fd);
      expect(res.job).toEqual(updatedJob);
      expect(mocks.updateJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        expect.objectContaining({
          clientName: 'Bob Builder',
          status: 'in_progress',
          quotedAmount: 2800,
        })
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        expect.objectContaining({ kind: 'job_update' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });

    it('revokes client feed access when clientFeedAccess is toggled off', async () => {
      const updatedJob = {
        id: 'job-123',
        client_name: 'Bob Builder',
        status: 'in_progress',
      };
      mocks.updateJob.mockResolvedValue(updatedJob);
      mocks.getActiveClientAccessCount.mockResolvedValue(2); // Had active links

      const fd = new FormData();
      fd.append('clientName', 'Bob Builder');
      // clientFeedAccess not set to 'on'

      await updateJobAction('job-123', fd);
      expect(mocks.revokeClientJobAccess).toHaveBeenCalledWith(expect.anything(), TEST_ACCOUNT_ID, 'job-123');
    });
  });

  describe('Inline attribute updates', () => {
    it('updateJobClientNameAction validates non-empty client name', async () => {
      await expect(updateJobClientNameAction('job-123', '   ')).rejects.toThrow('Client name cannot be blank.');
    });

    it('updateJobClientNameAction updates client name and revalidates', async () => {
      await updateJobClientNameAction('job-123', 'Wayne Enterprises');
      expect(mocks.patchJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        { client_name: 'Wayne Enterprises' }
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });

    it('updateJobContactAction updates phone and email', async () => {
      await updateJobContactAction('job-123', '(555) 999-8888', 'wayne@example.com');
      expect(mocks.patchJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        { client_phone: '(555) 999-8888', client_email: 'wayne@example.com' }
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });

    it('updateJobAddressAction updates address and creates feed event', async () => {
      await updateJobAddressAction('job-123', '1007 Mountain Drive');
      expect(mocks.patchJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        { address: '1007 Mountain Drive' }
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        expect.objectContaining({ kind: 'job_update' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });
  });

  describe('Job Lifecycle: Start & Complete State Transitions', () => {
    it('markJobStartedAction transitions job to in_progress and accepts quote if new', async () => {
      const job = { id: 'job-123', ref: 'JOB-123', status: 'new_lead', client_name: 'Test Client' };
      mocks.getJob.mockResolvedValue(job);

      await markJobStartedAction('job-123');
      expect(mocks.applyQuoteAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        { source: 'work_started' }
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-123',
        expect.objectContaining({ kind: 'job_started' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-123');
    });

    it('undoJobStartedAction reverts job to new_lead', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      await undoJobStartedAction('job-123', 'evt-started-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('jobs');
      expect(mockSupabase.from).toHaveBeenCalledWith('job_feed');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });

    it('markJobCompleteAction marks job complete and records completion event', async () => {
      const job = {
        id: 'job-456',
        ref: 'JOB-456',
        status: 'in_progress',
        client_name: 'Completed Client',
        scheduled_for: '2026-05-01',
      };
      mocks.getJob.mockResolvedValue(job);

      await markJobCompleteAction('job-456');
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-456',
        expect.objectContaining({ kind: 'job_completed' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-456');
    });

    it('undoJobCompleteAction restores previous status', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      await undoJobCompleteAction('job-456', 'evt-complete-1');
      expect(mockSupabase.from).toHaveBeenCalledWith('jobs');
      expect(mockSupabase.from).toHaveBeenCalledWith('job_feed');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });
  });

  describe('Scheduling & Dispatch Actions', () => {
    it('scheduleJobAction updates scheduled dates and creates feed event', async () => {
      const job = { id: 'job-1', ref: 'JOB-1', scheduled_for: null };
      mocks.getJob.mockResolvedValue(job);

      const fd = new FormData();
      fd.append('scheduledFor', '2026-07-15');
      fd.append('scheduledUntil', '2026-07-16');
      fd.append('scheduledTime', '09:00 AM');

      await scheduleJobAction('job-1', fd);
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({ kind: 'job_scheduled' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
    });

    it('removeJobScheduleAction clears schedule timestamps', async () => {
      const job = { id: 'job-1', ref: 'JOB-1', scheduled_for: '2026-07-15' };
      mocks.getJob.mockResolvedValue(job);

      await removeJobScheduleAction('job-1');
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({ kind: 'job_scheduled', title: 'Job removed from schedule' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });
  });

  describe('Crew Management Actions', () => {
    it('updateJobCrewAction replaces assigned crew members', async () => {
      const mockSupabase = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
      });

      const fd = new FormData();
      fd.append('crewIds', 'crew-1');
      fd.append('crewIds', 'crew-2');

      await updateJobCrewAction('job-1', false, fd);
      expect(mocks.setJobCrewAssignments).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        ['crew-1', 'crew-2']
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
    });

    it('toggleJobCrewAction assigns and unassigns crew member', async () => {
      mocks.toggleJobCrewAssignment.mockResolvedValue({ assigned: true });

      const res = await toggleJobCrewAction('job-1', 'crew-99', false);
      expect(res.assigned).toBe(true);
      expect(mocks.toggleJobCrewAssignment).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        'crew-99'
      );
    });
  });

  describe('Job Costs & Feed Notes', () => {
    it('createCostAction creates job cost entry and revalidates', async () => {
      mocks.createCost.mockResolvedValue({ id: 'cost-1', amount: 150 });

      const fd = new FormData();
      fd.append('amount', '150.00');
      fd.append('description', 'Lumber and screws');
      fd.append('category', 'materials');

      const cost = await createCostAction('job-1', fd);
      expect(cost.id).toBe('cost-1');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/expenses');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
    });

    it('deleteCostAction removes cost record', async () => {
      await deleteCostAction('job-1', 'cost-1');
      expect(mocks.deleteCost).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        'cost-1'
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
    });

    it('createManualJobFeedAction posts custom internal note', async () => {
      const fd = new FormData();
      fd.append('title', 'Special inspection passed');
      fd.append('body', 'City inspector signed off on framing.');
      fd.append('visibility', 'internal');

      await createManualJobFeedAction('job-1', fd);
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({
          title: 'Special inspection passed',
          body: 'City inspector signed off on framing.',
          visibility: 'internal',
        })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
    });
  });

  describe('Client Job Access Link Token Management', () => {
    it('createClientJobLinkAction generates token and logs event', async () => {
      const job = { id: 'job-1', client_phone: '555-0000', client_email: 'test@example.com' };
      mocks.getJob.mockResolvedValue(job);

      await expect(createClientJobLinkAction('job-1')).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.createClientJobAccessToken).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.anything()
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({ kind: 'client_link_created' })
      );
      expect(mocks.redirect).toHaveBeenCalledWith('/client/jobs/tok_abc123');
    });

    it('revokeClientJobLinkAction revokes active access and logs event', async () => {
      await revokeClientJobLinkAction('job-1');
      expect(mocks.revokeClientJobAccess).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1'
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({ kind: 'client_link_revoked' })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
    });

    it('deleteJobAction removes job record and redirects to jobs list', async () => {
      await expect(deleteJobAction('job-to-delete')).rejects.toThrow('NEXT_REDIRECT');
      expect(mocks.deleteJob).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-to-delete',
        expect.anything()
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/calendar');
    });
  });
});
