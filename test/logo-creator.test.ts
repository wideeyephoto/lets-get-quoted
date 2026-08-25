import { describe, it, expect } from 'vitest';
import {
  generateLogoConcepts,
  generateLogoSvg,
  resolveGlyphForTrade,
  type LogoStyle,
} from '../src/lib/logo-creator';

describe('AI Logo Creator & Vector Generator', () => {
  it('resolves correct trade iconography', () => {
    expect(resolveGlyphForTrade('plumbing')).toBe('droplet');
    expect(resolveGlyphForTrade('electrical')).toBe('bolt');
    expect(resolveGlyphForTrade('hvac')).toBe('fan');
    expect(resolveGlyphForTrade('roofing')).toBe('home');
    expect(resolveGlyphForTrade('painting')).toBe('paintbrush');
    expect(resolveGlyphForTrade('landscaping')).toBe('leaf');
    expect(resolveGlyphForTrade('custom', 'sparkles')).toBe('sparkles');
  });

  it('generates high-res SVG logos across all 5 styles', () => {
    const styles: LogoStyle[] = [
      'modern_shield',
      'minimal_monogram',
      'vintage_stamp',
      'hexagon_badge',
      'dynamic_motion',
    ];

    for (const style of styles) {
      const svg = generateLogoSvg({
        businessName: 'Apex Precision Plumbing',
        trade: 'plumbing',
        tagline: '24/7 Emergency Service',
        establishedYear: '2018',
        accentColor: '#0284c7',
        style,
      });

      expect(svg).toContain('<svg');
      expect(svg.toLowerCase()).toContain('apex');
      expect(svg).toContain('viewBox="0 0 640 220"');
      expect(svg).toContain('#0284c7');
    }
  });

  it('generates multi-style concept packs with data URIs', () => {
    const concepts = generateLogoConcepts({
      businessName: 'Summit Electric Co',
      trade: 'electrical',
      tagline: 'Licensed & Insured Master Electricians',
      accentColor: '#f59e0b',
    });

    expect(concepts.length).toBe(5);
    for (const concept of concepts) {
      expect(concept.dataUri).toContain('data:image/svg+xml');
      expect(concept.svg.toLowerCase()).toContain('summit');
      expect(concept.styleLabel).toBeDefined();
    }
  });
});
