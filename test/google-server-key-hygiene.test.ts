import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkStreetViewAvailability,
  getSatelliteStaticImageUrl,
} from '@/lib/property-intel/google-streetview';

describe('Google Maps Server Key Hygiene', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GOOGLE_MAPS_API_KEY = 'AIzaSySECRET_SERVER_KEY_12345';
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('never embeds GOOGLE_MAPS_API_KEY into getSatelliteStaticImageUrl', () => {
    const sat = getSatelliteStaticImageUrl(40.7128, -74.006);
    expect(sat.imageUrl).not.toContain('AIzaSySECRET_SERVER_KEY_12345');
    // With no public key configured, it returns empty string rather than leaking the secret
    expect(sat.imageUrl).toBe('');
  });

  it('embeds NEXT_PUBLIC_GOOGLE_MAPS_API_KEY into getSatelliteStaticImageUrl when configured', () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'AIzaSyPUBLIC_CLIENT_KEY_99999';
    const sat = getSatelliteStaticImageUrl(40.7128, -74.006);
    expect(sat.imageUrl).toContain('AIzaSyPUBLIC_CLIENT_KEY_99999');
    expect(sat.imageUrl).not.toContain('AIzaSySECRET_SERVER_KEY_12345');
  });

  it('uses server key for metadata check but does NOT leak it in imageUrl', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      expect(urlStr).toContain('AIzaSySECRET_SERVER_KEY_12345');
      return new Response(JSON.stringify({ status: 'OK', date: '2026-05', pano_id: 'pano123' }), {
        status: 200,
      });
    });

    const info = await checkStreetViewAvailability(40.7128, -74.006);
    expect(info.available).toBe(true);
    // Since NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set, imageUrl must be null and never leak the server key
    expect(info.imageUrl).toBeNull();

    fetchSpy.mockRestore();
  });
});
