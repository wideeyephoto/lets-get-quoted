import { describe, expect, it } from 'vitest';

import { trustedProviderCallbackOrigin } from '@/lib/app-origin';

describe('trusted provider callback origin', () => {
  const origin = (appUrl: string | undefined, root = 'letsgetquoted.com') =>
    trustedProviderCallbackOrigin({
      NEXT_PUBLIC_APP_URL: appUrl,
      NEXT_PUBLIC_ROOT_DOMAIN: root,
    });

  it('accepts only the configured LGQ apex or one of its subdomains', () => {
    expect(origin('https://letsgetquoted.com')).toBe('https://letsgetquoted.com');
    expect(origin('https://app.letsgetquoted.com/')).toBe('https://app.letsgetquoted.com');
    expect(origin('https://staging.letsgetquoted.com')).toBe('https://staging.letsgetquoted.com');
  });

  it.each([
    undefined,
    '',
    'http://app.letsgetquoted.com',
    'https://user:secret@app.letsgetquoted.com',
    'https://app.letsgetquoted.com:444',
    'https://app.letsgetquoted.com/callback-prefix',
    'https://app.letsgetquoted.com?next=https://attacker.example',
    'https://app.letsgetquoted.com#fragment',
    'https://attacker.example',
    'https://letsgetquoted.com.attacker.example',
    'not a URL',
  ])('rejects an unsafe callback destination: %s', (value) => {
    expect(origin(value)).toBeNull();
  });

  it('fails closed when the configured root is not a plain hostname', () => {
    expect(origin('https://app.letsgetquoted.com', 'https://letsgetquoted.com')).toBeNull();
    expect(origin('https://app.letsgetquoted.com', 'letsgetquoted.com/path')).toBeNull();
  });
});
