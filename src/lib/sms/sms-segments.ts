import { isGsm7, segmentSms } from '@/lib/sms-segments';

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

  const seg = segmentSms(text);
  const codePointLength = Array.from(text).length;
  const nonGsmCharsFound: string[] = [];

  if (seg.encoding === 'ucs-2') {
    for (const char of text) {
      if (!isGsm7(char) && !nonGsmCharsFound.includes(char) && nonGsmCharsFound.length < 5) {
        nonGsmCharsFound.push(char);
      }
    }
  }

  const singleLimit = seg.encoding === 'gsm-7' ? 160 : 70;
  const multiLimit = seg.encoding === 'gsm-7' ? 153 : 67;
  const maxCharsCurrentSegment = seg.segments === 1 ? singleLimit : seg.segments * multiLimit;

  return {
    charCount: codePointLength,
    effectiveCharCount: seg.units,
    encoding: seg.encoding === 'gsm-7' ? 'GSM-7' : 'UCS-2',
    segmentCount: seg.segments,
    maxCharsCurrentSegment,
    charsRemainingInSegment: Math.max(0, seg.unitsRemaining),
    containsUnicode: seg.encoding === 'ucs-2',
    hasNonGsmChars: seg.encoding === 'ucs-2',
    nonGsmChars: nonGsmCharsFound,
  };
}
