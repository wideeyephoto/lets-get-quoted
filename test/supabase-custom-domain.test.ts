import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseHosts } from '@/lib/supabase-hosts.mjs';
import { isAllowedProxyUrl } from '@/lib/photo-proxy-guard';
import { isTrustedVoiceMediaUrl } from '@/lib/voice/auth';
import { isOptimizableHost } from '@/lib/templates/SafeImage';

const custom = 'api.letsgetquoted.com';
const legacy = 'mfuvvtrkipkigwqqtcal.supabase.co';
afterEach(() => vi.unstubAllEnvs());
describe('Supabase custom-domain migration', () => {
  it('keeps old and new stored images usable without trusting another project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${custom}`);
    for (const host of [custom, legacy]) {
      const url = `https://${host}/storage/v1/object/public/photos/example.jpg`;
      expect(isAllowedProxyUrl(new URL(url))).toBe(true);
      expect(isOptimizableHost(url)).toBe(true);
      expect(isTrustedVoiceMediaUrl(url)).toBe(true);
    }
    expect(isAllowedProxyUrl(new URL('https://another.supabase.co/photo.jpg'))).toBe(false);
    expect(isOptimizableHost('https://another.supabase.co/photo.jpg')).toBe(false);
    expect(isAllowedProxyUrl(new URL(`https://${custom}.evil.example/photo.jpg`))).toBe(false);
  });
  it('does not add production hosts to staging', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://staging.supabase.co');
    expect(supabaseHosts(process.env.NEXT_PUBLIC_SUPABASE_URL)).toEqual(['staging.supabase.co']);
    expect(isAllowedProxyUrl(new URL(`https://${legacy}/photo.jpg`))).toBe(false);
    expect(isOptimizableHost(`https://${custom}/photo.jpg`)).toBe(false);
  });
  it('preserves rollback compatibility and rejects malformed config', () => {
    expect(supabaseHosts(`https://${legacy}`)).toEqual([custom, legacy]);
    expect(supabaseHosts(undefined)).toEqual([]);
    expect(supabaseHosts('not a url')).toEqual([]);
  });
});
