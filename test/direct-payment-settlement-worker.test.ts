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
        status: 'dispatch' as const,
        smsEventId: '80000000-0000-4000-8000-000000000008',
        phoneNumber: ENVELOPE.phoneNumber,
      };
    }),
    completeSms: vi.fn(async () => { order.push('complete'); }),
    fail: vi.fn(async () => failure('failed_retryable')),
    ...overrides,
  };
  const messenger: DirectPaymentSettlementMessenger = {
    resolveEnvelope: vi.fn(async () => { order.push('resolve'); return ENVELOPE; }),
    send: vi.fn(async () => { order.push('send'); return 'SM_provider_123'; }),
  };
  return { store, messenger, order };
}

describe('dark direct payment settlement worker', () => {
  it('durably records feed before staging and sending one receipt text', async () => {
    const test = harness();
    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toEqual({
        claimedCount: 1,
        outcomes: [{
          taskId: CLAIM.taskId,
          status: 'completed',
          feedStatus: 'recorded',
          smsStatus: 'sent',
        }],
      });
    expect(test.order).toEqual(['feed', 'resolve', 'stage', 'send', 'complete']);
    expect(test.store.completeSms).toHaveBeenCalledWith({
      claim: CLAIM,
      smsEventId: '80000000-0000-4000-8000-000000000008',
      providerId: 'SM_provider_123',
    });
    expect(test.store.fail).not.toHaveBeenCalled();
  });

  it('records a no-consent outcome without provider egress', async () => {
    const test = harness({
      stageSms: vi.fn(async () => ({
        status: 'skipped_no_consent' as const,
        smsEventId: null,
        phoneNumber: null,
      })),
    });
    test.messenger.resolveEnvelope = vi.fn(async () => ({ phoneNumber: null, body: null }));

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({
        outcomes: [{ status: 'completed', smsStatus: 'skipped_no_consent' }],
      });
    expect(test.messenger.send).not.toHaveBeenCalled();
    expect(test.store.completeSms).not.toHaveBeenCalled();
  });

  it('retries a pre-egress feed failure and never resolves or sends SMS', async () => {
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
    expect(test.messenger.send).not.toHaveBeenCalled();
  });

  it('marks any provider-call uncertainty indeterminate and never sends twice', async () => {
    const test = harness({
      fail: vi.fn(async () => failure('sms_indeterminate')),
    });
    test.messenger.send = vi.fn(async () => {
      throw new TypeError('ambiguous network result containing customer data');
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({
        outcomes: [{
          status: 'sms_indeterminate',
          feedStatus: 'recorded',
          smsStatus: 'indeterminate',
        }],
      });
    expect(test.messenger.send).toHaveBeenCalledTimes(1);
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'sms_provider_result_unknown',
      retryable: false,
    });
    expect(JSON.stringify(vi.mocked(test.store.fail).mock.calls))
      .not.toContain('customer data');
  });

  it('never resends when provider success cannot be finalized', async () => {
    const test = harness({
      completeSms: vi.fn(async () => {
        throw new DirectPaymentSettlementRpcError('PGRST000');
      }),
      fail: vi.fn(async () => failure('sms_indeterminate')),
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({ outcomes: [{ status: 'sms_indeterminate' }] });
    expect(test.messenger.send).toHaveBeenCalledTimes(1);
    expect(test.store.fail).toHaveBeenCalledWith({
      claim: CLAIM,
      errorCode: 'sms_completion_result_unknown',
      retryable: false,
    });
  });

  it('honors a database-detected stale pending SMS without provider egress', async () => {
    const test = harness({
      stageSms: vi.fn(async () => ({
        status: 'indeterminate' as const,
        smsEventId: '80000000-0000-4000-8000-000000000008',
        phoneNumber: null,
      })),
    });

    await expect(runDirectPaymentSettlementBatch(1, test.store, test.messenger))
      .resolves.toMatchObject({ outcomes: [{ status: 'sms_indeterminate' }] });
    expect(test.messenger.send).not.toHaveBeenCalled();
    expect(test.store.completeSms).not.toHaveBeenCalled();
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
        { dispatch_status: 'dispatch', sms_event_id: CLAIM.taskId, phone_number: '+12485550123' },
        { dispatch_status: 'dispatch', sms_event_id: CLAIM.jobId, phone_number: '+12485550123' },
      ],
    }));
    const ambiguous = new SupabaseDirectPaymentSettlementStore({ rpc: ambiguousRpc } as never);
    await expect(ambiguous.stageSms(CLAIM, ENVELOPE)).rejects.toThrow(/sms_stage_invalid/);
  });

  it('stays server-only, dark, and disconnected from special job/payment transitions', () => {
    const worker = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'direct-payment-settlement-worker.ts',
    );
    const activeFiles = sourceFiles(join(process.cwd(), 'src')).filter((file) => file !== worker);
    activeFiles.push(join(process.cwd(), '.env.example'), join(process.cwd(), 'vercel.json'));

    for (const file of activeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('direct-payment-settlement-worker');
      expect(source).not.toContain('runDirectPaymentSettlementBatch');
      expect(source).not.toContain('claim_direct_payment_settlement_tasks');
    }

    const source = readFileSync(worker, 'utf8');
    expect(source.startsWith("import 'server-only';")).toBe(true);
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
