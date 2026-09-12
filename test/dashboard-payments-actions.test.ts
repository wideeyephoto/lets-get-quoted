import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * src/app/dashboard/payments/actions.ts — 29 server actions over 973 lines, and
 * the single largest block of never-executed logic the untested-code audit
 * found. Refunds, instant pay links, payment-plan schedules, promise-to-pay,
 * dispute evidence, lien waivers, NOI notices and the whole Stripe Terminal
 * flow, none of it run by a test.
 *
 * The audit's advice was to split the module before testing it. That is the
 * wrong order for money code: the split needs a net under it, and this is the
 * net. Two things are held here.
 *
 * First, the capability each action demands, and the fact that a denial travels
 * rather than being reported as a payment failure — every one of these catches
 * every error, and a guard denies by throwing `redirect()`.
 *
 * Second, the money behaviour: what is written, what it is scoped to, and what
 * is refused before anything is written at all.
 */

const mocks = vi.hoisted(() => ({
  requireOfficeContext: vi.fn(),
  refundPayment: vi.fn(),
  markInvoicePaidForPayment: vi.fn(),
  sendPaymentSmsEvent: vi.fn(),
  sendLienWaiverSms: vi.fn(),
  queueAccountSms: vi.fn(),
  sendCardUpdateSms: vi.fn(),
  loadBusinessName: vi.fn(),
  createJobFeedEvent: vi.fn(),
  assembleDisputeEvidence: vi.fn(),
  revalidatePath: vi.fn(),
  terminal: {
    createTerminalConnectionToken: vi.fn(),
    listTerminalReaders: vi.fn(),
    registerTerminalReader: vi.fn(),
    createTerminalPaymentIntent: vi.fn(),
    simulateTerminalCardTap: vi.fn(),
    cancelTerminalReaderAction: vi.fn(),
    confirmTerminalPayment: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/payments', () => ({ refundPayment: mocks.refundPayment }));
vi.mock('@/lib/invoices', () => ({ markInvoicePaidForPayment: mocks.markInvoicePaidForPayment }));
vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
  sendLienWaiverSms: mocks.sendLienWaiverSms,
  queueAccountSms: mocks.queueAccountSms,
  sendCardUpdateSms: mocks.sendCardUpdateSms,
}));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: mocks.loadBusinessName }));
vi.mock('@/lib/job-feed', () => ({ createJobFeedEvent: mocks.createJobFeedEvent }));
vi.mock('@/lib/dispute-evidence', () => ({ assembleDisputeEvidence: mocks.assembleDisputeEvidence }));
vi.mock('@/lib/stripe-terminal', () => mocks.terminal);
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({
  // The real one rethrows anything Next threw for control flow and returns for
  // everything else. A denial has to keep travelling.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT')) throw error;
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

import * as actions from '@/app/dashboard/payments/actions';

const ACCOUNT_ID = 'workspace-a';

type Insert = { table: string; row: Record<string, unknown> };
let inserts: Insert[];
let selects: { table: string; filters: [string, unknown][] }[];
let insertError: { message: string } | null;
let insertedId: string;

function officeContext() {
  inserts = [];
  selects = [];
  const supabase = {
    from: (table: string) => {
      const chain: any = {
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return chain;
        },
        select: () => {
          selects.push({ table, filters: [] });
          return chain;
        },
        update: () => chain,
        upsert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return chain;
        },
        eq: (column: string, value: unknown) => {
          const current = selects[selects.length - 1];
          if (current) current.filters.push([column, value]);
          return chain;
        },
        in: () => chain,
        is: () => chain,
        lte: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => (insertError ? { data: null, error: insertError } : { data: { id: insertedId }, error: null }),
        maybeSingle: async () => (insertError ? { data: null, error: insertError } : { data: { id: insertedId }, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: insertError }).then(resolve),
      };
      return chain;
    },
  };
  mocks.requireOfficeContext.mockResolvedValue({ supabase, accountId: ACCOUNT_ID, accountTimeZone: 'America/Detroit' });
  return supabase;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertError = null;
  insertedId = 'payment-new';
  officeContext();
  mocks.refundPayment.mockResolvedValue({ isFull: true, amount: 250 });
  mocks.markInvoicePaidForPayment.mockResolvedValue(undefined);
  mocks.loadBusinessName.mockResolvedValue('Test Contracting');
  mocks.sendPaymentSmsEvent.mockResolvedValue(undefined);
  mocks.assembleDisputeEvidence.mockResolvedValue({ paymentId: 'payment-1' });
  for (const fn of Object.values(mocks.terminal)) fn.mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/**
 * Every action in this module wraps its whole body in `try { } catch { }` and
 * turns the error into `{ success: false }`. That is the right shape for a real
 * failure and the wrong one for a permission denial: the guards deny by throwing
 * `redirect()`, so without `unstable_rethrow` the denial is swallowed, the
 * navigation is lost, and the user is told their payment failed instead of being
 * sent where they belong. 28 of the 29 were missing it.
 */
describe('a permission denial travels, on every action', () => {
  const everyAction: [string, () => Promise<unknown>][] = [
    ['recordManualPaymentAction', () => actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '100' }))],
    ['recordBatchInvoiceSettlementAction', () => actions.recordBatchInvoiceSettlementAction('job-1', 'Check', [{ invoiceId: 'inv-1', amount: 10 }])],
    ['sendPaymentReminderAction', () => actions.sendPaymentReminderAction(form({ paymentId: 'payment-1' }))],
    ['sendPaymentReceiptSmsAction', () => actions.sendPaymentReceiptSmsAction('payment-1')],
    ['batchSendOverdueRemindersAction', () => actions.batchSendOverdueRemindersAction()],
    ['issueRefundAction', () => actions.issueRefundAction(form({ paymentId: 'payment-1', amount: '50' }))],
    ['createInstantPayLinkAction', () => actions.createInstantPayLinkAction(form({ jobId: 'job-1', amount: '100' }))],
    ['assembleDisputeEvidenceAction', () => actions.assembleDisputeEvidenceAction('payment-1')],
    ['getClientStatementDataAction', () => actions.getClientStatementDataAction('Sam Rivera')],
    ['recordPromiseToPayAction', () => actions.recordPromiseToPayAction(form({ paymentId: 'payment-1', promisedDate: '2026-10-01' }))],
    ['sendCustomPaymentReminderAction', () => actions.sendCustomPaymentReminderAction(form({ paymentId: 'payment-1', message: 'hello' }))],
    ['saveDunningRulesAction', () => actions.saveDunningRulesAction(form({}))],
    ['generateAccountingJournalCsvAction', () => actions.generateAccountingJournalCsvAction('qbo')],
    ['sendLienWaiverSmsAction', () => actions.sendLienWaiverSmsAction({ waiverId: 'waiver-1', phone: '+15550000000', customerName: 'Sam', jobRef: 'J-1', waiverTypeTitle: 'Final' })],
    ['sendNoiNoticeSmsAction', () => actions.sendNoiNoticeSmsAction(form({ jobId: 'job-1' }))],
    ['sendCardUpdateReminderAction', () => actions.sendCardUpdateReminderAction(form({ paymentId: 'payment-1' }))],
    ['getTerminalConnectionTokenAction', () => actions.getTerminalConnectionTokenAction()],
    ['listTerminalReadersAction', () => actions.listTerminalReadersAction()],
    ['createTerminalPaymentIntentAction', () => actions.createTerminalPaymentIntentAction({ jobId: 'job-1', amount: 100 })],
    ['simulateTerminalTapAction', () => actions.simulateTerminalTapAction('reader-1')],
    ['cancelTerminalAction', () => actions.cancelTerminalAction({ readerId: 'reader-1' })],
    ['confirmTerminalPaymentAction', () => actions.confirmTerminalPaymentAction('payment-1', 'pi_test')],
  ];

  it.each(everyAction)('%s rethrows the redirect rather than reporting a failure', async (_name, run) => {
    mocks.requireOfficeContext.mockRejectedValue(new Error('NEXT_REDIRECT:/dashboard'));

    await expect(run()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('still turns a real error into a reported failure', async () => {
    mocks.requireOfficeContext.mockRejectedValue(new Error('database is down'));

    await expect(actions.issueRefundAction(form({ paymentId: 'payment-1' }))).resolves.toMatchObject({
      success: false,
      error: 'database is down',
    });
  });

  it('asks for exactly one capability per action, and the right one', async () => {
    const expected: [string, () => Promise<unknown>, string][] = [
      ['record a manual payment', () => actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '5' })), 'payments.collect'],
      ['create a pay link', () => actions.createInstantPayLinkAction(form({ jobId: 'job-1', amount: '5' })), 'payments.collect'],
      ['issue a refund', () => actions.issueRefundAction(form({ paymentId: 'payment-1' })), 'payments.refund'],
      ['send a reminder', () => actions.sendPaymentReminderAction(form({ paymentId: 'payment-1' })), 'messages.send'],
    ];

    for (const [, run, capability] of expected) {
      mocks.requireOfficeContext.mockClear();
      officeContext();
      await run();
      expect(mocks.requireOfficeContext).toHaveBeenCalledWith(capability);
    }
  });

  /**
   * Refunding is a separate capability from collecting. Someone who can take a
   * payment must not be able to send money back by virtue of that alone.
   */
  it('does not let the collect capability stand in for the refund capability', async () => {
    await actions.issueRefundAction(form({ paymentId: 'payment-1', amount: '50' }));

    expect(mocks.requireOfficeContext).toHaveBeenCalledWith('payments.refund');
    expect(mocks.requireOfficeContext).not.toHaveBeenCalledWith('payments.collect');
  });
});

describe('recording a manual payment', () => {
  it.each([
    ['no job', { amount: '100' }, 'Select a job.'],
    ['a zero amount', { jobId: 'job-1', amount: '0' }, 'Enter a valid amount greater than $0.'],
    ['a negative amount', { jobId: 'job-1', amount: '-40' }, 'Enter a valid amount greater than $0.'],
    ['an unparseable amount', { jobId: 'job-1', amount: 'lots' }, 'Enter a valid amount greater than $0.'],
    ['no amount at all', { jobId: 'job-1' }, 'Enter a valid amount greater than $0.'],
  ])('refuses %s before writing anything', async (_label, fields, error) => {
    const result = await actions.recordManualPaymentAction(form(fields));

    expect(result).toEqual({ success: false, error });
    expect(inserts).toEqual([]);
  });

  it('writes the payment against the resolved workspace, paid, on the manual rail', async () => {
    const result = await actions.recordManualPaymentAction(
      form({ jobId: 'job-1', amount: '250.50', method: 'Check', label: 'Final', kind: 'final' }),
    );

    expect(result.success).toBe(true);
    const [insert] = inserts;
    expect(insert.table).toBe('payments');
    expect(insert.row).toMatchObject({
      account_id: ACCOUNT_ID,
      job_id: 'job-1',
      amount: 250.5,
      status: 'paid',
      // Not the destination or direct Stripe rails: nothing settles this and no
      // platform fee is owed on money that never touched Stripe.
      charge_model: 'manual',
      platform_fee: 0,
      fee_rate: 0,
      refunded_amount: 0,
    });
  });

  it('cannot be pointed at another workspace through the form', async () => {
    await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10', accountId: 'workspace-b' }));

    expect(inserts[0].row.account_id).toBe(ACCOUNT_ID);
  });

  it('records the method and note in the label, so the cash trail is readable', async () => {
    await actions.recordManualPaymentAction(
      form({ jobId: 'job-1', amount: '10', method: 'Zelle', label: 'Deposit', note: 'ref 8891' }),
    );

    expect(inserts[0].row.label).toBe('Deposit (Zelle - ref 8891)');
  });

  it('leaves the note out of the label when there is none', async () => {
    await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10', method: 'Cash', label: 'Deposit' }));

    expect(inserts[0].row.label).toBe('Deposit (Cash)');
  });

  it('marks a linked invoice paid, and does not link one that was not given', async () => {
    await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10', invoiceId: 'invoice-1' }));
    expect(mocks.markInvoicePaidForPayment).toHaveBeenCalledWith(expect.anything(), 'invoice-1');

    mocks.markInvoicePaidForPayment.mockClear();
    officeContext();
    await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10' }));
    expect(mocks.markInvoicePaidForPayment).not.toHaveBeenCalled();
    expect(inserts[0].row.invoice_id).toBeNull();
  });

  it('still reports the payment when marking the invoice fails', async () => {
    mocks.markInvoicePaidForPayment.mockRejectedValue(new Error('invoice is locked'));

    const result = await actions.recordManualPaymentAction(
      form({ jobId: 'job-1', amount: '10', invoiceId: 'invoice-1' }),
    );

    // The money arrived. An unmarked invoice is visible and fixable; a lost
    // payment record is not.
    expect(result.success).toBe(true);
  });

  it('reports a failed insert rather than claiming the money was recorded', async () => {
    insertError = { message: 'duplicate key' };

    const result = await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10' }));

    expect(result).toMatchObject({ success: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('refreshes the payments, cash-flow and job views on success', async () => {
    await actions.recordManualPaymentAction(form({ jobId: 'job-1', amount: '10' }));

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/payments');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/cash-flow');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/jobs/job-1');
  });
});

describe('issuing a refund', () => {
  it.each([
    ['no payment id', { amount: '50' }, 'Payment ID is required.'],
    ['a zero amount', { paymentId: 'payment-1', amount: '0' }, 'Enter a valid refund amount.'],
    ['a negative amount', { paymentId: 'payment-1', amount: '-5' }, 'Enter a valid refund amount.'],
    ['an unparseable amount', { paymentId: 'payment-1', amount: 'some' }, 'Enter a valid refund amount.'],
  ])('refuses %s without calling the refund rail', async (_label, fields, error) => {
    const result = await actions.issueRefundAction(form(fields));

    expect(result).toEqual({ success: false, error });
    expect(mocks.refundPayment).not.toHaveBeenCalled();
  });

  it('treats an absent amount as a full refund rather than zero', async () => {
    await actions.issueRefundAction(form({ paymentId: 'payment-1' }));

    // undefined, not 0: the rail reads undefined as "the whole thing".
    expect(mocks.refundPayment).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 'payment-1', undefined);
  });

  it('refunds through the resolved workspace, never one from the form', async () => {
    await actions.issueRefundAction(form({ paymentId: 'payment-1', amount: '50', accountId: 'workspace-b' }));

    expect(mocks.refundPayment).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 'payment-1', 50);
  });

  it('reports what was actually refunded, not what was asked for', async () => {
    mocks.refundPayment.mockResolvedValue({ isFull: false, amount: 25 });

    const result = await actions.issueRefundAction(form({ paymentId: 'payment-1', amount: '50' }));

    expect(result.success).toBe(true);
    expect(result.message).toContain('partial');
    expect(result.message).toContain('25.00');
  });

  it('reports a refusal from the refund rail without refreshing', async () => {
    mocks.refundPayment.mockRejectedValue(new Error('Charge is already fully refunded.'));

    const result = await actions.issueRefundAction(form({ paymentId: 'payment-1' }));

    expect(result).toEqual({ success: false, error: 'Charge is already fully refunded.' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('creating an instant pay link', () => {
  it.each([
    ['no job', { amount: '100' }, 'Select a job.'],
    ['a zero amount', { jobId: 'job-1', amount: '0' }, 'Enter a valid amount greater than $0.'],
    ['an unparseable amount', { jobId: 'job-1', amount: 'free' }, 'Enter a valid amount greater than $0.'],
  ])('refuses %s before writing anything', async (_label, fields, error) => {
    const result = await actions.createInstantPayLinkAction(form(fields));

    expect(result).toEqual({ success: false, error });
    expect(inserts).toEqual([]);
  });

  it('writes the request against the resolved workspace and hands back its own link', async () => {
    insertedId = 'payment-xyz';

    const result = await actions.createInstantPayLinkAction(form({ jobId: 'job-1', amount: '500' }));

    expect(result.success).toBe(true);
    expect(inserts[0].row).toMatchObject({ account_id: ACCOUNT_ID, job_id: 'job-1', amount: 500 });
    expect(result.data?.paymentId).toBe('payment-xyz');
    expect(result.data?.payUrl).toMatch(/\/pay\/payment-xyz$/);
  });

  it('texts the customer only when asked to', async () => {
    await actions.createInstantPayLinkAction(form({ jobId: 'job-1', amount: '10', phone: '+15550000000' }));
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();

    officeContext();
    await actions.createInstantPayLinkAction(
      form({ jobId: 'job-1', amount: '10', phone: '+15550000000', sendSms: '1' }),
    );
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalled();
  });

  it('reports a failed insert rather than handing back a link to nothing', async () => {
    insertError = { message: 'constraint violation' };

    const result = await actions.createInstantPayLinkAction(form({ jobId: 'job-1', amount: '10' }));

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });
});

describe('settling several invoices from one lump sum', () => {
  it('refuses an empty allocation list', async () => {
    const result = await actions.recordBatchInvoiceSettlementAction('job-1', 'Check', []);

    expect(result).toEqual({ success: false, error: 'No invoices selected for settlement.' });
    expect(inserts).toEqual([]);
  });

  it('writes one manual payment per allocation, scoped to the workspace', async () => {
    const result = await actions.recordBatchInvoiceSettlementAction('job-1', 'Wire', [
      { invoiceId: 'inv-1', amount: 100, ref: 'A' },
      { invoiceId: 'inv-2', amount: 250, ref: 'B' },
    ]);

    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.row).toMatchObject({ account_id: ACCOUNT_ID, job_id: 'job-1', charge_model: 'manual', status: 'paid' });
    }
    expect(result.message).toContain('2 invoices');
    expect(result.message).toContain('350.00');
  });

  it.each([0, -50])('skips an allocation of %d rather than writing it', async (amount) => {
    const result = await actions.recordBatchInvoiceSettlementAction('job-1', 'Check', [{ invoiceId: 'inv-1', amount }]);

    expect(inserts).toEqual([]);
    expect(result.message).toContain('0 invoices');
  });

  it('does not count an allocation whose insert failed', async () => {
    insertError = { message: 'constraint violation' };

    const result = await actions.recordBatchInvoiceSettlementAction('job-1', 'Check', [
      { invoiceId: 'inv-1', amount: 100 },
    ]);

    expect(result.message).toContain('0 invoices');
    expect(mocks.markInvoicePaidForPayment).not.toHaveBeenCalled();
  });
});

describe('the Stripe Terminal actions', () => {
  it('asks for a connection token through the resolved workspace', async () => {
    mocks.terminal.createTerminalConnectionToken.mockResolvedValue({ secret: 'pst_test' });

    const result = await actions.getTerminalConnectionTokenAction();

    expect(result.success).toBe(true);
    expect(mocks.terminal.createTerminalConnectionToken).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID);
  });

  it('reports a Terminal failure rather than throwing at the caller', async () => {
    mocks.terminal.createTerminalConnectionToken.mockRejectedValue(new Error('no reader registered'));

    await expect(actions.getTerminalConnectionTokenAction()).resolves.toMatchObject({
      success: false,
      error: 'no reader registered',
    });
  });

  it('lists readers for this workspace only', async () => {
    mocks.terminal.listTerminalReaders.mockResolvedValue([{ id: 'reader-1' }]);

    const result = await actions.listTerminalReadersAction();

    expect(result.success).toBe(true);
    expect(mocks.terminal.listTerminalReaders).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, undefined);
  });
});

describe('assembling dispute evidence', () => {
  it('builds the bundle for this workspace payment', async () => {
    const result = await actions.assembleDisputeEvidenceAction('payment-1');

    expect(result.success).toBe(true);
    expect(mocks.assembleDisputeEvidence).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 'payment-1');
  });

  it('reports a failure to assemble rather than an empty bundle', async () => {
    mocks.assembleDisputeEvidence.mockRejectedValue(new Error('payment not found'));

    const result = await actions.assembleDisputeEvidenceAction('payment-1');

    expect(result).toMatchObject({ success: false, error: 'payment not found' });
    expect(result.data).toBeUndefined();
  });
});
