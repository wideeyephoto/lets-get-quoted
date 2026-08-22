import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('settlement worker tests inject database dependencies');
  },
}));

import {
  classifyDirectPaymentSettlementFailure,
  DirectPaymentSettlementRpcError,
  DirectPaymentSettlementWorkerError,
  runDirectPaymentSettlementBatch,
  SupabaseDirectPaymentSettlementStore,
  type DirectPaymentSettlementClaim,
  type DirectPaymentSettlementFailure,
  type DirectPaymentSettlementMessenger,
  type DirectPaymentSettlementStore,
} from '@/lib/billing/direct-payment-settlement-worker';

const CLAIM: DirectPaymentSettlementClaim = Object.freeze({
  claimToken: '10000000-0000-4000-8000-000000000001',
  taskId: '20000000-0000-4000-8000-000000000002',
  paymentId: '30000000-0000-4000-8000-000000000003',
  workspaceId: '40000000-0000-4000-8000-000000000004',
  jobId: '50000000-0000-4000-8000-000000000005',
  invoiceId: '60000000-0000-4000-8000-000000000006',
  billingEventId: '70000000-0000-4000-8000-000000000007',
  settledAt: '2026-08-16T04:00:00.000Z',
  feedStatus: 'pending',
  smsStatus: 'pending',
  attemptNumber: 1,
  leaseExpiresAt: '2026-08-16T04:05:00.000Z',
});

const ENVELOPE = Object.freeze({
  phoneNumber: '+12485550123',
  body: 'Your final payment was received. Reply STOP to opt out or HELP for help.',
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

function failure(
  status: DirectPaymentSettlementFailure['status'],
): DirectPaymentSettlementFailure {
  if (status === 'failed_retryable') {
    return Object.freeze({
      status,
      taskState: 'retry_wait',
      nextAttemptAt: '2026-08-16T04:10:00.000Z',
    });
  }
  if (status === 'already_finished') {
    return Object.freeze({ status, taskState: 'completed', nextAttemptAt: null });
  }
  return Object.freeze({ status, taskState: 'dead_letter', nextAttemptAt: null });
}

function harness(overrides: Partial<DirectPaymentSettlementStore> = {}) {
  const order: string[] = [];
  const store: DirectPaymentSettlementStore = {
    claimBatch: vi.fn()
      .mockResolvedValueOnce([CLAIM])
      .mockResolvedValueOnce([]),
    recordFeed: vi.fn(async () => { order.push('feed'); }),
    stageSms: vi.fn(async () => {
      order.push('stage');
      return {
        status: 'queued' as const,
        smsEventId: '80000000-0000-4000-8000-000000000008',
        phoneNumber: null,
      };
    }),
    fail: vi.fn(async () => failure('failed_retryable')),
    ...overrides,
  };
  const messenger: DirectPaymentSettlementMessenger = {
    resolveEnvelope: vi.fn(async () => { order.push('resolve'); return ENVELOPE; }),
  };
  return { store, messenger, order };
}

describe('dark direct payment settlement worker', () => {
  it('durably records the financial feed before handing one receipt to the generic queue', async () => {
    const test = harness();
    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toEqual({
        claimedCount: 1,
        outcomes: [{
          taskId: CLAIM.taskId,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'queued',
        }],
      });
    expect(test.order).toEqual(['feed', 'resolve', 'stage']);
    expect(test.store.fail).not.toHaveBeenCalled();
  });

  it('records a no-consent outcome without creating a queue entry', async () => {
    const test = harness({
      stageSms: vi.fn(async () => ({
        status: 'skipped_no_consent' as const,
        smsEventId: null,
        phoneNumber: null,
      })),
    });
    test.messenger.resolveEnvelope = vi.fn(async () => ({
      phoneNumber: null,
      body: null,
    }));

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({
        outcomes: [{ status: 'completed', smsStatus: 'skipped_no_consent' }],
      });
    expect(test.store.stageSms).toHaveBeenCalledOnce();
  });

  it('retries a feed failure before resolving or enqueueing SMS', async () => {
    const test = harness({
      recordFeed: vi.fn(async () => {
        throw new DirectPaymentSettlementRpcError('40001');
      }),
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({ outcomes: [{ status: 'failed_retryable' }] });
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'worker_transport_error',
      retryable: true,
    });
    expect(test.messenger.resolveEnvelope).not.toHaveBeenCalled();
    expect(test.store.stageSms).not.toHaveBeenCalled();
  });

  it('honors a database-detected historical unknown without any carrier API', async () => {
    const test = harness({
      stageSms: vi.fn(async () => ({
        status: 'indeterminate' as const,
        smsEventId: '80000000-0000-4000-8000-000000000008',
        phoneNumber: null,
      })),
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({ outcomes: [{ status: 'sms_indeterminate' }] });
  });

  it('treats a previously finalized staged event as complete without replaying provider egress', async () => {
    const test = harness({
      stageSms: vi.fn(async () => ({
        status: 'already_sent' as const,
        smsEventId: '80000000-0000-4000-8000-000000000008',
        phoneNumber: null,
      })),
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({
        outcomes: [{ status: 'completed', feedStatus: 'recorded', smsStatus: 'sent' }],
      });
    expect(test.store.fail).not.toHaveBeenCalled();
  });

  it('claims one task at a time and rejects unsafe bounds', async () => {
    const test = harness();
    await runDirectPaymentSettlementBatch(1, test.store, test.messenger);
    expect(test.store.claimBatch).toHaveBeenCalledTimes(1);
    expect(test.store.claimBatch).toHaveBeenCalledWith(1);

    await expect(runDirectPaymentSettlementBatch(0, test.store, test.messenger))
      .rejects.toThrow(/between 1 and 25/i);
  });

  it('classifies only fixed PII-free worker codes', () => {
    expect(classifyDirectPaymentSettlementFailure(
      new DirectPaymentSettlementWorkerError('sms_phone_invalid', false),
    )).toEqual({ code: 'sms_phone_invalid', retryable: false });
    expect(classifyDirectPaymentSettlementFailure(
      new DirectPaymentSettlementRpcError('40P01'),
    )).toEqual({ code: 'worker_transport_error', retryable: true });
    expect(classifyDirectPaymentSettlementFailure(
      new DirectPaymentSettlementRpcError('22000'),
    )).toEqual({ code: 'worker_contract_error', retryable: false });
    expect(classifyDirectPaymentSettlementFailure(new Error('secret@example.com')))
      .toEqual({ code: 'worker_internal_error', retryable: true });
  });

  it('validates service-role RPC result shapes', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'claim_direct_payment_settlement_tasks') {
        return {
          error: null,
          data: [{
            work_claim_token: CLAIM.claimToken,
            task_id: CLAIM.taskId,
            payment_id: CLAIM.paymentId,
            workspace_id: CLAIM.workspaceId,
            job_id: CLAIM.jobId,
            invoice_id: CLAIM.invoiceId,
            billing_event_id: CLAIM.billingEventId,
            settled_at: CLAIM.settledAt,
            feed_status: 'pending',
            sms_status: 'pending',
            attempt_number: 1,
            lease_expires_at: CLAIM.leaseExpiresAt,
          }],
        };
      }
      return { error: { code: '22000' }, data: null };
    });
    const store = new SupabaseDirectPaymentSettlementStore({ rpc } as never);
    await expect(store.claimBatch(1)).resolves.toEqual([CLAIM]);
    expect(rpc).toHaveBeenCalledWith(
      'claim_direct_payment_settlement_tasks',
      { p_batch_size: 1 },
    );

    const ambiguousRpc = vi.fn(async () => ({
      error: null,
      data: [
        { dispatch_status: 'queued', sms_event_id: CLAIM.taskId, phone_number: null },
        { dispatch_status: 'queued', sms_event_id: CLAIM.jobId, phone_number: null },
      ],
    }));
    const ambiguous = new SupabaseDirectPaymentSettlementStore({ rpc: ambiguousRpc } as never);
    await expect(ambiguous.stageSms(CLAIM, ENVELOPE)).rejects.toThrow(/sms_stage_invalid/);
    expect(ambiguousRpc).toHaveBeenCalledWith(
      'enqueue_direct_payment_settlement_sms',
      expect.objectContaining({ p_task_id: CLAIM.taskId, p_claim_token: CLAIM.claimToken }),
    );
  });

  it('stays server-only, exact-gated, and disconnected from special job/payment transitions', () => {
    const worker = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'direct-payment-settlement-worker.ts',
    );
    const schedulerBoundary = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'billing-worker-cron.ts',
    );
    const activeFiles = sourceFiles(join(process.cwd(), 'src')).filter(
      (file) => file !== worker && file !== schedulerBoundary,
    );
    // A silent zero passes every assertion below it. The walk is the thing
    // most likely to break, and its failure looks exactly like success.
    expect(activeFiles.length).toBeGreaterThan(1_000);
    activeFiles.push(join(process.cwd(), '.env.example'), join(process.cwd(), 'vercel.json'));

    for (const file of activeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('direct-payment-settlement-worker');
      expect(source).not.toContain('runDirectPaymentSettlementBatch');
      expect(source).not.toContain('claim_direct_payment_settlement_tasks');
    }

    const scheduler = readFileSync(schedulerBoundary, 'utf8');
    expect(scheduler).toContain("from '@/lib/billing/direct-payment-settlement-worker'");
    expect(scheduler).toContain('DIRECT_PAYMENT_SETTLEMENT_WORKER_FLAG');
    expect(scheduler).toContain('runDirectPaymentSettlementCronBatch');

    const source = readFileSync(worker, 'utf8');
    expect(source.startsWith("import 'server-only';")).toBe(true);
    expect(source).toContain('enqueue_direct_payment_settlement_sms');
    expect(source).not.toContain('sendProviderMessage');
    expect(source).not.toContain("from '@/lib/sms-provider'");
    expect(source).not.toContain('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED');
    expect(source).not.toContain('smsCanaryAccounts');
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    for (const forbiddenImport of [
      '@/lib/payment-plans',
      '@/lib/recurring',
      '@/lib/quick-stop',
      '@/lib/extra-stop',
      '@/lib/job-status',
      '@/lib/refund',
    ]) {
      expect(imports.join('\n')).not.toContain(forbiddenImport);
    }
  });
});
