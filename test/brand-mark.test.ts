import { describe, it, expect } from 'vitest';
import { buildBrandMarkSvg, siteBrandMarkSvg, brandMarkDataUri, siteIconsMetadata, DEFAULT_BRAND_ACCENT } from '@/lib/brand-mark';
import { SERVICE_ICON_PATHS } from '@/lib/templates/ServiceIcon';

describe('buildBrandMarkSvg', () => {
  it('color variant: accent tile + white glyph + the glyph path', () => {
    const svg = buildBrandMarkSvg('wrench', '#123456', 'color');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('<rect width="64" height="64" rx="14" fill="#123456"/>');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain(SERVICE_ICON_PATHS.wrench);
  });

  it('black variant: no tile, dark glyph (one-color print)', () => {
    const svg = buildBrandMarkSvg('bolt', '#123456', 'black');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('stroke="#0e1622"');
    expect(svg).toContain(SERVICE_ICON_PATHS.bolt);
  });

  it('white variant: no tile, white glyph (reversed for dark surfaces)', () => {
    const svg = buildBrandMarkSvg('leaf', '#123456', 'white');
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('stroke="#ffffff"');
  });

  it('falls back to the wrench glyph for an unknown key', () => {
    expect(buildBrandMarkSvg('nope', '#123456', 'color')).toContain(SERVICE_ICON_PATHS.wrench);
  });

  it('falls back to the default accent for a non-hex value (never emits junk into fill)', () => {
    const svg = buildBrandMarkSvg('wrench', 'red; }<script>', 'color');
    expect(svg).toContain(`fill="${DEFAULT_BRAND_ACCENT}"`);
    expect(svg).not.toContain('<script>');
  });

  it('uses the default accent when accent is null/empty', () => {
    expect(buildBrandMarkSvg('wrench', null, 'color')).toContain(`fill="${DEFAULT_BRAND_ACCENT}"`);
    expect(buildBrandMarkSvg('wrench', '', 'color')).toContain(`fill="${DEFAULT_BRAND_ACCENT}"`);
  });
});

describe('siteBrandMarkSvg', () => {
  it('infers the glyph from the trade and uses the site accent', () => {
    const svg = siteBrandMarkSvg({ content: { trade: 'Plumbing & Drain' }, accent_override: '#00aa88' }, 'color');
    expect(svg).toContain('fill="#00aa88"');
    expect(svg).toContain(SERVICE_ICON_PATHS.wrench); // plumbing -> wrench
  });

  it('falls back to the house glyph for an unknown/blank trade', () => {
    const svg = siteBrandMarkSvg({ content: {}, accent_override: null }, 'color');
    expect(svg).toContain(SERVICE_ICON_PATHS.home);
    expect(svg).toContain(`fill="${DEFAULT_BRAND_ACCENT}"`);
  });
});

describe('brandMarkDataUri / siteIconsMetadata', () => {
  it('encodes the SVG as an svg+xml data URI', () => {
    const uri = brandMarkDataUri(buildBrandMarkSvg('wrench', '#123456', 'color'));
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(uri).toContain(encodeURIComponent('<svg'));
    expect(uri).not.toContain('<svg'); // must be encoded, not raw
  });

  it('produces an icon + shortcut metadata block pointing at the data URI', () => {
    const icons = siteIconsMetadata({ content: { trade: 'Electrician' }, accent_override: '#334455' });
    expect(icons.icon[0].type).toBe('image/svg+xml');
    expect(icons.icon[0].url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(icons.shortcut[0].url).toBe(icons.icon[0].url);
    // Electrician -> bolt glyph should be embedded in the encoded mark.
    expect(decodeURIComponent(icons.icon[0].url)).toContain(SERVICE_ICON_PATHS.bolt);
  });
});
