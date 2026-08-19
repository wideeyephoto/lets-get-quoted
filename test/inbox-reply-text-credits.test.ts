import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The text-credit meter's first live caller.
 *
 * `sendInboxReplySms` is a contractor typing a reply to their own customer,
 * which is the one outbound message whose billing is not in question - not a
 * self-alert, not a payment message, not a signup code. Those three are still
 * undecided; see 1.2 in docs/entitlement-gap-roadmap-2026-08-19.md.
 */

const sendProviderMessage = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/sms-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sms-provider')>()),
  sendProviderMessage: (...args: unknown[]) => sendProviderMessage(...args),
}));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: async () => 'Acme' }));

const { sendInboxReplySms } = await import('@/lib/sms');
const { SIMULATED_PROVIDER_ID } = await import('@/lib/sms-provider');
const { TEXT_CREDIT_GATE_FLAG, TEXT_CREDIT_METER_FLAG } = await import('@/lib/billing/text-credit-usage');

const reply = () => sendInboxReplySms({
  phone: '+15551230000',
  businessName: 'Acme',
  body: 'On my way.',
  accountId: '11111111-1111-4111-8111-111111111111',
});

const insufficient = {
  code: 'P0001',
  message: 'insufficient usage credits for resource text_segments (missing 1 units)',
};

beforeEach(() => {
  vi.unstubAllEnvs();
  sendProviderMessage.mockReset();
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('with the meter off', () => {
  it('touches no ledger at all', async () => {
    sendProviderMessage.mockResolvedValue('SM123');
    expect(await reply()).toBe('SM123');
    // Not merely "does not reserve" - it must not build a service-role client
    // or make any call, so a dark meter costs exactly nothing.
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('with the meter on', () => {
  beforeEach(() => vi.stubEnv(TEXT_CREDIT_METER_FLAG, '1'));

  it('holds a credit, sends, then spends it', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    sendProviderMessage.mockResolvedValue('SM123');
    expect(await reply()).toBe('SM123');

    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('gives the credit back when the send throws', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    sendProviderMessage.mockRejectedValue(new Error('carrier rejected'));
    await expect(reply()).rejects.toThrow('carrier rejected');

    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['reserve_usage_credits', 'release_usage_reservation']);
  });

  it('gives the credit back when outbound SMS is suppressed', async () => {
    // The message was composed, addressed, and went nowhere. Committing would
    // charge a contractor for a text no customer received.
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    sendProviderMessage.mockResolvedValue(SIMULATED_PROVIDER_ID);
    expect(await reply()).toBe(SIMULATED_PROVIDER_ID);

    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['reserve_usage_credits', 'release_usage_reservation']);
    expect(rpc.mock.calls[1][1].p_reason).toBe('outbound_suppressed');
  });

  it('still sends an exhausted workspace while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    sendProviderMessage.mockResolvedValue('SM123');
    expect(await reply()).toBe('SM123');
    expect(sendProviderMessage).toHaveBeenCalled();
  });

  it('still sends when the ledger cannot answer', async () => {
    rpc.mockRejectedValue(new Error('connection reset'));
    sendProviderMessage.mockResolvedValue('SM123');
    expect(await reply()).toBe('SM123');
  });
});

describe('with the gate on as well', () => {
  beforeEach(() => {
    vi.stubEnv(TEXT_CREDIT_METER_FLAG, '1');
    vi.stubEnv(TEXT_CREDIT_GATE_FLAG, '1');
  });

  it('refuses an exhausted workspace, and does not send', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    await expect(reply()).rejects.toThrow(/out of text credits/i);
    expect(sendProviderMessage).not.toHaveBeenCalled();
  });

  it('says what to do about it', async () => {
    // A refusal a contractor cannot act on is just a broken inbox.
    rpc.mockResolvedValue({ data: null, error: insufficient });
    await expect(reply()).rejects.toThrow(/top-up/i);
  });
});
