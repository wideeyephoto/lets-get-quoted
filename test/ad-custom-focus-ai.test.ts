import { describe, it, expect } from 'vitest';
import { analyzeCustomAdFocus } from '@/lib/ad-custom-focus-ai';

describe('AI Smart Field Custom Campaign Focus Engine', () => {
  it('analyzes a special dollar promotion and generates high-converting verified copy', () => {
    const analysis = analyzeCustomAdFocus({
      customFocus: '$1,500 Off Full Roof Replacement',
      trade: 'Roofing',
      city: 'Austin, TX',
      businessName: 'Lone Star Roofing',
    });

    expect(analysis.isCustom).toBe(true);
    expect(analysis.interpretedIntent).toBe('special_promotion');
    expect(analysis.clarityVerdict).toBe('ready');
    expect(analysis.clarityScore).toBeGreaterThanOrEqual(90);
    expect(analysis.aiUnderstandingSummary).toContain('Lone Star Roofing');
    expect(analysis.aiUnderstandingSummary).toContain('$1,500 Off Full Roof Replacement');

    // Headlines must be strictly clamped to Google limit (<= 30 chars)
    for (const headline of analysis.customHeadlines) {
      expect(headline.length).toBeLessThanOrEqual(30);
    }

    // Descriptions must be strictly clamped to Google limit (<= 90 chars)
    for (const desc of analysis.customDescriptions) {
      expect(desc.length).toBeLessThanOrEqual(90);
    }

    // Custom retargeting badge should reflect the promo
    expect(analysis.customRetargetingBadge).toContain('$1,500 Off');

    // Meta primary text highlights the special offer
    expect(analysis.customMetaPrimaryText).toContain('Special Limited-Time Offer');
  });

  it('analyzes authorized brand products and shields against DIY and manual search waste', () => {
    const analysis = analyzeCustomAdFocus({
      customFocus: 'Generac Whole-Home Generators',
      trade: 'Electrical',
      city: 'Houston, TX',
      businessName: 'Houston Power Pros',
    });

    expect(analysis.isCustom).toBe(true);
    expect(analysis.interpretedIntent).toBe('brand_product');
    expect(analysis.clarityVerdict).toBe('ready');
    expect(analysis.aiUnderstandingSummary).toContain('authorized Generac Whole-Home Generators');

    // Shields against DIY manual / recall waste
    expect(analysis.customNegativeFilters).toContain('manual pdf');
    expect(analysis.customNegativeFilters).toContain('recall');
    expect(analysis.customNegativeFilters).toContain('diy');

    // Buyer searches targeted
    expect(analysis.targetBuyerSearches.some((s) => s.includes('generac'))).toBe(true);
  });

  it('detects overly broad keywords and generates helpful guidance', () => {
    const analysis = analyzeCustomAdFocus({
      customFocus: 'roofs',
      trade: 'Roofing',
      city: 'Dallas, TX',
      businessName: 'Dallas Roofers',
    });

    expect(analysis.isCustom).toBe(true);
    expect(analysis.clarityVerdict).toBe('too_broad');
    expect(analysis.clarityScore).toBeLessThan(70);
    expect(analysis.aiSuggestions.length).toBeGreaterThan(0);
    expect(analysis.aiSuggestions[0]).toContain('broad');
  });

  it('gracefully returns default trade campaign specs when custom focus is empty', () => {
    const analysis = analyzeCustomAdFocus({
      customFocus: '',
      trade: 'Plumbing',
      city: 'San Antonio, TX',
    });

    expect(analysis.isCustom).toBe(false);
    expect(analysis.clarityVerdict).toBe('ready');
    expect(analysis.interpretedIntent).toBe('general');
    expect(analysis.targetBuyerSearches.some((s) => s.includes('plumbing'))).toBe(true);
  });
});
