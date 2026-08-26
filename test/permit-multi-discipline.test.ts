import { describe, it, expect } from 'vitest';
import { classifyWorkScope } from '../src/lib/permit-intel/requirement-engine';

describe('Multi-Discipline Work Scope Classification', () => {
  it('classifies electrical panel and EV charger work to electrical discipline', () => {
    const scope = classifyWorkScope('Install 200A service panel upgrade, 240V 50A EV charger in garage');
    expect(scope.trade).toBe('electrical');
    expect(scope.discipline).toBe('electrical');
  });

  it('classifies furnace and heat pump replacement to mechanical discipline', () => {
    const scope = classifyWorkScope('Remove old boiler, install 96% modulating gas furnace and 3-ton heat pump');
    expect(scope.trade).toBe('mechanical');
    expect(scope.discipline).toBe('mechanical');
  });

  it('classifies water heater and repiping to plumbing discipline', () => {
    const scope = classifyWorkScope('Replace 50 gallon power vent water heater and install backflow preventer');
    expect(scope.trade).toBe('plumbing');
    expect(scope.discipline).toBe('plumbing');
  });

  it('classifies roofing tear-off to building discipline with square calculation', () => {
    const scope = classifyWorkScope('Tear off 28 squares architectural shingles, install ice & water shield');
    expect(scope.trade).toBe('roofing');
    expect(scope.discipline).toBe('building');
    expect(scope.roofSquares).toBe(28);
  });

  it('classifies gutter and downspout replacement to building discipline', () => {
    const scope = classifyWorkScope('Seamless 6-inch aluminum gutters and downspouts');
    expect(scope.trade).toBe('gutters');
    expect(scope.discipline).toBe('building');
  });
});
