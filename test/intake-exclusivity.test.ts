import { describe, it, expect } from 'vitest';
import { getSiteContent } from '@/lib/site-content';

// Exactly one lead-intake method is ever active — Smart Intake (estimateRanges)
// OR the classic quote form, never both and never neither. quoteForm.enabled is
// the single source of truth; Smart Intake is on whenever the quote form is off.
describe('intake method is mutually exclusive', () => {
  const smartIntakeOn = (content: unknown) => {
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
