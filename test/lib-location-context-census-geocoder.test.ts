import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryCensusGeocoder } from '@/lib/location-context/census-geocoder';

describe('Census Geocoder', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('returns null if address is empty', async () => {
    expect(await queryCensusGeocoder('   ')).toBeNull();
    expect(await queryCensusGeocoder({ raw: '' } as any)).toBeNull();
  });

  it('returns null if fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));
    expect(await queryCensusGeocoder('123 Main St')).toBeNull();
  });

  it('returns null if res.ok is false', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await queryCensusGeocoder('123 Main St')).toBeNull();
  });

  it('returns null if no matches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: { addressMatches: [] } })
    });
    expect(await queryCensusGeocoder('123 Main St')).toBeNull();
  });

  it('returns geocoded context', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: {
          addressMatches: [{
            matchedAddress: '123 MAIN ST',
            coordinates: { x: -75.1, y: 40.1 },
            geographies: {
              Counties: [{ STATE: '42', COUNTY: '045', BASENAME: 'Delaware' }],
              'Incorporated Places': [{ BASENAME: 'Springfield' }],
              'Census Tracts': [{ TRACT: '123400' }],
              'Census Blocks': [{ BLOCK: '1001' }]
            }
          }]
        }
      })
    });
    const res = await queryCensusGeocoder('123 Main St');
    expect(res).toBeDefined();
    expect(res?.matchedAddress).toBe('123 MAIN ST');
    expect(res?.coordinates?.lat).toBe(40.1);
    expect(res?.coordinates?.lng).toBe(-75.1);
    expect(res?.stateFips).toBe('42');
    expect(res?.countyFips).toBe('045');
    expect(res?.countyName).toBe('Delaware');
    expect(res?.tract).toBe('123400');
    expect(res?.block).toBe('1001');
    expect(res?.incorporatedPlace).toBe('Springfield');
  });

  it('handles abort via timeout', async () => {
    let passedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((url: string, opts: any) => {
      passedSignal = opts.signal;
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new Error('AbortError')));
      });
    });
    
    const promise = queryCensusGeocoder('123 Main St', { timeoutMs: 10 });
    expect(await promise).toBeNull();
    expect(passedSignal?.aborted).toBe(true);
  });
});
