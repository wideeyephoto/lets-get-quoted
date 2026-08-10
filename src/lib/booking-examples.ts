/**
 * THE EXAMPLE TEXT ON A PUBLIC BOOKING FORM, AND WHY IT CANNOT BE WRITTEN DOWN.
 *
 * Every placeholder on /book used to be a literal: a Royal Oak address, a 248
 * mobile, a worn roof, a dripping kitchen faucet. All four were written while
 * looking at one contractor, and they ship to every contractor. A landscaper in
 * Lee's Summit was handing customers a form that suggested a Michigan address
 * and asked about their roof.
 *
 * That is not a cosmetic complaint. A booking page's entire job is to convince
 * somebody they have reached the right business, and details that belong to a
 * different business are the fastest way to lose that — a customer cannot tell
 * "stale placeholder" from "wrong company" or "scam".
 *
 * So: derived where the contractor has told us something (their service area,
 * their price book), and genuinely generic where they have not. Never a real
 * detail borrowed from somebody else.
 */

/**
 * 555-01xx is the block reserved for fiction precisely so nobody's real phone
 * ends up in an example. An area code — any area code — is a claim about where
 * this business is, and we already got that wrong once.
 */
export const PHONE_EXAMPLE = '(555) 123-4567';

/** Longer than this is a paragraph about coverage, not the name of a town. */
const TOWN_MAX = 32;

/**
 * The first place named in a service area, if one can be read out cleanly.
 *
 * service_area is free text an owner typed: "Lee's Summit, MO", "Lee's Summit,
 * Blue Springs and Independence", "Greater Kansas City", "within 30 miles of
 * downtown". The first segment is the best guess at a town, and anything that
 * does not look like one is refused rather than guessed at — an address example
 * reading "123 Main St, within 30 miles of downtown" is worse than no town.
 */
export function firstTown(serviceArea: string | null | undefined): string | null {
  const first = (serviceArea ?? '')
    .split(/[,;|/]| and /i)[0]
    ?.trim()
    .replace(/\s+/g, ' ');
  if (!first) return null;
  if (first.length > TOWN_MAX) return null;
  // Digits mean a radius or a zip, not a place name.
  if (/\d/.test(first)) return null;
  // "Greater", "within", "serving" — a description of an area, not its name.
  if (/^(greater|within|around|serving|all of|near)\b/i.test(first)) return null;
  return first;
}

/** "123 Main St, Lee's Summit" — their town, or no town at all. */
export function addressExample(serviceArea: string | null | undefined): string {
  const town = firstTown(serviceArea);
  return town ? `123 Main St, ${town}` : '123 Main St';
}

/**
 * What the job field should look like filled in, taken from the contractor's
 * own price book so a landscaper's form never suggests a roof.
 *
 * A placeholder models an ANSWER, not the question — somebody staring at an
 * empty box is trying to work out how much detail is wanted, and a restatement
 * of the label tells them nothing. With no price book to read there is nothing
 * trade-specific we honestly know, so it describes the shape of a good answer
 * instead of inventing a trade.
 */
export function jobExample(serviceNames: readonly string[]): string {
  const first = serviceNames.map((name) => name.trim()).filter(Boolean)[0];
  if (!first) return 'A sentence or two about what needs doing, and when you noticed it.';
  return `Looking for a quote on ${first.toLowerCase()}.`;
}

/**
 * The Quick Stop intake asks what is wrong RIGHT NOW, which is a different
 * question from "what do you need doing" — and it has no price book to read,
 * because it is offered on both booking paths. Generic on purpose, and phrased
 * as the three things the screener actually needs.
 */
export const ISSUE_EXAMPLE = 'What’s wrong, where it is, and when it started.';
