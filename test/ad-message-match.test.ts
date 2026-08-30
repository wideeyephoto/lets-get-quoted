import { describe, expect, it } from 'vitest';
import { resolveMessageMatchHero } from '@/lib/ad-message-match';

describe('AI Dynamic Message-Match Landing Page Hero', () => {
  it('matches emergency queries to 24/7 urgent hero headlines and emergency CTA label', () => {
    const hero = resolveMessageMatchHero({
      trade: 'Plumbing',
      city: 'Austin, TX',
      businessName: 'Austin Pro Rooter',
      utmTerm: 'emergency burst pipe repair',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('24/7 Emergency Plumbing in Austin');
    expect(hero.trustBadge).toContain('24/7 Fast Local Dispatch');
    expect(hero.ctaLabel).toContain('Emergency Tech Dispatch');
    expect(hero.detectedIntent).toBe('emergency');
  });

  it('matches replacement search queries to free written estimate headlines', () => {
    const hero = resolveMessageMatchHero({
      trade: 'Roofing',
      city: 'Austin, TX',
      businessName: 'Apex Roofs',
      utmCampaign: 'roof_replacement_deals',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('Free Roofing Estimate in Austin');
    expect(hero.trustBadge).toContain('Free 15-Minute Written Estimate');
    expect(hero.detectedIntent).toBe('replacement');
  });

  it('matches promotional discount search queries to verified special offer badge and CTA', () => {
    const hero = resolveMessageMatchHero({
      trade: 'HVAC',
      city: 'Austin, TX',
      businessName: 'Lone Star AC',
      promo: '$1,500 Off Full Replacement',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('$1,500 Off Full Replacement in Austin');
    expect(hero.trustBadge).toContain('Verified Special Offer Applied');
    expect(hero.ctaLabel).toContain('Claim Offer & Get Estimate');
    expect(hero.detectedIntent).toBe('promo');
  });

  it('matches neighborhood halo queries to neighbor discount badge', () => {
    const hero = resolveMessageMatchHero({
      trade: 'Roofing',
      city: 'Royal Oak, MI',
      businessName: 'Royal Oak Roofers',
      utmContent: 'neighborhood_halo_elm_st',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('Recent Projects Completed in Your Neighborhood');
    expect(hero.trustBadge).toContain('Neighborhood Project Special Active');
    expect(hero.ctaLabel).toContain('Claim Neighbor Rate');
    expect(hero.detectedIntent).toBe('neighborhood');
  });

  it('matches financing search queries to $0 down badge', () => {
    const hero = resolveMessageMatchHero({
      trade: 'Electrical',
      city: 'Dallas, TX',
      businessName: 'Sparky Pros',
      utmTerm: 'panel replacement financing zero down',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('Flexible Financing & $0 Down for Electrical in Dallas');
    expect(hero.trustBadge).toContain('Flexible Financing Available');
    expect(hero.ctaLabel).toContain('Explore Financing');
    expect(hero.detectedIntent).toBe('financing');
  });

  it('falls back gracefully to default branding when no UTMs or click IDs are present', () => {
    const hero = resolveMessageMatchHero({
      trade: 'HVAC',
      city: 'Dallas, TX',
      businessName: 'Comfort Air',
    });

    expect(hero.isMatch).toBe(false);
    expect(hero.headline).toBe('Professional HVAC in Dallas, TX');
  });
});
