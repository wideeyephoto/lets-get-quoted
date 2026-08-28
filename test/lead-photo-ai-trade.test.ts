import { describe, it, expect } from 'vitest';
import { normalizeVisualAnalysis } from '../src/lib/lead-photo-ai';

describe('Lead Photo AI - Trade Equipment & Code Flag Normalization', () => {
  it('normalizes structured technical equipment data for HVAC', () => {
    const rawHvac = {
      summary: 'Outdoor Carrier 3-ton condenser with visible coil hail damage and low refrigerant pressure.',
      detectedEquipment: [
        {
          type: 'AC Condenser',
          brand: 'Carrier',
          model: '24ACC636A003',
          specs: '3-Ton 16-SEER R-410A',
          approxAgeYears: 7,
        },
        {
          type: 'Furnace',
          brand: 'Carrier',
          model: '58SB0A090E17',
          specs: '80% AFUE 90,000 BTU Natural Gas',
          approxAgeYears: 7,
        },
      ],
      observedIssues: [
        'Bent aluminum condenser fins on south face',
        'Contactor points show heavy electrical pitting',
      ],
      suggestedPickList: [
        {
          category: 'HVAC Components',
          name: 'Fin Comb Tool & 30A Single-Pole Contactor',
          quantity: '1 pc',
          notes: 'Straighten airflow fins and replace worn electrical contactor',
        },
      ],
      safetyOrCodeFlags: [
        'Electrical disconnect box missing weather seal gasket',
      ],
      urgency: 'medium',
      confidence: 0.95,
    };

    const analysis = normalizeVisualAnalysis(rawHvac);
    expect(analysis).not.toBeNull();
    expect(analysis?.detectedEquipment.length).toBe(2);
    expect(analysis?.detectedEquipment[0].brand).toBe('Carrier');
    expect(analysis?.detectedEquipment[0].specs).toContain('3-Ton 16-SEER');
    expect(analysis?.observedIssues).toContain('Bent aluminum condenser fins on south face');
    expect(analysis?.safetyOrCodeFlags).toContain('Electrical disconnect box missing weather seal gasket');
  });

  it('normalizes electrical panel and flags obsolete fire hazard panels', () => {
    const rawElectrical = {
      summary: 'Observed vintage 100A Federal Pacific Stab-Lok electrical panel with double-tapped breakers.',
      detectedEquipment: [
        {
          type: 'Main Panel',
          brand: 'Federal Pacific',
          model: 'Stab-Lok 16-24',
          specs: '100A Main Breaker, 16 Spaces',
          approxAgeYears: 45,
        },
      ],
      observedIssues: [
        'Double-tapped 20A branch circuit breakers on slots 4 and 6',
        'Scorching visible on busbar connection for range breaker',
      ],
      suggestedPickList: [
        {
          category: 'Electrical',
          name: '200A 40-Space Square D QO Main Breaker Panel Package',
          quantity: '1 kit',
          notes: 'Full panel replacement to eliminate Stab-Lok safety hazard and upgrade to 200A',
        },
      ],
      safetyOrCodeFlags: [
        'Federal Pacific Stab-Lok panel fire hazard - known failure to trip under overload condition',
        'Pre-1978 wiring with ungrounded 2-wire circuits',
      ],
      urgency: 'high',
      confidence: 0.92,
    };

    const analysis = normalizeVisualAnalysis(rawElectrical);
    expect(analysis).not.toBeNull();
    expect(analysis?.urgency).toBe('high');
    expect(analysis?.detectedEquipment[0].brand).toBe('Federal Pacific');
    expect(analysis?.safetyOrCodeFlags).toContain(
      'Federal Pacific Stab-Lok panel fire hazard - known failure to trip under overload condition'
    );
  });

  it('handles null, undefined, and empty objects gracefully', () => {
    expect(normalizeVisualAnalysis(null)).toBeNull();
    expect(normalizeVisualAnalysis(undefined)).toBeNull();
    expect(normalizeVisualAnalysis({})).toBeNull();
    expect(normalizeVisualAnalysis({ summary: '' })).toBeNull();
  });
});
