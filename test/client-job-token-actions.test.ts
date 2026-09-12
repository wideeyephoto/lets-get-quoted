import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server actions behind /client/jobs/[token].
 *
 * Each one is a public endpoint: a server action is reachable by anybody who
 * holds the link, so "the form was hidden" is not a check and neither is
 * anything the form posted. What the browser sends is a token and some fields;
 * which account and which job may be touched has to come back from
 * resolveJobAccess and from nowhere else.
 *
 * These tests hold that line. They let the actions' own logic run and stub the
 * boundaries — the link resolver, the rate limiter, the writers — so that what
 * is asserted is the wiring between them: refuse first, scope from the resolved
 * access, and do not revalidate a page for a request that failed.
 */

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolveJobAccess: vi.fn(),
  respondAsClient: vi.fn(),
  checkRateLimit: vi.fn(),
  createJobFeedEvent: vi.fn(),
  chooseOption: vi.fn(),
  signCustomerFormSubmission: vi.fn(),
  ownerEmail: vi.fn(),
  alertEmail: vi.fn(),
  revalidatePath: vi.fn(),
  selectClientJobScheduleOption: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/change-order-client', () => ({
  resolveJobAccess: mocks.resolveJobAccess,
  respondAsClient: mocks.respondAsClient,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  clientIpFrom: () => '203.0.113.10',
}));
vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
  approveClientJobQuote: vi.fn(),
}));
vi.mock('@/lib/selections-data', () => ({ chooseOption: mocks.chooseOption }));
vi.mock('@/lib/forms/forms-data', () => ({ signCustomerFormSubmission: mocks.signCustomerFormSubmission }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.ownerEmail,
  sendContractorAlertEmail: mocks.alertEmail,
}));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Test Contracting' }));
vi.mock('@/lib/scheduling', () => ({
  selectClientJobScheduleOption: mocks.selectClientJobScheduleOption,
  requestDifferentClientJobScheduleOptions: vi.fn(),
  selectScheduleOption: vi.fn(),
  requestDifferentScheduleOptions: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { selectClientJobScheduleOptionAction, submitJobFeedbackAction } from '@/app/client/jobs/[token]/actions';
import { askAboutSelectionAction, chooseSelectionAction } from '@/app/client/jobs/[token]/selection-actions';
import { respondToChangeOrderAction } from '@/app/client/jobs/[token]/change-order-actions';
import { signClientFormAction } from '@/app/client/jobs/[token]/form-actions';

const TOKEN = 'homeowner-link-token';
const ACCESS = { accountId: 'workspace-a', jobId: 'job-a' };

/** Records every table read and the filters it was narrowed by. */
function recordingClient(rows: Record<string, unknown | null>) {
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    queries.push({ table, filters });
    const query = {
      select: () => query,
      insert: (value: Record<string, unknown>) => {
        filters.__insert = value;
        return Promise.resolve({ data: null, error: null });
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
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
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.resolveJobAccess.mockResolvedValue(ACCESS);
  mocks.createJobFeedEvent.mockResolvedValue(undefined);
  mocks.ownerEmail.mockResolvedValue(null);
  mocks.alertEmail.mockResolvedValue(undefined);
  mocks.redirect.mockImplementation((path: string) => {
    // Next's redirect throws to end the action. Returning instead would let the
    // rest of the body run and prove something that never happens.
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe('picking a schedule option from the job link', () => {
  it.each(['-1', '3', '1.5', 'two', ''])('refuses the option index %j before any write', async (optionIndex) => {
    recordingClient({});

    await expect(selectClientJobScheduleOptionAction(TOKEN, form({ optionIndex }))).rejects.toThrow(
      'Choose a valid schedule option.',
    );
    expect(mocks.selectClientJobScheduleOption).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a submission carrying no option field at all', async () => {
    recordingClient({});

    // Number(null) is 0. Without the guard this books the first slot and tells
    // the contractor the customer chose it.
    await expect(selectClientJobScheduleOptionAction(TOKEN, form({}))).rejects.toThrow(
      'Choose a valid schedule option.',
    );
    expect(mocks.selectClientJobScheduleOption).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('accepts option %i through the token', async (optionIndex) => {
    recordingClient({});

    await expect(
      selectClientJobScheduleOptionAction(TOKEN, form({ optionIndex: String(optionIndex), notes: '  Afternoon  ' })),
    ).rejects.toThrow(`NEXT_REDIRECT:/client/jobs/${TOKEN}?scheduled=1`);

    expect(mocks.selectClientJobScheduleOption).toHaveBeenCalledWith(TOKEN, optionIndex, 'Afternoon');
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
  });
});

describe('leaving private feedback on a finished job', () => {
  it('refuses a link the resolver rejects, and writes nothing', async () => {
    recordingClient({});
    mocks.resolveJobAccess.mockResolvedValue(null);

    const result = await submitJobFeedbackAction(TOKEN, form({ feedback: 'Great work', rating: '5' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no longer valid');
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
    expect(mocks.alertEmail).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rate-limits before it will even resolve the link', async () => {
    recordingClient({});
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await submitJobFeedbackAction(TOKEN, form({ feedback: 'Great work' }));

    expect(result.ok).toBe(false);
    expect(mocks.resolveJobAccess).not.toHaveBeenCalled();
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
  });

  it('rejects empty feedback without writing', async () => {
    recordingClient({ jobs: { ref: 'J-1', client_name: 'Sam' } });

    const result = await submitJobFeedbackAction(TOKEN, form({ feedback: '   ' }));

    expect(result).toMatchObject({ ok: false });
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
  });

  it('reads the job through the resolved account and job, not through anything posted', async () => {
    const queries = recordingClient({ jobs: { ref: 'J-1', client_name: 'Sam' } });

    await submitJobFeedbackAction(
      TOKEN,
      // A caller naming somebody else's workspace and job on the form.
      form({ feedback: 'All good', rating: '5', accountId: 'workspace-b', jobId: 'job-b' }),
    );

    const jobQuery = queries.find((query) => query.table === 'jobs');
    expect(jobQuery?.filters).toMatchObject({ account_id: ACCESS.accountId, id: ACCESS.jobId });
    expect(Object.values(jobQuery?.filters ?? {})).not.toContain('workspace-b');
    expect(Object.values(jobQuery?.filters ?? {})).not.toContain('job-b');
  });

  it('files the feedback against the resolved job, kept internal', async () => {
    recordingClient({ jobs: { ref: 'J-1', client_name: 'Sam' } });

    const result = await submitJobFeedbackAction(TOKEN, form({ feedback: 'All good', rating: '4' }));

    expect(result).toEqual({ ok: true });
    expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
      expect.anything(),
      ACCESS.accountId,
      ACCESS.jobId,
      expect.objectContaining({ kind: 'review_feedback', visibility: 'internal', body: 'All good' }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
  });

  it('keeps a rating only when it is a whole number from one to five', async () => {
    recordingClient({ jobs: { ref: 'J-1', client_name: 'Sam' } });

    for (const [rating, expected] of [['5', ' (5★)'], ['0', ''], ['9', ''], ['3.5', ''], ['', '']] as const) {
      mocks.createJobFeedEvent.mockClear();
      await submitJobFeedbackAction(TOKEN, form({ feedback: 'Fine', rating }));
      const [, , , event] = mocks.createJobFeedEvent.mock.calls[0];
      expect(event.title).toBe(`Private feedback${expected}`);
    }
  });

  it('still records the feedback when the alert email fails', async () => {
    recordingClient({ jobs: { ref: 'J-1', client_name: 'Sam' } });
    mocks.ownerEmail.mockResolvedValue('owner@example.com');
    mocks.alertEmail.mockRejectedValue(new Error('Resend is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(submitJobFeedbackAction(TOKEN, form({ feedback: 'All good' }))).resolves.toEqual({ ok: true });

    expect(mocks.createJobFeedEvent).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('choosing a selection from the client board', () => {
  beforeEach(() => {
    mocks.chooseOption.mockResolvedValue({ ok: true, snapshot: { name: 'Accessible Beige', reference: 'SW7036' } });
  });

  it('refuses a link the resolver rejects', async () => {
    recordingClient({});
    mocks.resolveJobAccess.mockResolvedValue(null);

    const result = await chooseSelectionAction(TOKEN, 'selection-1', form({ optionId: 'option-1', byName: 'Sam' }));

    expect(result.ok).toBe(false);
    expect(mocks.chooseOption).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('records the choice against the resolved job, whatever the form claims', async () => {
    recordingClient({});

    await chooseSelectionAction(
      TOKEN,
      'selection-1',
      form({ optionId: 'option-1', byName: 'Sam', jobId: 'job-b', accountId: 'workspace-b' }),
    );

    expect(mocks.chooseOption).toHaveBeenCalledWith(
      expect.anything(),
      ACCESS.accountId,
      expect.objectContaining({ selectionId: 'selection-1', optionId: 'option-1', jobId: ACCESS.jobId }),
    );
  });

  it('needs an option before it will write', async () => {
    recordingClient({});

    const result = await chooseSelectionAction(TOKEN, 'selection-1', form({ byName: 'Sam' }));

    expect(result.ok).toBe(false);
    expect(mocks.chooseOption).not.toHaveBeenCalled();
  });

  it('does not announce a choice the writer refused', async () => {
    recordingClient({});
    mocks.chooseOption.mockResolvedValue({ ok: false, message: 'That option is no longer offered.' });

    const result = await chooseSelectionAction(TOKEN, 'selection-1', form({ optionId: 'option-1', byName: 'Sam' }));

    expect(result).toEqual({ ok: false, message: 'That option is no longer offered.' });
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('asking a question about a selection', () => {
  it('will not post onto a selection that belongs to another job', async () => {
    const queries = recordingClient({ job_selections: null });

    const result = await askAboutSelectionAction(TOKEN, 'selection-from-another-job', form({ question: 'Can I see it?' }));

    expect(result).toEqual({ ok: false, message: 'That choice is not on this job.' });
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();

    // The lookup that makes that answer possible: scoped by account AND job.
    const lookup = queries.find((query) => query.table === 'job_selections');
    expect(lookup?.filters).toMatchObject({
      account_id: ACCESS.accountId,
      id: 'selection-from-another-job',
      job_id: ACCESS.jobId,
    });
  });

  it('posts the question to the job feed where the customer can see it', async () => {
    recordingClient({ job_selections: { id: 'selection-1', title: 'Wall colour' } });

    const result = await askAboutSelectionAction(TOKEN, 'selection-1', form({ question: 'Can I see it in person?' }));

    expect(result).toEqual({ ok: true });
    expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
      expect.anything(),
      ACCESS.accountId,
      ACCESS.jobId,
      expect.objectContaining({ kind: 'selection_question', visibility: 'client' }),
    );
  });

  it('needs a question, and refuses a link the resolver rejects', async () => {
    recordingClient({ job_selections: { id: 'selection-1', title: 'Wall colour' } });
    await expect(askAboutSelectionAction(TOKEN, 'selection-1', form({ question: '  ' }))).resolves.toMatchObject({ ok: false });

    mocks.resolveJobAccess.mockResolvedValue(null);
    await expect(askAboutSelectionAction(TOKEN, 'selection-1', form({ question: 'Hello?' }))).resolves.toMatchObject({ ok: false });
    expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
  });
});

describe('answering a change order', () => {
  beforeEach(() => {
    mocks.respondAsClient.mockResolvedValue({ ok: true, decision: 'approved' });
  });

  it.each(['', 'pending', 'APPROVED', 'approved; drop table', 'cancelled'])(
    'refuses the decision %j before reading anything',
    async (decision) => {
      recordingClient({});

      const result = await respondToChangeOrderAction(TOKEN, 'change-order-1', form({ decision }));

      expect(result).toEqual({ ok: false, message: 'Choose approve or decline.' });
      expect(mocks.respondAsClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(['approved', 'declined'] as const)('passes %s through with the token, not a workspace id', async (decision) => {
    recordingClient({});

    const result = await respondToChangeOrderAction(TOKEN, 'change-order-1', form({ decision, signatureName: 'Sam' }));

    expect(result).toEqual({ ok: true });
    expect(mocks.respondAsClient).toHaveBeenCalledWith(TOKEN, 'change-order-1', expect.objectContaining({ decision }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
  });

  it('rate-limits before it reads the decision', async () => {
    recordingClient({});
    mocks.checkRateLimit.mockResolvedValue(false);

    const result = await respondToChangeOrderAction(TOKEN, 'change-order-1', form({ decision: 'approved' }));

    expect(result.ok).toBe(false);
    expect(mocks.respondAsClient).not.toHaveBeenCalled();
  });

  it('reports a refusal from the writer without revalidating', async () => {
    recordingClient({});
    mocks.respondAsClient.mockResolvedValue({ ok: false, message: 'That has already been answered.' });

    const result = await respondToChangeOrderAction(TOKEN, 'change-order-1', form({ decision: 'approved' }));

    expect(result).toEqual({ ok: false, message: 'That has already been answered.' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('signing a completion certificate from the customer portal', () => {
  it('refuses a link the resolver rejects, and signs nothing', async () => {
    recordingClient({});
    mocks.resolveJobAccess.mockResolvedValue(null);

    const result = await signClientFormAction(TOKEN, 'submission-1', { signaturePath: 'M0 0', signerName: 'Sam' });

    expect(result).toEqual({ success: false, error: 'Invalid or expired client access link.' });
    expect(mocks.signCustomerFormSubmission).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('reports a missing certificate rather than claiming a signature', async () => {
    recordingClient({});
    mocks.signCustomerFormSubmission.mockResolvedValue(null);

    const result = await signClientFormAction(TOKEN, 'submission-1', { signaturePath: 'M0 0', signerName: 'Sam' });

    expect(result).toEqual({ success: false, error: 'Certificate record not found.' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('logs the signature against the resolved job and refreshes both sides', async () => {
    const queries = recordingClient({});
    mocks.signCustomerFormSubmission.mockResolvedValue({ templateSnapshot: { title: 'Final walkthrough' } });

    const result = await signClientFormAction(TOKEN, 'submission-1', { signaturePath: 'M0 0', signerName: 'Sam' });

    expect(result).toEqual({ success: true });
    const feedInsert = queries.find((query) => query.table === 'job_feed');
    expect(feedInsert?.filters.__insert).toMatchObject({
      account_id: ACCESS.accountId,
      job_id: ACCESS.jobId,
      kind: 'form_signed_by_client',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/client/jobs/${TOKEN}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/jobs/${ACCESS.jobId}`);
  });
});
