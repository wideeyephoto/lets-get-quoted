import { describe, it, expect } from 'vitest';
import { evaluateFieldNoteConfidence } from '@/lib/field-intake-quality';

describe('Text-to-Job Behavioral Quality & Lead Confidence', () => {
  it('awards verified phone bonus when hasPhone is true even if not in note body', () => {
    const rawNote = 'Need a quote for a new roof on the garage';
    const verdictWithPhone = evaluateFieldNoteConfidence(rawNote, {
      type: 'sms',
      matchedJobRef: 'New Lead: Sarah Jenkins',
      extractedItemsCount: 1,
      isLead: true,
      hasPhone: true,
    });

    expect(verdictWithPhone.reasons).toContain('Verified 10-digit phone number');
    expect(verdictWithPhone.reasons).not.toContain('Missing callback phone for new lead');
    expect(verdictWithPhone.score).toBeGreaterThanOrEqual(60);
    expect(verdictWithPhone.level).not.toBe('low');
  });

  it('applies missing phone penalty when hasPhone is false and note lacks phone', () => {
    const rawNote = 'Water heater is leaking, can someone come out?';
    const verdictWithoutPhone = evaluateFieldNoteConfidence(rawNote, {
      type: 'sms',
      matchedJobRef: 'New Lead: Prospect',
      extractedItemsCount: 1,
      isLead: true,
      hasPhone: false,
    });

    expect(verdictWithoutPhone.reasons).toContain('Missing callback phone for new lead');
    expect(verdictWithoutPhone.score).toBeLessThanOrEqual(45);
    expect(verdictWithoutPhone.level).toBe('low');
  });

  it('recognizes inline phone numbers in raw text when hasPhone is not explicitly passed', () => {
    const textWithInlinePhone = 'Met Dave Miller 248-555-0812 oak limb removal estimate Tuesday 9am';
    const verdict = evaluateFieldNoteConfidence(textWithInlinePhone, {
      type: 'sms',
      matchedJobRef: 'New Lead: Dave Miller',
      extractedItemsCount: 1,
      isLead: true,
    });

    expect(verdict.reasons).toContain('Verified 10-digit phone number');
    expect(verdict.reasons).not.toContain('Missing callback phone for new lead');
    expect(verdict.score).toBeGreaterThanOrEqual(80);
    expect(verdict.level).toBe('ready');
  });
});
