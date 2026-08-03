import { describe, expect, it } from 'vitest';
import { getSiteContent, getPublishedChatButton } from '@/lib/site-content';

describe('chatButton content parsing', () => {
  it('is off by default, so an existing site never sprouts one on redeploy', () => {
    expect(getSiteContent({}).chatButton.enabled).toBe(false);
    expect(getSiteContent(null).chatButton.enabled).toBe(false);
  });

  it('defaults to SMS, which works on every phone', () => {
    expect(getSiteContent({}).chatButton.channel).toBe('sms');
  });

  it('falls back to SMS for a channel it does not support', () => {
    expect(getSiteContent({ chatButton: { channel: 'messenger' } }).chatButton.channel).toBe('sms');
    expect(getSiteContent({ chatButton: { channel: 42 } }).chatButton.channel).toBe('sms');
  });

  it('keeps a supported channel', () => {
    expect(getSiteContent({ chatButton: { channel: 'whatsapp' } }).chatButton.channel).toBe('whatsapp');
  });

  it('caps the greeting so a compose window does not open mid-scroll', () => {
    const long = 'x'.repeat(400);
    expect(getSiteContent({ chatButton: { greeting: long } }).chatButton.greeting).toHaveLength(160);
  });

  it('survives a garbage blob without throwing', () => {
    expect(getSiteContent({ chatButton: 'nope' }).chatButton.enabled).toBe(false);
    expect(getSiteContent({ chatButton: [] }).chatButton.channel).toBe('sms');
  });
});

describe('getPublishedChatButton', () => {
  const on = { chatButton: { enabled: true } };

  it('uses the site phone when no number is set', () => {
    const r = getPublishedChatButton(on, '313-555-0100', 'BrokePipes')!;
    expect(r.href).toContain('sms:3135550100');
    expect(r.href).toContain('?&body='); // the both-platforms separator
  });

  it('vanishes with the phone when the owner has hidden it', () => {
    // withPublicContact nulls site.phone on public routes; the button follows.
    expect(getPublishedChatButton(on, null, 'BrokePipes')).toBeNull();
  });

  it('is null when the owner has not turned it on', () => {
    expect(getPublishedChatButton({}, '313-555-0100', 'BrokePipes')).toBeNull();
  });

  it('adds the country code for WhatsApp', () => {
    const r = getPublishedChatButton(
      { chatButton: { enabled: true, channel: 'whatsapp' } }, '313-555-0100', 'BrokePipes',
    )!;
    expect(r.href).toContain('https://wa.me/13135550100');
  });
});
