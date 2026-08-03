import { describe, expect, it } from 'vitest';
import {
  SOCIAL_PLATFORMS,
  normalizeSocialUrl,
  socialPlatform,
  isSocialPlatformId,
  socialLinkLabel,
} from '../src/lib/socials';

describe('the platform registry', () => {
  it('has a unique id and a baked icon for every platform', () => {
    const ids = SOCIAL_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only offers handle entry where a handle identifies a business', () => {
    // Yelp/Google/BBB/Angi/Houzz/Thumbtack/LinkedIn identify by listing path, so
    // there is nothing to build from a bare word.
    for (const id of ['yelp', 'google', 'bbb', 'angi', 'houzz', 'thumbtack', 'linkedin']) {
      expect(socialPlatform(id)!.handleHost).toBeNull();
    }
    for (const id of ['facebook', 'instagram', 'tiktok', 'x', 'youtube', 'pinterest']) {
      expect(socialPlatform(id)!.handleHost).not.toBeNull();
    }
  });

  it('recognises its own ids and nothing else', () => {
    expect(isSocialPlatformId('facebook')).toBe(true);
    expect(isSocialPlatformId('myspace')).toBe(false);
  });
});

describe('normalizeSocialUrl — what people actually paste', () => {
  it('takes a plain profile URL', () => {
    expect(normalizeSocialUrl('facebook', 'https://www.facebook.com/brokepipes'))
      .toBe('https://www.facebook.com/brokepipes');
  });

  it('adds the scheme when it was left off', () => {
    expect(normalizeSocialUrl('facebook', 'facebook.com/brokepipes'))
      .toBe('https://facebook.com/brokepipes');
  });

  it('upgrades http to https rather than rejecting it', () => {
    expect(normalizeSocialUrl('yelp', 'http://www.yelp.com/biz/brokepipes'))
      .toBe('https://www.yelp.com/biz/brokepipes');
  });

  it('expands a bare @handle', () => {
    expect(normalizeSocialUrl('instagram', '@brokepipes')).toBe('https://instagram.com/brokepipes');
  });

  it('expands a bare word as a handle where that is meaningful', () => {
    expect(normalizeSocialUrl('instagram', 'brokepipes')).toBe('https://instagram.com/brokepipes');
  });

  it('keeps the @ for YouTube and TikTok, which use it in the URL', () => {
    expect(normalizeSocialUrl('youtube', '@brokepipes')).toBe('https://youtube.com/@brokepipes');
    expect(normalizeSocialUrl('tiktok', 'brokepipes')).toBe('https://tiktok.com/@brokepipes');
  });

  it('refuses a bare word for a platform that identifies by listing path', () => {
    // Better an inline "that doesn't look like a Yelp link" than a published
    // dead link to yelp.com/brokepipes.
    expect(normalizeSocialUrl('yelp', 'brokepipes')).toBeNull();
    expect(normalizeSocialUrl('linkedin', '@brokepipes')).toBeNull();
  });

  it('accepts the m. and country subdomains a phone hands out', () => {
    expect(normalizeSocialUrl('facebook', 'https://m.facebook.com/brokepipes'))
      .toBe('https://m.facebook.com/brokepipes');
    expect(normalizeSocialUrl('facebook', 'https://en-gb.facebook.com/brokepipes'))
      .toBe('https://en-gb.facebook.com/brokepipes');
  });

  it('accepts the short share domains', () => {
    expect(normalizeSocialUrl('facebook', 'https://fb.me/brokepipes')).toBe('https://fb.me/brokepipes');
    expect(normalizeSocialUrl('google', 'https://g.page/brokepipes')).toBe('https://g.page/brokepipes');
    expect(normalizeSocialUrl('google', 'https://maps.app.goo.gl/aBcDeF')).toBe('https://maps.app.goo.gl/aBcDeF');
  });

  it('treats x.com and twitter.com as the same platform', () => {
    expect(normalizeSocialUrl('x', 'https://twitter.com/brokepipes')).toBe('https://twitter.com/brokepipes');
    expect(normalizeSocialUrl('x', '@brokepipes')).toBe('https://x.com/brokepipes');
  });

  it('strips the tracking parameters a share sheet bolts on', () => {
    expect(normalizeSocialUrl('facebook', 'https://facebook.com/brokepipes?fbclid=IwAR123&mibextid=abc'))
      .toBe('https://facebook.com/brokepipes');
    expect(normalizeSocialUrl('instagram', 'https://instagram.com/brokepipes?igshid=xyz'))
      .toBe('https://instagram.com/brokepipes');
  });

  it('keeps a query parameter that is part of the identity', () => {
    expect(normalizeSocialUrl('google', 'https://google.com/maps/place?cid=12345'))
      .toBe('https://google.com/maps/place?cid=12345');
  });

  it('drops a fragment and a trailing slash', () => {
    expect(normalizeSocialUrl('facebook', 'https://facebook.com/brokepipes/#about'))
      .toBe('https://facebook.com/brokepipes');
  });

  it('survives a paste with surrounding whitespace, newlines or angle brackets', () => {
    expect(normalizeSocialUrl('facebook', '  <https://facebook.com/brokepipes>\n'))
      .toBe('https://facebook.com/brokepipes');
    expect(normalizeSocialUrl('facebook', 'https://facebook.com/broke\npipes'))
      .toBe('https://facebook.com/brokepipes');
  });
});

describe('normalizeSocialUrl — the rejections that matter', () => {
  it('rejects a link for the wrong platform', () => {
    // The single most likely real mistake: right-looking URL, wrong box.
    expect(normalizeSocialUrl('instagram', 'https://facebook.com/brokepipes')).toBeNull();
    expect(normalizeSocialUrl('yelp', 'https://houzz.com/pro/brokepipes')).toBeNull();
  });

  it('rejects a lookalike host that merely ends with the platform name', () => {
    expect(normalizeSocialUrl('facebook', 'https://notfacebook.com/brokepipes')).toBeNull();
    expect(normalizeSocialUrl('facebook', 'https://facebook.com.evil.example/brokepipes')).toBeNull();
    expect(normalizeSocialUrl('yelp', 'https://yelp.com.co/biz/x')).toBeNull();
  });

  it('rejects javascript: and data: rather than wrapping them in a scheme', () => {
    expect(normalizeSocialUrl('facebook', 'javascript:alert(1)')).toBeNull();
    expect(normalizeSocialUrl('facebook', 'JaVaScRiPt:alert(1)')).toBeNull();
    expect(normalizeSocialUrl('facebook', 'data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeSocialUrl('facebook', 'vbscript:msgbox(1)')).toBeNull();
  });

  it('rejects credentials embedded in the URL', () => {
    expect(normalizeSocialUrl('facebook', 'https://user:pass@facebook.com/brokepipes')).toBeNull();
  });

  it('rejects a bare google.com link that is not a maps or profile link', () => {
    // google.com hosts everything Google runs, so the host alone proves nothing.
    expect(normalizeSocialUrl('google', 'https://google.com/search?q=cats')).toBeNull();
    expect(normalizeSocialUrl('google', 'https://google.com/maps/place/BrokePipes'))
      .toBe('https://google.com/maps/place/BrokePipes');
  });

  it('rejects empty, whitespace-only and unknown-platform input', () => {
    expect(normalizeSocialUrl('facebook', '')).toBeNull();
    expect(normalizeSocialUrl('facebook', '   ')).toBeNull();
    expect(normalizeSocialUrl('myspace', 'https://myspace.com/brokepipes')).toBeNull();
  });

  it('rejects a handle with characters a handle cannot contain', () => {
    expect(normalizeSocialUrl('instagram', '@broke pipes')).toBeNull();
    expect(normalizeSocialUrl('instagram', '@broke/pipes/../../etc')).toBeNull();
  });
});

describe('socialLinkLabel', () => {
  it('names the business and the platform, so the icon is not the only cue', () => {
    expect(socialLinkLabel('facebook', 'BrokePipes')).toBe('BrokePipes on Facebook');
  });

  it('says what a review listing is', () => {
    expect(socialLinkLabel('yelp', 'BrokePipes')).toBe('Reviews for BrokePipes on Yelp');
  });
});
