import { describe, it, expect } from 'vitest';
import {
  TRADE_INTAKE_PRESETS,
  matchTradePreset,
  getTradeIntakePresetsList,
  getDefaultLeadFiltersForTrade,
} from '../src/lib/trade-intake-presets';
import type { TradeFamily } from '../src/lib/property-intel/profile';

describe('Trade Intake Presets - 13 Canonical Families', () => {
  const canonicalFamilies: TradeFamily[] = [
    'roofing',
    'siding',
    'solar',
    'plumbing',
    'hvac',
    'electrical',
    'finishing',
    'flooring',
    'insulation',
    'window_installation',
    'outdoor_maintenance',
    'landscaping',
    'general',
  ];

  it('defines valid presets for all 13 canonical trade families', () => {
    for (const family of canonicalFamilies) {
      const preset = TRADE_INTAKE_PRESETS[family];
      expect(preset).toBeDefined();
      expect(preset.id).toBe(family);
      expect(preset.name).toBeTruthy();
      expect(preset.minJobAmount).toBeGreaterThan(0);
      expect(preset.highValueLeadAmount).toBeGreaterThan(preset.minJobAmount);
      expect(preset.exclusions.length).toBeGreaterThan(0);
      expect(preset.mandatoryQuestions.length).toBeGreaterThan(0);
      expect(preset.photoPrompt).toBeTruthy();
      expect(preset.photoGuidance).toBeTruthy();
      expect(preset.siteVisitTriggers.length).toBeGreaterThan(0);
      expect(preset.equipmentSpecs.length).toBeGreaterThan(0);
      expect(preset.description).toBeTruthy();
    }
  });

  it('correctly matches free text trade strings to canonical presets', () => {
    expect(matchTradePreset('Licensed Plumber').id).toBe('plumbing');
    expect(matchTradePreset('Emergency Drain Cleaning').id).toBe('plumbing');
    expect(matchTradePreset('HVAC Service & Heating Repair').id).toBe('hvac');
    expect(matchTradePreset('Roofer & Gutter Specialist').id).toBe('roofing');
    expect(matchTradePreset('Master Electrician').id).toBe('electrical');
    expect(matchTradePreset('Residential Painting & Drywall').id).toBe('finishing');
    expect(matchTradePreset('Hardwood Flooring & Tile').id).toBe('flooring');
    expect(matchTradePreset('Attic Insulation & Air Sealing').id).toBe('insulation');
    expect(matchTradePreset('Window & Door Replacement').id).toBe('window_installation');
    expect(matchTradePreset('Power Washing & Window Cleaning').id).toBe('outdoor_maintenance');
    expect(matchTradePreset('Lawn Care & Landscape Design').id).toBe('landscaping');
    expect(matchTradePreset('Siding & Trim Contractor').id).toBe('siding');
    expect(matchTradePreset('Solar Panel Installer').id).toBe('solar');
    expect(matchTradePreset('General Contractor & Remodeler').id).toBe('general');
  });

  it('returns default lead filters calibrated to the specific trade', () => {
    const plumberFilters = getDefaultLeadFiltersForTrade('Plumbing');
    expect(plumberFilters.minJobAmount).toBe(150);
    expect(plumberFilters.exclusions).toContain('mobile home underground mains');

    const generalFilters = getDefaultLeadFiltersForTrade('General Contractor');
    expect(generalFilters.minJobAmount).toBe(1000);
    expect(generalFilters.exclusions).toContain('commercial tenant buildouts');

    const rooferFilters = getDefaultLeadFiltersForTrade('Roofing');
    expect(rooferFilters.minJobAmount).toBe(500);
    expect(rooferFilters.exclusions).toContain('slate roofs');
  });

  it('lists all trade presets excluding unknown for UI selection', () => {
    const list = getTradeIntakePresetsList();
    expect(list.length).toBe(13);
    expect(list.find((p) => p.id === 'unknown')).toBeUndefined();
  });
});
