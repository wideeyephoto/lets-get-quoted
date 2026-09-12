import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server actions behind /portal/view/[token].
 *
 * Same shape as the client job link and the same rule: the token resolves to an
 * account AND a client, and both halves matter. An action that honoured only
 * the account would let one customer of a contractor pause another customer's
 * recurring plan, which is somebody else's money and somebody else's calendar.
 *
 * customerTogglePlanAction is the one that has to get this right, because it
 * takes a plan id straight from the page.
 */

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolvePortalAccess: vi.fn(),
  submitPortalMessage: vi.fn(),
  setRecurringPlanActive: vi.fn(),
  createJobFeedEvent: vi.fn(),
  ownerEmail: vi.fn(),
  alertEmail: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/client-portal', () => ({ resolvePortalAccess: mocks.resolvePortalAccess }));
vi.mock('@/lib/client-portal-data', () => ({ submitPortalMessage: mocks.submitPortalMessage }));
vi.mock('@/lib/recurring', () => ({ setRecurringPlanActive: mocks.setRecurringPlanActive }));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: mocks.createJobFeedEvent }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.ownerEmail,
  sendContractorAlertEmail: mocks.alertEmail,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { customerTogglePlanAction, sendPortalMessageAction } from '@/app/portal/view/[token]/actions';

const TOKEN = 'portal-link-token';
const ACCESS = { accountId: 'workspace-a', clientId: 'client-a' };

type Rows = Partial<Record<'recurring_plans' | 'clients' | 'sites' | 'accounts' | 'jobs', unknown>>;

function recordingClient(rows: Rows) {
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    queries.push({ table, filters });
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: (rows as Record<string, unknown>)[table] ?? null, error: null }),
    };
    return query;
  });
  return queries;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolvePortalAccess.mockResolvedValue(ACCESS);
  mocks.submitPortalMessage.mockResolvedValue({ ok: true });
  mocks.setRecurringPlanActive.mockResolvedValue(undefined);
  mocks.createJobFeedEvent.mockResolvedValue(undefined);
  mocks.ownerEmail.mockResolvedValue(null);
  mocks.alertEmail.mockResolvedValue(undefined);
});

describe('messaging the contractor from the portal', () => {
  it('refuses an empty message before it touches the database', async () => {
    recordingClient({});

    const result = await sendPortalMessageAction(TOKEN, form({ message: '   ' }));

    expect(result).toMatchObject({ ok: false });
    expect(mocks.resolvePortalAccess).not.toHaveBeenCalled();
    expect(mocks.submitPortalMessage).not.toHaveBeenCalled();
  });

  it('refuses an expired link', async () => {
    recordingClient({});
    mocks.resolvePortalAccess.mockResolvedValue(null);

    const result = await sendPortalMessageAction(TOKEN, form({ message: 'Any update?' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('expired');
    expect(mocks.submitPortalMessage).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('files the message under the resolved account and client, not a posted one', async () => {
    recordingClient({});

    await sendPortalMessageAction(
      TOKEN,
      form({ message: 'Any update?', accountId: 'workspace-b', clientId: 'client-b', jobId: 'job-a' }),
    );

    expect(mocks.submitPortalMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accountId: ACCESS.accountId, clientId: ACCESS.clientId, body: 'Any update?', jobId: 'job-a' }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
  });

  it('does not refresh the page for a message the writer refused', async () => {
    recordingClient({});
    mocks.submitPortalMessage.mockResolvedValue({ ok: false, message: 'Messaging is off for this account.' });

    const result = await sendPortalMessageAction(TOKEN, form({ message: 'Any update?' }));

    expect(result).toEqual({ ok: false, message: 'Messaging is off for this account.' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('pausing and resuming a recurring plan from the portal', () => {
  const plan = { id: 'plan-a', client_id: ACCESS.clientId, title: 'Quarterly service', last_job_id: 'job-a' };

  it('refuses an expired link before reading the plan', async () => {
    recordingClient({ recurring_plans: plan });
    mocks.resolvePortalAccess.mockResolvedValue(null);

    await expect(customerTogglePlanAction(TOKEN, 'plan-a', false)).rejects.toThrow('expired');
    expect(mocks.setRecurringPlanActive).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses a plan belonging to a different customer of the same contractor', async () => {
    recordingClient({ recurring_plans: { ...plan, client_id: 'client-b' }, clients: { name: 'Sam' } });

    await expect(customerTogglePlanAction(TOKEN, 'plan-a', false)).rejects.toThrow('Plan not found or unauthorized.');
    expect(mocks.setRecurringPlanActive).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a plan id that resolves to nothing in this account', async () => {
    recordingClient({ recurring_plans: null });

    await expect(customerTogglePlanAction(TOKEN, 'plan-from-another-account', false)).rejects.toThrow(
      'Plan not found or unauthorized.',
    );
    expect(mocks.setRecurringPlanActive).not.toHaveBeenCalled();
  });

  it('reads the plan scoped to the resolved account', async () => {
    const queries = recordingClient({ recurring_plans: plan, clients: { name: 'Sam' } });

    await customerTogglePlanAction(TOKEN, 'plan-a', false);

    const planQuery = queries.find((query) => query.table === 'recurring_plans');
    expect(planQuery?.filters).toMatchObject({ account_id: ACCESS.accountId, id: 'plan-a' });
  });

  it('pauses the plan and records it against the job, marked internal', async () => {
    recordingClient({ recurring_plans: plan, clients: { name: 'Sam', phone: '+15550000000', email: 'sam@example.com' } });

    await customerTogglePlanAction(TOKEN, 'plan-a', false);

    expect(mocks.setRecurringPlanActive).toHaveBeenCalledWith(expect.anything(), ACCESS.accountId, 'plan-a', false);
    expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
      expect.anything(),
      ACCESS.accountId,
      'job-a',
      expect.objectContaining({ visibility: 'internal', title: expect.stringContaining('paused') }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
  });

  it('resumes the plan and says so', async () => {
    recordingClient({ recurring_plans: plan, clients: { name: 'Sam' } });

    await customerTogglePlanAction(TOKEN, 'plan-a', true);

    expect(mocks.setRecurringPlanActive).toHaveBeenCalledWith(expect.anything(), ACCESS.accountId, 'plan-a', true);
    const [, , , event] = mocks.createJobFeedEvent.mock.calls[0];
    expect(event.title).toContain('resumed');
  });

  it('falls back to the plan latest job when the plan carries no last job', async () => {
    const queries = recordingClient({
      recurring_plans: { ...plan, last_job_id: null },
      clients: { name: 'Sam' },
      jobs: { id: 'job-latest' },
    });

    await customerTogglePlanAction(TOKEN, 'plan-a', false);

    const jobQuery = queries.find((query) => query.table === 'jobs');
    expect(jobQuery?.filters).toMatchObject({ account_id: ACCESS.accountId, recurring_plan_id: 'plan-a' });
    expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(expect.anything(), ACCESS.accountId, 'job-latest', expect.anything());
  });

  it('still toggles the plan when there is no job to record it against', async () => {
    recordingClient({ recurring_plans: { ...plan, last_job_id: null }, clients: { name: 'Sam' }, jobs: null });

    await expect(customerTogglePlanAction(TOKEN, 'plan-a', false)).resolves.toBeUndefined();

    expect(mocks.setRecurringPlanActive).toHaveBeenCalled();
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
  });

  it('still toggles the plan when the contractor alert email fails', async () => {
    recordingClient({ recurring_plans: plan, clients: { name: 'Sam' } });
    mocks.ownerEmail.mockResolvedValue('owner@example.com');
    mocks.alertEmail.mockRejectedValue(new Error('Resend is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(customerTogglePlanAction(TOKEN, 'plan-a', false)).resolves.toBeUndefined();

    expect(mocks.setRecurringPlanActive).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/portal/view/${TOKEN}`);
    consoleError.mockRestore();
  });
});
