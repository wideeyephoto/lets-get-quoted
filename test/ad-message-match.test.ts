import { describe, expect, it } from 'vitest';
import { resolveMessageMatchHero } from '@/lib/ad-message-match';

describe('AI Dynamic Message-Match Landing Page Hero', () => {
  it('matches emergency queries to 24/7 urgent hero headlines', () => {
    const hero = resolveMessageMatchHero({
      trade: 'Plumbing',
      city: 'Austin, TX',
      businessName: 'Austin Pro Rooter',
      utmTerm: 'emergency burst pipe repair',
    });

    expect(hero.isMatch).toBe(true);
    expect(hero.headline).toContain('24/7 Emergency Plumbing in Austin');
    expect(hero.trustBadge).toContain('24/7 Fast Local Dispatch');
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
  });

  it('falls back gracefully to default branding when no UTMs are present', () => {
    const hero = resolveMessageMatchHero({
      trade: 'HVAC',
      city: 'Dallas, TX',
      businessName: 'Comfort Air',
    });

    expect(hero.isMatch).toBe(false);
    expect(hero.headline).toBe('Professional HVAC in Dallas, TX');
  });
});
