import 'server-only';

import { randomInt } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeUsPhone } from '@/lib/phone';
import { voiceStaffStepUpCodeText } from '@/lib/sms-templates';
import {
  outboundSmsLaneSuppression,
  sendProviderMessage,
} from '@/lib/sms-provider';
import { deriveVoiceStaffStepUpCodeDigest } from '@/lib/voice/auth';
import type { VoiceCallerIdentity, VoiceStaffCaller } from '@/lib/voice/caller-identity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_CALL_ID = /^[^\u0000-\u001f\u007f]{1,255}$/;
const CODE = /^\d{6}$/;
const HMAC = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

type IssueStatus =
  | 'provider_pending'
  | 'cooldown'
  | 'rate_limited'
  | 'already_verified'
  | 'locked'
  | 'call_not_live';

type VerificationStatus =
  | 'verified'
  | 'already_verified'
  | 'invalid'
  | 'not_provider_accepted'
  | 'expired'
  | 'locked'
  | 'call_not_live'
  | 'not_found';

export type VoiceStaffStepUpStatus =
  | 'provider_pending'
  | 'pending'
  | 'cooldown'
  | 'verified'
  | 'expired'
  | 'invalidated'
  | 'locked'
  | 'call_not_live'
  | 'not_found';

type StepUpContext = Readonly<{
  admin: SupabaseClient;
  accountId: string;
  providerCallId: string;
  signedCallerPhone: string | null;
  identity: VoiceCallerIdentity;
}>;

type StepUpRuntime = Readonly<{
  generateCode?: () => string;
  environment?: Readonly<Record<string, string | undefined>>;
  sendSms?: (input: Readonly<{
    accountId: string;
    phone: string;
    code: string;
    messageKey: string;
  }>) => Promise<string>;
}>;

export type VoiceStaffStepUpRequestResult = Readonly<{
  ok: boolean;
  verified: boolean;
  status:
    | IssueStatus
    | 'provider_accepted'
    | 'already_provider_accepted'
    | 'stale_ack'
    | 'inactive'
    | 'expired'
    | 'not_found'
    | 'not_staff'
    | 'invalid_context'
    | 'delivery_failed'
    | 'unavailable';
  response: string;
  retryAfterSeconds?: number;
}>;

export type VoiceStaffStepUpVerificationResult = Readonly<{
  ok: boolean;
  verified: boolean;
  status: VerificationStatus | 'not_staff' | 'invalid_context' | 'invalid_code' | 'unavailable';
  response: string;
  attemptsRemaining?: number;
}>;

export type VoiceStaffStepUpStatusResult = Readonly<{
  ok: boolean;
  verified: boolean;
  status: VoiceStaffStepUpStatus | 'not_staff' | 'invalid_context' | 'unavailable';
  response: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}>;

type ValidContext = Readonly<{
  admin: SupabaseClient;
  accountId: string;
  providerCallId: string;
  caller: VoiceStaffCaller;
  callerPhone: string;
}>;

type IssueRow = Readonly<{
  challengeId: string | null;
  status: IssueStatus;
  shouldSend: boolean;
  sendCount: number;
  retryAfterSeconds: number;
  codeKeyId: string | null;
}>;

type DeliveryStatus =
  | 'provider_accepted'
  | 'already_provider_accepted'
  | 'stale_ack'
  | 'inactive'
  | 'expired'
  | 'call_not_live'
  | 'not_found';

type DeliveryRow = Readonly<{
  challengeId: string | null;
  status: DeliveryStatus;
  activated: boolean;
  sendCount: number;
  providerMessageId: string | null;
}>;

type VerificationRow = Readonly<{
  status: VerificationStatus;
  attemptsRemaining: number;
}>;

type StatusRow = Readonly<{
  status: VoiceStaffStepUpStatus;
  attemptsRemaining: number;
  retryAfterSeconds: number;
}>;

export type VoiceStaffStepUpInvalidationReason = 'sms_delivery_failed' | 'call_ended';

function record(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function validateContext(input: StepUpContext): ValidContext | null {
  if (!UUID.test(input.accountId) || !PROVIDER_CALL_ID.test(input.providerCallId)) return null;
  if (input.identity.status !== 'staff') return null;
  const callerPhone = input.signedCallerPhone
    ? normalizeUsPhone(input.signedCallerPhone)
    : null;
  if (!callerPhone || callerPhone !== input.identity.caller.normalizedPhone) return null;
  return Object.freeze({
    admin: input.admin,
    accountId: input.accountId.toLowerCase(),
    providerCallId: input.providerCallId,
    caller: input.identity.caller,
    callerPhone,
  });
}

function isNonStaff(input: StepUpContext): boolean {
  return input.identity.status !== 'staff';
}

function newSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function digestFor(
  context: ValidContext,
  code: string,
  environment?: Readonly<Record<string, string | undefined>>,
) {
  const digest = deriveVoiceStaffStepUpCodeDigest({
    accountId: context.accountId,
    providerCallId: context.providerCallId,
    callerPhone: context.callerPhone,
    code,
  }, environment);
  return digest && HMAC.test(digest.codeHmac) && KEY_ID.test(digest.codeKeyId)
    ? digest
    : null;
}

function parseIssueRow(value: unknown): IssueRow | null {
  const raw = record(value);
  if (!raw) return null;
  const statuses = new Set<IssueStatus>([
    'provider_pending', 'cooldown', 'rate_limited', 'already_verified', 'locked', 'call_not_live',
  ]);
  if (typeof raw.issue_status !== 'string' || !statuses.has(raw.issue_status as IssueStatus)) return null;
  if (typeof raw.should_send !== 'boolean') return null;
  const sendCount = boundedInteger(raw.send_count, 0, 3);
  const retryAfterSeconds = raw.retry_after_seconds == null
    ? 0
    : boundedInteger(raw.retry_after_seconds, 0, 86_400);
  if (sendCount == null || retryAfterSeconds == null) return null;
  const challengeId = typeof raw.challenge_id === 'string' && UUID.test(raw.challenge_id)
    ? raw.challenge_id.toLowerCase()
    : null;
  const codeKeyId = typeof raw.code_key_id === 'string' && KEY_ID.test(raw.code_key_id)
    ? raw.code_key_id
    : null;
  if (raw.issue_status !== 'call_not_live' && raw.issue_status !== 'rate_limited'
      && (!challengeId || !codeKeyId)) return null;
  return Object.freeze({
    challengeId,
    status: raw.issue_status as IssueStatus,
    shouldSend: raw.should_send,
    sendCount,
    retryAfterSeconds,
    codeKeyId,
  });
}

function parseDeliveryRow(value: unknown): DeliveryRow | null {
  const raw = record(value);
  const statuses = new Set<DeliveryStatus>([
    'provider_accepted', 'already_provider_accepted', 'stale_ack', 'inactive', 'expired',
    'call_not_live', 'not_found',
  ]);
  if (!raw || typeof raw.delivery_status !== 'string'
      || !statuses.has(raw.delivery_status as DeliveryStatus)
      || typeof raw.activated !== 'boolean') return null;
  const challengeId = typeof raw.challenge_id === 'string' && UUID.test(raw.challenge_id)
    ? raw.challenge_id.toLowerCase()
    : null;
  const sendCount = boundedInteger(raw.send_count, 0, 3);
  const providerMessageId = definitiveProviderId(raw.provider_message_id)
    ? raw.provider_message_id
    : null;
  if (sendCount == null) return null;
  return Object.freeze({
    challengeId,
    status: raw.delivery_status as DeliveryStatus,
    activated: raw.activated,
    sendCount,
    providerMessageId,
  });
}

function parseVerificationRow(value: unknown): VerificationRow | null {
  const raw = record(value);
  const statuses = new Set<VerificationStatus>([
    'verified', 'already_verified', 'invalid', 'not_provider_accepted', 'expired', 'locked',
    'call_not_live', 'not_found',
  ]);
  if (!raw || typeof raw.verification_status !== 'string'
      || !statuses.has(raw.verification_status as VerificationStatus)) return null;
  const attemptsRemaining = boundedInteger(raw.attempts_remaining, 0, 5);
  if (attemptsRemaining == null) return null;
  return Object.freeze({
    status: raw.verification_status as VerificationStatus,
    attemptsRemaining,
  });
}

function parseStatusRow(value: unknown): StatusRow | null {
  const raw = record(value);
  const statuses = new Set<VoiceStaffStepUpStatus>([
    'provider_pending', 'pending', 'cooldown', 'verified', 'expired', 'invalidated', 'locked',
    'call_not_live', 'not_found',
  ]);
  if (!raw || typeof raw.status !== 'string'
      || !statuses.has(raw.status as VoiceStaffStepUpStatus)) return null;
  const attemptsRemaining = boundedInteger(raw.attempts_remaining, 0, 5);
  const retryAfterSeconds = raw.retry_after_seconds == null
    ? 0
    : boundedInteger(raw.retry_after_seconds, 0, 86_400);
  if (attemptsRemaining == null || retryAfterSeconds == null) return null;
  return Object.freeze({
    status: raw.status as VoiceStaffStepUpStatus,
    attemptsRemaining,
    retryAfterSeconds,
  });
}

async function sendStepUpSms(input: Readonly<{
  accountId: string;
  phone: string;
  code: string;
  messageKey: string;
}>): Promise<string> {
  const suppression = outboundSmsLaneSuppression(input.accountId, 'lgq_shared');
  if (suppression) throw new Error('Voice verification SMS is unavailable.');
  return sendProviderMessage(
    input.phone,
    voiceStaffStepUpCodeText({ code: input.code }),
    { accountId: input.accountId, category: 'verification' },
    { messageKey: input.messageKey },
  );
}

function definitiveProviderId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 255
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Lifecycle cleanup used by provider-send failure and the authoritative call receipt. */
export async function invalidateVoiceStaffStepUp(input: Readonly<{
  admin: SupabaseClient;
  accountId: string;
  providerCallId: string;
  callerPhone: string;
  reason: VoiceStaffStepUpInvalidationReason;
}>): Promise<boolean> {
  const callerPhone = normalizeUsPhone(input.callerPhone);
  if (!UUID.test(input.accountId) || !PROVIDER_CALL_ID.test(input.providerCallId) || !callerPhone) {
    throw new Error('Voice staff verification invalidation context is invalid.');
  }
  const { data, error } = await input.admin.rpc('invalidate_voice_staff_step_up_challenge', {
    p_account_id: input.accountId.toLowerCase(),
    p_provider_call_id: input.providerCallId,
    p_caller_number: callerPhone,
    p_reason: input.reason,
  });
  if (error || typeof data !== 'boolean') {
    throw new Error('Voice staff verification invalidation failed.');
  }
  return data;
}

function unavailableRequest(status: 'not_staff' | 'invalid_context' | 'unavailable'):
VoiceStaffStepUpRequestResult {
  return Object.freeze({
    ok: false,
    verified: false,
    status,
    response: status === 'not_staff'
      ? 'Voice dispatch changes are restricted to verified team members.'
      : 'I could not safely start phone verification, so I did not change anything.',
  });
}

/** Issue an OTP and address its provider request only to the exact signed staff caller. */
export async function requestVoiceStaffStepUp(
  input: StepUpContext,
  runtime: StepUpRuntime = {},
): Promise<VoiceStaffStepUpRequestResult> {
  const context = validateContext(input);
  if (!context) return unavailableRequest(isNonStaff(input) ? 'not_staff' : 'invalid_context');

  const code = (runtime.generateCode ?? newSixDigitCode)();
  if (!CODE.test(code)) return unavailableRequest('unavailable');
  const digest = digestFor(context, code, runtime.environment);
  if (!digest) return unavailableRequest('unavailable');

  const { data, error } = await context.admin.rpc('issue_voice_staff_step_up_challenge', {
    p_account_id: context.accountId,
    p_provider_call_id: context.providerCallId,
    p_caller_number: context.callerPhone,
    p_code_hmac: digest.codeHmac,
    p_code_key_id: digest.codeKeyId,
  });
  if (error) return unavailableRequest('unavailable');
  const issued = parseIssueRow(data);
  if (!issued) return unavailableRequest('unavailable');

  if (issued.shouldSend) {
    if (issued.status !== 'provider_pending' || !issued.challengeId
        || issued.codeKeyId !== digest.codeKeyId) {
      return unavailableRequest('unavailable');
    }
    let providerMessageId: string;
    try {
      providerMessageId = await (runtime.sendSms ?? sendStepUpSms)({
        accountId: context.accountId,
        phone: context.callerPhone,
        code,
        messageKey: `voice-step-up:${issued.challengeId}:${issued.sendCount}`,
      });
      if (!definitiveProviderId(providerMessageId)) throw new Error('Provider acceptance was invalid.');
    } catch {
      const invalidated = await invalidateVoiceStaffStepUp({
        admin: context.admin,
        accountId: context.accountId,
        providerCallId: context.providerCallId,
        callerPhone: context.callerPhone,
        reason: 'sms_delivery_failed',
      }).catch(() => false);
      return Object.freeze({
        ok: false,
        verified: false,
        status: 'delivery_failed' as const,
        response: invalidated
          ? 'I could not confirm provider acceptance of the verification text. The code was invalidated and nothing was changed.'
          : 'I could not confirm provider acceptance of the verification text. No dispatch change is authorized.',
      });
    }

    const acknowledgement = await context.admin.rpc('mark_voice_staff_step_up_provider_accepted', {
      p_account_id: context.accountId,
      p_provider_call_id: context.providerCallId,
      p_caller_number: context.callerPhone,
      p_challenge_id: issued.challengeId,
      p_code_hmac: digest.codeHmac,
      p_code_key_id: digest.codeKeyId,
      p_send_count: issued.sendCount,
      p_provider_message_id: providerMessageId,
    });
    if (acknowledgement.error) {
      return Object.freeze({
        ok: false,
        verified: false,
        status: 'unavailable' as const,
        response: 'The text provider accepted the message, but authorization could not be confirmed. No dispatch change is authorized.',
      });
    }
    const accepted = parseDeliveryRow(acknowledgement.data);
    if (!accepted) {
      return Object.freeze({
        ok: false,
        verified: false,
        status: 'unavailable' as const,
        response: 'The text provider accepted the message, but authorization could not be confirmed. No dispatch change is authorized.',
      });
    }
    if ((accepted.status !== 'provider_accepted'
          && accepted.status !== 'already_provider_accepted')
        || !accepted.activated) {
      return Object.freeze({
        ok: false,
        verified: false,
        status: accepted.status,
        response: 'The text provider accepted the message, but this code was not activated. No dispatch change is authorized.',
      });
    }
    if (accepted.challengeId !== issued.challengeId
        || accepted.sendCount !== issued.sendCount
        || accepted.providerMessageId !== providerMessageId) {
      return Object.freeze({
        ok: false,
        verified: false,
        status: 'unavailable' as const,
        response: 'The text provider accepted the message, but authorization could not be confirmed. No dispatch change is authorized.',
      });
    }
    return Object.freeze({
      ok: true,
      verified: false,
      status: accepted.status,
      response: 'The text provider accepted a six-digit code for the verified phone calling now. Please read it back when it arrives; it expires in ten minutes.',
    });
  }

  if (issued.status === 'already_verified') {
    return Object.freeze({
      ok: true,
      verified: true,
      status: issued.status,
      response: 'This call is already verified. I can continue with the requested dispatch change.',
    });
  }
  if (issued.status === 'cooldown') {
    return Object.freeze({
      ok: false,
      verified: false,
      status: issued.status,
      retryAfterSeconds: issued.retryAfterSeconds,
      response: `A code request was already accepted recently. Please wait ${issued.retryAfterSeconds} seconds before requesting another.`,
    });
  }
  if (issued.status === 'rate_limited') {
    return Object.freeze({
      ok: false,
      verified: false,
      status: issued.status,
      retryAfterSeconds: issued.retryAfterSeconds,
      response: 'Too many verification texts were requested for this staff phone. Please wait before trying again; nothing was changed.',
    });
  }
  if (issued.status === 'locked') {
    return Object.freeze({
      ok: false,
      verified: false,
      status: issued.status,
      response: 'Verification is locked for this call. I did not change anything; please contact the office.',
    });
  }
  return Object.freeze({
    ok: false,
    verified: false,
    status: 'call_not_live' as const,
    response: 'This call is no longer eligible for verification, so I did not change anything.',
  });
}

/** Verify one six-digit response without storing or returning the plaintext. */
export async function verifyVoiceStaffStepUp(
  input: StepUpContext & Readonly<{ code: unknown }>,
  runtime: Pick<StepUpRuntime, 'environment'> = {},
): Promise<VoiceStaffStepUpVerificationResult> {
  const context = validateContext(input);
  if (!context) {
    const status = isNonStaff(input) ? 'not_staff' as const : 'invalid_context' as const;
    return Object.freeze({
      ok: false,
      verified: false,
      status,
      response: status === 'not_staff'
        ? 'Voice dispatch changes are restricted to verified team members.'
        : 'I could not safely verify this call, so I did not change anything.',
    });
  }
  if (typeof input.code !== 'string' || !CODE.test(input.code)) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'invalid_code' as const,
      response: 'Please provide the six-digit code from the verification text.',
    });
  }
  const digest = digestFor(context, input.code, runtime.environment);
  if (!digest) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'unavailable' as const,
      response: 'I could not safely verify that code, so I did not change anything.',
    });
  }

  const { data, error } = await context.admin.rpc('verify_voice_staff_step_up_challenge', {
    p_account_id: context.accountId,
    p_provider_call_id: context.providerCallId,
    p_caller_number: context.callerPhone,
    p_code_hmac: digest.codeHmac,
    p_code_key_id: digest.codeKeyId,
  });
  if (error) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'unavailable' as const,
      response: 'I could not safely verify that code, so I did not change anything.',
    });
  }
  const checked = parseVerificationRow(data);
  if (!checked) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'unavailable' as const,
      response: 'I could not safely verify that code, so I did not change anything.',
    });
  }

  if (checked.status === 'verified' || checked.status === 'already_verified') {
    return Object.freeze({
      ok: true,
      verified: true,
      status: checked.status,
      attemptsRemaining: checked.attemptsRemaining,
      response: checked.status === 'verified'
        ? 'Verification succeeded. I can now continue with the requested dispatch change.'
        : 'This call was already verified. I can continue with the requested dispatch change.',
    });
  }

  const response = checked.status === 'invalid'
    ? `That code did not match. ${checked.attemptsRemaining} attempt${checked.attemptsRemaining === 1 ? '' : 's'} remain.`
    : checked.status === 'not_provider_accepted'
      ? 'That code was not activated because provider acceptance was not confirmed. Please request a new verification code.'
    : checked.status === 'expired'
      ? 'That code expired. Please request a new verification code.'
      : checked.status === 'locked'
        ? 'Too many codes were tried, so verification is locked for this call.'
        : checked.status === 'call_not_live'
          ? 'This call is no longer eligible for verification.'
          : 'No active verification code was found. Please request a new code.';
  return Object.freeze({
    ok: false,
    verified: false,
    status: checked.status,
    attemptsRemaining: checked.attemptsRemaining,
    response,
  });
}

/** Read the RPC-only canonical authorization state before any mutation tool. */
export async function getVoiceStaffStepUpStatus(
  input: StepUpContext,
): Promise<VoiceStaffStepUpStatusResult> {
  const context = validateContext(input);
  if (!context) {
    const status = isNonStaff(input) ? 'not_staff' as const : 'invalid_context' as const;
    return Object.freeze({
      ok: false,
      verified: false,
      status,
      response: status === 'not_staff'
        ? 'Voice dispatch changes are restricted to verified team members.'
        : 'I could not safely verify this call, so I did not change anything.',
    });
  }

  const { data, error } = await context.admin.rpc('get_voice_staff_step_up_status', {
    p_account_id: context.accountId,
    p_provider_call_id: context.providerCallId,
    p_caller_number: context.callerPhone,
  });
  if (error) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'unavailable' as const,
      response: 'I could not confirm phone verification, so I did not change anything.',
    });
  }
  const current = parseStatusRow(data);
  if (!current) {
    return Object.freeze({
      ok: false,
      verified: false,
      status: 'unavailable' as const,
      response: 'I could not confirm phone verification, so I did not change anything.',
    });
  }
  if (current.status === 'verified') {
    return Object.freeze({
      ok: true,
      verified: true,
      status: current.status,
      attemptsRemaining: current.attemptsRemaining,
      response: 'This call is verified for dispatch changes.',
    });
  }
  return Object.freeze({
    ok: true,
    verified: false,
    status: current.status,
    attemptsRemaining: current.attemptsRemaining,
    retryAfterSeconds: current.retryAfterSeconds,
    response: current.status === 'locked'
      ? 'Verification is locked for this call, so I did not change anything.'
      : 'Before I can save a dispatch change, I need to text a six-digit code to the verified phone calling now.',
  });
}
