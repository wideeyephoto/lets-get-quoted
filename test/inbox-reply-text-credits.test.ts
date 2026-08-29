import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Text credits held and spent at the one egress point.
 *
 * These exercise `sendProviderMessage` itself rather than a helper, because
 * that is where the meter now lives - which is the property worth protecting.
 * Metering inside each helper would let a new caller skip it; metering here
 * means a segment cannot reach a carrier unmetered without someone deleting
 * this code.
 */

const rpc = vi.fn();
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc }) }));

const {
  sendProviderMessage,
  SIMULATED_PROVIDER_ID,
  SmsBillingRefusalError,
  SmsProviderRejectedError,
} = await import('@/lib/sms-provider');
const { TEXT_CREDIT_GATE_FLAG, TEXT_CREDIT_METER_FLAG } = await import('@/lib/billing/text-credit-usage');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const insufficient = {
  code: 'P0001',
  message: 'insufficient usage credits for resource text_segments (missing 1 units)',
};

/** Credentials that work, and an environment that would really send. */
function live() {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC11111111111111111111111111111111');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-secret');
  vi.stubEnv('TWILIO_FROM_NUMBER', '+15550001111');
  vi.stubEnv('TWILIO_MESSAGING_SERVICE_SID', '');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('LGQ_DISABLE_OUTBOUND_SMS', '');
}

const carrierAccepts = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ sid: 'SM123' }), { status: 201 }),
);
const carrierRejects = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ message: 'carrier said no' }), { status: 400 }),
);

const send = (category: 'customer_message' | 'owner_alert' = 'customer_message') =>
  sendProviderMessage('+15551230000', 'On my way.', { accountId: ACCOUNT, category });

const rpcNames = () => rpc.mock.calls.map((c) => c[0]);

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('with the meter off', () => {
  it('touches no ledger at all', async () => {
    live();
    carrierAccepts();
    expect(await send()).toBe('SM123');
    // Not merely "does not reserve": no service-role client, no round trip, so
    // a dark meter costs exactly nothing on the hottest path in the product.
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('with the meter on', () => {
  beforeEach(() => {
    live();
    vi.stubEnv(TEXT_CREDIT_METER_FLAG, '1');
  });

  it('holds credits, sends, then spends them', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    carrierAccepts();
    expect(await send()).toBe('SM123');
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('runs the durable boundary after credit admission and immediately before fetch', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    const fetchSpy = carrierAccepts();
    const beforeRequest = vi.fn(async () => {
      expect(rpcNames()).toEqual(['reserve_usage_credits']);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
    await expect(sendProviderMessage(
      '+15551230000',
      'On my way.',
      { accountId: ACCOUNT, category: 'customer_message' },
      { beforeRequest },
    )).resolves.toBe('SM123');
    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('releases held credits when the durable boundary refuses to start', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    const fetchSpy = carrierAccepts();
    await expect(sendProviderMessage(
      '+15551230000',
      'On my way.',
      { accountId: ACCOUNT, category: 'customer_message' },
      { beforeRequest: async () => { throw new Error('claim expired'); } },
    )).rejects.toThrow(/claim expired/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'release_usage_reservation']);
  });

  it('gives the credits back when the carrier refuses', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    carrierRejects();
    await expect(send()).rejects.toThrow();
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'release_usage_reservation']);
  });

  it('types a non-timeout 4xx as a definitive provider rejection', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    carrierRejects();
    const error = await send().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SmsProviderRejectedError);
    expect(error).toMatchObject({ status: 400, retryable: false });
  });

  it('keeps HTTP 408 ambiguous instead of declaring a safe rejection', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'request timed out' }), { status: 408 }),
    );
    const error = await send().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SmsProviderRejectedError);
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('commits the hold when the socket outcome is unknown', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection reset'));
    await expect(send()).rejects.toThrow(/connection reset/i);
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('keeps a 5xx outcome ambiguous and does not make a delivered message free', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'upstream unavailable' }), { status: 503 }),
    );
    const error = await send().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SmsProviderRejectedError);
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('commits the hold when the provider response body cannot be read', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => { throw new TypeError('body stream reset'); },
    } as unknown as Response);
    await expect(send()).rejects.toThrow(/body stream reset/i);
    expect(rpcNames()).toEqual(['reserve_usage_credits', 'commit_usage_reservation']);
  });

  it('marks a received 429 rejection as safe to retry', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 }),
    );
    const error = await send().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SmsProviderRejectedError);
    expect(error).toMatchObject({ status: 429, retryable: true });
  });

  it('holds nothing at all for a category that does not bill', async () => {
    // payment_message is undecided and currently exempt - see sms-billing-policy.
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    carrierAccepts();
    expect(await send('payment_message')).toBe('SM123');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still sends when the ledger cannot answer', async () => {
    // A reminder not sent because a database call timed out is worse than a
    // segment that went unbilled.
    rpc.mockRejectedValue(new Error('connection reset'));
    carrierAccepts();
    expect(await send()).toBe('SM123');
  });

  it('still sends an exhausted workspace while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    carrierAccepts();
    expect(await send()).toBe('SM123');
  });
});

describe('with the gate on as well', () => {
  beforeEach(() => {
    live();
    vi.stubEnv(TEXT_CREDIT_METER_FLAG, '1');
    vi.stubEnv(TEXT_CREDIT_GATE_FLAG, '1');
  });

  it('refuses an exhausted workspace before reaching the carrier', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    const fetchSpy = carrierAccepts();
    await expect(send()).rejects.toThrow(/out of text credits/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not cross the durable request boundary on a billing refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    const fetchSpy = carrierAccepts();
    const beforeRequest = vi.fn(async () => {});
    const error = await sendProviderMessage(
      '+15551230000',
      'On my way.',
      { accountId: ACCOUNT, category: 'customer_message' },
      { beforeRequest },
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(SmsBillingRefusalError);
    expect(beforeRequest).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says what to do about it', async () => {
    // A refusal a contractor cannot act on is just a broken outbox.
    rpc.mockResolvedValue({ data: null, error: insufficient });
    carrierAccepts();
    await expect(send()).rejects.toThrow(/top-up/i);
  });
});

describe('a suppressed send', () => {
  it('never holds a credit in the first place', async () => {
    // Suppression returns before any reservation, which is why nothing
    // downstream has to remember not to bill a message that went nowhere.
    vi.stubEnv(TEXT_CREDIT_METER_FLAG, '1');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC11111111111111111111111111111111');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'twilio-secret');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15550001111');
    vi.stubEnv('LGQ_DISABLE_OUTBOUND_SMS', '1');
    expect(await send()).toBe(SIMULATED_PROVIDER_ID);
    expect(rpc).not.toHaveBeenCalled();
  });
});
