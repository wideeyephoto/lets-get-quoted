import { describe, it, expect } from 'vitest';
import { getSiteContent, getFooterStyle, FOOTER_STYLE_KEYS } from '@/lib/site-content';
import { navEditTarget, NAV_EDIT_TARGET } from '@/lib/templates/nav-edit-target';

describe('footerStyle normalization', () => {
  it('defaults to columns when unset', () => {
    expect(getSiteContent({}).footerStyle).toBe('columns');
    expect(getSiteContent(null).footerStyle).toBe('columns');
  });

  it('keeps every valid layout', () => {
    for (const key of ['columns', 'cta', 'centered', 'grid']) {
      expect(getSiteContent({ footerStyle: key }).footerStyle).toBe(key);
      expect(FOOTER_STYLE_KEYS.has(key)).toBe(true);
    }
  });

  it('falls back to columns for an unknown/garbage value', () => {
    expect(getSiteContent({ footerStyle: 'fancy' }).footerStyle).toBe('columns');
    expect(getSiteContent({ footerStyle: 42 }).footerStyle).toBe('columns');
  });

  it('getFooterStyle reads the normalized value from raw content', () => {
    expect(getFooterStyle({ footerStyle: 'centered' })).toBe('centered');
    expect(getFooterStyle({})).toBe('columns');
  });

  it('maps footer links to their section edit target in the builder', () => {
    expect(navEditTarget('/#our-services')).toBe('our-services');
    expect(navEditTarget('/#showcase')).toBe('showcase');
    expect(navEditTarget('/#reviews')).toBe('reviews');
    expect(navEditTarget('/#faqs')).toBe('faqs');
    expect(navEditTarget('/#blog')).toBe('blog');
    expect(navEditTarget('/blog')).toBe('blog');
    expect(navEditTarget('/videos')).toBe('video');
    expect(navEditTarget('/#contact')).toBe('contact');
    expect(navEditTarget('/privacy')).toBe('legal');
    expect(navEditTarget('/terms')).toBe('legal');
  });
});
