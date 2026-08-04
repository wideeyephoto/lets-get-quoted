import { describe, it, expect } from 'vitest';
import { parseVerificationToken, verificationTokenProblem } from '../src/lib/seo/search-console';

const TOKEN = 'k3Y-abc_DEF12345678901234567890xyz';

describe('parseVerificationToken', () => {
  it('takes a bare token', () => {
    expect(parseVerificationToken(TOKEN)).toBe(TOKEN);
    expect(parseVerificationToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it('takes the whole <meta> tag, which is what Google shows you', () => {
    expect(parseVerificationToken(`<meta name="google-site-verification" content="${TOKEN}" />`)).toBe(TOKEN);
    expect(parseVerificationToken(`<meta content="${TOKEN}" name="google-site-verification">`)).toBe(TOKEN);
    expect(parseVerificationToken(`<meta name='google-site-verification' content='${TOKEN}'>`)).toBe(TOKEN);
  });

  it('refuses anything that is not a token', () => {
    expect(parseVerificationToken('')).toBe('');
    expect(parseVerificationToken(null)).toBe('');
    expect(parseVerificationToken('https://example.com')).toBe('');
    expect(parseVerificationToken('short')).toBe('');
    // The field can only ever hold a verification token — not another tag.
    expect(parseVerificationToken('<meta name="robots" content="noindex">')).toBe('');
    expect(parseVerificationToken('<script>alert(1)</script>')).toBe('');
    expect(parseVerificationToken('abc def ghi jkl')).toBe('');
  });
});

describe('verificationTokenProblem', () => {
  it('says nothing when the field is blank — it is optional', () => {
    expect(verificationTokenProblem('')).toBeNull();
    expect(verificationTokenProblem(null)).toBeNull();
  });

  it('says nothing for a value that parses', () => {
    expect(verificationTokenProblem(TOKEN)).toBeNull();
    expect(verificationTokenProblem(`<meta name="google-site-verification" content="${TOKEN}" />`)).toBeNull();
  });

  it('names the specific mistake', () => {
    expect(verificationTokenProblem('https://search.google.com/x')).toMatch(/web address/i);
    expect(verificationTokenProblem('<meta name="robots" content="noindex">')).toMatch(/verification tag/i);
    expect(verificationTokenProblem('nope!')).toMatch(/verification code/i);
  });
});
