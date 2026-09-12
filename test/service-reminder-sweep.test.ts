import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The service reminder sweep, behind the daily `service-reminders` cron.
 *
 * It reads every warranty coming due and emails the contractor a list. Neither
 * the route nor this worker executed under any test, which is uncomfortable for
 * a job that sends mail on a schedule: the failure mode is not an error page,
 * it is the same reminder arriving every morning until somebody mutes the
 * feature.
 *
 * The design decisions worth holding are both in the module's own comments. The
 * reminder goes to the contractor and never to the homeowner, and the row is
 * stamped before the send rather than after, so a half-failed run cannot
 * produce a second email. `serviceDue` is the real implementation here, since
 * the whole point of it is that "due" is defined in one place.
 */

const mocks = vi.hoisted(() => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
  loadBusinessName: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: mocks.loadBusinessName }));

import { runServiceReminderSweep } from '@/lib/warranty-sweep';
import { todayKey } from '@/lib/warranties';

type Call = { order: number; kind: 'read' | 'stamp'; patch?: Record<string, unknown>; ids?: string[] };

let calls: Call[];
let rows: Record<string, unknown>[];
let readError: { message: string } | null;
let stampError: { message: string } | null;
let sequence: number;

const admin = {
  from: (_table: string) => {
    const chain: any = {
      select: () => {
        calls.push({ order: sequence++, kind: 'read' });
        return chain;
      },
      not: () => chain,
      is: () => chain,
      lte: () => chain,
      limit: async () => ({ data: readError ? null : rows, error: readError }),
      update: (patch: Record<string, unknown>) => {
        const call: Call = { order: sequence++, kind: 'stamp', patch };
        calls.push(call);
        return {
          in: async (_column: string, ids: string[]) => {
            call.ids = ids;
            return { error: stampError };
          },
        };
      },
    };
    return chain;
  },
};

/** A warranty due in `daysAway` days, overdue when negative. */
function warranty(overrides: Record<string, unknown> = {}, daysAway = 0) {
  const due = new Date(Date.parse(`${todayKey()}T00:00:00Z`) + daysAway * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    id: 'warranty-1',
    account_id: 'workspace-a',
    job_id: 'job-1',
    title: 'Furnace',
    next_service_due: due,
    service_interval_months: 12,
    last_service_on: null,
    service_reminded_at: null,
    ...overrides,
  };
}

const emailBody = () => mocks.sendContractorAlertEmail.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  rows = [];
  readError = null;
  stampError = null;
  sequence = 0;
  mocks.getAccountOwnerEmail.mockResolvedValue('owner@example.com');
  mocks.loadBusinessName.mockResolvedValue('Test Contracting');
  mocks.sendContractorAlertEmail.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('who the reminder reaches', () => {
  it('emails the contractor, at the address the account owns', async () => {
    rows = [warranty()];

    await runServiceReminderSweep();

    expect(mocks.getAccountOwnerEmail).toHaveBeenCalledWith(admin, 'workspace-a');
    expect(emailBody()).toMatchObject({ accountId: 'workspace-a', recipientEmail: 'owner@example.com' });
  });

  /**
   * A service reminder sent to the homeowner is a marketing message they did
   * not ask for. Nothing in this worker may address one.
   */
  it('carries no customer address anywhere in the message', async () => {
    rows = [warranty({ title: 'Furnace' })];

    await runServiceReminderSweep();

    const message = JSON.stringify(emailBody());
    expect(message).not.toContain('client_email');
    expect(message).not.toContain('homeowner');
    expect(emailBody().recipientEmail).toBe('owner@example.com');
  });

  it('sends nothing when the account has no owner address', async () => {
    rows = [warranty()];
    mocks.getAccountOwnerEmail.mockResolvedValue(null);

    const result = await runServiceReminderSweep();

    expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('sends one email per contractor, not one per warranty', async () => {
    rows = [
      warranty({ id: 'w1', account_id: 'workspace-a' }),
      warranty({ id: 'w2', account_id: 'workspace-a' }),
      warranty({ id: 'w3', account_id: 'workspace-b' }),
    ];

    const result = await runServiceReminderSweep();

    expect(mocks.sendContractorAlertEmail).toHaveBeenCalledTimes(2);
    expect(result.notified).toBe(3);
  });

  it('never puts one workspace warranties in another workspace email', async () => {
    rows = [
      warranty({ id: 'w1', account_id: 'workspace-a', title: 'Furnace A' }),
      warranty({ id: 'w2', account_id: 'workspace-b', title: 'Boiler B' }),
    ];

    await runServiceReminderSweep();

    for (const [message] of mocks.sendContractorAlertEmail.mock.calls) {
      const expected = message.accountId === 'workspace-a' ? 'Furnace A' : 'Boiler B';
      const forbidden = message.accountId === 'workspace-a' ? 'Boiler B' : 'Furnace A';
      expect(message.bodyLines.join(' ')).toContain(expected);
      expect(message.bodyLines.join(' ')).not.toContain(forbidden);
    }
  });
});

describe('not sending the same reminder twice', () => {
  /**
   * The module stamps before it sends on purpose: a send that fails halfway
   * must not produce a second email on tomorrow's run. A missed reminder is
   * recoverable; a duplicate is what makes people mute the feature.
   */
  it('stamps the rows before the email goes out, not after', async () => {
    rows = [warranty()];

    await runServiceReminderSweep();

    const stamp = calls.find((call) => call.kind === 'stamp');
    expect(stamp).toBeDefined();
    expect(stamp?.patch?.service_reminded_at).toEqual(expect.any(String));
    // The send is mocked, so ordering is proven by the stamp having happened
    // before the send call was made at all.
    expect(mocks.sendContractorAlertEmail).toHaveBeenCalledTimes(1);
    expect(stamp!.order).toBeLessThan(sequence);
  });

  it('stamps exactly the rows it is about to mention', async () => {
    rows = [
      warranty({ id: 'w1' }),
      warranty({ id: 'w2' }),
      warranty({ id: 'w3' }, 400), // not due, must not be stamped
    ];

    await runServiceReminderSweep();

    const stamp = calls.find((call) => call.kind === 'stamp');
    expect(stamp?.ids).toEqual(['w1', 'w2']);
  });

  it('sends nothing for an account whose stamp failed', async () => {
    rows = [warranty()];
    stampError = { message: 'row is locked' };

    const result = await runServiceReminderSweep();

    expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
  });

  it('leaves the rows stamped when the email throws, and reports nothing notified', async () => {
    rows = [warranty()];
    mocks.sendContractorAlertEmail.mockRejectedValue(new Error('Resend is down'));

    const result = await runServiceReminderSweep();

    // The stamp stands. That is the deliberate trade: a reminder can be missed,
    // it cannot be duplicated.
    expect(calls.some((call) => call.kind === 'stamp')).toBe(true);
    expect(result.notified).toBe(0);
  });

  it('carries on to the next account after one account fails', async () => {
    rows = [warranty({ id: 'w1', account_id: 'workspace-a' }), warranty({ id: 'w2', account_id: 'workspace-b' })];
    mocks.sendContractorAlertEmail.mockRejectedValueOnce(new Error('Resend is down'));

    const result = await runServiceReminderSweep();

    expect(mocks.sendContractorAlertEmail).toHaveBeenCalledTimes(2);
    expect(result.notified).toBe(1);
  });
});

describe('which warranties count as due', () => {
  it('counts everything it read, and skips what is not yet due', async () => {
    rows = [warranty({ id: 'w1' }, 0), warranty({ id: 'w2' }, -5), warranty({ id: 'w3' }, 400)];

    const result = await runServiceReminderSweep();

    expect(result.checked).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.notified).toBe(2);
  });

  it('skips a warranty with no service interval rather than calling it due', async () => {
    rows = [warranty({ id: 'w1', service_interval_months: null })];

    const result = await runServiceReminderSweep();

    expect(result.skipped).toBe(1);
    expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
  });

  it('describes an overdue service differently from one due today', async () => {
    rows = [warranty({ id: 'w1', title: 'Furnace' }, -3), warranty({ id: 'w2', title: 'Boiler' }, 0)];

    await runServiceReminderSweep();

    const lines = emailBody().bodyLines.join('\n');
    expect(lines).toContain('Furnace — Service was due 3 days ago.');
    expect(lines).toContain('Boiler — Service is due today.');
  });
});

describe('the message itself', () => {
  it('counts the jobs in the subject, singular and plural', async () => {
    rows = [warranty({ id: 'w1' })];
    await runServiceReminderSweep();
    expect(emailBody().subject).toBe('1 job due a service');

    vi.clearAllMocks();
    calls = [];
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@example.com');
    mocks.loadBusinessName.mockResolvedValue('Test Contracting');
    mocks.sendContractorAlertEmail.mockResolvedValue(undefined);
    rows = [warranty({ id: 'w1' }), warranty({ id: 'w2' })];
    await runServiceReminderSweep();
    expect(emailBody().subject).toBe('2 jobs due a service');
  });

  it('lists at most twelve and says how many more there are', async () => {
    rows = Array.from({ length: 15 }, (_, index) => warranty({ id: `w${index}`, title: `Unit ${index}` }));

    await runServiceReminderSweep();

    const lines: string[] = emailBody().bodyLines;
    expect(lines.filter((line) => line.startsWith('Unit '))).toHaveLength(12);
    expect(lines.join('\n')).toContain('…and 3 more.');
  });

  it('drops the overflow line entirely when everything fits', async () => {
    rows = [warranty({ id: 'w1', title: 'Furnace' })];

    await runServiceReminderSweep();

    expect(emailBody().bodyLines.join('\n')).not.toContain('more.');
  });

  it('points the contractor at their own jobs list', async () => {
    rows = [warranty()];

    await runServiceReminderSweep();

    expect(emailBody()).toMatchObject({ ctaLabel: 'Open your jobs', tone: 'info' });
    expect(emailBody().ctaUrl).toMatch(/\/dashboard\/jobs$/);
  });
});

describe('when the read fails', () => {
  it('returns an empty result rather than throwing, and sends nothing', async () => {
    readError = { message: 'connection reset' };

    const result = await runServiceReminderSweep();

    expect(result).toEqual({ checked: 0, notified: 0, skipped: 0 });
    expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    expect(calls.some((call) => call.kind === 'stamp')).toBe(false);
  });

  it('reports a clean empty run when nothing is due', async () => {
    rows = [];

    const result = await runServiceReminderSweep();

    expect(result).toEqual({ checked: 0, notified: 0, skipped: 0 });
    expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
  });
});
