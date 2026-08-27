import { describe, expect, it } from 'vitest';
import { getTradePhotoTip } from '@/lib/trade-photo-tips';

describe('Trade photo tips generator', () => {
  it('returns plumbing tips when trade or description mentions water heaters, pipes, or leaks', () => {
    const tip = getTradePhotoTip('Plumbing', 'Water heater leaking in basement');
    expect(tip).toContain('Stand back 3–4 ft');
    expect(tip).toContain('pipes and the base of the unit');
  });

  it('returns electrical tips when electrical keywords are present', () => {
    const tip = getTradePhotoTip('Electrical', 'Subpanel tripping');
    expect(tip).toContain('Open the panel door');
    expect(tip).toContain('breakers');
  });

  it('returns HVAC tips when furnace or AC is mentioned', () => {
    const tip = getTradePhotoTip('HVAC', 'Furnace not blowing hot air');
    expect(tip).toContain('data badge');
    expect(tip).toContain('condenser');
  });

  it('returns roofing tips for roof and shingle jobs', () => {
    const tip = getTradePhotoTip('Roofing', 'Missing shingles after storm');
    expect(tip).toContain('roofline, pitch');
  });

  it('returns general tips when trade is unknown or generic', () => {
    const tip = getTradePhotoTip(null, 'Some odd repair around the house');
    expect(tip).toContain('Step back 3–5 ft');
  });
});
