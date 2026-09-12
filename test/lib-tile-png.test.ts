import { describe, it, expect } from 'vitest';
import { brandTilePng, encodeOpaquePng } from '@/lib/tile-png';

describe('Tile PNG Lib', () => {
  describe('encodeOpaquePng', () => {
    it('returns a valid PNG buffer', () => {
      const buf = encodeOpaquePng(10, () => [255, 0, 0]);
      expect(Buffer.isBuffer(buf)).toBe(true);
      // PNG magic number
      expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      // Should include IHDR chunk
      expect(buf.indexOf('IHDR')).toBeGreaterThan(0);
      // Should include IDAT chunk
      expect(buf.indexOf('IDAT')).toBeGreaterThan(0);
      // Should include IEND chunk
      expect(buf.indexOf('IEND')).toBeGreaterThan(0);
    });
  });

  describe('brandTilePng', () => {
    it('generates a branded tile png', () => {
      // Very small size to make it fast
      const buf = brandTilePng('#ff0000', '#000000', 10);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    });

    it('handles 3-character hex codes', () => {
      const buf = brandTilePng('#f00', '#000', 10);
      expect(Buffer.isBuffer(buf)).toBe(true);
    });
  });
});
