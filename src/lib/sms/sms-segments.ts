/**
 * Carrier SMS Segment Calculator
 * Accurately determines encoding (GSM-7 vs UCS-2) and calculates billable segments.
 *
 * In carrier SMS (Twilio, SignalWire, etc.):
 * - If all characters belong to the GSM 03.38 alphabet:
 *   - Single message: up to 160 characters (1 segment)
 *   - Multi-part message: 153 characters per segment (due to 7-byte UDH)
 *   - GSM extended characters (^ { } \ [ ~ ] | €) count as 2 chars.
 * - If ANY character requires UCS-2 (Unicode, emojis like ☀️, 🌧️, 🚨, 📍, curly quotes ’):
 *   - Single message: up to 70 characters (1 segment)
 *   - Multi-part message: 67 characters per segment (due to 6-byte UDH)
 */

// GSM 03.38 Basic Character Set
const GSM_7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// GSM 03.38 Extended Character Set (each takes 2 GSM-7 characters)
const GSM_7_EXTENDED = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€']);

const GSM_7_BASIC_SET = new Set(GSM_7_BASIC.split(''));

export type SmsSegmentCalculation = {
  charCount: number;
  effectiveCharCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  segmentCount: number;
  maxCharsCurrentSegment: number;
  charsRemainingInSegment: number;
  containsUnicode: boolean;
  hasNonGsmChars: boolean;
  nonGsmChars: string[];
};

export function calculateSmsSegments(text: string): SmsSegmentCalculation {
  if (!text) {
    return {
      charCount: 0,
      effectiveCharCount: 0,
      encoding: 'GSM-7',
      segmentCount: 0,
      maxCharsCurrentSegment: 160,
      charsRemainingInSegment: 160,
      containsUnicode: false,
      hasNonGsmChars: false,
      nonGsmChars: [],
    };
  }

  let isGsm7 = true;
  let gsmEffectiveLength = 0;
  const nonGsmCharsFound: string[] = [];

  // Iterate over Unicode code points (properly handling surrogate pairs for emojis)
  for (const char of text) {
    if (GSM_7_BASIC_SET.has(char)) {
      gsmEffectiveLength += 1;
    } else if (GSM_7_EXTENDED.has(char)) {
      gsmEffectiveLength += 2;
    } else {
      isGsm7 = false;
      if (!nonGsmCharsFound.includes(char) && nonGsmCharsFound.length < 5) {
        nonGsmCharsFound.push(char);
      }
    }
  }

  const codePointLength = Array.from(text).length;
  // UTF-16 code units (what UCS-2 counts)
  const utf16Length = text.length;

  if (isGsm7) {
    const singleLimit = 160;
    const multiLimit = 153;
    const segmentCount = gsmEffectiveLength <= singleLimit ? 1 : Math.ceil(gsmEffectiveLength / multiLimit);
    const maxCharsCurrentSegment = segmentCount === 1 ? singleLimit : segmentCount * multiLimit;
    const charsRemainingInSegment = maxCharsCurrentSegment - gsmEffectiveLength;

    return {
      charCount: codePointLength,
      effectiveCharCount: gsmEffectiveLength,
      encoding: 'GSM-7',
      segmentCount,
      maxCharsCurrentSegment,
      charsRemainingInSegment: Math.max(0, charsRemainingInSegment),
      containsUnicode: false,
      hasNonGsmChars: false,
      nonGsmChars: [],
    };
  }

  // UCS-2 encoding
  const singleLimit = 70;
  const multiLimit = 67;
  const segmentCount = utf16Length <= singleLimit ? 1 : Math.ceil(utf16Length / multiLimit);
  const maxCharsCurrentSegment = segmentCount === 1 ? singleLimit : segmentCount * multiLimit;
  const charsRemainingInSegment = maxCharsCurrentSegment - utf16Length;

  return {
    charCount: codePointLength,
    effectiveCharCount: utf16Length,
    encoding: 'UCS-2',
    segmentCount,
    maxCharsCurrentSegment,
    charsRemainingInSegment: Math.max(0, charsRemainingInSegment),
    containsUnicode: true,
    hasNonGsmChars: true,
    nonGsmChars: nonGsmCharsFound,
  };
}
