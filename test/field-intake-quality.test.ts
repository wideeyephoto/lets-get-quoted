import { describe, it, expect } from 'vitest';
import { evaluateFieldNoteConfidence } from '@/lib/field-intake-quality';

describe('field-intake-quality evaluation engine', () => {
  it('rates complete new lead notes as ready with high quality score', () => {
    const verdict = evaluateFieldNoteConfidence(
      'Met Dave Miller 248-555-0812 oak limb removal estimate Tuesday 9am. High urgency near roofline.',
      { type: 'sms', isLead: true, extractedItemsCount: 3 }
    );

    expect(verdict.level).toBe('ready');
    expect(verdict.score).toBeGreaterThanOrEqual(80);
    expect(verdict.label).toBe('Ready to Apply');
    expect(verdict.badgeText).toContain('Ready to Apply');
    expect(verdict.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('phone'),
        expect.stringContaining('schedule'),
      ])
    );
  });

  it('rates change orders with dollar amounts and trade scopes as ready', () => {
    const verdict = evaluateFieldNoteConfidence(
      'Rough plumbing passed inspection at 124 Main. Need Mike and drywall crew Thursday 8am. Added $450 extra PEX lines to Miller quote.',
      { type: 'voice', matchedJobRef: 'Job J-104 (Miller)', extractedItemsCount: 4 }
    );

    expect(verdict.level).toBe('ready');
    expect(verdict.score).toBeGreaterThanOrEqual(85);
    expect(verdict.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('$450'),
        expect.stringContaining('trade service'),
      ])
    );
  });

  it('demotes a new lead note missing a callback phone number to review', () => {
    const verdict = evaluateFieldNoteConfidence(
      'New lead Dave Miller wants estimate Tuesday morning for roof leak',
      { type: 'sms', isLead: true }
    );

    expect(verdict.level).toBe('review');
    expect(verdict.label).toBe('Needs Review');
    expect(verdict.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Missing callback phone')])
    );
  });

  it('rates vague or unlinked notes as review or low clarity', () => {
    const vagueVerdict = evaluateFieldNoteConfidence('called the guy back', {
      type: 'sms',
    });

    expect(vagueVerdict.level).toBe('low');
    expect(vagueVerdict.score).toBeLessThan(60);
    expect(vagueVerdict.label).toBe('Low Clarity');
    expect(vagueVerdict.isActionable).toBe(false);
  });

  it('handles empty input gracefully', () => {
    const emptyVerdict = evaluateFieldNoteConfidence('');
    expect(emptyVerdict.level).toBe('low');
    expect(emptyVerdict.score).toBe(0);
    expect(emptyVerdict.isActionable).toBe(false);
  });

  it('flags receipts missing explicit totals for review', () => {
    const receiptVerdict = evaluateFieldNoteConfidence(
      'Supply house receipt with random hardware',
      { type: 'receipt' }
    );

    expect(receiptVerdict.score).toBeLessThan(75);
    expect(receiptVerdict.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Missing clear total')])
    );
  });
});
