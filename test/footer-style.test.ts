import { describe, it, expect } from 'vitest';
import { getSiteContent, getFooterStyle, FOOTER_STYLE_KEYS } from '@/lib/site-content';

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
});
