import { describe, it, expect } from 'vitest';
import { getSiteContent, REORDERABLE_SECTIONS } from '@/lib/site-content';

// The default page a brand-new site starts with — order + which sections are on.
// Locks in the arrangement chosen for the builder (matches the reference layout).
describe('default section order', () => {
  it('is the intended top-to-bottom order', () => {
    expect(getSiteContent({}).sectionOrder).toEqual([
      'services', 'showcase', 'video', 'testimonials', 'stats', 'faqs',
      'beforeAfter', 'projectShowcase', 'howItWorks', 'blog', 'serviceAreas',
    ]);
  });
  it('default order is exactly the REORDERABLE_SECTIONS order', () => {
    expect(getSiteContent({}).sectionOrder).toEqual(REORDERABLE_SECTIONS.map((s) => s.key));
  });
});

describe('default section on/off', () => {
  const c = getSiteContent({});
  it('these sections default ON', () => {
    expect(c.services.enabled).toBe(true);
    expect(c.showcase.enabled).toBe(true);
    expect(c.testimonials.enabled).toBe(true);
    expect(c.stats.enabled).toBe(true);
    expect(c.faqs.enabled).toBe(true);
    expect(c.projectShowcase.enabled).toBe(true);
    expect(c.blog.enabled).toBe(true);
    expect(c.serviceAreas.enabled).toBe(true);
    // On, but gated on having a video — see test/video-section.test.ts.
    expect(c.videoSection.enabled).toBe(true);
  });
  it('these sections default OFF', () => {
    expect(c.beforeAfter.enabled).toBe(false);
    expect(c.howItWorks.enabled).toBe(false);
  });
  it('an explicit off is always respected over the default', () => {
    expect(getSiteContent({ services: { enabled: false } }).services.enabled).toBe(false);
    expect(getSiteContent({ testimonials: { enabled: false } }).testimonials.enabled).toBe(false);
  });
});
