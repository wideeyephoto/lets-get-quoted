import { describe, it, expect } from 'vitest';
import {
  buildTaglinePromptInput,
  getFallbackTaglines,
  TAGLINE_INSTRUCTIONS,
} from '../src/lib/logo-taglines';

describe('Logo Taglines & Slogans Engine', () => {
  describe('OpenAI Responses API prompt builder', () => {
    it('always includes "json" in the user input to prevent the Responses API 400 rejection', () => {
      const input = buildTaglinePromptInput({
        companyName: 'BrokePipes Plumbing',
        trade: 'Plumbing',
        serviceArea: 'Austin, TX',
      });

      // The OpenAI Responses API 400s on text.format:json_object unless "json" appears in input
      expect(input.toLowerCase()).toContain('json');
      expect(input).toContain('Respond with json only.');
      expect(input).toContain('BrokePipes Plumbing');
      expect(input).toContain('Plumbing');
    });

    it('falls back cleanly when companyName or trade are omitted', () => {
      const input = buildTaglinePromptInput({});
      expect(input.toLowerCase()).toContain('json');
      expect(input).toContain('Our Company');
      expect(input).toContain('General Contractor');
    });

    it('defines strict tagline instructions for concise logo slogans', () => {
      expect(TAGLINE_INSTRUCTIONS).toContain('5 distinct');
      expect(TAGLINE_INSTRUCTIONS).toContain('under 40 characters');
      expect(TAGLINE_INSTRUCTIONS).toContain('{"taglines"');
    });
  });

  describe('Trade-specific fallback taglines', () => {
    it('returns 5 distinct, punchy slogans under 50 characters', () => {
      const taglines = getFallbackTaglines('Plumbing', 'BrokePipes');
      expect(taglines).toHaveLength(5);
      const unique = new Set(taglines);
      expect(unique.size).toBe(5);

      for (const t of taglines) {
        expect(t.length).toBeGreaterThan(5);
        expect(t.length).toBeLessThanOrEqual(50);
      }
    });

    it('returns plumbing-specific taglines for plumbers', () => {
      const taglines = getFallbackTaglines('Plumbing', 'Apex Drains');
      const text = taglines.join(' ').toLowerCase();
      expect(
        text.includes('plumb') ||
        text.includes('drain') ||
        text.includes('pipe') ||
        text.includes('leak') ||
        text.includes('water heater') ||
        text.includes('apex')
      ).toBe(true);
    });

    it('returns HVAC-specific taglines for HVAC businesses', () => {
      const taglines = getFallbackTaglines('HVAC', 'Breeze Air');
      const text = taglines.join(' ').toLowerCase();
      expect(
        text.includes('heat') ||
        text.includes('cool') ||
        text.includes('hvac') ||
        text.includes('furnace') ||
        text.includes('climate') ||
        text.includes('breeze')
      ).toBe(true);
    });

    it('returns electrical-specific taglines for electricians', () => {
      const taglines = getFallbackTaglines('Electrical', 'Volt Pros');
      const text = taglines.join(' ').toLowerCase();
      expect(
        text.includes('electric') ||
        text.includes('wire') ||
        text.includes('power') ||
        text.includes('volt')
      ).toBe(true);
    });

    it('returns roofing-specific taglines for roofers', () => {
      const taglines = getFallbackTaglines('Roofing', 'Summit Roofing');
      const text = taglines.join(' ').toLowerCase();
      expect(
        text.includes('roof') ||
        text.includes('storm') ||
        text.includes('leak') ||
        text.includes('summit')
      ).toBe(true);
    });

    it('returns landscaping-specific taglines for landscapers', () => {
      const taglines = getFallbackTaglines('Landscaping', 'Green Valley');
      const text = taglines.join(' ').toLowerCase();
      expect(
        text.includes('lawn') ||
        text.includes('landscape') ||
        text.includes('outdoor') ||
        text.includes('green')
      ).toBe(true);
    });
  });
});
