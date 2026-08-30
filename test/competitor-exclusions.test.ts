import { describe, expect, it } from 'vitest';
import {
  generateTradeKeywords,
  generateGoogleAdsEditorCsv,
  generateResponsiveSearchAd,
} from '@/lib/google-ads-generator';

describe('Competitor Negative Keyword Exclusions', () => {
  it('adds competitor brand variations to negative keywords list', () => {
    const { negativeKeywords } = generateTradeKeywords(
      ['Roof Replacement'],
      'Austin, TX',
      'Roofing',
      ['Apex Rival Roofing', 'Mega Roofer LLC']
    );

    expect(negativeKeywords).toContain('apex rival roofing');
    expect(negativeKeywords).toContain('apex rival roofing reviews');
    expect(negativeKeywords).toContain('apex rival roofing phone');
    expect(negativeKeywords).toContain('mega roofer llc');
  });

  it('outputs competitor negative keywords in Google Ads Editor CSV export', () => {
    const rsa = generateResponsiveSearchAd({
      businessName: 'Evergreen Roofing',
      trade: 'Roofing',
      city: 'Austin, TX',
      services: ['Roof Repair'],
      landingPageUrl: 'https://evergreen.com',
    });

    const { allKeywords, negativeKeywords } = generateTradeKeywords(
      ['Roof Repair'],
      'Austin, TX',
      'Roofing',
      ['Competitor Express Inc']
    );

    const csv = generateGoogleAdsEditorCsv({
      campaignName: 'Austin Roofing Ads',
      monthlyBudget: 600,
      dailyBudget: 19.74,
      targetCity: 'Austin, TX',
      targetRadiusMiles: 25,
      rsa,
      keywords: allKeywords,
      negativeKeywords,
    });

    expect(csv).toContain('competitor express inc');
    expect(csv).toContain('Negative Phrase');
  });
});
