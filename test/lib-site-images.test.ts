import { describe, it, expect } from 'vitest';
import { getSiteGallery, STOCK_SITE_IMAGES } from '@/lib/site-images';

describe('Site Images Lib', () => {
  it('returns empty array if no gallery array', () => {
    expect(getSiteGallery({})).toEqual([]);
    expect(getSiteGallery({ gallery: 'not an array' })).toEqual([]);
    expect(getSiteGallery({ gallery: null })).toEqual([]);
  });

  it('filters invalid elements', () => {
    const invalidGallery = [
      null,
      'string',
      { id: '123' }, // missing url, alt, category, source
      { id: '123', url: 'foo', alt: 'bar', category: 'interior', source: 'invalid_source' },
      { id: '123', url: 'foo', alt: 'bar', category: 'interior', source: 'stock' } // Valid
    ];

    const res = getSiteGallery({ gallery: invalidGallery });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('123');
  });

  it('accepts valid stock images', () => {
    const res = getSiteGallery({ gallery: STOCK_SITE_IMAGES });
    expect(res).toHaveLength(STOCK_SITE_IMAGES.length);
  });
});
