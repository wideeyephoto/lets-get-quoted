/**
 * Turning a texted URL into something a person can read.
 *
 * Every automated message this app sends carries a link, and a text bubble
 * renders the raw thing: 74 characters of https://letsgetquoted.com/q/8f2a1c…
 * with no space or hyphen in it. `overflow-wrap: anywhere` on the bubble stops
 * that from blowing the column open, but the cost lands somewhere worse — on a
 * 320px phone one link becomes a five-line brick of hex, and a thread of quote
 * sends reads as a wall of gibberish with the actual sentences buried in it.
 *
 * So the bubble shows what the link IS — host plus one path segment — and the
 * anchor still carries the whole thing in href and title. Nothing is lost; the
 * width is just spent on the message instead of on a token nobody reads.
 *
 * Pure and DOM-free on purpose: the caller renders the segments, so this is
 * testable in the node environment the rest of the suite runs in, and it can
 * never inject markup — a segment is data, not HTML.
 */

export type MessageSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; href: string; label: string };

// Deliberately not a "smart" URL regex. It matches an explicit scheme only, so
// a sentence like "call me at 3pm" can never become a link, and it stops at
// whitespace — the trailing-punctuation trim below does the rest.
const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

// A URL at the end of a sentence swallows the full stop, and one in brackets
// swallows the bracket. Both make a dead link out of a live one.
const TRAILING_JUNK = /[.,;:!?)\]}>'"…]+$/;

/**
 * "letsgetquoted.com/q/8f2a…" — enough to tell a quote link from a pay link.
 *
 * The host is the part that says whose link it is; the first path segment is
 * the part that says what kind. Everything after that is an opaque id, and an
 * id truncated at 12 characters is no more readable than one truncated at 40.
 */
export function linkLabel(href: string, maxLength = 34): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href.length > maxLength ? `${href.slice(0, maxLength - 1)}…` : href;
  }

  const host = url.host.replace(/^www\./i, '');
  const segments = url.pathname.split('/').filter(Boolean);
  // No path at all: the host IS the whole link, and there is nothing to elide.
  if (segments.length === 0) return url.search || url.hash ? `${host}/…` : host;

  const head = segments[0];
  const shortened = segments.length > 1 || url.search || url.hash;
  let label = `${host}/${head}${shortened ? '/…' : ''}`;

  // A long first segment (a slug, not an id) can still overrun on its own.
  if (label.length > maxLength) {
    const room = Math.max(4, maxLength - host.length - 3);
    label = `${host}/${head.slice(0, room)}…`;
  }
  return label;
}

/**
 * Split a message body into plain runs and links, in order.
 *
 * Always returns at least one segment for a non-empty body, and never returns
 * an empty text segment — the caller maps straight over this, and a blank
 * `<span>` between two links is a stray gap in the bubble.
 */
export function linkifyMessage(body: string | null | undefined, maxLength = 34): MessageSegment[] {
  const text = body ?? '';
  if (!text) return [];

  const out: MessageSegment[] = [];
  let cursor = 0;
  // Fresh regex per call: /g carries lastIndex between calls and a shared one
  // would skip links in every other message.
  const pattern = new RegExp(URL_PATTERN.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_JUNK, '');
    // Punctuation-only match — nothing usable is left, so leave it as text.
    if (!/^https?:\/\/[^/]/i.test(trimmed)) continue;

    if (match.index > cursor) out.push({ kind: 'text', text: text.slice(cursor, match.index) });
    out.push({ kind: 'link', href: trimmed, label: linkLabel(trimmed, maxLength) });
    cursor = match.index + trimmed.length;
    // Rewind so the punctuation we trimmed is picked up as text, not skipped.
    pattern.lastIndex = cursor;
  }

  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor) });
  return out;
}
