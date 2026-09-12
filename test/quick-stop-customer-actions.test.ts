import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The customer's side of a Quick Stop, at /quick-stop/[id].
 *
 * There is no token and no session here: the unguessable request id is the
 * authorisation, and every action re-reads the request rather than trusting
 * anything about the state the page was rendered in. What each one then checks
 * is a state machine, and the states decide money — a cancellation refunds on a
 * tier, a verified no-show refunds in full, an approved diagnostic raises a
 * payment link.
 *
 * These tests hold the guards. A guard that lets the wrong state through does
 * not error; it refunds, or charges, and nobody finds out until the statement.
 */

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  redirect: vi.fn(),
  getQuickStopRequestById: vi.fn(),
  logQuickStopEvent: vi.fn(),
  resolveQuickStopCancellation: vi.fn(),
  updateJobSchedule: vi.fn(),
  createDepositRequest: vi.fn(),
  sendQuickStopStatusSms: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequestById: mocks.getQuickStopRequestById,
  logQuickStopEvent: mocks.logQuickStopEvent,
}));
vi.mock('@/lib/quick-stop-refunds', () => ({ resolveQuickStopCancellation: mocks.resolveQuickStopCancellation }));
vi.mock('@/lib/jobs', () => ({ updateJobSchedule: mocks.updateJobSchedule }));
vi.mock('@/lib/payments', () => ({ createDepositRequest: mocks.createDepositRequest }));
vi.mock('@/lib/sms', () => ({ sendQuickStopStatusSms: mocks.sendQuickStopStatusSms }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import {
  acceptRevisedWindowQuickStopAction,
  approveDiagnosticConversionAction,
  customerCancelQuickStopAction,
  declineDiagnosticConversionAction,
  declineRevisedWindowQuickStopAction,
  reportNoShowQuickStopAction,
} from '@/app/quick-stop/[id]/actions';

const REQUEST_ID = 'quick-stop-request-1';

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    account_id: 'workspace-a',
    job_id: 'job-a',
    status: 'confirmed',
    client_phone: '+15550000000',
    arrived_at: null,
    arrival_date: null,
    arrival_start: null,
    arrival_end: null,
    proposed_arrival_date: null,
    proposed_arrival_start: null,
    proposed_arrival_end: null,
    diagnostic_conversion: null,
    fee_cents: 9900,
    diagnostic_proposed_cents: null,
    ...overrides,
  };
}

/** Records the table writes an action performed. */
function recordingClient() {
  const writes: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const entry = { table, patch: {} as Record<string, unknown>, filters: {} as Record<string, unknown> };
    const query = {
      update: (patch: Record<string, unknown>) => {
        entry.patch = patch;
        writes.push(entry);
        return query;
      },
      eq: (column: string, value: unknown) => {
        entry.filters[column] = value;
        return Object.assign(Promise.resolve({ data: null, error: null }), query);
      },
    };
    return query;
  });
  return writes;
}

/** The path a redirect was sent to, from the error Next would have thrown. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('NEXT_REDIRECT:')) return message.slice('NEXT_REDIRECT:'.length);
    throw error;
  }
  throw new Error('Expected a redirect, and the action returned instead.');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  mocks.getQuickStopRequestById.mockResolvedValue(request());
  mocks.resolveQuickStopCancellation.mockResolvedValue(undefined);
  mocks.logQuickStopEvent.mockResolvedValue(undefined);
  mocks.updateJobSchedule.mockResolvedValue(undefined);
});

describe('an unknown request id', () => {
  it.each([
    ['cancel', () => customerCancelQuickStopAction(REQUEST_ID)],
    ['no-show', () => reportNoShowQuickStopAction(REQUEST_ID)],
    ['accept window', () => acceptRevisedWindowQuickStopAction(REQUEST_ID)],
    ['decline window', () => declineRevisedWindowQuickStopAction(REQUEST_ID)],
    ['approve diagnostic', () => approveDiagnosticConversionAction(REQUEST_ID)],
    ['decline diagnostic', () => declineDiagnosticConversionAction(REQUEST_ID)],
  ])('stops %s before any write', async (_label, run) => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(null);

    expect(await redirectedTo(run)).toBe(`/quick-stop/${REQUEST_ID}?error=notfound`);
    expect(writes).toEqual([]);
    expect(mocks.resolveQuickStopCancellation).not.toHaveBeenCalled();
    expect(mocks.createDepositRequest).not.toHaveBeenCalled();
  });
});

describe('the customer cancelling', () => {
  it.each(['awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'])(
    'refunds on the tier policy from %s',
    async (status) => {
      recordingClient();
      mocks.getQuickStopRequestById.mockResolvedValue(request({ status }));

      expect(await redirectedTo(() => customerCancelQuickStopAction(REQUEST_ID))).toBe(
        `/quick-stop/${REQUEST_ID}?done=canceled`,
      );
      expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
        expect.anything(),
        'workspace-a',
        REQUEST_ID,
        expect.objectContaining({ kind: 'customer_cancel' }),
      );
    },
  );

  it.each(['completed', 'canceled', 'refunded', 'declined', 'draft'])(
    'refuses to cancel a visit already in %s, and refunds nothing',
    async (status) => {
      recordingClient();
      mocks.getQuickStopRequestById.mockResolvedValue(request({ status }));

      expect(await redirectedTo(() => customerCancelQuickStopAction(REQUEST_ID))).toBe(
        `/quick-stop/${REQUEST_ID}?error=state`,
      );
      expect(mocks.resolveQuickStopCancellation).not.toHaveBeenCalled();
    },
  );

  it('cancels against the account on the request, never one supplied by the caller', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ account_id: 'workspace-owning-this-request' }));

    await redirectedTo(() => customerCancelQuickStopAction(REQUEST_ID));

    expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
      expect.anything(),
      'workspace-owning-this-request',
      REQUEST_ID,
      expect.anything(),
    );
  });
});

describe('the customer reporting a no-show', () => {
  const within = () => {
    const now = new Date(Date.now() - 30 * 60 * 1000);
    return {
      arrival_date: now.toISOString().slice(0, 10),
      arrival_end: now.toISOString().slice(11, 19),
    };
  };

  it('refunds in full when the tech never arrived and the report is inside the grace window', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...within(), status: 'en_route' }));

    expect(await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=no_show`,
    );
    expect(mocks.resolveQuickStopCancellation).toHaveBeenCalledWith(
      expect.anything(),
      'workspace-a',
      REQUEST_ID,
      expect.objectContaining({ kind: 'no_show' }),
    );
  });

  it('stamps the report time on the request before resolving the refund', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...within(), status: 'confirmed' }));

    await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID));

    const stamp = writes.find((write) => write.table === 'extra_stop_requests');
    expect(stamp?.patch.no_show_reported_at).toEqual(expect.any(String));
    expect(stamp?.filters).toMatchObject({ id: REQUEST_ID });
  });

  it('refuses a no-show once the tech has marked arrived', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ ...within(), status: 'confirmed', arrived_at: new Date().toISOString() }),
    );

    expect(await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=state`,
    );
    expect(mocks.resolveQuickStopCancellation).not.toHaveBeenCalled();
  });

  it.each(['arrived', 'completed', 'canceled'])('refuses a no-show from %s', async (status) => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...within(), status }));

    expect(await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=state`,
    );
    expect(mocks.resolveQuickStopCancellation).not.toHaveBeenCalled();
  });

  it('refuses a no-show reported more than two hours after the window closed', async () => {
    recordingClient();
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({
        status: 'confirmed',
        arrival_date: stale.toISOString().slice(0, 10),
        arrival_end: stale.toISOString().slice(11, 19),
      }),
    );

    expect(await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=late`,
    );
    expect(mocks.resolveQuickStopCancellation).not.toHaveBeenCalled();
  });

  it('allows the report when the request carries no window to be late against', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ status: 'confirmed', arrival_date: null, arrival_end: null }));

    expect(await redirectedTo(() => reportNoShowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=no_show`,
    );
  });
});

describe('the customer answering a revised arrival window', () => {
  const proposed = {
    proposed_arrival_date: '2026-10-01',
    proposed_arrival_start: '09:00:00',
    proposed_arrival_end: '11:00:00',
  };

  it('moves the live window and reschedules the job when accepted', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...proposed, status: 'confirmed' }));

    expect(await redirectedTo(() => acceptRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=window_accepted`,
    );

    const write = writes.find((entry) => entry.table === 'extra_stop_requests');
    expect(write?.patch).toMatchObject({
      arrival_date: '2026-10-01',
      arrival_start: '09:00:00',
      arrival_end: '11:00:00',
      proposed_arrival_date: null,
      proposed_window_at: null,
    });
    expect(mocks.updateJobSchedule).toHaveBeenCalledWith(expect.anything(), 'workspace-a', 'job-a', '2026-10-01', '09:00:00');
  });

  it('refuses to accept a window that was never proposed', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ status: 'confirmed' }));

    expect(await redirectedTo(() => acceptRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=state`,
    );
    expect(writes).toEqual([]);
    expect(mocks.updateJobSchedule).not.toHaveBeenCalled();
  });

  it.each(['arrived', 'completed', 'canceled'])('refuses to accept a revised window from %s', async (status) => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...proposed, status }));

    expect(await redirectedTo(() => acceptRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=state`,
    );
    expect(writes).toEqual([]);
  });

  it('still accepts the window when rescheduling the job throws', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ ...proposed, status: 'confirmed' }));
    mocks.updateJobSchedule.mockRejectedValue(new Error('Calendar unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await redirectedTo(() => acceptRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=window_accepted`,
    );
    consoleError.mockRestore();
  });

  it('clears the proposal and leaves the original window when declined', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ ...proposed, status: 'confirmed', arrival_date: '2026-09-20' }),
    );

    expect(await redirectedTo(() => declineRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=window_declined`,
    );

    const write = writes.find((entry) => entry.table === 'extra_stop_requests');
    expect(write?.patch).toMatchObject({ proposed_arrival_date: null, proposed_window_at: null });
    expect(write?.patch).not.toHaveProperty('arrival_date');
  });

  it('refuses to decline a window that was never proposed', async () => {
    const writes = recordingClient();

    expect(await redirectedTo(() => declineRevisedWindowQuickStopAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?error=state`,
    );
    expect(writes).toEqual([]);
  });
});

describe('the customer answering a diagnostic conversion', () => {
  it('charges only the amount above the Quick Stop fee already paid', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ diagnostic_conversion: 'proposed', fee_cents: 9900, diagnostic_proposed_cents: 24900 }),
    );
    mocks.createDepositRequest.mockResolvedValue({ id: 'payment-1' });
    mocks.sendQuickStopStatusSms.mockResolvedValue(undefined);

    expect(await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=diag_approved`,
    );

    expect(mocks.createDepositRequest).toHaveBeenCalledWith(
      expect.anything(),
      'workspace-a',
      'job-a',
      expect.objectContaining({ amount: 150, kind: 'deposit' }),
    );
    expect(mocks.sendQuickStopStatusSms).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `quick-stop:${REQUEST_ID}:diagnostic-approved:payment-1` }),
    );
  });

  it('raises no payment when the diagnostic costs no more than the fee already paid', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ diagnostic_conversion: 'proposed', fee_cents: 9900, diagnostic_proposed_cents: 9900 }),
    );

    await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID));

    expect(mocks.createDepositRequest).not.toHaveBeenCalled();
    expect(mocks.sendQuickStopStatusSms).not.toHaveBeenCalled();
  });

  it('never charges a negative amount when the proposal is below the fee', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ diagnostic_conversion: 'proposed', fee_cents: 9900, diagnostic_proposed_cents: 4900 }),
    );

    await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID));

    expect(mocks.createDepositRequest).not.toHaveBeenCalled();
  });

  it.each([null, 'approved', 'declined'])(
    'refuses to approve a conversion in state %j, and charges nothing',
    async (state) => {
      const writes = recordingClient();
      mocks.getQuickStopRequestById.mockResolvedValue(request({ diagnostic_conversion: state }));

      expect(await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID))).toBe(
        `/quick-stop/${REQUEST_ID}?error=state`,
      );
      expect(writes).toEqual([]);
      expect(mocks.createDepositRequest).not.toHaveBeenCalled();
    },
  );

  it('narrows its own update to the proposed state, so two clicks cannot both take effect', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ diagnostic_conversion: 'proposed', diagnostic_proposed_cents: 9900 }),
    );

    await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID));

    const write = writes.find((entry) => entry.table === 'extra_stop_requests');
    expect(write?.filters).toMatchObject({ id: REQUEST_ID, diagnostic_conversion: 'proposed' });
  });

  it('records a decline without raising any charge', async () => {
    const writes = recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(request({ diagnostic_conversion: 'proposed' }));

    expect(await redirectedTo(() => declineDiagnosticConversionAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=diag_declined`,
    );

    const write = writes.find((entry) => entry.table === 'extra_stop_requests');
    expect(write?.patch).toMatchObject({ diagnostic_conversion: 'declined' });
    expect(write?.filters).toMatchObject({ diagnostic_conversion: 'proposed' });
    expect(mocks.createDepositRequest).not.toHaveBeenCalled();
  });

  it('still records the approval when the payment link cannot be created', async () => {
    recordingClient();
    mocks.getQuickStopRequestById.mockResolvedValue(
      request({ diagnostic_conversion: 'proposed', fee_cents: 0, diagnostic_proposed_cents: 24900 }),
    );
    mocks.createDepositRequest.mockRejectedValue(new Error('Stripe is down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await redirectedTo(() => approveDiagnosticConversionAction(REQUEST_ID))).toBe(
      `/quick-stop/${REQUEST_ID}?done=diag_approved`,
    );
    expect(mocks.sendQuickStopStatusSms).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
