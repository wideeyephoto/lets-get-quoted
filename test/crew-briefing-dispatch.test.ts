import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crewBriefingSendAt } from '@/lib/crew-briefing-dispatch';
import { crewBriefingStopsForMember } from '@/lib/crew-briefing';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), jobs: vi.fn(), crew: vi.fn(), assignments: vi.fn(), settings: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: async () => ({ supabase: {}, accountId: '11111111-1111-4111-8111-111111111111' }),
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: vi.fn() }));
vi.mock('@/lib/jobs', () => ({ backfillJobCoordinates: vi.fn(), updateJobSchedule: vi.fn() }));
vi.mock('@/lib/sms', () => ({ isPhoneOptedOut: vi.fn(), recordSmsConsent: vi.fn(), sendArrivalTimeChangedSms: vi.fn() }));
vi.mock('@/lib/route-plan', () => ({ arrivalWindow: vi.fn(), buildScheduleChangeset: vi.fn(), formatTimeLabel: vi.fn(), parseTimeMinutes: vi.fn() }));
vi.mock('@/lib/route-plan-day', () => ({ getPlanAccountSettings: mocks.settings, listDayJobs: mocks.jobs }));
vi.mock('@/lib/geocode', () => ({ geocodeAddress: vi.fn() }));
vi.mock('@/lib/route-stops', () => ({ isRouteStopId: vi.fn(), normalizeManualKind: vi.fn(), rememberPlace: vi.fn(), routeStopUuid: vi.fn() }));
vi.mock('@/lib/day-plan-prefs', () => ({ savePreferredLast: vi.fn() }));
vi.mock('@/lib/crew', () => ({ listCrew: mocks.crew, listJobIdsForCrew: mocks.assignments }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Example Business' }));

import { sendCrewMorningBriefingAction } from '@/app/dashboard/schedule/plan/actions';

const alice = { id: '22222222-2222-4222-8222-222222222222', name: 'Alice', phone: '+12025550101' };
const bob = { id: '33333333-3333-4333-8333-333333333333', name: 'Bob', phone: '+12025550102' };
const job = { id: '44444444-4444-4444-8444-444444444444', client_name: 'Example Customer', address: '123 Example Street', client_phone: '+12025550103', scheduled_time: '09:00', scope: 'Repair sink', lat: null, lng: null };
const intentId = '66666666-6666-4666-8666-666666666666';
const eventId = '55555555-5555-4555-8555-555555555555';
const recordedIntents = new Set<string>();

function form(options: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ dateKey: '2026-09-06', memberId: alice.id, intentId, ...options })) result.set(key, value);
  return result;
}
async function submit(value: FormData) {
  try {
    await sendCrewMorningBriefingAction(value);
    throw new Error('Expected a redirect');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^REDIRECT:/);
    return new URL((error as Error).message.slice('REDIRECT:'.length), 'https://example.test').searchParams;
  }
}
function queued() { return mocks.rpc.mock.calls.map(([, params]) => params); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-05T16:00:00.000Z'));
  recordedIntents.clear();
  mocks.settings.mockResolvedValue({ scheduleDayHours: 8, workingWeekdays: null, timezone: 'America/New_York' });
  mocks.crew.mockResolvedValue([alice, bob]);
  mocks.jobs.mockResolvedValue({ jobs: [job] });
  mocks.assignments.mockImplementation(async (_db, _account, crewId) => crewId === alice.id ? [job.id] : []);
  mocks.rpc.mockImplementation(async (_name, params) => {
    const created = !recordedIntents.has(params.p_idempotency_key);
    recordedIntents.add(params.p_idempotency_key);
    return { data: { sms_event_id: eventId, task_state: 'queued', created }, error: null };
  });
});
afterEach(() => vi.useRealTimers());

describe('crew dispatch through the canonical enqueue boundary', () => {
  it('persists 7 AM account-local delivery in the actual enqueue RPC', async () => {
    const result = await submit(form({ scheduledTiming: 'scheduled_7am' }));
    expect(mocks.rpc).toHaveBeenCalledWith('enqueue_sms_delivery', expect.objectContaining({ p_available_at: '2026-09-06T11:00:00.000Z', p_sender_purpose: 'lgq_dispatch' }));
    expect(result.get('scheduled')).toBe('1');
  });

  it('leaves Send Now immediately eligible', async () => {
    await submit(form());
    expect(queued()[0].p_available_at).toBeNull();
  });

  it('rejects a past 7 AM schedule without silently sending now', async () => {
    const result = await submit(form({ dateKey: '2026-09-05', scheduledTiming: 'scheduled_7am' }));
    expect(result.get('dispatchError')).toBe('past_schedule');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid'])('requires a valid producer intent (%s)', async (intentId) => {
    const result = await submit(form({ intentId }));
    expect(result.get('dispatchError')).toBe('invalid_intent');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not send another crew member\'s jobs to an unassigned recipient', async () => {
    const result = await submit(form({ memberId: bob.id }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.get('skippedNoJobs')).toBe('1');
  });

  it.each(['', 'unrelated-crew-id'])('does not broaden an empty or invalid selection (%s) to the roster', async (memberId) => {
    const result = await submit(form({ memberId }));
    expect(result.get('dispatchError')).toBe('invalid_recipients');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('still checks assignments for a one-person roster', async () => {
    mocks.crew.mockResolvedValue([bob]);
    await submit(form({ memberId: bob.id }));
    expect(mocks.assignments).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['0', '1'])('fails closed on assignment errors, including urgent updates (%s)', async (isUrgentUpdate) => {
    mocks.assignments.mockRejectedValue(new Error('Database unavailable'));
    const result = await submit(form({ isUrgentUpdate }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.get('failedDispatch')).toBe('Alice');
    expect(result.has('briefingCompleted')).toBe(false);
  });

  it('filters every recipient to their own assignments, independent of the screen filter', async () => {
    const secondJob = { ...job, id: '77777777-7777-4777-8777-777777777777', address: '456 Other Street' };
    mocks.jobs.mockResolvedValue({ jobs: [job, secondJob] });
    mocks.assignments.mockImplementation(async (_db, _account, id) => [id === alice.id ? job.id : secondJob.id]);
    const value = form({ crewId: alice.id });
    value.append('memberId', bob.id);
    await submit(value);
    expect(mocks.jobs.mock.calls[0][3]).toBeNull();
    expect(queued()[0].p_body).toContain(job.address);
    expect(queued()[0].p_body).not.toContain(secondJob.address);
    expect(queued()[1].p_body).toContain(secondJob.address);
    expect(queued()[1].p_body).not.toContain(job.address);
  });

  it('replays the same submission with one stable database identity', async () => {
    const value = form();
    await submit(value);
    vi.setSystemTime(new Date('2026-09-05T16:05:00.000Z'));
    await submit(value);
    expect(queued()).toHaveLength(2);
    expect(queued()[0].p_idempotency_key).toBe(queued()[1].p_idempotency_key);
    expect(recordedIntents.size).toBe(1);
  });

  it('permits an intentional new dispatch after the completed intent rotates', async () => {
    const first = await submit(form());
    expect(first.get('briefingCompleted')).toBe(intentId);
    await submit(form({ intentId: '88888888-8888-4888-8888-888888888888' }));
    expect(recordedIntents.size).toBe(2);
  });

  it('preserves identity after partial success, so retry only creates missing delivery work', async () => {
    mocks.assignments.mockResolvedValue([job.id]);
    const workingRpc = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (name, params) => params.p_crew_id === bob.id
      ? { data: null, error: { code: '08006' } } : workingRpc(name, params));
    const value = form();
    value.append('memberId', bob.id);
    const first = await submit(value);
    expect(first.get('briefed')).toBe('1');
    expect(first.has('briefingCompleted')).toBe(false);
    mocks.rpc.mockImplementation(workingRpc);
    const second = await submit(value);
    expect(recordedIntents.size).toBe(2);
    expect(second.get('briefingCompleted')).toBe(intentId);
  });

  it('sends an explicit urgent cancellation when the final stop disappears', async () => {
    mocks.jobs.mockResolvedValue({ jobs: [] });
    await submit(form({ isUrgentUpdate: '1' }));
    expect(queued()[0].p_body).toContain('no remaining scheduled stops');
    expect(queued()[0].p_body).not.toContain(job.address);
  });

  it('preserves intent when a missing phone is repaired after partial success', async () => {
    mocks.crew.mockResolvedValue([alice, { ...bob, phone: null }]);
    mocks.assignments.mockResolvedValue([job.id]);
    const value = form();
    value.append('memberId', bob.id);
    const first = await submit(value);
    expect(first.get('skippedNoPhone')).toBe('1');
    expect(first.has('briefingCompleted')).toBe(false);
    mocks.crew.mockResolvedValue([alice, bob]);
    await submit(value);
    expect(recordedIntents.size).toBe(2);
  });

  it('sends a cancellation to an unassigned member even if another member still has jobs', async () => {
    await submit(form({ memberId: bob.id, isUrgentUpdate: '1' }));
    expect(queued()[0].p_body).toContain('no remaining scheduled stops');
    expect(queued()[0].p_body).not.toContain(job.address);
  });

  it('does not turn a failed schedule read into a cancellation', async () => {
    mocks.jobs.mockRejectedValue(new Error('Schedule unavailable'));
    await expect(sendCrewMorningBriefingAction(form({ isUrgentUpdate: '1' }))).rejects.toThrow('Schedule unavailable');
    expect(mocks.jobs.mock.calls[0][4].requireSuccessfulRead).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires a successful account settings read before choosing a delivery time', async () => {
    mocks.settings.mockRejectedValue(new Error('Settings unavailable'));
    await expect(sendCrewMorningBriefingAction(form())).rejects.toThrow('Settings unavailable');
    expect(mocks.settings.mock.calls[0][2].requireSuccessfulRead).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('account-local 7 AM scheduling', () => {
  it.each([
    ['2026-03-08', 'America/New_York', '2026-03-08T11:00:00.000Z'],
    ['2026-11-01', 'America/New_York', '2026-11-01T12:00:00.000Z'],
    ['2026-09-06', 'America/Los_Angeles', '2026-09-06T14:00:00.000Z'],
    ['2026-09-06', 'Pacific/Honolulu', '2026-09-06T17:00:00.000Z'],
    ['2026-09-06', 'Asia/Kolkata', '2026-09-06T01:30:00.000Z'],
  ])('schedules %s in %s at %s', (date, zone, expected) => {
    expect(crewBriefingSendAt(date, zone).toISOString()).toBe(expected);
  });
  it.each(['2026-02-30', '2026-13-01', 'invalid'])('rejects invalid date %s', (date) => {
    expect(() => crewBriefingSendAt(date, 'America/New_York')).toThrow();
  });
  it('rejects an invalid time zone instead of guessing', () => {
    expect(() => crewBriefingSendAt('2026-09-06', 'Invalid/Zone')).toThrow();
  });
});

it('uses full assignment identities for preview, even when display references collide', () => {
  const stops = [
    { jobId: job.id, jobRef: 'JOB-444444', clientName: 'Alice job', address: job.address },
    { jobId: '44444444-9999-4999-8999-999999999999', jobRef: 'JOB-444444', clientName: 'Bob job', address: 'Private address' },
    { jobRef: 'JOB-444444', clientName: 'Unknown assignment', address: 'Hidden' },
  ];
  expect(crewBriefingStopsForMember(stops, { [job.id]: [alice.id] }, alice.id)).toEqual([stops[0]]);
  expect(crewBriefingStopsForMember(stops, {}, bob.id)).toEqual([]);
});
