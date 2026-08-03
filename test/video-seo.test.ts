import { describe, expect, it } from 'vitest';
import { buildVideoObject, buildVideoListJsonLd, isoDuration, type VideoSeoContext } from '@/lib/seo/video-seo';
import type { SiteVideoItem, SiteVideoSectionContent } from '@/lib/site-content';

const FILE = 'https://xyz.supabase.co/storage/v1/object/public/site-videos/acct/clip.mp4';
const POSTER = 'https://xyz.supabase.co/storage/v1/object/public/site-images/acct/poster.jpg';

function item(over: Partial<SiteVideoItem> = {}): SiteVideoItem {
  return {
    id: 'v1', url: FILE, posterUrl: POSTER, label: 'Roof tear-off, start to finish',
    duration: 102, playbackWarning: '', uploadedAt: '2026-07-01T10:00:00.000Z',
    quote: '', author: '', authorLabel: '', ...over,
  };
}

function section(over: Partial<SiteVideoSectionContent> = {}): SiteVideoSectionContent {
  return {
    id: 'video-1', enabled: true, style: 'split',
    eyebrow: 'Our work', headline: 'Twenty years on these roofs',
    body: 'A walk through a full tear-off in Royal Oak.',
    ctaLabel: 'Get an estimate', ctaHref: '#contact', videos: [],
    location: '', timeline: '', service: '', steps: [],
    autoplay: true, loop: true, controls: false, overlay: 55, mobilePoster: true, ...over,
  };
}

const ctx: VideoSeoContext = {
  siteUrl: 'https://acme.letsgetquoted.com',
  siteUpdatedAt: '2026-06-01T00:00:00.000Z',
  businessName: 'Acme Roofing',
};

describe('isoDuration', () => {
  it('formats the shapes schema.org expects', () => {
    expect(isoDuration(42)).toBe('PT42S');
    expect(isoDuration(102)).toBe('PT1M42S');
    expect(isoDuration(3661)).toBe('PT1H1M1S');
    expect(isoDuration(120)).toBe('PT2M');
    expect(isoDuration(3600)).toBe('PT1H');
  });

  it('says nothing rather than asserting a zero-length video', () => {
    // duration 0 means "never read", not "the clip is empty" — PT0S would be a
    // claim about the video that isn't true.
    expect(isoDuration(0)).toBe('');
    expect(isoDuration(-5)).toBe('');
  });
});

describe('buildVideoObject', () => {
  it('builds a complete node for an uploaded clip', () => {
    const node = buildVideoObject({ item: item(), section: section() }, ctx)!;
    expect(node['@type']).toBe('VideoObject');
    expect(node.name).toBe('Roof tear-off, start to finish');
    expect(node.thumbnailUrl).toBe(POSTER);
    expect(node.contentUrl).toBe(FILE);
    expect(node.uploadDate).toBe('2026-07-01T10:00:00.000Z');
    expect(node.duration).toBe('PT1M42S');
    // An uploaded file has no watch page, so no embedUrl should be claimed.
    expect(node.embedUrl).toBeUndefined();
  });

  it('uses YouTube’s own thumbnail and both URLs for a link', () => {
    const node = buildVideoObject(
      { item: item({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', posterUrl: '' }), section: section() },
      ctx,
    )!;
    // hqdefault, not maxresdefault: the latter 404s on non-HD uploads, which is
    // exactly the older phone footage a contractor is likely to have up.
    expect(node.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(String(node.embedUrl)).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(node.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(node.contentUrl).toBeUndefined();
  });

  // An invalid VideoObject is worse than none: Google reports it as an error
  // against the whole page rather than skipping the one item.
  it('omits a clip with no thumbnail rather than emitting an invalid node', () => {
    expect(buildVideoObject({ item: item({ posterUrl: '' }), section: section() }, ctx)).toBeNull();
  });

  it('omits a clip whose URL we cannot play', () => {
    expect(buildVideoObject({ item: item({ url: 'https://vimeo.com/12345' }), section: section() }, ctx)).toBeNull();
  });

  it('falls back to the site’s updated_at rather than inventing today', () => {
    const node = buildVideoObject({ item: item({ uploadedAt: '' }), section: section() }, ctx)!;
    expect(node.uploadDate).toBe('2026-06-01T00:00:00.000Z');
  });

  it('drops the node entirely when no date can be established', () => {
    const node = buildVideoObject({ item: item({ uploadedAt: '' }), section: section() }, { ...ctx, siteUpdatedAt: null });
    expect(node).toBeNull();
  });

  it('ignores an unparseable date instead of passing it through', () => {
    const node = buildVideoObject({ item: item({ uploadedAt: 'last tuesday' }), section: section() }, ctx)!;
    expect(node.uploadDate).toBe('2026-06-01T00:00:00.000Z');
  });

  it('names and describes from the band when the clip has no words of its own', () => {
    const node = buildVideoObject({ item: item({ label: '' }), section: section() }, ctx)!;
    expect(node.name).toBe('Twenty years on these roofs');
    expect(node.description).toBe('A walk through a full tear-off in Royal Oak.');
  });

  it('prefers a testimonial’s own quote as the description', () => {
    const node = buildVideoObject({ item: item({ quote: 'They showed up when they said they would.' }), section: section() }, ctx)!;
    expect(node.description).toBe('They showed up when they said they would.');
  });
});

describe('buildVideoListJsonLd', () => {
  it('numbers the list in page order', () => {
    const entries = [
      { item: item({ id: 'a', label: 'First' }), section: section() },
      { item: item({ id: 'b', label: 'Second' }), section: section() },
    ];
    const list = buildVideoListJsonLd(entries, ctx)!;
    expect(list['@type']).toBe('ItemList');
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    expect(elements.map((e) => e.position)).toEqual([1, 2]);
    expect((elements[0].item as Record<string, unknown>).name).toBe('First');
  });

  it('skips the invalid ones but still numbers what is left contiguously', () => {
    const entries = [
      { item: item({ id: 'a', label: 'Good' }), section: section() },
      { item: item({ id: 'b', posterUrl: '' }), section: section() }, // no thumbnail
      { item: item({ id: 'c', label: 'Also good' }), section: section() },
    ];
    const list = buildVideoListJsonLd(entries, ctx)!;
    const elements = list.itemListElement as Array<Record<string, unknown>>;
    // A gap in position would describe a list with a hole in it.
    expect(elements.map((e) => e.position)).toEqual([1, 2]);
    expect(elements.map((e) => (e.item as Record<string, unknown>).name)).toEqual(['Good', 'Also good']);
  });

  // Caught by probing a real site: three clips in one band, none labelled, all
  // named after the band's headline — three identical VideoObjects aimed at the
  // one page built to be indexed.
  it('numbers colliding names so a band of unlabelled clips isn’t three duplicates', () => {
    const entries = [
      { item: item({ id: 'a', label: '' }), section: section() },
      { item: item({ id: 'b', label: '' }), section: section() },
      { item: item({ id: 'c', label: '' }), section: section() },
    ];
    const list = buildVideoListJsonLd(entries, ctx)!;
    const names = (list.itemListElement as Array<Record<string, unknown>>).map(
      (e) => (e.item as Record<string, unknown>).name,
    );
    expect(new Set(names).size).toBe(3);
    // The first keeps the clean name — it's the one the band actually features.
    expect(names[0]).toBe('Twenty years on these roofs');
    expect(names[1]).toBe('Twenty years on these roofs (2)');
  });

  it('leaves a properly labelled set completely alone', () => {
    const entries = [
      { item: item({ id: 'a', label: 'Tear-off' }), section: section() },
      { item: item({ id: 'b', label: 'Underlayment' }), section: section() },
    ];
    const names = (buildVideoListJsonLd(entries, ctx)!.itemListElement as Array<Record<string, unknown>>).map(
      (e) => (e.item as Record<string, unknown>).name,
    );
    expect(names).toEqual(['Tear-off', 'Underlayment']);
  });

  it('returns null rather than an empty list', () => {
    expect(buildVideoListJsonLd([], ctx)).toBeNull();
    expect(buildVideoListJsonLd([{ item: item({ posterUrl: '' }), section: section() }], ctx)).toBeNull();
  });
});
