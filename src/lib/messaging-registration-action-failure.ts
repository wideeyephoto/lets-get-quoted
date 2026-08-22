import 'server-only';

import { randomUUID } from 'node:crypto';

const MAX_SAFE_MESSAGE_LENGTH = 700;
const SAFE_PROVIDER_ERROR_CODE = /^[a-z0-9][a-z0-9_.-]{0,31}$/i;
const SAFE_FALLBACK_ERROR_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const TOKEN_SHAPED_ERROR_CODE = /^(?=.{24,}$)(?=.*[a-z])(?=.*[0-9])[a-z0-9_-]+$/i;

export type MessagingRegistrationFailure = Readonly<{
  applicationId: string | null;
  action: string;
  fallbackCode: string;
  error: unknown;
}>;

type FailureLogOptions = Readonly<{
  correlationId?: () => string;
  write?: (entry: Record<string, unknown>) => void;
}>;

type ProviderLikeError = Error & {
  code?: unknown;
  operatorMessage?: unknown;
};

function providerLikeError(error: unknown): ProviderLikeError | null {
  return error instanceof Error ? error as ProviderLikeError : null;
}

function safeErrorCode(error: unknown, fallback: string): string {
  const providerCode = providerLikeError(error)?.code;
  const candidate = typeof providerCode === 'string' ? providerCode.trim() : '';
  const configuredSecrets = [
    process.env.SIGNALWIRE_API_TOKEN,
    process.env.SIGNALWIRE_SIGNING_KEY,
    process.env.SIGNALWIRE_PROJECT_ID,
  ].filter((value): value is string => Boolean(value));
  if (
    candidate
    && SAFE_PROVIDER_ERROR_CODE.test(candidate)
    && !TOKEN_SHAPED_ERROR_CODE.test(candidate)
    && !configuredSecrets.includes(candidate)
  ) {
    return candidate.toLowerCase();
  }
  const safeFallback = fallback.trim();
  return SAFE_FALLBACK_ERROR_CODE.test(safeFallback) ? safeFallback.toLowerCase() : 'operation_failed';
}

/**
 * Keep enough provider detail for an operator to diagnose a failed action while
 * refusing the credential and end-user data shapes that commonly appear in an
 * upstream error response. The raw error is never logged by this boundary.
 */
export function redactMessagingRegistrationFailureMessage(message: string): string {
  let safe = message.replace(/[\r\n\t]+/g, ' ').trim();

  for (const secret of [
    process.env.SIGNALWIRE_API_TOKEN,
    process.env.SIGNALWIRE_SIGNING_KEY,
    process.env.SIGNALWIRE_PROJECT_ID,
  ]) {
    if (secret && secret.length >= 4) safe = safe.split(secret).join('[redacted-secret]');
  }

  safe = safe
    .replace(/\b(authorization\s*[:=]\s*)(?:basic|bearer)?\s*[^\s,;]+/gi, '$1[redacted-credential]')
    .replace(/\b(?:basic|bearer)\s+[a-z0-9._~+/=-]+/gi, '[redacted-credential]')
    .replace(/\b(api[_ -]?(?:token|key)|access[_ -]?token|token|signing[_ -]?key|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted-secret]')
    .replace(/https?:\/\/[^\s]+/gi, (rawUrl) => {
      try {
        const punctuation = rawUrl.match(/[),.;!?]+$/)?.[0] ?? '';
        const candidate = punctuation ? rawUrl.slice(0, -punctuation.length) : rawUrl;
        const url = new URL(candidate);
        url.username = '';
        url.password = '';
        if (url.search) url.search = '?[redacted]';
        url.hash = '';
        return `${url.toString()}${punctuation}`;
      } catch {
        return '[redacted-url]';
      }
    })
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+?[1-9][0-9 .()-]{7,}[0-9]/g, '[redacted-phone]')
    .replace(/\b[0-9]{2}-?[0-9]{7}\b/g, '[redacted-ein]')
    .replace(/\b[0-9]{9}\b/g, '[redacted-number]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b[a-z0-9_-]{24,}\b/gi, '[redacted-token]');

  return (safe || 'The operation failed without a readable provider response.')
    .slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

function safeMessage(error: unknown): string {
  const typed = providerLikeError(error);
  const message = typeof typed?.operatorMessage === 'string' && typed.operatorMessage.trim()
    ? typed.operatorMessage
    : typed?.message ?? 'The operation failed without a readable provider response.';
  return redactMessagingRegistrationFailureMessage(message);
}

/**
 * Returns the opaque reference that may be placed in a redirect. All diagnostic
 * detail stays in the structured server log and is deliberately absent from the
 * URL and operator-facing banner.
 */
export function logMessagingRegistrationActionFailure(
  failure: MessagingRegistrationFailure,
  options: FailureLogOptions = {},
): string {
  const correlationId = (options.correlationId ?? randomUUID)();
  const entry = {
    event: 'messaging_registration_action_failed',
    correlationId,
    applicationId: failure.applicationId,
    action: failure.action,
    errorCode: safeErrorCode(failure.error, failure.fallbackCode),
    safeMessage: safeMessage(failure.error),
  };
  (options.write ?? ((value) => console.error(value)))(entry);
  return correlationId;
}
