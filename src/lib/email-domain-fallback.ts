import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse } from 'resend';

type SendEmail = (payload: CreateEmailOptions, options?: CreateEmailRequestOptions) => Promise<CreateEmailResponse>;

/** Retry only Resend's definitive sender-domain rejection, never an ambiguous send. */
export async function sendWithDomainFallback(
  send: SendEmail,
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
): Promise<CreateEmailResponse> {
  const result = await send(payload, options);
  if (result.data || result.error?.name !== 'validation_error') return result;

  const address = payload.from.match(/<([^<>]+)>\s*$/)?.[1] ?? payload.from.trim();
  const domain = address.split('@')[1]?.toLowerCase();
  if (!domain || domain === 'letsgetquoted.com' || domain.endsWith('.letsgetquoted.com')) return result;

  // SDK v3 does not retain HTTP status codes. Match the documented rejection
  // and the actual From domain; a general 403, timeout, quota or suppression
  // must not trigger a second send. Preserve Reply-To, content and attachments.
  const rejectedDomain = result.error.message.match(/^The\s+`?([^\s`]+)`?\s+domain is not verified\./i)?.[1];
  if (rejectedDomain?.toLowerCase() !== domain) return result;

  const from = payload.from.includes('<')
    ? payload.from.replace(/<[^<>]+>\s*$/, '<hello@letsgetquoted.com>')
    : 'hello@letsgetquoted.com';
  return send({ ...payload, from }, options);
}
