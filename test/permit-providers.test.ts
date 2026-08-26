import { describe, it, expect } from 'vitest';
import { normalizeAddress } from '../src/lib/location-context/normalize-address';
import {
  resolvePermitHistoryProvider,
  BsaPermitProvider,
  AccelaPermitProvider,
  OpenGovPermitProvider,
  OpenDataPermitProvider,
  ManualLinkPermitProvider,
} from '../src/lib/permit-intel/providers';
import { getPropertyPermitHistory } from '../src/lib/permit-intel/permit-history-service';

describe('Permit History Provider Adapters', () => {
  it('resolves BsaPermitProvider for City of Royal Oak', () => {
    const parsed = normalizeAddress('211 S Williams St, Royal Oak, MI 48067');
    const provider = resolvePermitHistoryProvider('mi-royal-oak', parsed);
    expect(provider).toBeInstanceOf(BsaPermitProvider);
    expect(provider.providerId).toBe('bsa_accessmygov');
  });

  it('resolves AccelaPermitProvider for City of Grand Rapids', () => {
    const parsed = normalizeAddress('300 Monroe Ave NW, Grand Rapids, MI 49503');
    const provider = resolvePermitHistoryProvider('mi-grand-rapids', parsed);
    expect(provider).toBeInstanceOf(AccelaPermitProvider);
    expect(provider.providerId).toBe('accela');
  });

  it('resolves OpenGovPermitProvider for City of Ann Arbor', () => {
    const parsed = normalizeAddress('301 E Huron St, Ann Arbor, MI 48104');
    const provider = resolvePermitHistoryProvider('mi-ann-arbor', parsed);
    expect(provider).toBeInstanceOf(OpenGovPermitProvider);
    expect(provider.providerId).toBe('opengov');
  });

  it('resolves OpenDataPermitProvider for City of Detroit BSEED', () => {
    const parsed = normalizeAddress('2 Woodward Ave, Detroit, MI 48226');
    const provider = resolvePermitHistoryProvider('mi-detroit', parsed);
    expect(provider).toBeInstanceOf(OpenDataPermitProvider);
    expect(provider.providerId).toBe('open_data_gis');
  });

  it('resolves ManualLinkPermitProvider for unknown jurisdictions as fallback', () => {
    const parsed = normalizeAddress('123 Main St, Unknown, OH 43215');
    const provider = resolvePermitHistoryProvider('unknown-jurisdiction', parsed);
    expect(provider).toBeInstanceOf(ManualLinkPermitProvider);
    expect(provider.providerId).toBe('manual_link');
  });

  it('returns verified history records and AccessMyGov portal search link for Royal Oak pilot', async () => {
    const history = await getPropertyPermitHistory('211 S Williams St, Royal Oak, MI 48067');

    expect(history.authorityId).toBe('mi-royal-oak');
    expect(history.authorityName).toBe('City of Royal Oak');
    expect(history.portalSearchUrl).toContain('accessmygov.com/BuildingPermits/Search?uid=1349');
    expect(history.records.length).toBeGreaterThan(0);

    const roofPermit = history.records.find((r) => r.permitType.includes('Roofing'));
    expect(roofPermit).toBeDefined();
    expect(roofPermit?.permitNumber).toBe('PB-2023-0482');
    expect(roofPermit?.status).toBe('closed');
    expect(roofPermit?.valuation).toBe(9400);
    expect(roofPermit?.contractorName).toContain('Motor City Roofing');
  });
});
