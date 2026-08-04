import { describe, expect, it } from 'vitest';
import { getSiteContent, mergeSiteContent, preserveIntakeSettings } from '@/lib/site-content';

// Intake tuning moved from the website builder to Settings → Automations →
// Intake AI. The builder still sends the whole content object it loaded when
// the page opened, so without this a filter changed in Settings is silently
// reverted by a Save the owner thought only changed their headline — and they
// have no reason to suspect it, because the two pages look nothing alike.

function stored() {
  return mergeSiteContent({}, {
    heroEyebrow: 'Stored eyebrow',
    leadFilters: {
      ...getSiteContent(null).leadFilters,
      askTimeline: true,
      minJobAmount: 750,
      exclusions: ['mobile homes'],
      phoneVerification: true,
    },
    estimateRanges: { ...getSiteContent(null).estimateRanges, emailField: 'required' },
    quoteForm: { ...getSiteContent(null).quoteForm, estimateLabel: 'quick', formHeading: 'Get a price', emailRequired: true },
  });
}

/** What a builder tab opened BEFORE those Settings changes would send back. */
function staleBuilderSave() {
  return mergeSiteContent({}, {
    heroEyebrow: 'A brand new eyebrow',
    leadFilters: { ...getSiteContent(null).leadFilters, askTimeline: false, minJobAmount: 0, exclusions: [] },
    estimateRanges: { ...getSiteContent(null).estimateRanges, emailField: 'off' },
    quoteForm: { ...getSiteContent(null).quoteForm, estimateLabel: 'instant', formHeading: '', emailRequired: false },
  });
}

describe('a website save cannot revert the intake settings', () => {
  it('keeps the lead filters that Settings owns', () => {
    const result = getSiteContent(preserveIntakeSettings(stored(), staleBuilderSave()));
    expect(result.leadFilters.askTimeline).toBe(true);
    expect(result.leadFilters.minJobAmount).toBe(750);
    expect(result.leadFilters.exclusions).toEqual(['mobile homes']);
    expect(result.leadFilters.phoneVerification).toBe(true);
  });

  it('keeps the intake wording and the email requirement', () => {
    const result = getSiteContent(preserveIntakeSettings(stored(), staleBuilderSave()));
    expect(result.estimateRanges.emailField).toBe('required');
    expect(result.quoteForm.estimateLabel).toBe('quick');
    expect(result.quoteForm.formHeading).toBe('Get a price');
    expect(result.quoteForm.emailRequired).toBe(true);
  });

  it('still lets the builder change what the builder owns', () => {
    // The whole point is that it protects a branch, not that it freezes the save.
    const result = getSiteContent(preserveIntakeSettings(stored(), staleBuilderSave()));
    expect(result.heroEyebrow).toBe('A brand new eyebrow');
  });

  it('lets the builder switch which intake runs', () => {
    // quoteForm.enabled is the Smart-vs-classic choice and belongs to the
    // builder. Replacing the whole quoteForm object would have frozen it —
    // pressing "Classic quote form" would appear to do nothing.
    const incoming = mergeSiteContent(staleBuilderSave(), {
      quoteForm: { ...getSiteContent(staleBuilderSave()).quoteForm, enabled: true },
    });
    expect(getSiteContent(preserveIntakeSettings(stored(), incoming)).quoteForm.enabled).toBe(true);

    const off = mergeSiteContent(staleBuilderSave(), {
      quoteForm: { ...getSiteContent(staleBuilderSave()).quoteForm, enabled: false },
    });
    expect(getSiteContent(preserveIntakeSettings(stored(), off)).quoteForm.enabled).toBe(false);
  });

  it('survives an empty or missing content object on either side', () => {
    expect(() => preserveIntakeSettings(null, null)).not.toThrow();
    expect(getSiteContent(preserveIntakeSettings(null, {})).leadFilters).toEqual(getSiteContent(null).leadFilters);
    // A brand-new site saving for the first time keeps the defaults, not junk.
    expect(getSiteContent(preserveIntakeSettings({}, staleBuilderSave())).estimateRanges.emailField)
      .toBe(getSiteContent(null).estimateRanges.emailField);
  });
});
