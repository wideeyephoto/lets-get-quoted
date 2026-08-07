import { describe, it, expect } from 'vitest';
import { resendRecipient, resendTagValue, resendTags } from '@/lib/resend-tags';

// The shipped bug: the handler called `event.data.tags.find(...)`, because that
// is the shape the Resend SEND api takes. The WEBHOOK delivers a flat object,
// so every email.sent and email.delivered threw "r.find is not a function"
// before the email_events upsert — meaning no delivery was ever recorded, no
// bouncing address was ever suppressed, and Resend retried each one into
// several identical webhook_failures rows.

describe('the shape the webhook actually sends', () => {
  // Verbatim from a real payload: a flat object, not an array of pairs.
  const webhookTags = { kind: 'invoice', account_id: '8f1c2b3a-0000-4000-8000-000000000001' };

  it('reads a tag off it', () => {
    expect(resendTagValue(webhookTags, 'kind')).toBe('invoice');
    expect(resendTagValue(webhookTags, 'account_id')).toBe('8f1c2b3a-0000-4000-8000-000000000001');
  });

  it('returns null for a tag that is not there, rather than throwing', () => {
    expect(resendTagValue(webhookTags, 'nope')).toBeNull();
  });

  it('gives the handler both tags it needs in one call', () => {
    expect(resendTags(webhookTags)).toEqual({
      kind: 'invoice',
      accountId: '8f1c2b3a-0000-4000-8000-000000000001',
    });
  });
});

describe('the shape the send api takes', () => {
  // Still accepted: it is what our own send calls pass, and what the docs
  // describe, so a provider that later normalises its payloads must not break
  // this a second time.
  const sendTags = [
    { name: 'kind', value: 'client_quote' },
    { name: 'account_id', value: 'acc-1' },
  ];

  it('is read the same way', () => {
    expect(resendTags(sendTags)).toEqual({ kind: 'client_quote', accountId: 'acc-1' });
  });

  it('ignores entries that are not tag pairs', () => {
    expect(resendTagValue([null, 'x', 42, { name: 'kind', value: 'ok' }], 'kind')).toBe('ok');
  });
});

describe('nothing usable', () => {
  // The important property: none of these throw. The whole defect was an
  // exception on an unexpected shape, taking every write in the handler with it.
  it('falls back rather than throwing, whatever arrives', () => {
    for (const odd of [undefined, null, '', 0, false, 'a string', [], {}, [[]], [{ name: 'kind' }]]) {
      expect(() => resendTags(odd)).not.toThrow();
      expect(resendTags(odd).kind).toBe('unknown');
      expect(resendTags(odd).accountId).toBeNull();
    }
  });

  // account_id null is what makes maybeSuppress log "cannot suppress" rather
  // than suppress against the wrong account, so an empty value must read as
  // absent and never as the string "undefined".
  it('treats an empty or blank tag value as absent', () => {
    expect(resendTagValue({ kind: '' }, 'kind')).toBeNull();
    expect(resendTagValue({ kind: '   ' }, 'kind')).toBeNull();
    expect(resendTagValue([{ name: 'kind', value: '' }], 'kind')).toBeNull();
  });

  it('refuses a nested object rather than stringifying it into the column', () => {
    expect(resendTagValue({ kind: { a: 1 } }, 'kind')).toBeNull();
  });

  it('coerces a numeric tag to text', () => {
    expect(resendTagValue({ kind: 42 }, 'kind')).toBe('42');
  });
});

describe('the recipient', () => {
  // `to` arrives as a bare string on some events and an array on others.
  it('is read from either shape', () => {
    expect(resendRecipient('a@b.com')).toBe('a@b.com');
    expect(resendRecipient(['a@b.com', 'c@d.com'])).toBe('a@b.com');
  });

  it('skips empty entries to find a real address', () => {
    expect(resendRecipient(['', '   ', 'real@b.com'])).toBe('real@b.com');
  });

  it('is null when there is nothing to read', () => {
    for (const odd of [undefined, null, '', '   ', [], [null], [42], {}]) {
      expect(resendRecipient(odd)).toBeNull();
    }
  });
});
