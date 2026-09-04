import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_VOICE_FLAG,
  aiVoiceEnabled,
  countOpenAiCalls,
  planInboundCall,
} from '@/lib/voice/admission';

const admitVoiceCall = vi.fn();
vi.mock('@/lib/billing/voice-minute-usage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  admitVoiceCall: (...a: unknown[]) => admitVoiceCall(...a),
  voiceMinuteMode: () => 'enforce',
}));

const resolveVoiceCallerIdentity = vi.fn();
vi.mock('@/lib/voice/caller-identity', () => ({
  resolveVoiceCallerIdentity: (...a: unknown[]) => resolveVoiceCallerIdentity(...a),
}));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const TO = '+15551230000';
const VOICE_NUMBER = '22222222-2222-4222-8222-222222222222';
const PHONE_RESOURCE = '33333333-3333-4333-8333-333333333333';

/**
 * A Supabase stub driven by a per-table script. Real enough to exercise the
 * order of the checks, which is the thing under test.
 */
type TableReply = { data?: unknown; error?: unknown };
let replies: Record<string, TableReply>;
let purchasedVoiceUnits = 0;

const admin = {
  from(table: string) {
    const reply = replies[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'in']) {
      chain[method] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve(reply);
    // A list read is awaited directly rather than through maybeSingle.
    (chain as { then: unknown }).then = (resolve: (v: TableReply) => unknown) => resolve(reply);
    return chain;
  },
  rpc(name: string) {
    if (name !== 'workspace_purchased_capacity_units') {
      return Promise.resolve({ data: null, error: { message: `unexpected RPC ${name}` } });
    }
    return Promise.resolve({ data: purchasedVoiceUnits, error: null });
  },
} as never;

const call = { providerCallId: CALL, toNumber: TO, fromNumber: '+15559876543' };
const options = {
  receiptUrl: 'https://lgq.test/api/voice/receipt',
  receiptAuthorization: {
    scheme: 'basic' as const, username: 'voice-receipt', password: 'test-only-password',
  },
  forwardActionUrl: (id: string) => `https://lgq.test/api/voice/ai/status?account=${id}`,
  enabled: true,
};

const ACTIVE = {
  status: 'active', answer_mode: 'always', business_hours: {},
  greeting: null, transfer_number: null,
};

const ACTIVE_DEDICATED = {
  id: VOICE_NUMBER,
  provider: 'signalwire',
  e164_number: TO,
  provider_number_id: PHONE_RESOURCE,
  purpose: 'ai_voice',
  account_id: ACCOUNT,
  lifecycle_state: 'active',
  voice_capable: true,
  call_handler: 'laml_webhooks',
  call_request_url: 'https://app.letsgetquoted.com/api/voice/ai',
  call_request_method: 'POST',
  call_status_callback_url: 'https://app.letsgetquoted.com/api/voice/provider-status',
  call_status_callback_method: 'POST',
  provider_readiness_state: 'ready',
  provider_verified_at: new Date().toISOString(),
  last_provider_sync_at: new Date().toISOString(),
  activated_at: '2026-08-21T12:00:00Z',
  suspended_at: null,
  released_at: null,
};

const workspace = (
  limits: Record<string, unknown>,
  forward: string | null = '+15557654321',
  settings: Record<string, unknown> | null = ACTIVE,
  timezone = 'America/New_York',
) => {
  replies = {
    voice_number_inventory: { data: ACTIVE_DEDICATED, error: null },
    accounts: {
      data: {
        id: ACCOUNT,
        call_tracking_number: TO,
        ai_voice_route_revision: 0,
        call_forward_number: forward,
        timezone,
      },
      error: null,
    },
    workspace_entitlements: {
      data: {
        entitlement_state: 'active',
        feature_limits: { voice_included_minutes: 100, ...limits },
        feature_flags: { voice_included: true, voice_advanced_routing: false },
      },
      error: null,
    },
    voice_settings: { data: settings, error: null },
    voice_call_admissions: { data: [], error: null },
    voice_events: { data: [], error: null },
  };
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.letsgetquoted.com');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'letsgetquoted.com');
  admitVoiceCall.mockReset();
  admitVoiceCall.mockResolvedValue({ outcome: 'admitted', lease: {} });
  resolveVoiceCallerIdentity.mockReset();
  resolveVoiceCallerIdentity.mockResolvedValue({ status: 'customer' });
  purchasedVoiceUnits = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  workspace({ voice_concurrent_calls: 1 });
});

afterEach(() => vi.unstubAllEnvs());

describe('the product flag is not a metering flag', () => {
  it('is off unless set to exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(aiVoiceEnabled({ [AI_VOICE_FLAG]: value })).toBe(false);
    }
    expect(aiVoiceEnabled({ [AI_VOICE_FLAG]: '1' })).toBe(true);
  });
});

describe('what a caller gets', () => {
  it('reaches the AI when everything is in place', async () => {
    const result = await planInboundCall(admin, call, options);
    expect(result.plan.kind).toBe('ai_agent');
    expect(result.declineReason).toBeNull();
    if (result.plan.kind !== 'ai_agent') return;
    expect(result.plan.receiptUrl).toBe('https://lgq.test/api/voice/receipt');
    expect(result.plan.receiptUrl).not.toContain('@');
    // The disclosure is not optional and not a setting.
    expect(result.plan.greeting).toContain('AI assistant');
    expect(admitVoiceCall).toHaveBeenCalledWith(
      admin,
      {
        accountId: ACCOUNT,
        providerCallId: CALL,
        dialedNumber: TO,
        callerNumber: '+15559876543',
        callerKind: 'customer',
      },
      { mode: 'enforce', concurrencyLimit: 1 },
    );
  });

  it('persists the shared resolver\'s staff identity in the atomic admission claim', async () => {
    resolveVoiceCallerIdentity.mockResolvedValue({
      status: 'staff',
      caller: {
        name: 'Dave Miller',
        role: 'crew',
        normalizedPhone: '+15559876543',
        crewId: 'crew-1',
        hourlyRate: 35,
        burdenPct: 20,
      },
    });

    const result = await planInboundCall(admin, call, options);

    expect(result.plan.kind).toBe('ai_agent');
    expect(admitVoiceCall).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        accountId: ACCOUNT,
        providerCallId: CALL,
        callerNumber: '+15559876543',
        callerKind: 'crew',
      }),
      { mode: 'enforce', concurrencyLimit: 1 },
    );
  });

  it.each([
    ['unavailable', 'an identity dependency is unavailable'],
    ['ambiguous', 'the signed caller matches more than one staff identity'],
  ] as const)(
    'safely admits as customer rather than dropping to forward when %s: %s',
    async (status, _reason) => {
      resolveVoiceCallerIdentity.mockResolvedValue({ status });

      const result = await planInboundCall(admin, call, options);

      expect(resolveVoiceCallerIdentity).toHaveBeenCalledWith(admin, ACCOUNT, call.fromNumber);
      expect(result).toMatchObject({
        accountId: ACCOUNT,
        declineReason: null,
      });
      expect(result.plan.kind).toBe('ai_agent');
      expect(admitVoiceCall).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          accountId: ACCOUNT,
          callerKind: 'customer',
        }),
        { mode: 'enforce', concurrencyLimit: 1 },
      );
    },
  );

  it('falls through to the contractor\'s own line, never to an error', async () => {
    // Every decline below is a caller who still reaches the business. The
    // published behaviour at a limit is forwarding or voicemail, not an apology.
    const cases: Array<[string, () => void, string]> = [
      ['product_off', () => {}, 'product_off'],
      ['no seat on the plan', () => workspace({ voice_concurrent_calls: 0 }), 'no_seat'],
      ['no entitlement row at all', () => {
        workspace({ voice_concurrent_calls: 1 });
        replies.workspace_entitlements = { data: null, error: null };
      }, 'no_entitlement'],
    ];

    for (const [name, arrange, reason] of cases) {
      workspace({ voice_concurrent_calls: 1 });
      arrange();
      const result = await planInboundCall(admin, call, {
        ...options, enabled: reason === 'product_off' ? false : true,
      });
      expect(result.plan.kind, name).toBe('forward');
      expect(result.declineReason, name).toBe(reason);
      if (result.plan.kind !== 'forward') continue;
      expect(result.plan.number, name).toBe('+15557654321');
      // The contractor sees their own number, not the caller's.
      expect(result.plan.callerId, name).toBe(TO);
    }
  });

  it('says it is unavailable only when there is nowhere to send them', async () => {
    workspace({ voice_concurrent_calls: 1 }, null);
    const result = await planInboundCall(admin, call, { ...options, enabled: false });
    expect(result.plan.kind).toBe('unavailable');
  });

  it('falls back to settings transferNumber when callForwardNumber is null', async () => {
    workspace({ voice_concurrent_calls: 1 }, null, { ...ACTIVE, transfer_number: '+18105550199' });
    const result = await planInboundCall(admin, call, { ...options, enabled: false });
    expect(result.plan.kind).toBe('forward');
    if (result.plan.kind === 'forward') {
      expect(result.plan.number).toBe('+18105550199');
    }
  });

  it('does not recognise a number belonging to no workspace', async () => {
    replies = { voice_number_inventory: { data: null, error: null } };
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'no_workspace', accountId: null });
    expect(result.plan.kind).toBe('unavailable');
  });

  it('does not resolve shared, other-account, inactive, or unprovisioned inventory', async () => {
    const invalidRows = [
      { ...ACTIVE_DEDICATED, purpose: 'not_voice', account_id: null },
      { ...ACTIVE_DEDICATED, account_id: '44444444-4444-4444-8444-444444444444' },
      { ...ACTIVE_DEDICATED, lifecycle_state: 'suspended', suspended_at: '2026-08-21T13:00:00Z' },
      { ...ACTIVE_DEDICATED, provider_number_id: null, lifecycle_state: 'purchased' },
    ];

    for (const sender of invalidRows) {
      workspace({ voice_concurrent_calls: 1 });
      replies.voice_number_inventory = { data: sender, error: null };
      const result = await planInboundCall(admin, call, options);
      expect(result).toMatchObject({ declineReason: 'no_workspace', accountId: null });
      expect(result.plan.kind).toBe('unavailable');
      expect(admitVoiceCall).not.toHaveBeenCalled();
    }
  });

  it('fails closed without leaking ownership when sender inventory cannot be read', async () => {
    replies.voice_number_inventory = { data: null, error: { message: 'inventory down' } };
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'no_workspace', accountId: null });
    expect(result.plan.kind).toBe('unavailable');
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('never reaches the ledger for a call it was never going to admit', async () => {
    // The order of the checks is the design: a workspace with no seat must not
    // cost a reservation to refuse.
    workspace({ voice_concurrent_calls: 0 });
    await planInboundCall(admin, call, options);
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('does not confuse launch capacity with a purchased voice entitlement', async () => {
    workspace({ voice_concurrent_calls: 1, voice_included_minutes: 0 });
    replies.workspace_entitlements = {
      data: {
        entitlement_state: 'active',
        feature_limits: {
          voice_concurrent_calls: 1, voice_history_days: 30, voice_included_minutes: 0,
        },
        feature_flags: { voice_included: false, voice_advanced_routing: false },
      },
      error: null,
    };
    const result = await planInboundCall(admin, call, options);
    expect(result.declineReason).toBe('no_entitlement');
    expect(result.plan.kind).toBe('forward');
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('fails to the normal line before admission when receipt auth is missing', async () => {
    const result = await planInboundCall(admin, call, {
      ...options, receiptAuthorization: null,
    });
    expect(result.declineReason).toBe('receipt_auth_unavailable');
    expect(result.plan.kind).toBe('forward');
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('forwards when the allowance is gone, which is the published behaviour', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'refused', reason: 'no_allowance' });
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'no_allowance' });
    expect(result.plan.kind).toBe('forward');
  });

  it('still answers when the call was admitted unmetered', async () => {
    // Failing open is the meter's decision; the route must honour it rather
    // than treating "unmetered" as "refused".
    admitVoiceCall.mockResolvedValue({ outcome: 'admitted_unmetered', reason: 'ledger_unavailable' });
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });

  it('uses an attribution failure reason when the meter cannot persist the call', async () => {
    admitVoiceCall.mockResolvedValue({
      outcome: 'refused',
      reason: 'admission_unavailable',
    });
    const result = await planInboundCall(admin, call, options);
    expect(result.declineReason).toBe('admission_unavailable');
    expect(result.plan.kind).not.toBe('ai_agent');
  });

  it('does not answer a CallSid already closed by the provider terminal tombstone', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'refused', reason: 'call_terminal' });
    const result = await planInboundCall(admin, call, options);
    expect(result.declineReason).toBe('call_terminal');
    expect(result.plan.kind).not.toBe('ai_agent');
  });

  it('answers on an authorized overage too', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'admitted_overage', overage: {} });
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });
});

describe('concurrency, without a call-started event to count from', () => {
  it('counts an admission with no receipt as a live call', async () => {
    replies.voice_call_admissions = { data: [{ provider_call_id: 'live-1' }], error: null };
    replies.voice_events = { data: [], error: null };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(1);
  });

  it('stops counting one whose receipt has arrived', async () => {
    replies.voice_call_admissions = {
      data: [{ provider_call_id: 'done-1' }, { provider_call_id: 'live-1' }], error: null,
    };
    replies.voice_events = { data: [{ provider_call_id: 'done-1' }], error: null };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(1);
  });

  it('stops counting a provider-terminal admission before its delayed receipt arrives', async () => {
    replies.voice_call_admissions = {
      data: [
        { provider_call_id: 'terminal-1', provider_terminal_at: '2026-09-03T23:00:00.000Z', provider_terminal_status: 'completed' },
        { provider_call_id: 'live-1', provider_terminal_at: null, provider_terminal_status: null },
      ],
      error: null,
    };
    replies.voice_events = { data: [], error: null };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(1);
  });

  it('refuses the call rather than guessing when the count cannot be read', async () => {
    // Returning the limit sheds AI calls to voicemail. Returning zero would
    // admit an unbounded number that LGQ pays for and cannot bill.
    replies.voice_call_admissions = { data: null, error: { message: 'down' } };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(3);

    replies.voice_call_admissions = { data: [{ provider_call_id: 'x' }], error: null };
    replies.voice_events = { data: null, error: { message: 'down' } };
    expect(await countOpenAiCalls(admin, ACCOUNT, 3)).toBe(3);
  });

  it('forwards a caller who arrives at the limit', async () => {
    workspace({ voice_concurrent_calls: 1 });
    replies.voice_call_admissions = { data: [{ provider_call_id: 'live-1' }], error: null };
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'at_capacity' });
    expect(result.plan.kind).toBe('forward');
    expect(admitVoiceCall).not.toHaveBeenCalled();
  });

  it('honours the atomic claim when a simultaneous request takes the last seat', async () => {
    admitVoiceCall.mockResolvedValue({ outcome: 'refused', reason: 'at_capacity' });
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'at_capacity' });
    expect(result.plan.kind).toBe('forward');
  });

  it('lets Scale run three at once where Flex runs one', async () => {
    const twoLive = { data: [{ provider_call_id: 'a' }, { provider_call_id: 'b' }], error: null };

    workspace({ voice_concurrent_calls: 1 });
    replies.voice_call_admissions = twoLive;
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('forward');

    // Same two calls in flight, different plan, different answer.
    workspace({ voice_concurrent_calls: 3 });
    replies.voice_call_admissions = twoLive;
    expect((await planInboundCall(admin, call, options)).plan.kind).toBe('ai_agent');
  });
});

describe('when the receptionist is meant to pick up', () => {
  it('does not answer for a workspace that never configured it', async () => {
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', null);
    const result = await planInboundCall(admin, call, options);
    expect(result).toMatchObject({ declineReason: 'not_configured' });
    expect(result.plan.kind).toBe('forward');
  });

  it('stays quiet while paused, without losing the configuration', async () => {
    // Paused is not off. A contractor reaches for it during a holiday and
    // expects to undo it without setting everything up again.
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', { ...ACTIVE, status: 'paused' });
    expect((await planInboundCall(admin, call, options))).toMatchObject({ declineReason: 'paused' });
  });

  it('lets a person answer during business hours when that is the setup', async () => {
    // Tuesday 10:00 in Detroit. Answering here would put an AI in front of a
    // customer who rang expecting the contractor.
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', {
      ...ACTIVE, answer_mode: 'after_hours', business_hours: { 2: ['08:00', '17:00'] },
    }, 'America/Detroit');
    const at = new Date('2026-08-18T14:00:00Z'); // 10:00 EDT
    const result = await planInboundCall(admin, call, { ...options, now: () => at });
    expect(result).toMatchObject({ declineReason: 'within_business_hours' });
  });

  it('answers the same Tuesday once the office has shut', async () => {
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', {
      ...ACTIVE, answer_mode: 'after_hours', business_hours: { 2: ['08:00', '17:00'] },
    }, 'America/Detroit');
    const at = new Date('2026-08-18T23:00:00Z'); // 19:00 EDT
    expect((await planInboundCall(admin, call, { ...options, now: () => at })).plan.kind)
      .toBe('ai_agent');
  });

  it('answers everything when the mode says always, hours or not', async () => {
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', {
      ...ACTIVE, answer_mode: 'always', business_hours: { 2: ['08:00', '17:00'] },
    }, 'America/Detroit');
    const at = new Date('2026-08-18T14:00:00Z');
    expect((await planInboundCall(admin, call, { ...options, now: () => at })).plan.kind)
      .toBe('ai_agent');
  });

  it('uses the configured greeting and hand-off when they are set', async () => {
    workspace({ voice_concurrent_calls: 1 }, '+15557654321', {
      ...ACTIVE, greeting: 'Rivera Plumbing, how can I help?', transfer_number: '+15550001111',
    });
    const result = await planInboundCall(admin, call, options);
    if (result.plan.kind !== 'ai_agent') throw new Error('expected the agent');
    expect(result.plan.greeting).toContain('You are speaking with an AI assistant.');
    expect(result.plan.greeting).toContain('Rivera Plumbing, how can I help?');
    // The configured hand-off wins over the general forwarding number.
    expect(result.plan.transferTo).toBe('+15550001111');
  });
});
