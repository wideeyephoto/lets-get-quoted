// The "Message us" button on a contractor's site.
//
// Deliberately NOT a chat widget. A hosted widget means a third-party script on
// every customer's site, a monthly bill, and an inbox the contractor has to
// remember to check. This opens the messaging app the homeowner already uses,
// and the reply lands in the same place every other text does — the
// contractor's phone.
//
// Two channels, both of which are just a URL: no SDK, no script, nothing new in
// the CSP.

export type ChatChannel = 'sms' | 'whatsapp';

export type ChatButtonConfig = {
  enabled: boolean;
  channel: ChatChannel;
  /** Overrides the site phone. Empty means "use the site's number". */
  number: string;
  /** Visible label. Empty falls back to a per-channel default. */
  label: string;
  /** Pre-filled first message. Empty sends an empty compose window. */
  greeting: string;
};

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
  sms: 'Text message',
  whatsapp: 'WhatsApp',
};

const DEFAULT_LABEL: Record<ChatChannel, string> = {
  sms: 'Text us',
  whatsapp: 'WhatsApp us',
};

export function isChatChannel(value: string): value is ChatChannel {
  return value === 'sms' || value === 'whatsapp';
}

/**
 * Digits only. Everything a contractor types — (313) 555-0100, +1 313-555-0100,
 * 313.555.0100 — collapses to the same string.
 */
export function phoneDigits(input: string): string {
  return String(input ?? '').replace(/\D+/g, '');
}

/**
 * Digits in E.164 order, without the +.
 *
 * WhatsApp identifies an account by its full international number, and a
 * contractor typing their own number will not include a country code — nobody
 * writes their own number that way. A bare 10-digit number would produce
 * wa.me/3135550100, which is not a real account, and the failure is silent: the
 * link opens WhatsApp and says the number is invalid, on the visitor's phone,
 * where the owner never sees it.
 *
 * So a 10-digit number gets a US/Canada 1. That assumption is safe HERE and
 * would not be in a different product: the app collects ZIP codes, sends via a
 * US Twilio messaging service, and prices in dollars. An 11-digit number already
 * starting with 1 is left alone, as is anything longer, which is already
 * international.
 */
export function internationalDigits(input: string): string {
  const digits = phoneDigits(input);
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

/**
 * Whether a number can work for this channel.
 *
 * `sms:` accepts whatever the dialler accepts, so any plausible number passes.
 * WhatsApp needs enough digits to be a real international number.
 */
export function chatNumberProblem(channel: ChatChannel, input: string): string {
  const digits = phoneDigits(input);
  if (!digits) return 'Add a phone number.';
  if (digits.length < 10) return 'That looks too short to be a phone number.';
  if (digits.length > 15) return 'That looks too long — an international number is at most 15 digits.';
  if (channel === 'whatsapp' && digits.length === 10) {
    // Not an error: internationalDigits() will add the 1. Said out loud so the
    // owner isn't surprised by what the link opens.
    return '';
  }
  return '';
}

/**
 * The link the button points at.
 *
 * THE SMS SEPARATOR IS THE WHOLE TRICK. `sms:` has never been consistently
 * specified: iOS wants the body after a `&`, Android wants it after a `?`, and
 * the form that works on BOTH is `?&body=` — a `?` immediately followed by `&`,
 * which each platform reads the way it wants. Using one or the other means the
 * pre-filled message silently vanishes on half the phones that visit, and it
 * vanishes on whichever half the contractor doesn't own, so they will never see
 * it themselves.
 */
export function chatHref(channel: ChatChannel, number: string, greeting: string): string | null {
  const text = String(greeting ?? '').trim();
  if (channel === 'whatsapp') {
    const digits = internationalDigits(number);
    if (!digits) return null;
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  }
  const digits = phoneDigits(number);
  if (!digits) return null;
  // Keep the leading + when the owner gave an international number, so the
  // dialler doesn't treat it as a local one.
  const dial = digits.length > 10 ? `+${digits}` : digits;
  return `sms:${dial}${text ? `?&body=${encodeURIComponent(text)}` : ''}`;
}

/** The default greeting, which names the business so a reply has context. */
export function defaultChatGreeting(businessName: string): string {
  const name = String(businessName ?? '').trim();
  return name ? `Hi ${name}, I'd like a quote for ` : "Hi, I'd like a quote for ";
}

/**
 * Everything the render needs, or null when the button shouldn't appear.
 *
 * `sitePhone` is already null on public routes when the owner has hidden their
 * number (withPublicContact), so a button falling back to it disappears with
 * it. An explicitly typed number is a separate, deliberate choice and stands on
 * its own.
 */
export function resolveChatButton(
  config: ChatButtonConfig,
  sitePhone: string | null | undefined,
  businessName: string,
): { href: string; label: string; channel: ChatChannel } | null {
  if (!config.enabled) return null;
  const channel = isChatChannel(config.channel) ? config.channel : 'sms';
  const number = config.number.trim() || String(sitePhone ?? '').trim();
  if (!number) return null;
  if (phoneDigits(number).length < 10) return null;

  const greeting = config.greeting.trim() || defaultChatGreeting(businessName);
  const href = chatHref(channel, number, greeting);
  if (!href) return null;

  return { href, label: config.label.trim() || DEFAULT_LABEL[channel], channel };
}
