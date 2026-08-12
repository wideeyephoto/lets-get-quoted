/**
 * HOW WE MAY MESSAGE THIS CUSTOMER, in one place.
 *
 * Three separate facts used to decide whether a text went out, and no two
 * screens agreed on how to combine them:
 *
 *   - whether there is a mobile number on file
 *   - whether that number has replied STOP        (sms_consent.opted_out)
 *   - whether the contractor wants us to text this person at all
 *
 * The third had nowhere to live. The quote form's "Text quote and sign-off
 * link" checkbox was the only place it was ever asked, it was never stored, and
 * it died with the request — so a contractor who deliberately unticked it got
 * the customer texted anyway by the next automation that found a phone number.
 * Meanwhile the paragraph under that checkbox, the one that told the owner what
 * was about to happen, was hardcoded to "📱 A text" whenever a mobile existed:
 * it described the number on file, not the send, and untickng the box changed
 * nothing on screen.
 *
 * This module is the whole decision, as a pure function, so the preview and the
 * send cannot disagree — they are the same call. Everything that reaches a
 * customer about a job resolves through resolveClientChannel and gets back both
 * the channel and the reason, and the reason is what the interface says out
 * loud instead of guessing.
 *
 * No IO. The opted-out flag is passed in by whoever already knows it
 * (isPhoneOptedOut, or a sweep that batch-loaded consent rows), because this
 * module is imported by client components that must not pull in the admin
 * client.
 */

/** What a send would actually use. 'none' means nothing goes out. */
export type ClientChannel = 'sms' | 'email' | 'none';

/**
 * What the CONTRACTOR has said about messaging this customer.
 *
 * 'auto' is the default and means "use whatever reaches them" — it is not a
 * decision, it is the absence of one, which is why it is distinct from 'sms'.
 * A customer explicitly set to 'sms' with no mobile on file is a mistake worth
 * surfacing; one on 'auto' with no mobile is just an email customer.
 */
export type ClientChannelPreference = 'auto' | 'sms' | 'email' | 'off';

export const CLIENT_CHANNEL_PREFERENCES: readonly ClientChannelPreference[] = ['auto', 'sms', 'email', 'off'] as const;

export const DEFAULT_CLIENT_CHANNEL_PREFERENCE: ClientChannelPreference = 'auto';

/** For a <select>. Says what happens, not what it is called. */
export const CLIENT_CHANNEL_LABEL: Record<ClientChannelPreference, string> = {
  auto: 'Text, or email if there’s no mobile',
  sms: 'Text only',
  email: 'Email only',
  off: 'No automatic messages',
};

/** The one-line explanation under the picker. */
export const CLIENT_CHANNEL_HINT: Record<ClientChannelPreference, string> = {
  auto: 'The usual. Texts go to their mobile; without one we fall back to email.',
  sms: 'Never email this customer automatically — if there’s no mobile, nothing is sent.',
  email: 'Never text this customer. Quotes, reminders and receipts go by email.',
  off: 'Nothing automatic reaches them. You send everything by hand.',
};

export function normalizeClientChannelPreference(value: unknown): ClientChannelPreference {
  return (CLIENT_CHANNEL_PREFERENCES as readonly string[]).includes(value as string)
    ? (value as ClientChannelPreference)
    : DEFAULT_CLIENT_CHANNEL_PREFERENCE;
}

/**
 * Why the channel came out the way it did.
 *
 * Carried alongside the channel because 'none' has four completely different
 * fixes — add a number, ask them to opt back in, change the setting, or nothing
 * at all — and an interface that says only "not sent" sends the owner hunting.
 */
export type ClientChannelReason =
  /** The contractor turned automatic messages off for this customer. */
  | 'preference_off'
  /** This number replied STOP, and nothing else can reach them. */
  | 'opted_out'
  /** Set to text-only, no mobile on file. */
  | 'no_mobile'
  /** Set to email-only, no email on file. */
  | 'no_email'
  /** Nothing on file at all. */
  | 'no_contact'
  /** Going out on the channel the contractor chose. */
  | 'preferred'
  /** Going out on the only channel available, no preference expressed. */
  | 'fallback'
  /** They replied STOP, so the text became an email. */
  | 'sms_blocked'
  /** Going out by text, the default when a mobile exists. */
  | 'default';

export type ClientChannelResolution = {
  channel: ClientChannel;
  reason: ClientChannelReason;
};

/**
 * Whether the customer asked for this message or we decided to send it.
 *
 * The distinction exists because STOP does not mean the same thing to both.
 *
 * 'requested' is the quote they asked for, the invoice they owe, the receipt
 * for what they just paid — a direct answer to something they did. STOP means
 * "stop texting me", so the text becomes an email and the document still
 * arrives. Refusing to send someone their own invoice because they once replied
 * STOP to a text would be reading a channel preference as a boycott.
 *
 * 'automatic' is everything we send off our own bat: choice reminders, the
 * morning-of confirmation, the review ask, re-engagement. Here STOP is a full
 * stop. Someone who told a business to leave them alone and then received an
 * email instead has been answered with a loophole, and it is the rule the
 * choice-reminder sweep already follows.
 *
 * Defaults to 'automatic' — the quiet one — so a caller that has not thought
 * about it cannot accidentally pursue an opted-out customer on another channel.
 */
export type ClientMessageKind = 'requested' | 'automatic';

export type ClientContact = {
  phone?: string | null;
  email?: string | null;
  preference?: ClientChannelPreference | null;
  /** True when this mobile has replied STOP for this account. */
  optedOut?: boolean;
  /** Defaults to 'automatic'. See ClientMessageKind. */
  kind?: ClientMessageKind;
};

function clean(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text.length > 0 ? text : null;
}

/**
 * The decision. Pure, total, and the only place the order of these rules lives.
 *
 * The contractor's switch is read FIRST: 'off' means off, and no amount of
 * contact details or opt-in status overrides somebody's explicit "don't".
 *
 * Then STOP, whose reach depends on what is being sent — see ClientMessageKind.
 * For an automatic message it ends the matter. For one the customer asked for
 * it removes the phone from consideration and nothing more, so an emailed copy
 * still goes; a customer set to text-only gets nothing, because there is no
 * channel left that anyone consented to.
 */
export function resolveClientChannel(contact: ClientContact): ClientChannelResolution {
  const email = clean(contact.email);
  const preference = normalizeClientChannelPreference(contact.preference ?? undefined);
  const kind: ClientMessageKind = contact.kind ?? 'automatic';

  if (preference === 'off') return { channel: 'none', reason: 'preference_off' };
  if (contact.optedOut && kind === 'automatic') return { channel: 'none', reason: 'opted_out' };

  // An opted-out number is not a number we have, for every purpose below.
  const phone = contact.optedOut ? null : clean(contact.phone);

  if (preference === 'sms') {
    if (phone) return { channel: 'sms', reason: 'preferred' };
    return { channel: 'none', reason: contact.optedOut ? 'opted_out' : 'no_mobile' };
  }
  if (preference === 'email') {
    return email ? { channel: 'email', reason: 'preferred' } : { channel: 'none', reason: 'no_email' };
  }

  if (phone) return { channel: 'sms', reason: 'default' };
  if (email) return { channel: 'email', reason: contact.optedOut ? 'sms_blocked' : 'fallback' };
  return { channel: 'none', reason: contact.optedOut ? 'opted_out' : 'no_contact' };
}

/** Shorthand for the common "can I text this person" question. */
export function canTextClient(contact: ClientContact): boolean {
  return resolveClientChannel(contact).channel === 'sms';
}

/* --- the same four values, as two switches --------------------------------- */

/**
 * TWO BUTTONS, NOT A DROPDOWN.
 *
 * The four preferences are really two independent yes/nos — may we text them,
 * may we email them — and a <select> reading "Text, or email if there's no
 * mobile" makes somebody parse a sentence to answer a question they already
 * know the answer to. Two toggles say it at a glance and set it in one tap.
 *
 * The mapping is exact and lossless, so nothing about the stored value, the
 * column, or resolveClientChannel changes:
 *
 *   Text ✓  Email ✓  →  'auto'   text first, email if the text can't reach them
 *   Text ✓  Email ✗  →  'sms'    never email this customer
 *   Text ✗  Email ✓  →  'email'  never text this customer
 *   Text ✗  Email ✗  →  'off'    nothing automatic at all
 */
export type ChannelToggles = { sms: boolean; email: boolean };

export function togglesForPreference(preference: ClientChannelPreference): ChannelToggles {
  if (preference === 'off') return { sms: false, email: false };
  if (preference === 'sms') return { sms: true, email: false };
  if (preference === 'email') return { sms: false, email: true };
  return { sms: true, email: true };
}

export function preferenceForToggles(toggles: ChannelToggles): ClientChannelPreference {
  if (toggles.sms && toggles.email) return 'auto';
  if (toggles.sms) return 'sms';
  if (toggles.email) return 'email';
  return 'off';
}

/**
 * THE TEXT WENT OUT AND BOUNCED. NOW WHAT?
 *
 * A dead number used to mean a dead quote. resolveClientChannel picks ONE
 * channel up front, and a carrier rejection after that point left the send
 * recorded as "failed" with a perfectly good email address sitting unused on
 * the same row — the customer never learned a quote existed, and the only
 * signal was a banner the contractor had to notice and act on.
 *
 * So the decision has a second half. This answers "the SMS we chose has just
 * thrown — is there anywhere else this may go?", and the answer is no unless
 * the contractor left email switched on. Somebody set to text-only said never
 * email this customer, and a failure is not permission.
 *
 * Deliberately NOT a general retry ladder: it fires once, only after a real
 * send attempt failed, and only for the channel that failed. Everything else
 * still resolves exactly once.
 */
export function smsFailureFallback(contact: ClientContact): { channel: 'email'; to: string } | null {
  const preference = normalizeClientChannelPreference(contact.preference ?? undefined);
  if (preference === 'off' || preference === 'sms') return null;
  const email = clean(contact.email);
  return email ? { channel: 'email', to: email } : null;
}

export type ClientChannelPreview = {
  /** '📱' | '📧' | '⚠' — the shape of the line, for styling and for screen order. */
  icon: string;
  /** "A text to 248-555-0117" */
  headline: string;
  /** The rest of the sentence, including what to do about it when nothing sends. */
  detail: string;
  tone: 'ok' | 'warn';
};

/**
 * The same decision, as the sentence shown next to the button.
 *
 * `what` names the thing being sent so one preview component serves the quote
 * form, the scheduling card and anything else — "A text … with their quote" vs
 * "… with three dates to choose from".
 *
 * `formatPhone` is injected rather than imported so this module stays free of
 * @/lib/phone, which reaches into server-only code. Callers pass
 * formatPhoneDashes.
 */
export function clientChannelPreview(
  contact: ClientContact,
  options: { what: string; fallbackAction?: string; formatPhone?: (phone: string) => string },
): ClientChannelPreview {
  const { channel, reason } = resolveClientChannel(contact);
  const phone = clean(contact.phone);
  const email = clean(contact.email);
  const formatPhone = options.formatPhone ?? ((value: string) => value);
  // What the owner can still do when nothing goes out automatically. Every
  // 'none' branch ends on an action, because "we can't send it" on its own
  // leaves a job half-done with no next step named.
  const fallback = options.fallbackAction ?? 'You’ll get a link to copy and send yourself.';

  if (channel === 'sms') {
    return {
      icon: '📱',
      headline: `A text to ${formatPhone(phone as string)}`,
      detail: `${options.what} They can reply STOP to opt out.`,
      tone: 'ok',
    };
  }

  if (channel === 'email') {
    const why = reason === 'preferred'
      ? 'This customer is set to email only.'
      : reason === 'sms_blocked'
        ? 'Their mobile replied STOP, so it goes by email instead.'
        : 'No mobile on file.';
    return { icon: '📧', headline: `An email to ${email}`, detail: `${options.what} ${why}`, tone: 'ok' };
  }

  const because: Record<ClientChannelReason, string> = {
    preference_off: 'Messages are switched off for this customer.',
    opted_out: 'This number replied STOP, and there’s no email to fall back to.',
    no_mobile: 'This customer is set to text only, and there’s no mobile on file.',
    no_email: 'This customer is set to email only, and there’s no email on file.',
    no_contact: 'There’s no mobile or email on file.',
    // Unreachable for channel 'none', but the record is exhaustive so adding a
    // reason later cannot silently produce an empty sentence.
    preferred: 'Nothing will be sent.',
    fallback: 'Nothing will be sent.',
    sms_blocked: 'Nothing will be sent.',
    default: 'Nothing will be sent.',
  };

  return { icon: '⚠', headline: 'Nothing is sent automatically', detail: `${because[reason]} ${fallback}`, tone: 'warn' };
}

/**
 * The short version, for a chip on a lead or job header.
 *
 * Returns null on the ordinary case — a customer we text, with a mobile, who
 * has not opted out. A badge on every record for "nothing unusual here" is
 * noise that trains people to stop reading badges.
 */
export function clientChannelChip(contact: ClientContact): { label: string; tone: 'ok' | 'warn' } | null {
  const { channel, reason } = resolveClientChannel(contact);
  if (channel === 'sms' && reason === 'default') return null;
  if (reason === 'preference_off') return { label: '🔕 No automatic messages', tone: 'warn' };
  if (reason === 'opted_out') return { label: '🚫 Replied STOP', tone: 'warn' };
  if (reason === 'no_mobile') return { label: '⚠ Text only — no mobile on file', tone: 'warn' };
  if (reason === 'no_email') return { label: '⚠ Email only — no email on file', tone: 'warn' };
  if (reason === 'no_contact') return { label: '⚠ No mobile or email', tone: 'warn' };
  if (reason === 'sms_blocked') return { label: '🚫 Replied STOP — emailed instead', tone: 'warn' };
  if (channel === 'email') return { label: '📧 Email only', tone: 'ok' };
  return { label: '💬 Text only', tone: 'ok' };
}
