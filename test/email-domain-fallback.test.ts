import { describe, expect, it, vi } from 'vitest';
import type { CreateEmailOptions, CreateEmailResponse } from 'resend';
import { sendWithDomainFallback } from '@/lib/email-domain-fallback';

const payload: CreateEmailOptions = {
  from: 'Contractor <quotes@contractor.example>',
  to: 'receiver@example.com',
  reply_to: 'owner@example.com',
  subject: 'Your quote',
  html: '<p>Your quote</p>',
  attachments: [{ filename: 'quote.pdf', content: 'test' }],
  tags: [{ name: 'account_id', value: 'workspace-a' }],
};
const accepted: CreateEmailResponse = { data: { id: 'accepted' }, error: null };
const rejected: CreateEmailResponse = {
  data: null,
  error: { name: 'validation_error', message: 'The contractor.example domain is not verified. Please, add and verify your domain.' },
};

describe('custom domain send recovery', () => {
  it('retries a definitive domain rejection once and preserves the reply address and message', async () => {
    const send = vi.fn().mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    expect(await sendWithDomainFallback(send, payload)).toEqual(accepted);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual({ ...payload, from: 'Contractor <hello@letsgetquoted.com>' });
  });

  it('does not resend an accepted message', async () => {
    const send = vi.fn().mockResolvedValue(accepted);
    expect(await sendWithDomainFallback(send, payload)).toEqual(accepted);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'application_error', message: 'Unable to fetch data. The request could not be resolved.' },
    { name: 'rate_limit_exceeded', message: 'Too many requests.' },
    { name: 'validation_error', message: 'You can only send testing emails to your own email address.' },
    { name: 'validation_error', message: 'The other.example domain is not verified.' },
    { name: 'restricted_api_key', message: 'API key is not active' },
  ])('never changes sender for $name: $message', async (error) => {
    const result = { data: null, error };
    const send = vi.fn().mockResolvedValue(result);
    expect(await sendWithDomainFallback(send, payload)).toEqual(result);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not retry a thrown timeout with an unknown delivery outcome', async () => {
    const send = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(sendWithDomainFallback(send, payload)).rejects.toThrow('timeout');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed fallback without attempting a third send', async () => {
    const send = vi.fn().mockResolvedValue(rejected);
    expect(await sendWithDomainFallback(send, payload)).toEqual(rejected);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not rewrite platform identity', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'The letsgetquoted.com domain is not verified.' } });
    await sendWithDomainFallback(send, { ...payload, from: 'Security <hello@letsgetquoted.com>' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
