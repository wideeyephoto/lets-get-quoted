import { describe, it, expect } from 'vitest';
import { buildReviewFlyerHtml } from '../src/lib/review-flyer';

describe('Google Review Leave-Behind Flyer Generator', () => {
  it('generates a complete HTML printable review flyer', () => {
    const html = buildReviewFlyerHtml({
      businessName: 'Apex Roofing & Solar',
      phone: '(555) 432-1098',
      googleReviewUrl: 'https://g.page/r/CbK9s8df/review',
      tagline: 'Quality roofing backed by a 25-year warranty.',
      ownerName: 'Dan & Sarah',
    });

    expect(html).toContain('Apex Roofing &amp; Solar');
    expect(html).toContain('(555) 432-1098');
    expect(html).toContain('Quality roofing backed by a 25-year warranty.');
    expect(html).toContain('Dan &amp; Sarah &amp; the Crew');
    expect(html).toContain('SCAN WITH PHONE CAMERA TO REVIEW');
    expect(html).toContain('<svg');
    expect(html).toContain('★★★★★');
  });

  it('handles optional parameters gracefully', () => {
    const html = buildReviewFlyerHtml({
      businessName: 'Standard Plumbers',
      googleReviewUrl: 'https://g.page/r/demo/review',
    });

    expect(html).toContain('Standard Plumbers');
    expect(html).toContain('The Entire Team');
    expect(html).toContain('<svg');
  });
});
