import { describe, expect, it } from 'vitest';

import { isGsm7, segmentSms, smsSegmentCount } from '@/lib/sms-segments';

/**
 * A text credit is one carrier segment, so every number here is money. The cases
 * that matter are the ones an ordinary contractor message hits by accident: a
 * name with an accent, a quote pasted out of Word, an emoji in a reminder.
 */

describe('which alphabet the message lands in', () => {
  it('keeps plain business English in GSM-7', () => {
    expect(isGsm7('Hi Dave, running 20 mins late. Reply STOP to opt out.')).toBe(true);
  });

  it('keeps the accented characters GSM-7 actually carries', () => {
    // These are in the default alphabet. Treating them as UCS-2 would more than
    // double the bill for a message to anyone called Renée or Müller.
    expect(isGsm7('Renée Müller à Ø å Æ ß É ñ ö ü è ì ò ù Ç §')).toBe(true);
  });

  it('drops to UCS-2 for a curly quote pasted out of a word processor', () => {
    // The single most common way a message silently doubles in price.
    expect(isGsm7('Don’t forget')).toBe(false);
  });

  it('drops to UCS-2 for an emoji', () => {
    expect(isGsm7('On my way \u{1F44D}')).toBe(false);
  });
});

describe('GSM-7 boundaries', () => {
  it('fits 160 septets in one segment', () => {
    expect(segmentSms('x'.repeat(160))).toMatchObject({
      encoding: 'gsm-7', units: 160, segments: 1, unitsRemaining: 0,
    });
  });

  it('spends the header the moment it needs a second part', () => {
    // 161 characters is 2 segments, not "160 and a bit" - concatenation costs
    // 7 septets per part, so the boundary drops to 153.
    expect(smsSegmentCount('x'.repeat(161))).toBe(2);
    expect(smsSegmentCount('x'.repeat(306))).toBe(2);
    expect(smsSegmentCount('x'.repeat(307))).toBe(3);
  });

  it('charges two septets for the extension-table characters', () => {
    // 80 euro signs is 160 septets: still one segment, but only just.
    expect(segmentSms('€'.repeat(80))).toMatchObject({
      encoding: 'gsm-7', units: 160, segments: 1,
    });
    expect(smsSegmentCount('€'.repeat(81))).toBe(2);
    for (const character of ['^', '{', '}', '\\', '[', '~', ']', '|', '€']) {
      expect(segmentSms(character).units).toBe(2);
    }
  });

  it('never splits a two-septet character across a boundary', () => {
    // 306 septets is exactly two segments' worth, but the euro sign straddles
    // the 153 boundary, so it moves whole and the message costs a third part.
    // Dividing units by capacity reports 2 and under-bills every message shaped
    // like this one.
    const body = `${'x'.repeat(152)}€${'x'.repeat(152)}`;
    const result = segmentSms(body);
    expect(result.units).toBe(306);
    expect(Math.ceil(result.units / 153)).toBe(2);
    expect(result.segments).toBe(3);
  });
});

describe('UCS-2 boundaries', () => {
  it('fits 70 code units in one segment', () => {
    expect(segmentSms(`${'x'.repeat(69)}’`)).toMatchObject({
      encoding: 'ucs-2', units: 70, segments: 1, unitsRemaining: 0,
    });
  });

  it('drops to 67 per part once concatenated', () => {
    expect(smsSegmentCount(`${'x'.repeat(70)}’`)).toBe(2);
    expect(smsSegmentCount(`${'x'.repeat(133)}’`)).toBe(2);
    expect(smsSegmentCount(`${'x'.repeat(134)}’`)).toBe(3);
  });

  it('charges an astral emoji the two code units it occupies', () => {
    // Counted by code point, not by lone surrogate. A thumbs-up is one
    // character to a reader and two units to a carrier.
    expect(segmentSms('\u{1F44D}')).toMatchObject({ encoding: 'ucs-2', units: 2, segments: 1 });
  });

  it('never splits a surrogate pair across a boundary', () => {
    const body = `${'a'.repeat(66)}\u{1F44D}${'a'.repeat(66)}`;
    const result = segmentSms(body);
    expect(result.units).toBe(134);
    expect(Math.ceil(result.units / 67)).toBe(2);
    expect(result.segments).toBe(3);
  });

  it('makes one emoji re-price the whole message', () => {
    // The reason this function exists. Same 150 characters, 3x the cost.
    expect(smsSegmentCount('x'.repeat(150))).toBe(1);
    expect(smsSegmentCount(`${'x'.repeat(150)}\u{1F44D}`)).toBe(3);
  });
});

describe('the edges a caller will hit', () => {
  it('never reports zero segments', () => {
    // A billing function that can return zero invites a caller that reserves
    // zero and then sends something.
    expect(segmentSms('')).toMatchObject({ units: 0, segments: 1 });
  });

  it('reports what is left in the last segment', () => {
    expect(segmentSms('x'.repeat(100)).unitsRemaining).toBe(60);
    expect(segmentSms('x'.repeat(200)).unitsRemaining).toBe(153 - 47);
  });

  it('counts CR and LF as the single septets they are', () => {
    expect(segmentSms('a\nb\rc')).toMatchObject({ encoding: 'gsm-7', units: 5 });
  });
});
