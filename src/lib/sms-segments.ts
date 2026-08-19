/**
 * How many carrier segments a message body actually costs.
 *
 * WHY THIS IS NOT `Math.ceil(length / 160)`. The price book defines a text
 * credit as one carrier SMS segment, so this function decides what a workspace
 * is billed. Three things make the naive version wrong, and all three are
 * ordinary in contractor messages rather than exotic:
 *
 *  - **A single non-GSM character re-encodes the whole message.** One emoji, one
 *    curly quote pasted from Word, one accented name, and the segment size drops
 *    from 160 to 70. A 150-character message goes from 1 segment to 3.
 *  - **Concatenated messages are smaller than single ones.** Multi-part SMS
 *    spends 7 septets per part on a user-data header, so the boundary is 153,
 *    not 160 — and 67, not 70. A 161-character message is 2 segments, not
 *    "160 plus 1".
 *  - **Some GSM characters cost two septets.** `^ { } \ [ ~ ] | €` are sent as
 *    an escape plus a character. A message of 100 curly braces is 200 septets.
 *
 * And the boundary rule that is easiest to miss: a two-unit character may not be
 * split across a segment boundary. If it will not fit in what remains, the whole
 * character moves to the next segment and the gap is padded. Counting units and
 * dividing gets this wrong by one segment on messages that land near a boundary,
 * which is exactly where a customer is most likely to be looking.
 *
 * Pure, dependency-free, and no I/O, so both the billing path and the composer
 * can use it — the number a contractor is warned about and the number they are
 * charged should not come from two different pieces of arithmetic.
 */

/**
 * GSM 03.38 default alphabet, minus the ESC at 0x1B which is not a character.
 *
 * Written out rather than generated because it IS the specification: a table
 * derived from a rule would need the rule to be right, and this is short enough
 * to check against the standard by eye.
 */
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789'
  + ':;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** GSM 03.38 extension table: sent as ESC + char, so two septets each. */
const GSM_EXTENDED = '\f^{}\\[~]|€';

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

/** Septets in a single GSM-7 message. */
const GSM_SINGLE = 160;
/** Septets per part once a GSM-7 message is concatenated: 160 less the 7-septet header. */
const GSM_CONCATENATED = 153;
/** UTF-16 code units in a single UCS-2 message. */
const UCS2_SINGLE = 70;
/** UTF-16 code units per part once a UCS-2 message is concatenated. */
const UCS2_CONCATENATED = 67;

export type SmsEncoding = 'gsm-7' | 'ucs-2';

export type SmsSegmentation = Readonly<{
  encoding: SmsEncoding;
  /** Septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  /** Carrier segments, and therefore text credits. Never below 1. */
  segments: number;
  /** Units still free in the last segment. Useful for a live composer hint. */
  unitsRemaining: number;
}>;

/** True when every character can be carried by the GSM-7 alphabet. */
export function isGsm7(body: string): boolean {
  for (const character of body) {
    if (!BASIC.has(character) && !EXTENDED.has(character)) return false;
  }
  return true;
}

/**
 * The cost of each character, in order.
 *
 * Iterating with `for...of` walks code POINTS, so an emoji outside the basic
 * multilingual plane arrives as one character and is correctly charged the two
 * UTF-16 code units it occupies — rather than as two lone surrogates, which is
 * what indexing by `.length` would produce.
 */
function unitCosts(body: string, encoding: SmsEncoding): number[] {
  const costs: number[] = [];
  for (const character of body) {
    costs.push(encoding === 'gsm-7'
      ? (EXTENDED.has(character) ? 2 : 1)
      : character.length);
  }
  return costs;
}

export function segmentSms(body: string): SmsSegmentation {
  const encoding: SmsEncoding = isGsm7(body) ? 'gsm-7' : 'ucs-2';
  const single = encoding === 'gsm-7' ? GSM_SINGLE : UCS2_SINGLE;
  const concatenated = encoding === 'gsm-7' ? GSM_CONCATENATED : UCS2_CONCATENATED;

  const costs = unitCosts(body, encoding);
  const units = costs.reduce((total, cost) => total + cost, 0);

  // A message that is sent occupies a segment whatever its length, so an empty
  // body is one segment rather than zero. Nothing should be sending one, but a
  // billing function that can return zero invites a caller that reserves zero.
  if (units <= single) {
    return Object.freeze({ encoding, units, segments: 1, unitsRemaining: single - units });
  }

  // Pack greedily, moving a two-unit character wholly into the next segment when
  // it will not fit. This is the step that dividing cannot express.
  let segments = 1;
  let used = 0;
  for (const cost of costs) {
    if (used + cost > concatenated) {
      segments += 1;
      used = cost;
    } else {
      used += cost;
    }
  }

  return Object.freeze({
    encoding,
    units,
    segments,
    unitsRemaining: concatenated - used,
  });
}

/** Segments alone, for callers that do not need the rest. */
export function smsSegmentCount(body: string): number {
  return segmentSms(body).segments;
}
