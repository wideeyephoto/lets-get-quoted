import { describe, it, expect } from 'vitest';
import {
  CLIENT_CHANNEL_HINT,
  CLIENT_CHANNEL_LABEL,
  CLIENT_CHANNEL_PREFERENCES,
  canTextClient,
  clientChannelChip,
  clientChannelPreview,
  normalizeClientChannelPreference,
  resolveClientChannel,
  type ClientChannelPreference,
} from '@/lib/client-channel';

/**
 * How this customer may be messaged.
 *
 * Three facts decide it — a mobile on file, a STOP reply against that mobile,
 * and the contractor's own setting — and until this module existed no two
 * screens combined them the same way. The third fact had nowhere to live at
 * all: the "Text quote and sign-off link" checkbox was asked once, never
 * stored, and forgotten by the next automation that found a phone number.
 */

const SARAH = { phone: '+12485550117', email: 'sarah@example.com' };

describe('the ordinary case', () => {
  it('texts a customer with a mobile', () => {
    expect(resolveClientChannel(SARAH)).toEqual({ channel: 'sms', reason: 'default' });
  });

  it('emails one without', () => {
    expect(resolveClientChannel({ email: 'sarah@example.com' })).toEqual({ channel: 'email', reason: 'fallback' });
  });

  it('sends nothing when there is nothing on file', () => {
    expect(resolveClientChannel({})).toEqual({ channel: 'none', reason: 'no_contact' });
  });

  it('treats whitespace as absence', () => {
    expect(resolveClientChannel({ phone: '   ', email: '  ' })).toEqual({ channel: 'none', reason: 'no_contact' });
  });
});

describe("the contractor's setting", () => {
  it("'off' means off, whatever is on file", () => {
    expect(resolveClientChannel({ ...SARAH, preference: 'off' })).toEqual({
      channel: 'none',
      reason: 'preference_off',
    });
  });

  it("'email' never texts, even with a mobile", () => {
    expect(resolveClientChannel({ ...SARAH, preference: 'email' })).toEqual({ channel: 'email', reason: 'preferred' });
  });

  it("'sms' never emails, even with an address", () => {
    expect(resolveClientChannel({ ...SARAH, preference: 'sms' })).toEqual({ channel: 'sms', reason: 'preferred' });
  });

  /**
   * 'auto' is the ABSENCE of a decision, which is why it is not the same as
   * 'sms'. A customer explicitly set to text-only with no mobile is a mistake
   * worth surfacing; one on 'auto' with no mobile is just an email customer.
   */
  it("distinguishes 'sms' with no mobile from 'auto' with no mobile", () => {
    const contact = { email: 'sarah@example.com' };
    expect(resolveClientChannel({ ...contact, preference: 'sms' })).toEqual({ channel: 'none', reason: 'no_mobile' });
    expect(resolveClientChannel({ ...contact, preference: 'auto' })).toEqual({ channel: 'email', reason: 'fallback' });
  });

  it("'email' with no email on file says which one is missing", () => {
    expect(resolveClientChannel({ phone: '+12485550117', preference: 'email' })).toEqual({
      channel: 'none',
      reason: 'no_email',
    });
  });
});

/**
 * STOP means "stop texting me". What that costs depends on who asked for the
 * message: a quote the customer requested still reaches them by email, an
 * automatic reminder does not go at all. Answering "leave me alone" with an
 * email is a loophole; refusing to send somebody their own invoice over a text
 * preference is a boycott. Neither is right for both cases.
 */
describe('a STOP reply', () => {
  const optedOut = { ...SARAH, optedOut: true };

  it('stops an automatic message completely', () => {
    expect(resolveClientChannel({ ...optedOut, kind: 'automatic' })).toEqual({
      channel: 'none',
      reason: 'opted_out',
    });
  });

  it('is the default reading, for a caller that has not thought about it', () => {
    expect(resolveClientChannel(optedOut)).toEqual({ channel: 'none', reason: 'opted_out' });
  });

  it('moves a requested message to email instead', () => {
    expect(resolveClientChannel({ ...optedOut, kind: 'requested' })).toEqual({
      channel: 'email',
      reason: 'sms_blocked',
    });
  });

  it('leaves a requested message nowhere to go when there is no email', () => {
    expect(resolveClientChannel({ phone: '+12485550117', optedOut: true, kind: 'requested' })).toEqual({
      channel: 'none',
      reason: 'opted_out',
    });
  });

  it('is not overridden by a text-only setting', () => {
    expect(resolveClientChannel({ ...optedOut, preference: 'sms', kind: 'requested' })).toEqual({
      channel: 'none',
      reason: 'opted_out',
    });
  });

  it("does not resurrect a customer the contractor switched off", () => {
    expect(resolveClientChannel({ ...optedOut, preference: 'off', kind: 'requested' })).toEqual({
      channel: 'none',
      reason: 'preference_off',
    });
  });
});

describe('normalizing what came out of the database', () => {
  it('lands on auto for anything unrecognised', () => {
    for (const value of [undefined, null, '', 'text', 'SMS', 42, {}, 'offf']) {
      expect(normalizeClientChannelPreference(value)).toBe('auto');
    }
  });

  it('passes every real preference through untouched', () => {
    for (const value of CLIENT_CHANNEL_PREFERENCES) {
      expect(normalizeClientChannelPreference(value)).toBe(value);
    }
  });

  // A pre-migration row has no column at all, and it must read as today's
  // behaviour rather than as an error or as silence.
  it('reads a missing column as auto', () => {
    const row: { message_channel?: string } = {};
    expect(normalizeClientChannelPreference(row.message_channel)).toBe('auto');
    expect(canTextClient({ phone: '+12485550117', preference: normalizeClientChannelPreference(row.message_channel) })).toBe(true);
  });
});

describe('every preference has words to describe it', () => {
  it('a label and a hint, for all four', () => {
    for (const value of CLIENT_CHANNEL_PREFERENCES) {
      expect(CLIENT_CHANNEL_LABEL[value].length).toBeGreaterThan(0);
      expect(CLIENT_CHANNEL_HINT[value].length).toBeGreaterThan(0);
    }
  });

  it('and no two labels are the same', () => {
    const labels = CLIENT_CHANNEL_PREFERENCES.map((value) => CLIENT_CHANNEL_LABEL[value]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/**
 * The preview IS the decision, rendered — not a description of it. The bug it
 * replaces was a paragraph built from the phone number alone, which read "📱 A
 * text" whether the checkbox was ticked or not.
 */
describe('the sentence shown next to the button', () => {
  const what = 'It carries a link to approve the quote.';

  it('names the number a text is going to', () => {
    const preview = clientChannelPreview(SARAH, { what, formatPhone: () => '248-555-0117' });
    expect(preview.icon).toBe('📱');
    expect(preview.headline).toBe('A text to 248-555-0117');
    expect(preview.detail).toContain(what);
    expect(preview.detail).toContain('STOP');
    expect(preview.tone).toBe('ok');
  });

  it('names the address an email is going to', () => {
    const preview = clientChannelPreview({ email: 'sarah@example.com' }, { what });
    expect(preview.icon).toBe('📧');
    expect(preview.headline).toBe('An email to sarah@example.com');
    expect(preview.detail).toContain('No mobile on file');
  });

  it('says WHY it is an email when that was the contractor’s choice', () => {
    const preview = clientChannelPreview({ ...SARAH, preference: 'email' }, { what });
    expect(preview.detail).toContain('set to email only');
    expect(preview.detail).not.toContain('No mobile on file');
  });

  it('turns the switch off in the sentence, not just in the checkbox', () => {
    const preview = clientChannelPreview({ ...SARAH, preference: 'off' }, { what });
    expect(preview.icon).toBe('⚠');
    expect(preview.headline).toBe('Nothing is sent automatically');
    expect(preview.detail).toContain('switched off');
    expect(preview.tone).toBe('warn');
  });

  // "We can't send it" with no next step leaves a job half-done. Every warn
  // branch ends on something the owner can still do.
  it('always ends on an action when nothing goes out', () => {
    const offs: ClientChannelPreference[] = ['off', 'sms', 'email'];
    for (const preference of offs) {
      const preview = clientChannelPreview({ preference }, { what, fallbackAction: 'Copy the link and send it yourself.' });
      expect(preview.tone).toBe('warn');
      expect(preview.detail).toContain('Copy the link and send it yourself.');
    }
  });

  it('has a distinct sentence for every reason it cannot send', () => {
    const details = [
      clientChannelPreview({ ...SARAH, preference: 'off' }, { what }).detail,
      clientChannelPreview({ ...SARAH, optedOut: true }, { what }).detail,
      clientChannelPreview({ email: 'a@b.c', preference: 'sms' }, { what }).detail,
      clientChannelPreview({ phone: '+12485550117', preference: 'email' }, { what }).detail,
      clientChannelPreview({}, { what }).detail,
    ];
    expect(new Set(details).size).toBe(details.length);
  });
});

/**
 * A badge on every record saying "nothing unusual here" trains people to stop
 * reading badges, so the chip is null for the ordinary case and only that one.
 */
describe('the chip on a job header', () => {
  it('says nothing about a textable customer with a mobile', () => {
    expect(clientChannelChip(SARAH)).toBeNull();
  });

  it('speaks up for every other state', () => {
    const states = [
      { ...SARAH, preference: 'off' as const },
      { ...SARAH, optedOut: true },
      { ...SARAH, preference: 'email' as const },
      { email: 'a@b.c', preference: 'sms' as const },
      { phone: '+12485550117', preference: 'email' as const },
      {},
    ];
    for (const state of states) {
      const chip = clientChannelChip(state);
      expect(chip, JSON.stringify(state)).not.toBeNull();
      expect(chip!.label.length).toBeGreaterThan(0);
    }
  });

  it('warns rather than informs when a message cannot be delivered', () => {
    expect(clientChannelChip({ ...SARAH, preference: 'off' })!.tone).toBe('warn');
    expect(clientChannelChip({})!.tone).toBe('warn');
    // Email-only is a working configuration, not a problem.
    expect(clientChannelChip({ ...SARAH, preference: 'email' })!.tone).toBe('ok');
  });
});

describe('canTextClient, the question most callers actually have', () => {
  it('agrees with resolveClientChannel every time', () => {
    const contacts = [
      SARAH,
      { ...SARAH, preference: 'off' as const },
      { ...SARAH, preference: 'email' as const },
      { ...SARAH, optedOut: true },
      { email: 'a@b.c' },
      {},
    ];
    for (const contact of contacts) {
      expect(canTextClient(contact)).toBe(resolveClientChannel(contact).channel === 'sms');
    }
  });
});
