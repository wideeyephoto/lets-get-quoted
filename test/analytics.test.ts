import { describe, expect, it } from 'vitest';
import {
  normalizeGa4Id, normalizeMetaPixelId, analyticsIdProblem, hasAnalytics,
  consentWording, shouldMeasure, readConsent,
} from '@/lib/analytics';

describe('GA4 measurement ids', () => {
  it('accepts a real one, in any case', () => {
    expect(normalizeGa4Id('G-ABCD1234')).toBe('G-ABCD1234');
    expect(normalizeGa4Id('  g-abcd1234 ')).toBe('G-ABCD1234');
  });

  it('rejects the two IDs people paste by mistake, and says which is which', () => {
    // Both look plausible and neither works. A generic "invalid" would leave an
    // owner staring at a string that is genuinely their Google ID.
    expect(normalizeGa4Id('UA-12345-1')).toBe('');
    expect(analyticsIdProblem('ga4', 'UA-12345-1')).toContain('Universal Analytics');
    expect(normalizeGa4Id('GTM-ABCD')).toBe('');
    expect(analyticsIdProblem('ga4', 'GTM-ABCD')).toContain('Tag Manager');
  });

  it('rejects nonsense and explains where to find the real one', () => {
    expect(normalizeGa4Id('hello')).toBe('');
    expect(analyticsIdProblem('ga4', 'hello')).toContain('Data streams');
  });

  it('says nothing about an empty field', () => {
    expect(analyticsIdProblem('ga4', '')).toBe('');
    expect(analyticsIdProblem('ga4', '   ')).toBe('');
  });
});

describe('Meta pixel ids', () => {
  it('accepts a bare id', () => {
    expect(normalizeMetaPixelId('123456789012345')).toBe('123456789012345');
  });

  it('pulls the id out of the line people copy from Events Manager', () => {
    expect(normalizeMetaPixelId('Pixel ID: 123456789012345')).toBe('123456789012345');
    expect(normalizeMetaPixelId('  123456789012345  ')).toBe('123456789012345');
  });

  it('refuses a pasted snippet rather than guessing at its numbers', () => {
    // A real Meta tag carries version numbers and several calls besides the id,
    // so "which digits are the id" has a plausible-looking wrong answer. Better
    // to say so than to silently point the pixel at nothing.
    const snippet = "<script>fbq('init', '123456789012345'); fbq('track', 'PageView');</script>";
    expect(normalizeMetaPixelId(snippet)).toBe('');
    expect(normalizeMetaPixelId("fbq('init', '123456789012345')")).toBe('');
  });

  it('rejects something far too short to be a pixel', () => {
    expect(normalizeMetaPixelId('12345')).toBe('');
    expect(analyticsIdProblem('metaPixel', '12345')).toContain('Events Manager');
  });
});

describe('hasAnalytics', () => {
  it('is false until a valid id exists', () => {
    expect(hasAnalytics({ ga4: '', metaPixel: '' })).toBe(false);
    expect(hasAnalytics({ ga4: 'nonsense', metaPixel: '' })).toBe(false);
    expect(hasAnalytics({ ga4: 'G-ABCD1234', metaPixel: '' })).toBe(true);
    expect(hasAnalytics({ ga4: '', metaPixel: '123456789012345' })).toBe(true);
  });
});

describe('consent wording follows what is actually configured', () => {
  it('says measurement when it is only analytics', () => {
    const w = consentWording({ ga4: 'G-ABCD1234', metaPixel: '' });
    expect(w.kind).toBe('analytics');
    expect(w.body).toContain('No ads');
  });

  it('admits to ad tracking when a pixel is on', () => {
    // A banner claiming "just analytics" while loading a Meta pixel is exactly
    // the dark pattern the consent flow exists to avoid.
    const w = consentWording({ ga4: 'G-ABCD1234', metaPixel: '123456789012345' });
    expect(w.kind).toBe('ads');
    expect(w.body).toMatch(/ads/i);
  });
});

describe('shouldMeasure — keeping our traffic out of their reports', () => {
  it('never measures inside an iframe', () => {
    // The only place a contractor site renders framed is our own builder
    // preview, which reloads on every keystroke.
    expect(shouldMeasure({ hostname: 'brokepipes.com', inFrame: true })).toBe(false);
  });

  it('never measures on localhost or a preview deployment', () => {
    expect(shouldMeasure({ hostname: 'localhost', inFrame: false })).toBe(false);
    expect(shouldMeasure({ hostname: '127.0.0.1', inFrame: false })).toBe(false);
    expect(shouldMeasure({ hostname: 'lets-get-quoted-abc123.vercel.app', inFrame: false })).toBe(false);
  });

  it('measures on a real site', () => {
    expect(shouldMeasure({ hostname: 'brokepipes.com', inFrame: false })).toBe(true);
    expect(shouldMeasure({ hostname: 'thisisit.letsgetquoted.com', inFrame: false })).toBe(true);
  });
});

describe('readConsent', () => {
  it('only trusts the two values it wrote', () => {
    expect(readConsent('granted')).toBe('granted');
    expect(readConsent('denied')).toBe('denied');
    expect(readConsent('true')).toBeNull();
    expect(readConsent(null)).toBeNull();
  });
});
