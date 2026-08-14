import { describe, it, expect } from 'vitest';
import { getSiteContent } from '@/lib/site-content';

// Exactly one lead-intake method is ever active — Smart Intake (estimateRanges)
// OR the classic quote form, never both and never neither. quoteForm.enabled is
// the single source of truth; Smart Intake is on whenever the quote form is off.
describe('intake method is mutually exclusive', () => {
  const smartIntakeOn = (content: Record<string, unknown> | null | undefined) => {
    const c = getSiteContent(content);
    return c.estimateRanges.enabled === !c.quoteForm.enabled;
  };

  it('defaults to Smart Intake on, quote form off', () => {
    const c = getSiteContent({});
    expect(c.quoteForm.enabled).toBe(false);
    expect(c.estimateRanges.enabled).toBe(true);
  });

  it('quote form on forces Smart Intake off', () => {
    const c = getSiteContent({ quoteForm: { enabled: true }, estimateRanges: { enabled: true } });
    expect(c.quoteForm.enabled).toBe(true);
    expect(c.estimateRanges.enabled).toBe(false);
  });

  it('a legacy "both off" site resolves to Smart Intake', () => {
    const c = getSiteContent({ quoteForm: { enabled: false }, estimateRanges: { enabled: false } });
    expect(c.quoteForm.enabled).toBe(false);
    expect(c.estimateRanges.enabled).toBe(true);
  });

  it('the invariant holds for every stored combination', () => {
    for (const q of [true, false, undefined]) {
      for (const e of [true, false, undefined]) {
        expect(smartIntakeOn({ quoteForm: { enabled: q }, estimateRanges: { enabled: e } })).toBe(true);
      }
    }
  });
});

// The Website Builder's method picker writes quoteForm.enabled and every other
// surface reads estimateRanges.enabled as "is Smart Intake active". That round
// trip only holds because the two are strict inverses.
describe('the intake method choice round-trips through quoteForm.enabled', () => {
  const smartIntakeAfterWriting = (smartIntakeOn: boolean) =>
    getSiteContent({ quoteForm: { enabled: !smartIntakeOn } }).estimateRanges.enabled;

  it('turning Smart Intake on writes the quote form off, and reads back on', () => {
    expect(smartIntakeAfterWriting(true)).toBe(true);
  });

  it('turning Smart Intake off writes the quote form on, and reads back off', () => {
    expect(smartIntakeAfterWriting(false)).toBe(false);
  });

  it('preserves the quote form’s other settings across a flip', () => {
    // The action spreads the existing quoteForm, so wording and email-required
    // survive being switched off and back on.
    const before = getSiteContent({ quoteForm: { enabled: true, emailRequired: true, estimateLabel: 'instant' } });
    const flipped = getSiteContent({ quoteForm: { ...before.quoteForm, enabled: false } });
    expect(flipped.estimateRanges.enabled).toBe(true);
    expect(flipped.quoteForm.emailRequired).toBe(true);
    expect(flipped.quoteForm.estimateLabel).toBe('instant');
  });
});
