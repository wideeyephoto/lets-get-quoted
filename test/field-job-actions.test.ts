import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    const err = new Error(`NEXT_REDIRECT:${path}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};307;;`;
    throw err;
  }),
  revalidatePath: vi.fn(),
  requireCrewContext: vi.fn(),
  createAdminClient: vi.fn(),
  isJobAssignedToCrew: vi.fn(),
  applyQuoteAcceptance: vi.fn(),
  createJobFeedEvent: vi.fn(),
  createCost: vi.fn(),
  evaluateAndTriggerMarginAlert: vi.fn(),
  createJobTask: vi.fn(),
  setJobTaskDone: vi.fn(),
  arrivalPermissionsFromCrew: vi.fn(),
  arrivalSettingsFromAccount: vi.fn(),
  applyArrivalStatus: vi.fn(),
  sendArrival: vi.fn(),
  getActiveTracking: vi.fn(),
  updateTechPosition: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  getOpenShift: vi.fn(),
  setCrewJobStatus: vi.fn(),
  sendJobsiteArrivalBriefingSms: vi.fn().mockResolvedValue({}),
  resolveCrewBurdenPct: vi.fn().mockResolvedValue(15),
  normalizeCostSource: vi.fn((s) => (s === 'estimated' ? 'estimated' : 'receipt')),
  triggerNeighborhoodHaloOnJobComplete: vi.fn().mockResolvedValue({}),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/crew-auth', () => ({
  requireCrewContext: mocks.requireCrewContext,
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/crew', () => ({
  isJobAssignedToCrew: mocks.isJobAssignedToCrew,
}));

vi.mock('@/lib/job-feed', () => ({
  applyQuoteAcceptance: mocks.applyQuoteAcceptance,
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/jobs', () => ({
  createCost: mocks.createCost,
}));

vi.mock('@/lib/margin-alerts', () => ({
  evaluateAndTriggerMarginAlert: mocks.evaluateAndTriggerMarginAlert,
}));

vi.mock('@/lib/job-tasks', () => ({
  createJobTask: mocks.createJobTask,
  setJobTaskDone: mocks.setJobTaskDone,
}));

vi.mock('@/lib/arrival', () => ({
  arrivalPermissionsFromCrew: mocks.arrivalPermissionsFromCrew,
  arrivalSettingsFromAccount: mocks.arrivalSettingsFromAccount,
  MIN_ETA_MINUTES: 5,
  MAX_ETA_MINUTES: 180,
}));

vi.mock('@/lib/arrival-send', () => ({
  applyArrivalStatus: mocks.applyArrivalStatus,
  sendArrival: mocks.sendArrival,
}));

vi.mock('@/lib/job-tracking', () => ({
  getActiveTracking: mocks.getActiveTracking,
  updateTechPosition: mocks.updateTechPosition,
}));

vi.mock('@/lib/time-clock-data', () => ({
  clockIn: mocks.clockIn,
  clockOut: mocks.clockOut,
  getOpenShift: mocks.getOpenShift,
}));

vi.mock('@/lib/crew-job-status', () => ({
  setCrewJobStatus: mocks.setCrewJobStatus,
}));

vi.mock('@/lib/crew-onsite-briefing', () => ({
  sendJobsiteArrivalBriefingSms: mocks.sendJobsiteArrivalBriefingSms,
}));

vi.mock('@/lib/cost-truth-data', () => ({
  resolveCrewBurdenPct: mocks.resolveCrewBurdenPct,
}));

vi.mock('@/lib/cost-truth', () => ({
  normalizeCostSource: mocks.normalizeCostSource,
}));

vi.mock('@/lib/neighborhood-halo-service', () => ({
  triggerNeighborhoodHaloOnJobComplete: mocks.triggerNeighborhoodHaloOnJobComplete,
}));

import {
  assertAssigned,
  setFieldJobStatusAction,
  sendArrivalFieldAction,
  updateArrivalPositionAction,
  setArrivalStatusFieldAction,
  clockInFieldAction,
  clockOutFieldAction,
  logFieldTimeAction,
  logFieldMaterialAction,
  toggleFieldTaskAction,
  addFieldTaskAction,
  postFieldUpdateAction,
} from '@/app/field/jobs/[id]/actions';

const TEST_ACCOUNT_ID = 'acc-crew-123';
const TEST_JOB_ID = 'job-field-456';
const TEST_CREW_ID = 'crew-member-789';

function createMockCrewSupabase(jobStatus = 'scheduled') {
  return {
    from: vi.fn((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: TEST_JOB_ID, status: jobStatus, lat: 37.77, lng: -122.41 },
                  error: null,
                }),
              })),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: TEST_JOB_ID, status: jobStatus, lat: 37.77, lng: -122.41 },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: TEST_ACCOUNT_ID, location_policy: 'precise' },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
  };
}

describe('Field Job Server Actions (field/jobs/[id]/actions.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockCrewSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockCrewSupabase();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
    mocks.requireCrewContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: TEST_ACCOUNT_ID,
      crew: {
        id: TEST_CREW_ID,
        name: 'Dave Miller',
        hourly_rate: 35,
        role: 'tech',
      },
      timeClockMode: 'optional',
    });
    mocks.isJobAssignedToCrew.mockResolvedValue(true);
    mocks.arrivalPermissionsFromCrew.mockReturnValue({ shareLocation: true });
    mocks.arrivalSettingsFromAccount.mockReturnValue({
      locationPolicy: 'precise',
      locationPrecision: 10,
    });
  });

  describe('assertAssigned', () => {
    it('passes silently when crew is assigned to job', async () => {
      mocks.isJobAssignedToCrew.mockResolvedValueOnce(true);
      await expect(assertAssigned(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID, TEST_CREW_ID)).resolves.toBeUndefined();
    });

    it('throws error when crew is not assigned to job', async () => {
      mocks.isJobAssignedToCrew.mockResolvedValueOnce(false);
      await expect(assertAssigned(mockSupabase as any, TEST_ACCOUNT_ID, TEST_JOB_ID, TEST_CREW_ID)).rejects.toThrow(
        'You are not assigned to this job.'
      );
    });
  });

  describe('setFieldJobStatusAction', () => {
    it('rejects if crew is not assigned', async () => {
      mocks.isJobAssignedToCrew.mockResolvedValueOnce(false);
      await expect(setFieldJobStatusAction(TEST_JOB_ID, 'in_progress')).rejects.toThrow(
        'You are not assigned to this job.'
      );
    });

    it('applies quote acceptance if current status is new_lead and starting work', async () => {
      mockSupabase = createMockCrewSupabase('new_lead');
      mocks.requireCrewContext.mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        crew: { id: TEST_CREW_ID, name: 'Dave Miller', hourly_rate: 35 },
        timeClockMode: 'optional',
      });

      await expect(setFieldJobStatusAction(TEST_JOB_ID, 'in_progress')).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );

      expect(mocks.applyQuoteAcceptance).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        { source: 'work_started' }
      );
      expect(mocks.setCrewJobStatus).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        'in_progress'
      );
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        expect.objectContaining({
          title: 'Work started by crew',
          visibility: 'internal',
        })
      );
    });

    it('triggers halo service when completing job', async () => {
      await expect(setFieldJobStatusAction(TEST_JOB_ID, 'complete')).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );

      expect(mocks.setCrewJobStatus).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        'complete'
      );
      expect(mocks.triggerNeighborhoodHaloOnJobComplete).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        TEST_JOB_ID
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/field');
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/field/jobs/${TEST_JOB_ID}`);
    });

    it('redirects with clock error message if setCrewJobStatus throws', async () => {
      mocks.setCrewJobStatus.mockRejectedValueOnce(new Error('Job is archived'));
      await expect(setFieldJobStatusAction(TEST_JOB_ID, 'in_progress')).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clock=Job%20is%20archived`
      );
    });
  });

  describe('sendArrivalFieldAction', () => {
    it('redirects bad-eta when eta is out of range', async () => {
      const fd = new FormData();
      fd.append('eta', '500'); // exceeds MAX_ETA_MINUTES (180)

      await expect(sendArrivalFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?arrival=bad-eta`
      );
    });

    it('redirects with error reason if sendArrival fails', async () => {
      const fd = new FormData();
      fd.append('eta', '30');
      fd.append('lat', '37.77');
      fd.append('lng', '-122.41');
      fd.append('share', 'on');

      mocks.sendArrival.mockResolvedValueOnce({
        ok: false,
        reason: 'no_customer_phone',
      });

      await expect(sendArrivalFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?arrival=no_customer_phone`
      );
    });

    it('sends arrival notification successfully and redirects with mode and sms status', async () => {
      const fd = new FormData();
      fd.append('eta', '25');
      fd.append('lat', '37.77');
      fd.append('lng', '-122.41');
      fd.append('share', 'on');
      fd.append('suggested', '20');
      fd.append('message', 'On my way!');
      fd.append('confirm', 'on');

      mocks.sendArrival.mockResolvedValueOnce({
        ok: true,
        mode: 'en_route',
        sms: { status: 'sent' },
      });

      await expect(sendArrivalFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?arrival=en_route&sms=sent`
      );

      expect(mocks.sendArrival).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          accountId: TEST_ACCOUNT_ID,
          jobId: TEST_JOB_ID,
          etaMinutes: 25,
          suggestedMinutes: 20,
          override: 'On my way!',
          shareLocation: true,
          techLoc: { lat: 37.77, lng: -122.41 },
        })
      );
    });
  });

  describe('updateArrivalPositionAction', () => {
    it('ignores update if shareLocation permission is false', async () => {
      mocks.arrivalPermissionsFromCrew.mockReturnValueOnce({ shareLocation: false });
      await updateArrivalPositionAction(TEST_JOB_ID, 37.77, -122.41);
      expect(mocks.updateTechPosition).not.toHaveBeenCalled();
    });

    it('ignores update if coords are NaN', async () => {
      await updateArrivalPositionAction(TEST_JOB_ID, NaN, -122.41);
      expect(mocks.updateTechPosition).not.toHaveBeenCalled();
    });

    it('updates position when active tracking is present and policy is not off', async () => {
      const activeTracking = { id: 'track-1', job_id: TEST_JOB_ID };
      mocks.getActiveTracking.mockResolvedValueOnce(activeTracking);

      await updateArrivalPositionAction(TEST_JOB_ID, 37.7749, -122.4194);

      expect(mocks.updateTechPosition).toHaveBeenCalledWith(
        expect.anything(),
        activeTracking,
        { lat: 37.7749, lng: -122.4194 },
        10,
        expect.any(Date),
        { lat: 37.77, lng: -122.41 },
        expect.anything()
      );
    });
  });

  describe('setArrivalStatusFieldAction', () => {
    it('redirects without action if status is invalid', async () => {
      const fd = new FormData();
      fd.append('status', 'flying');

      await expect(setArrivalStatusFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );
      expect(mocks.applyArrivalStatus).not.toHaveBeenCalled();
    });

    it('applies arrival status and redirects with outcome', async () => {
      const fd = new FormData();
      fd.append('status', 'arrived');
      fd.append('note', 'Parked on driveway');
      fd.append('notify', 'on');

      mocks.applyArrivalStatus.mockResolvedValueOnce({ ok: true });

      await expect(setArrivalStatusFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?arrival=arrived`
      );

      expect(mocks.applyArrivalStatus).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          accountId: TEST_ACCOUNT_ID,
          jobId: TEST_JOB_ID,
          status: 'arrived',
          note: 'Parked on driveway',
          notify: true,
        })
      );
    });
  });

  describe('clockInFieldAction', () => {
    it('redirects directly if timeClockMode is off', async () => {
      mocks.requireCrewContext.mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        crew: { id: TEST_CREW_ID, name: 'Dave', hourly_rate: 30 },
        timeClockMode: 'off',
      });

      await expect(clockInFieldAction(TEST_JOB_ID)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );
      expect(mocks.clockIn).not.toHaveBeenCalled();
    });

    it('clocks in with geofence evidence and triggers briefing SMS', async () => {
      const fd = new FormData();
      fd.append('lat', '37.77');
      fd.append('lng', '-122.41');
      fd.append('accuracy', '5');
      fd.append('geofenceStatus', 'inside');
      fd.append('distanceFt', '45');

      await expect(clockInFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clocked=in`
      );

      expect(mocks.clockIn).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_CREW_ID,
        TEST_JOB_ID,
        35,
        undefined,
        undefined,
        expect.objectContaining({
          status: 'inside',
          distanceFt: 45,
          accuracyMeters: 5,
        })
      );
      expect(mocks.sendJobsiteArrivalBriefingSms).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: TEST_ACCOUNT_ID,
          jobId: TEST_JOB_ID,
          crewId: TEST_CREW_ID,
        }),
        expect.anything()
      );
    });

    it('redirects with clock error if clockIn throws', async () => {
      mocks.clockIn.mockRejectedValueOnce(new Error('Already clocked in on another job'));

      await expect(clockInFieldAction(TEST_JOB_ID)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clock=Already%20clocked%20in%20on%20another%20job`
      );
    });
  });

  describe('clockOutFieldAction', () => {
    it('redirects with error if there is no open shift', async () => {
      mocks.getOpenShift.mockResolvedValueOnce(null);
      const fd = new FormData();

      await expect(clockOutFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clock=No%20open%20shift%20to%20clock%20out%20of.`
      );
    });

    it('clocks out shift and redirects with hours worked', async () => {
      const shift = { id: 'shift-1', job_id: TEST_JOB_ID };
      mocks.getOpenShift.mockResolvedValueOnce(shift);
      mocks.clockOut.mockResolvedValueOnce({ hours: 4.5 });

      const fd = new FormData();
      fd.append('description', 'Finished copper piping');
      fd.append('lat', '37.77');
      fd.append('lng', '-122.41');

      await expect(clockOutFieldAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clocked=out&hours=4.5`
      );

      expect(mocks.clockOut).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        shift,
        expect.objectContaining({
          crewName: 'Dave Miller',
          note: 'Finished copper piping',
        })
      );
    });
  });

  describe('logFieldTimeAction', () => {
    it('redirects with error if timeClockMode is required', async () => {
      mocks.requireCrewContext.mockResolvedValueOnce({
        supabase: mockSupabase,
        accountId: TEST_ACCOUNT_ID,
        crew: { id: TEST_CREW_ID, name: 'Dave', hourly_rate: 35 },
        timeClockMode: 'required',
      });
      const fd = new FormData();

      await expect(logFieldTimeAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?clock=Clock%20in%20and%20out%20to%20log%20time%20on%20this%20job.`
      );
    });

    it('redirects time-invalid if hours is missing or zero', async () => {
      const fd = new FormData();
      fd.append('hours', '0');

      await expect(logFieldTimeAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?logged=time-invalid`
      );
    });

    it('creates labor cost with burden pct and checks margin alert', async () => {
      const fd = new FormData();
      fd.append('hours', '3.5');
      fd.append('description', 'Drywall patching');

      const mockCost = { id: 'cost-1', type: 'labor', amount: 122.5 };
      mocks.createCost.mockResolvedValueOnce(mockCost);

      await expect(logFieldTimeAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?logged=time`
      );

      expect(mocks.createCost).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        expect.objectContaining({
          type: 'labor',
          description: 'Drywall patching',
          crewId: TEST_CREW_ID,
          hours: 3.5,
          rate: 35,
          source: 'estimated',
          burdenPct: 15,
        })
      );
      expect(mocks.evaluateAndTriggerMarginAlert).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        mockCost
      );
    });
  });

  describe('logFieldMaterialAction', () => {
    it('redirects material-invalid if missing description or negative amount', async () => {
      const fd = new FormData();
      fd.append('amount', '-10');

      await expect(logFieldMaterialAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?logged=material-invalid`
      );
    });

    it('creates material cost with receipt default and checks margin alert', async () => {
      const fd = new FormData();
      fd.append('description', 'PVC valves & glue');
      fd.append('amount', '64.50');

      const mockCost = { id: 'cost-mat-1', type: 'material', amount: 64.50 };
      mocks.createCost.mockResolvedValueOnce(mockCost);

      await expect(logFieldMaterialAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}?logged=material`
      );

      expect(mocks.createCost).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        expect.objectContaining({
          type: 'material',
          description: 'PVC valves & glue',
          amount: 64.50,
          crewId: TEST_CREW_ID,
          source: 'receipt',
        })
      );
      expect(mocks.evaluateAndTriggerMarginAlert).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        mockCost
      );
    });
  });

  describe('toggleFieldTaskAction and addFieldTaskAction', () => {
    it('toggles task done status with crew attribution', async () => {
      await expect(toggleFieldTaskAction(TEST_JOB_ID, 'task-99', true)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );
      expect(mocks.setJobTaskDone).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        'task-99',
        true,
        'Dave Miller'
      );
    });

    it('adds new field task', async () => {
      const fd = new FormData();
      fd.append('title', 'Replace water filter');

      await expect(addFieldTaskAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );
      expect(mocks.createJobTask).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        'Replace water filter'
      );
    });
  });

  describe('postFieldUpdateAction', () => {
    it('creates internal note or client-visible update', async () => {
      const fd = new FormData();
      fd.append('body', 'Found broken seal on main line');
      fd.append('share', 'on');

      await expect(postFieldUpdateAction(TEST_JOB_ID, fd)).rejects.toThrow(
        `NEXT_REDIRECT:/field/jobs/${TEST_JOB_ID}`
      );

      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        mockSupabase,
        TEST_ACCOUNT_ID,
        TEST_JOB_ID,
        expect.objectContaining({
          kind: 'job_update',
          title: 'Update from Dave Miller',
          body: 'Found broken seal on main line',
          visibility: 'client',
          author: 'Dave Miller',
        })
      );
    });
  });
});
