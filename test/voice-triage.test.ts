import { describe, expect, it } from 'vitest';
import { detectCallEmergency } from '@/lib/voice/triage';

describe('detectCallEmergency', () => {
  it('detects critical water leak and flooding emergencies', () => {
    const res = detectCallEmergency('Caller states a burst pipe in the basement is flooding the laundry room.');
    expect(res.isEmergency).toBe(true);
    expect(res.hazardType).toBe('water_leak_flooding');
    expect(res.severity).toBe('critical');
  });

  it('detects dangerous gas leak odor hazards', () => {
    const res = detectCallEmergency('Homeowner called to report a strong gas leak smell near the water heater.');
    expect(res.isEmergency).toBe(true);
    expect(res.hazardType).toBe('gas_leak_hazard');
    expect(res.severity).toBe('critical');
  });

  it('detects electrical sparks and fire hazards', () => {
    const res = detectCallEmergency('The main electrical panel is sparking with a burning smell.');
    expect(res.isEmergency).toBe(true);
    expect(res.hazardType).toBe('electrical_fire_hazard');
    expect(res.severity).toBe('critical');
  });

  it('detects heating failures in freezing conditions', () => {
    const res = detectCallEmergency('Furnace broke and it is freezing inside the home with pipes at risk.');
    expect(res.isEmergency).toBe(true);
    expect(res.hazardType).toBe('no_heat_winter');
    expect(res.severity).toBe('high');
  });

  it('detects sewer backups', () => {
    const res = detectCallEmergency('The toilet is overflowing with a severe sewer backup in the ground floor bathroom.');
    expect(res.isEmergency).toBe(true);
    expect(res.hazardType).toBe('sewer_backup');
    expect(res.severity).toBe('high');
  });

  it('identifies standard estimate calls as non-emergency', () => {
    const res = detectCallEmergency('Homeowner would like a quote to remodel their master bathroom next month.');
    expect(res.isEmergency).toBe(false);
    expect(res.hazardType).toBeNull();
    expect(res.severity).toBe('normal');
  });
});
