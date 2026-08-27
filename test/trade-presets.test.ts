import { describe, it, expect } from 'vitest';
import { matchTradePreset, TRADE_INTAKE_PRESETS } from '@/lib/trade-intake-presets';

describe('trade-intake-presets', () => {
  it('matches common trade variations to the correct preset', () => {
    expect(matchTradePreset('Master Plumber').id).toBe('plumbing');
    expect(matchTradePreset('Heating & Air Conditioning').id).toBe('hvac');
    expect(matchTradePreset('Roof Replacement & Gutters').id).toBe('roofing');
    expect(matchTradePreset('Licensed Electrician').id).toBe('electrical');
    expect(matchTradePreset('Lawn Care and Landscaping').id).toBe('landscaping');
    expect(matchTradePreset('Interior Painting').id).toBe('painting');
    expect(matchTradePreset('Custom Home Renovations').id).toBe('general');
    expect(matchTradePreset(null).id).toBe('general');
  });

  it('provides non-empty exclusions and questions for every preset', () => {
    for (const preset of Object.values(TRADE_INTAKE_PRESETS)) {
      expect(preset.minJobAmount).toBeGreaterThan(0);
      expect(preset.highValueLeadAmount).toBeGreaterThan(preset.minJobAmount);
      expect(preset.exclusions.length).toBeGreaterThan(0);
      expect(preset.mandatoryQuestions.length).toBeGreaterThan(0);
      expect(preset.photoPrompt).toBeTruthy();
    }
  });
});
