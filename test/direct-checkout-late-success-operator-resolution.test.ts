import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('operator-resolution tests inject the service store');
  },
}));

import {
  DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
  DirectCheckoutLateSuccessOperatorResolutionRpcError,
  SupabaseDirectCheckoutLateSuccessOperatorResolutionStore,
  type DirectCheckoutLateSuccessOperatorResolutionPlan,
} from '@/lib/billing/direct-checkout-late-success-operator-resolution';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PAYMENT_ID = '20000000-0000-4000-8000-000000000002';
const TASK_ID = '30000000-0000-4000-8000-000000000003';
const PAID_OPERATION_PK = '40000000-0000-4000-8000-000000000004';
const CURRENT_OPERATION_PK = '50000000-0000-4000-8000-000000000005';
const OPERATION_ID = `payment:${PAYMENT_ID}:late-success:operator-resolution:1`;
const ACTOR_USER_ID = '70000000-0000-4000-8000-000000000007';
const RESOLUTION_ID = '80000000-0000-4000-8000-000000000008';
const CURRENT_SESSION_ID = 'cs_test_successor123';
const TASK_SET_SHA256 = 'a'.repeat(64);
const EVIDENCE_SHA256 = 'b'.repeat(64);
const REQUEST_SHA256 = 'c'.repeat(64);

function planRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resolution_schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    decision_code: 'accept_single_late_paid_predecessor',
    eligible: true,
    reason_code: 'single_late_paid_predecessor_resolution_ready',
    account_id: ACCOUNT_ID,
    payment_id: PAYMENT_ID,
    task_id: TASK_ID,
    paid_operation_pk: PAID_OPERATION_PK,
    current_operation_pk: CURRENT_OPERATION_PK,
    current_checkout_session_id: CURRENT_SESSION_ID,
    task_set_sha256: TASK_SET_SHA256,
    evidence_sha256: EVIDENCE_SHA256,
    ...overrides,
  };
}

function plan(overrides: Partial<DirectCheckoutLateSuccessOperatorResolutionPlan> = {}):
DirectCheckoutLateSuccessOperatorResolutionPlan {
  return Object.freeze({
    schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    action: 'settle_paid_predecessor',
    decisionCode: 'accept_single_late_paid_predecessor',
    eligible: true,
    reasonCode: 'single_late_paid_predecessor_resolution_ready',
    accountId: ACCOUNT_ID,
    paymentId: PAYMENT_ID,
    taskId: TASK_ID,
    paidOperationPk: PAID_OPERATION_PK,
    currentOperationPk: CURRENT_OPERATION_PK,
    currentCheckoutSessionId: CURRENT_SESSION_ID,
    taskSetSha256: TASK_SET_SHA256,
    evidenceSha256: EVIDENCE_SHA256,
    ...overrides,
  });
}

function resultRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resolution_schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
    resolution_id: RESOLUTION_ID,
    applied: true,
    result_code: 'settled',
    payment_id: PAYMENT_ID,
    task_id: TASK_ID,
    paid_operation_pk: PAID_OPERATION_PK,
    ...overrides,
  };
}

// Only the settle RPC returns evidence_moved, so only settle fixtures carry it.
// Passing a settleRow() to retainHold (or vice versa) is a real contract
// violation and the parser is expected to reject it -- that is asserted below.
function settleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...resultRow(), evidence_moved: false, ...overrides };
}

function mutationInput(planValue = plan()) {
  return {
    plan: planValue,
    operationId: OPERATION_ID,
    requestSha256: REQUEST_SHA256,
    actorUserId: ACTOR_USER_ID,
  };
}

function filesBelow(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

describe('direct Checkout late-success operator-resolution service store', () => {
  it('parses one exact, versioned settlement plan and preserves its CAS fingerprints', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [planRow()], error: null });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.plan({
      accountId: ACCOUNT_ID.toUpperCase(),
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
    }, 'settle_paid_predecessor')).resolves.toEqual(plan());
    expect(rpc).toHaveBeenCalledWith(
      'plan_direct_checkout_late_success_operator_resolution',
      {
        p_account_id: ACCOUNT_ID,
        p_payment_id: PAYMENT_ID,
        p_task_id: TASK_ID,
        p_action: 'settle_paid_predecessor',
      },
    );
  });

  it('settles only an eligible exact plan and passes every immutable CAS value', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [settleRow()], error: null });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).resolves.toEqual({
      schema: DIRECT_CHECKOUT_LATE_SUCCESS_OPERATOR_RESOLUTION_SCHEMA,
      resolutionId: RESOLUTION_ID,
      applied: true,
      resultCode: 'settled',
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
      paidOperationPk: PAID_OPERATION_PK,
      evidenceMoved: false,
    });
    expect(rpc).toHaveBeenCalledWith('settle_direct_checkout_late_success_task', {
      p_account_id: ACCOUNT_ID,
      p_payment_id: PAYMENT_ID,
      p_task_id: TASK_ID,
      p_operation_id: OPERATION_ID,
      p_request_sha256: REQUEST_SHA256,
      p_task_set_sha256: TASK_SET_SHA256,
      p_evidence_sha256: EVIDENCE_SHA256,
      p_actor_user_id: ACTOR_USER_ID,
    });
  });

  it('accepts a fixed replay result without claiming that it applied twice', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [settleRow({
        applied: false,
        result_code: 'already_settled',
      })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).resolves.toMatchObject({
      applied: false,
      resultCode: 'already_settled',
      evidenceMoved: false,
    });
  });

  it('reports a replay whose evidence has moved instead of failing the call', async () => {
    // The decision this encodes. A settle replay stays idempotent even after a
    // second paid fact lands, because 'already_settled' exists precisely so an
    // honest retry gets an identical answer; turning a network retry into an
    // error on a rail carrying real payments would trade a reporting gap for an
    // availability one. The hold still blocks refund release either way, so the
    // staleness is information the caller needs, not a reason to fail. The call
    // succeeds and says so.
    const rpc = vi.fn().mockResolvedValue({
      data: [settleRow({
        applied: false,
        result_code: 'already_settled',
        evidence_moved: true,
      })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).resolves.toMatchObject({
      applied: false,
      resultCode: 'already_settled',
      evidenceMoved: true,
    });
  });

  it('refuses a settle result that omits the moved-evidence flag', async () => {
    // Never coerce this one. An absent column collapses to falsey, which reads
    // as 'evidence has not moved' -- the exact claim the flag exists to stop the
    // RPC making when it cannot back it up.
    const rpc = vi.fn().mockResolvedValue({ data: [resultRow()], error: null });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).rejects.toThrow(/moved-evidence flag/i);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'false'],
    ['a number', 0],
  ])('refuses a settle result whose moved-evidence flag is %s', async (_label, value) => {
    const rpc = vi.fn().mockResolvedValue({
      data: [settleRow({ evidence_moved: value })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).rejects.toThrow(/moved-evidence flag/i);
  });

  it('leaves the flag null for retain-hold, which does not report it', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [resultRow({ result_code: 'hold_retained' })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.retainHold({
      ...mutationInput(plan({
        action: 'retain_hold',
        decisionCode: 'retain_operator_hold',
        reasonCode: 'operator_hold_requested',
      })),
      disposition: 'additional_paid_truth_requires_review',
    })).resolves.toMatchObject({ evidenceMoved: null });
  });

  it('refuses a retain-hold result reporting a flag it has no business reporting', async () => {
    // null here means 'this RPC does not answer that question', not 'nothing
    // moved'. A flag arriving on the retain-hold path means its shape changed
    // underneath us, and silently accepting it would let the two RPCs drift.
    const rpc = vi.fn().mockResolvedValue({
      data: [settleRow({ result_code: 'hold_retained' })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.retainHold({
      ...mutationInput(plan({
        action: 'retain_hold',
        decisionCode: 'retain_operator_hold',
        reasonCode: 'operator_hold_requested',
      })),
      disposition: 'additional_paid_truth_requires_review',
    })).rejects.toThrow(/moved-evidence flag/i);
  });

  it('records only a fixed manual disposition through the dedicated retain-hold RPC', async () => {
    const retainPlan = plan({
      action: 'retain_hold',
      decisionCode: 'retain_operator_hold',
      reasonCode: 'operator_hold_requested',
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [resultRow({ result_code: 'hold_retained' })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.retainHold({
      ...mutationInput(retainPlan),
      disposition: 'additional_paid_truth_requires_review',
    })).resolves.toMatchObject({
      applied: true,
      resultCode: 'hold_retained',
    });
    expect(rpc).toHaveBeenCalledWith(
      'record_direct_checkout_late_success_manual_disposition',
      expect.objectContaining({
        p_task_set_sha256: TASK_SET_SHA256,
        p_evidence_sha256: EVIDENCE_SHA256,
        p_disposition_reason: 'additional_paid_truth_requires_review',
      }),
    );
  });

  it('parses a fixed ineligible plan but refuses to send it to settlement', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [planRow({
          decision_code: 'reject_additional_paid_truth',
          eligible: false,
          reason_code: 'additional_paid_truth_present',
        })],
        error: null,
      });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);
    const rejected = await store.plan({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
    }, 'settle_paid_predecessor');

    expect(rejected).toMatchObject({
      eligible: false,
      decisionCode: 'reject_additional_paid_truth',
    });
    await expect(store.settle(mutationInput(rejected))).rejects.toThrow(/does not permit settlement/i);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['settle_paid_predecessor', 'retain_hold'] as const)(
    'parses an already-resolved task as ineligible for %s',
    async (action) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [planRow({
          decision_code: 'reject_task_already_resolved',
          eligible: false,
          reason_code: 'task_already_resolved',
        })],
        error: null,
      });
      const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

      await expect(store.plan({
        accountId: ACCOUNT_ID,
        paymentId: PAYMENT_ID,
        taskId: TASK_ID,
      }, action)).resolves.toMatchObject({
        decisionCode: 'reject_task_already_resolved',
        eligible: false,
        reasonCode: 'task_already_resolved',
      });
    },
  );

  it('rejects a fixed decision that cannot result from the requested action', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [planRow({
        decision_code: 'reject_additional_paid_truth',
        eligible: false,
        reason_code: 'additional_paid_truth_present',
      })],
      error: null,
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.plan({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
    }, 'retain_hold')).rejects.toThrow(/decision contract/i);
  });

  it.each([
    ['unknown decision', { decision_code: 'customer_supplied_decision' }],
    ['decision/reason mismatch', { reason_code: 'successor_not_neutralized' }],
    ['accepted decision marked ineligible', { eligible: false }],
    ['different accepted action', {
      decision_code: 'retain_operator_hold',
      reason_code: 'operator_hold_requested',
    }],
    ['schema drift', { resolution_schema: 'direct_checkout_late_success_operator_resolution_v2' }],
    ['scope drift', { payment_id: ACCOUNT_ID }],
    ['uppercase task-set digest', { task_set_sha256: TASK_SET_SHA256.toUpperCase() }],
    ['task-set digest with a trailing newline', { task_set_sha256: `${TASK_SET_SHA256}\n` }],
    ['short evidence digest', { evidence_sha256: 'abc123' }],
    ['task UUID with a trailing newline', { task_id: `${TASK_ID}\n` }],
    ['Session without current operation', { current_operation_pk: null }],
    ['eligible plan without current operation or Session', {
      current_operation_pk: null,
      current_checkout_session_id: null,
    }],
    ['noncanonical Checkout Session ID', { current_checkout_session_id: 'cs_unknown_12345678' }],
    ['Checkout Session ID with a trailing newline', {
      current_checkout_session_id: `${CURRENT_SESSION_ID}\n`,
    }],
  ])('fails closed for a malformed privileged plan: %s', async (_label, override) => {
    const rpc = vi.fn().mockResolvedValue({ data: [planRow(override)], error: null });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.plan({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
    }, 'settle_paid_predecessor')).rejects.toThrow();
  });

  it('rejects zero or multiple plan rows instead of selecting a convenient row', async () => {
    for (const data of [[], [planRow(), planRow()]]) {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);
      await expect(store.plan({
        accountId: ACCOUNT_ID,
        paymentId: PAYMENT_ID,
        taskId: TASK_ID,
      }, 'settle_paid_predecessor')).rejects.toThrow(/row/i);
    }
  });

  it('rejects nonallowlisted action and disposition values before any RPC', async () => {
    const rpc = vi.fn();
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.plan({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      taskId: TASK_ID,
    }, 'clear_hold' as never)).rejects.toThrow(/action is invalid/i);
    const retainPlan = plan({
      action: 'retain_hold',
      decisionCode: 'retain_operator_hold',
      reasonCode: 'operator_hold_requested',
    });
    await expect(store.retainHold({
      ...mutationInput(retainPlan),
      disposition: 'customer@example.com' as never,
    })).rejects.toThrow(/disposition is invalid/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['task-set fingerprint', { taskSetSha256: TASK_SET_SHA256.toUpperCase() }],
    ['evidence fingerprint', { evidenceSha256: 'short' }],
    ['schema', { schema: 'legacy_v0' }],
    ['decision pair', { reasonCode: 'successor_not_neutralized' }],
    ['paid-operation identity', { paidOperationPk: 'not-a-uuid' }],
  ])('rejects a forged mutation plan with an invalid %s before RPC', async (_label, override) => {
    const rpc = vi.fn();
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput(plan(
      override as Partial<DirectCheckoutLateSuccessOperatorResolutionPlan>,
    )))).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid request fingerprint and actor identity before RPC', async () => {
    for (const override of [
      { requestSha256: REQUEST_SHA256.toUpperCase() },
      { actorUserId: 'not-an-auth-user-uuid' },
    ]) {
      const rpc = vi.fn();
      const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);
      await expect(store.settle({
        ...mutationInput(),
        ...override,
      })).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it.each([
    '',
    ' padded-operation-id ',
    'late-success\nsecond-command',
    `late-success:${'x'.repeat(201)}`,
  ])('rejects an unsafe stable operation ID before mutation RPC: %j', async (operationId) => {
    const rpc = vi.fn();
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle({
      ...mutationInput(),
      operationId,
    })).rejects.toThrow(/operation ID is invalid/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['result code expansion', { result_code: 'hold_cleared' }],
    ['applied/result mismatch', { applied: false }],
    ['identity drift', { paid_operation_pk: CURRENT_OPERATION_PK }],
    ['schema drift', { resolution_schema: 'legacy_v0' }],
  ])('fails closed for a malformed mutation result: %s', async (_label, override) => {
    const rpc = vi.fn().mockResolvedValue({ data: [settleRow(override)], error: null });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    await expect(store.settle(mutationInput())).rejects.toThrow();
  });

  it('surfaces only a bounded database code and never a raw privileged message', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: ' p0001 ', message: 'customer@example.com and provider IDs' },
    });
    const store = new SupabaseDirectCheckoutLateSuccessOperatorResolutionStore({ rpc } as never);

    let caught: unknown;
    try {
      await store.plan({
        accountId: ACCOUNT_ID,
        paymentId: PAYMENT_ID,
        taskId: TASK_ID,
      }, 'settle_paid_predecessor');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DirectCheckoutLateSuccessOperatorResolutionRpcError);
    expect(caught).toMatchObject({ rpcCode: 'P0001' });
    expect(String(caught)).not.toMatch(/customer@|provider IDs/);
  });

  it('has no route, automatic caller, or provider activation surface', () => {
    const moduleSource = readFileSync(join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'direct-checkout-late-success-operator-resolution.ts',
    ), 'utf8');
    const appSource = filesBelow(join(process.cwd(), 'src', 'app'))
      .filter((path) => /\.(?:ts|tsx)$/.test(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(moduleSource).toContain("import 'server-only'");
    expect(moduleSource).toContain('audit attribution only');
    expect(moduleSource).toContain('MFA- and staff-permission-gated context');
    expect(moduleSource).toContain('not an operator-authorization boundary');
    expect(moduleSource).not.toMatch(/revalidates its staff row|active super_admin/i);
    expect(moduleSource).not.toMatch(/export\s+(?:async\s+)?function/);
    expect(moduleSource).not.toMatch(/\bfetch\s*\(|stripe|provider\.(?:retrieve|expire|refund)/i);
    expect(appSource).not.toContain('direct-checkout-late-success-operator-resolution');
  });
});
