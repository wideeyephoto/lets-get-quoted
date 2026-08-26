import { describe, it, expect } from 'vitest';
import { buildSignupUrl, APP_SIGNUP_URL } from '@/lib/signup-intent';

describe('marketing signup link builder', () => {
  it('preserves existing goal=build_site on default invocation', () => {
    const url = buildSignupUrl();
    expect(url).toBe(APP_SIGNUP_URL);
    expect(url).toBe('https://app.letsgetquoted.com/start?goal=build_site');
  });

  it('appends trade parameter cleanly without breaking query string', () => {
    const url = buildSignupUrl({ trade: 'holiday-lighting' });
    expect(url).toBe('https://app.letsgetquoted.com/start?goal=build_site&trade=holiday-lighting');
    // Ensure no double ? (e.g. ?goal=build_site?trade=...)
    expect((url.match(/\?/g) || []).length).toBe(1);
  });

  it('appends source and city parameters correctly', () => {
    const url = buildSignupUrl({ trade: 'lawn-care', city: 'austin', source: 'pricing' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('goal')).toBe('build_site');
    expect(parsed.searchParams.get('trade')).toBe('lawn-care');
    expect(parsed.searchParams.get('city')).toBe('austin');
    expect(parsed.searchParams.get('source')).toBe('pricing');
  });

  it('handles custom base URL', () => {
    const url = buildSignupUrl({ trade: 'plumbers' }, 'https://custom.domain.com');
    expect(url).toBe('https://custom.domain.com/start?goal=build_site&trade=plumbers');
  });
});
