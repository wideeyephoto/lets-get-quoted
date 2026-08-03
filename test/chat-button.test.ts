import { describe, expect, it } from 'vitest';
import {
  phoneDigits, internationalDigits, chatHref, resolveChatButton,
  defaultChatGreeting, chatNumberProblem, isChatChannel, type ChatButtonConfig,
} from '@/lib/chat-button';

function config(over: Partial<ChatButtonConfig> = {}): ChatButtonConfig {
  return { enabled: true, channel: 'sms', number: '', label: '', greeting: '', ...over };
}

describe('phone normalising', () => {
  it('collapses every way a contractor writes their own number', () => {
    for (const written of ['(313) 555-0100', '313-555-0100', '313.555.0100', '+1 313 555 0100', '13135550100']) {
      expect(phoneDigits(written).endsWith('3135550100')).toBe(true);
    }
  });

  it('adds a US country code to a 10-digit number for WhatsApp', () => {
    // Nobody writes their own number with a country code, and wa.me/3135550100
    // is not a real account — it fails silently on the visitor's phone.
    expect(internationalDigits('(313) 555-0100')).toBe('13135550100');
  });

  it('leaves an already-international number alone', () => {
    expect(internationalDigits('+1 313 555 0100')).toBe('13135550100');
    expect(internationalDigits('+44 20 7946 0958')).toBe('442079460958');
  });
});

describe('chatHref', () => {
  it('builds a wa.me link with an encoded message', () => {
    expect(chatHref('whatsapp', '3135550100', 'Hi BrokePipes, I need a quote'))
      .toBe('https://wa.me/13135550100?text=Hi%20BrokePipes%2C%20I%20need%20a%20quote');
  });

  it('uses ?&body= for SMS, which is the only form that works on both platforms', () => {
    // iOS wants the body after '&', Android after '?'. '?&' satisfies both.
    // Getting this wrong drops the message on half of all phones — and on
    // whichever half the contractor doesn't own, so they never see it.
    const href = chatHref('sms', '3135550100', 'Hi there')!;
    expect(href).toBe('sms:3135550100?&body=Hi%20there');
    expect(href).toContain('?&body=');
    expect(href).not.toMatch(/\?body=/);
    expect(href).not.toContain(';body=');
  });

  it('keeps the + on an international SMS number so it is not dialled locally', () => {
    expect(chatHref('sms', '+44 20 7946 0958', '')).toBe('sms:+442079460958');
  });

  it('omits the query entirely when there is no greeting', () => {
    expect(chatHref('sms', '3135550100', '   ')).toBe('sms:3135550100');
    expect(chatHref('whatsapp', '3135550100', '')).toBe('https://wa.me/13135550100');
  });

  it('returns null when there is no number to dial', () => {
    expect(chatHref('sms', '', 'hi')).toBeNull();
    expect(chatHref('whatsapp', 'not a phone', 'hi')).toBeNull();
  });
});

describe('resolveChatButton', () => {
  it('falls back to the site phone', () => {
    const r = resolveChatButton(config(), '313-555-0100', 'BrokePipes')!;
    expect(r.href).toContain('sms:3135550100');
    expect(r.label).toBe('Text us');
  });

  it('prefers an explicitly entered number over the site phone', () => {
    const r = resolveChatButton(config({ number: '248-555-0199' }), '313-555-0100', 'BrokePipes')!;
    expect(r.href).toContain('2485550199');
  });

  it('disappears when the owner has hidden their phone and set no number', () => {
    // withPublicContact nulls site.phone on public routes when it's hidden, so
    // the button goes with it rather than re-exposing the number.
    expect(resolveChatButton(config(), null, 'BrokePipes')).toBeNull();
  });

  it('still shows an explicitly entered number when the site phone is hidden', () => {
    const r = resolveChatButton(config({ number: '248-555-0199' }), null, 'BrokePipes');
    expect(r).not.toBeNull();
  });

  it('is null when disabled', () => {
    expect(resolveChatButton(config({ enabled: false }), '313-555-0100', 'BrokePipes')).toBeNull();
  });

  it('is null for a number too short to be real', () => {
    expect(resolveChatButton(config({ number: '555-0100' }), null, 'BrokePipes')).toBeNull();
  });

  it('names the business in the default greeting, so a reply has context', () => {
    const r = resolveChatButton(config({ channel: 'whatsapp' }), '3135550100', 'BrokePipes')!;
    expect(decodeURIComponent(r.href)).toContain('Hi BrokePipes');
  });

  it('uses the owner greeting and label when set', () => {
    const r = resolveChatButton(
      config({ label: 'Message the team', greeting: 'Emergency?' }), '3135550100', 'BrokePipes',
    )!;
    expect(r.label).toBe('Message the team');
    expect(decodeURIComponent(r.href)).toContain('Emergency?');
  });

  it('falls back to SMS for a channel that is not one of ours', () => {
    const r = resolveChatButton(config({ channel: 'telegram' as never }), '3135550100', 'BrokePipes')!;
    expect(r.channel).toBe('sms');
  });
});

describe('validation shown in the builder', () => {
  it('accepts a normal number', () => {
    expect(chatNumberProblem('sms', '(313) 555-0100')).toBe('');
    expect(chatNumberProblem('whatsapp', '+1 313 555 0100')).toBe('');
  });

  it('rejects empty, too short and impossibly long', () => {
    expect(chatNumberProblem('sms', '')).toContain('Add a phone number');
    expect(chatNumberProblem('sms', '555-0100')).toContain('too short');
    expect(chatNumberProblem('sms', '1234567890123456')).toContain('too long');
  });

  it('knows its own channels', () => {
    expect(isChatChannel('sms')).toBe(true);
    expect(isChatChannel('whatsapp')).toBe(true);
    expect(isChatChannel('messenger')).toBe(false);
  });

  it('handles a business with no name', () => {
    expect(defaultChatGreeting('')).toBe("Hi, I'd like a quote for ");
  });
});
