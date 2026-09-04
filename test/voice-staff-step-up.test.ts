import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveVoiceStaffStepUpCodeDigest } from '@/lib/voice/auth';
import type { VoiceCallerIdentity } from '@/lib/voice/caller-identity';
import {
  getVoiceStaffStepUpStatus,
  requestVoiceStaffStepUp,
  verifyVoiceStaffStepUp,
} from '@/lib/voice/staff-step-up';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const CALL_ID = 'signalwire-call-step-up-123';
const PHONE = '+18103042061';
const CODE = '481920';
const CHALLENGE_ID = '33333333-3333-4333-8333-333333333333';
const ENV = { SIGNALWIRE_SIGNING_KEY: 'test-only-voice-signing-secret' } as const;
const DIGEST = deriveVoiceStaffStepUpCodeDigest({
  accountId: ACCOUNT_ID,
  providerCallId: CALL_ID,
  callerPhone: PHONE,
  code: CODE,
}, ENV)!;

const staffIdentity: VoiceCallerIdentity = {
  status: 'staff',
  caller: {
    name: 'Brett',
    role: 'owner',
    normalizedPhone: PHONE,
    crewId: null,
    hourlyRate: null,
    burdenPct: 15,
  },
};

const customerIdentity: VoiceCallerIdentity = { status: 'customer' };

type RpcResult = Readonly<{ data: unknown; error: unknown }>;

function mockAdmin(...results: RpcResult[]) {
  const rpc = vi.fn();
  for (const result of results) rpc.mockResolvedValueOnce(result);
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

function context(admin: SupabaseClient, identity: VoiceCallerIdentity = staffIdentity) {
  return {
    admin,
    accountId: ACCOUNT_ID,
    providerCallId: CALL_ID,
    signedCallerPhone: PHONE,
    identity,
  };
}

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    challenge_id: CHALLENGE_ID,
    issue_status: 'provider_pending',
    should_send: true,
    send_count: 1,
    code_expires_at: '2026-09-03T23:40:00.000Z',
    retry_after_seconds: 60,
    code_key_id: DIGEST.codeKeyId,
    ...overrides,
  };
}

function deliveryRow(overrides: Record<string, unknown> = {}) {
  return {
    challenge_id: CHALLENGE_ID,
    delivery_status: 'provider_accepted',
    activated: true,
    send_count: 1,
    code_expires_at: '2026-09-03T23:40:00.000Z',
    provider_message_id: 'provider-message-id',
    provider_accepted_at: '2026-09-03T23:30:00.000Z',
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('AI Voice staff step-up HMAC binding', () => {
  it('binds the digest to the account, provider call, caller, and code without exposing the key', () => {
    const base = deriveVoiceStaffStepUpCodeDigest({
      accountId: ACCOUNT_ID,
      providerCallId: CALL_ID,
      callerPhone: PHONE,
      code: CODE,
    }, ENV);
    const otherAccount = deriveVoiceStaffStepUpCodeDigest({
      accountId: OTHER_ACCOUNT_ID,
      providerCallId: CALL_ID,
      callerPhone: PHONE,
      code: CODE,
    }, ENV);
    const otherCall = deriveVoiceStaffStepUpCodeDigest({
      accountId: ACCOUNT_ID,
      providerCallId: `${CALL_ID}-other`,
      callerPhone: PHONE,
      code: CODE,
    }, ENV);
    const otherCaller = deriveVoiceStaffStepUpCodeDigest({
      accountId: ACCOUNT_ID,
      providerCallId: CALL_ID,
      callerPhone: '+12485550105',
      code: CODE,
    }, ENV);

    expect(base?.codeHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(base?.codeKeyId).toMatch(/^voice-tool-v1-[a-f0-9]{16}$/);
    expect(base?.codeHmac).not.toContain(CODE);
    expect(new Set([
      base?.codeHmac,
      otherAccount?.codeHmac,
      otherCall?.codeHmac,
      otherCaller?.codeHmac,
    ]).size).toBe(4);
    expect(JSON.stringify(base)).not.toContain(ENV.SIGNALWIRE_SIGNING_KEY);
  });
});

describe('AI Voice staff step-up issuance', () => {
  it('rejects a non-staff caller before issuing or sending anything', async () => {
    const { admin, rpc } = mockAdmin();
    const sendSms = vi.fn();

    const result = await requestVoiceStaffStepUp(context(admin, customerIdentity), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms,
    });

    expect(result.status).toBe('not_staff');
    expect(result.verified).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('sends only after the issue RPC authorizes it and keeps plaintext out of DB and responses', async () => {
    const { admin, rpc } = mockAdmin(
      { data: issueRow(), error: null },
      { data: deliveryRow(), error: null },
    );
    const sendSms = vi.fn().mockResolvedValue('provider-message-id');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await requestVoiceStaffStepUp(context(admin), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms,
    });

    expect(result.status).toBe('provider_accepted');
    expect(result.verified).toBe(false);
    expect(sendSms).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      phone: PHONE,
      code: CODE,
      messageKey: `voice-step-up:${CHALLENGE_ID}:1`,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('issue_voice_staff_step_up_challenge', expect.objectContaining({
      p_account_id: ACCOUNT_ID,
      p_provider_call_id: CALL_ID,
      p_caller_number: PHONE,
      p_code_hmac: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_code_key_id: expect.stringMatching(/^voice-tool-v1-[a-f0-9]{16}$/),
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(result)).not.toContain(CODE);
    expect(JSON.stringify(info.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(error.mock.calls)).not.toContain(CODE);
    expect(rpc.mock.calls[1]).toEqual([
      'mark_voice_staff_step_up_provider_accepted',
      {
        p_account_id: ACCOUNT_ID,
        p_provider_call_id: CALL_ID,
        p_caller_number: PHONE,
        p_challenge_id: CHALLENGE_ID,
        p_code_hmac: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_code_key_id: expect.stringMatching(/^voice-tool-v1-[a-f0-9]{16}$/),
        p_send_count: 1,
        p_provider_message_id: 'provider-message-id',
      },
    ]);
  });

  it('does not send during cooldown or after the call is no longer live', async () => {
    const cooldown = mockAdmin({
      data: issueRow({ issue_status: 'cooldown', should_send: false, retry_after_seconds: 42 }),
      error: null,
    });
    const notLive = mockAdmin({
      data: issueRow({
        challenge_id: null,
        issue_status: 'call_not_live',
        should_send: false,
        send_count: 0,
        retry_after_seconds: 0,
        code_key_id: null,
      }),
      error: null,
    });
    const sendSms = vi.fn();

    await expect(requestVoiceStaffStepUp(context(cooldown.admin), {
      generateCode: () => CODE, environment: ENV, sendSms,
    })).resolves.toMatchObject({ status: 'cooldown', retryAfterSeconds: 42 });
    await expect(requestVoiceStaffStepUp(context(notLive.admin), {
      generateCode: () => CODE, environment: ENV, sendSms,
    })).resolves.toMatchObject({ status: 'call_not_live', verified: false });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('accepts the null-challenge rate-limit shape and sends nothing', async () => {
    const limited = mockAdmin({
      data: issueRow({
        challenge_id: null,
        issue_status: 'rate_limited',
        should_send: false,
        send_count: 0,
        code_expires_at: null,
        retry_after_seconds: 733,
        code_key_id: null,
      }),
      error: null,
    });
    const sendSms = vi.fn();

    const result = await requestVoiceStaffStepUp(context(limited.admin), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms,
    });

    expect(result).toMatchObject({
      status: 'rate_limited',
      verified: false,
      retryAfterSeconds: 733,
    });
    expect(result.response).toMatch(/too many verification texts/i);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('invalidates the exact challenge identity when SMS delivery fails', async () => {
    const { admin, rpc } = mockAdmin(
      { data: issueRow(), error: null },
      { data: true, error: null },
    );

    const result = await requestVoiceStaffStepUp(context(admin), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms: vi.fn().mockRejectedValue(new Error(`provider rejected ${CODE}`)),
    });

    expect(result).toMatchObject({ status: 'delivery_failed', verified: false });
    expect(JSON.stringify(result)).not.toContain(CODE);
    expect(rpc.mock.calls[1]).toEqual([
      'invalidate_voice_staff_step_up_challenge',
      {
        p_account_id: ACCOUNT_ID,
        p_provider_call_id: CALL_ID,
        p_caller_number: PHONE,
        p_reason: 'sms_delivery_failed',
      },
    ]);
  });

  it('fails closed when the delivery acknowledgement RPC resolves with an error', async () => {
    const { admin } = mockAdmin(
      { data: issueRow(), error: null },
      { data: null, error: { code: '08006' } },
    );

    const result = await requestVoiceStaffStepUp(context(admin), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms: vi.fn().mockResolvedValue('provider-message-id'),
    });

    expect(result).toMatchObject({ status: 'unavailable', verified: false });
    expect(result.response).toContain('No dispatch change is authorized');
    expect(JSON.stringify(result)).not.toContain(CODE);
  });

  it('rejects a stale bound delivery acknowledgement and never claims the code is active', async () => {
    const { admin } = mockAdmin(
      { data: issueRow(), error: null },
      { data: deliveryRow({ delivery_status: 'stale_ack', activated: false }), error: null },
    );

    const result = await requestVoiceStaffStepUp(context(admin), {
      generateCode: () => CODE,
      environment: ENV,
      sendSms: vi.fn().mockResolvedValue('provider-message-id'),
    });

    expect(result).toMatchObject({ status: 'stale_ack', verified: false });
    expect(result.response).toContain('was not activated');
    expect(result.response).toContain('No dispatch change is authorized');
  });
});

describe('AI Voice staff step-up verification', () => {
  it('returns a bounded wrong-code response and passes only an HMAC to the RPC', async () => {
    const { admin, rpc } = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        verification_status: 'invalid',
        attempt_count: 1,
        attempts_remaining: 4,
        verified_until: null,
      },
      error: null,
    });

    const result = await verifyVoiceStaffStepUp({ ...context(admin), code: CODE }, { environment: ENV });

    expect(result).toMatchObject({ status: 'invalid', verified: false, attemptsRemaining: 4 });
    expect(result.response).toContain('4 attempts remain');
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(CODE);
    expect(JSON.stringify(result)).not.toContain(CODE);
  });

  it.each([
    ['locked', 0, 'locked'],
    ['expired', 3, 'expired'],
    ['not_provider_accepted', 5, 'not_provider_accepted'],
  ] as const)('fails closed for %s codes', async (verificationStatus, attemptsRemaining, expected) => {
    const { admin } = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        verification_status: verificationStatus,
        attempt_count: 5 - attemptsRemaining,
        attempts_remaining: attemptsRemaining,
        verified_until: null,
      },
      error: null,
    });

    await expect(verifyVoiceStaffStepUp(
      { ...context(admin), code: CODE },
      { environment: ENV },
    )).resolves.toMatchObject({ status: expected, verified: false });
  });

  it('treats a same-call replay as already verified without returning the code', async () => {
    const { admin } = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        verification_status: 'already_verified',
        attempt_count: 0,
        attempts_remaining: 5,
        verified_until: '2026-09-04T00:00:00.000Z',
      },
      error: null,
    });

    const result = await verifyVoiceStaffStepUp(
      { ...context(admin), code: CODE },
      { environment: ENV },
    );

    expect(result).toMatchObject({ status: 'already_verified', verified: true });
    expect(JSON.stringify(result)).not.toContain(CODE);
  });

  it('requires the canonical status RPC to report verified before mutations may proceed', async () => {
    const pending = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        status: 'pending',
        send_count: 1,
        attempt_count: 0,
        attempts_remaining: 5,
        code_expires_at: '2026-09-03T23:40:00.000Z',
        verified_until: null,
        retry_after_seconds: 0,
        code_key_id: 'voice-tool-v1-0123456789abcdef',
      },
      error: null,
    });
    const deliveryPending = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        status: 'provider_pending',
        send_count: 1,
        attempt_count: 0,
        attempts_remaining: 5,
        code_expires_at: '2026-09-03T23:40:00.000Z',
        verified_until: null,
        retry_after_seconds: 0,
        code_key_id: 'voice-tool-v1-0123456789abcdef',
      },
      error: null,
    });
    const verified = mockAdmin({
      data: {
        challenge_id: CHALLENGE_ID,
        status: 'verified',
        send_count: 1,
        attempt_count: 0,
        attempts_remaining: 5,
        code_expires_at: '2026-09-03T23:40:00.000Z',
        verified_until: '2026-09-04T00:00:00.000Z',
        retry_after_seconds: 0,
        code_key_id: 'voice-tool-v1-0123456789abcdef',
      },
      error: null,
    });

    await expect(getVoiceStaffStepUpStatus(context(pending.admin)))
      .resolves.toMatchObject({ status: 'pending', verified: false });
    await expect(getVoiceStaffStepUpStatus(context(deliveryPending.admin)))
      .resolves.toMatchObject({ status: 'provider_pending', verified: false });
    await expect(getVoiceStaffStepUpStatus(context(verified.admin)))
      .resolves.toMatchObject({ status: 'verified', verified: true });
  });
});
