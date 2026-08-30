import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_LINK_PRESETS,
  buildCampaignUrl,
  buildCampaignQrSvg,
} from '@/lib/campaign-roi';

describe('Campaign Link Presets', () => {
  it('defines presets for both digital and offline print channels', () => {
    const digital = CAMPAIGN_LINK_PRESETS.filter((p) => p.category === 'digital');
    const offline = CAMPAIGN_LINK_PRESETS.filter((p) => p.category === 'offline');
    const onsite = CAMPAIGN_LINK_PRESETS.filter((p) => p.category === 'onsite');

    expect(digital.length).toBeGreaterThanOrEqual(4); // FB, Insta, Google, TikTok, Nextdoor
    expect(offline.length).toBeGreaterThanOrEqual(3); // Yard sign, truck, door hanger
    expect(onsite.length).toBeGreaterThanOrEqual(1); // Site promo
  });

  it('generates valid URLs for yard sign and truck wrap presets', () => {
    const yardPreset = CAMPAIGN_LINK_PRESETS.find((p) => p.id === 'yard_sign')!;
    const url = buildCampaignUrl({
      baseUrl: 'https://evergreenroofing.com/quote',
      source: yardPreset.defaultSource,
      medium: yardPreset.defaultMedium,
      campaign: yardPreset.suggestedCampaign,
    });

    expect(url).toContain('utm_source=yard_sign');
    expect(url).toContain('utm_medium=print_qr');
    expect(url).toContain('utm_campaign=jobsite_neighborhood_qr');
  });

  it('generates high-resolution SVG QR code with valid SVG tags and crisp edges', () => {
    const svg = buildCampaignQrSvg('https://evergreenroofing.com?utm_source=yard_sign', 250);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 250 250"');
    expect(svg).toContain('shape-rendering="crispEdges"');
  });
});
