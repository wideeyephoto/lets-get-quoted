import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { normalizeAddress } from '../src/lib/location-context/normalize-address';

describe('Location Context - Jurisdiction Resolution', () => {
  it('resolves City of Royal Oak building inspection authority from address', () => {
    const address = normalizeAddress('211 S Williams St, Royal Oak, MI 48067');
    const match = resolveJurisdiction(address, 'building');

    expect(match.authorityId).toBe('mi-royal-oak');
    expect(match.authorityName).toBe('City of Royal Oak');
    expect(match.agencyName).toBe('City of Royal Oak Building Inspection');
    expect(match.discipline).toBe('building');
    expect(match.isAuthoritative).toBe(true);
    expect(match.confidence).toBe('verified');
    expect(match.sourceUrl).toContain('romi.gov');
  });

  it('resolves discipline-specific authorities (e.g. electrical in Detroit)', () => {
    const address = normalizeAddress('2 Woodward Ave, Detroit, MI 48226');
    const match = resolveJurisdiction(address, 'electrical');

    expect(match.authorityId).toBe('mi-detroit');
    expect(match.authorityName).toBe('City of Detroit');
    expect(match.agencyName).toBe('Detroit BSEED Electrical Division');
    expect(match.discipline).toBe('electrical');
    expect(match.isAuthoritative).toBe(true);
  });

  it('falls back to Michigan state BCC for uncurated Michigan municipalities', () => {
    const address = normalizeAddress('123 Northwoods Way, Alpena, MI 49707');
    const match = resolveJurisdiction(address, 'building');

    expect(match.authorityId).toContain('mi-generic');
    expect(match.state).toBe('MI');
    expect(match.isAuthoritative).toBe(false);
    expect(match.confidence).toBe('medium');
    expect(match.sourceUrl).toContain('michigan.gov/lara');
  });

  it('handles national generic fallback when outside Michigan', () => {
    const address = normalizeAddress('100 S Biscayne Blvd, Miami, FL 33131');
    const match = resolveJurisdiction(address, 'building');

    expect(match.isAuthoritative).toBe(false);
    expect(match.confidence).toBe('low');
    expect(match.authorityName).toContain('Miami');
  });
});
