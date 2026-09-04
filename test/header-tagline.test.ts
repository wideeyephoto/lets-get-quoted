import { describe, expect, it } from 'vitest';
import { getHeaderTagline, getSiteContent, shouldHideHeaderCompanyName } from '@/lib/site-content';

describe('headerTagline in site-content', () => {
  it('defaults to empty string when not provided', () => {
    const content = getSiteContent(null);
    expect(content.headerTagline).toBe('');
    expect(getHeaderTagline(null)).toBe('');
  });

  it('parses headerTagline when specified', () => {
    const content = getSiteContent({
      headerTagline: '24/7 Emergency Service • Licensed & Insured',
    });
    expect(content.headerTagline).toBe('24/7 Emergency Service • Licensed & Insured');
    expect(getHeaderTagline({ headerTagline: '24/7 Emergency Service • Licensed & Insured' })).toBe(
      '24/7 Emergency Service • Licensed & Insured'
    );
  });

  it('supports headerSlogan as a fallback alias', () => {
    const content = getSiteContent({
      headerSlogan: 'Done Right. Every Time.',
    });
    expect(content.headerTagline).toBe('Done Right. Every Time.');
    expect(getHeaderTagline({ headerSlogan: 'Done Right. Every Time.' })).toBe('Done Right. Every Time.');
  });

  it('prioritizes headerTagline over headerSlogan if both exist', () => {
    const content = getSiteContent({
      headerTagline: 'Top Tagline',
      headerSlogan: 'Fallback Slogan',
    });
    expect(content.headerTagline).toBe('Top Tagline');
  });

  it('clamps headerTagline to 100 characters', () => {
    const longText = 'A'.repeat(150);
    const content = getSiteContent({ headerTagline: longText });
    expect(content.headerTagline).toBe('A'.repeat(100));
    expect(content.headerTagline.length).toBe(100);
  });

  it('safely handles non-string values by falling back to empty string', () => {
    expect(getSiteContent({ headerTagline: 12345 }).headerTagline).toBe('');
    expect(getSiteContent({ headerTagline: null }).headerTagline).toBe('');
    expect(getSiteContent({ headerTagline: undefined }).headerTagline).toBe('');
  });

  it('coexists with hideHeaderCompanyName without interference', () => {
    const withName = getSiteContent({
      headerTagline: 'Quality First',
      hideHeaderCompanyName: false,
    });
    expect(withName.headerTagline).toBe('Quality First');
    expect(shouldHideHeaderCompanyName({ hideHeaderCompanyName: false })).toBe(false);

    const withoutName = getSiteContent({
      headerTagline: 'Quality First',
      hideHeaderCompanyName: true,
    });
    expect(withoutName.headerTagline).toBe('Quality First');
    expect(shouldHideHeaderCompanyName({ hideHeaderCompanyName: true })).toBe(true);
  });
});
