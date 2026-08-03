import { describe, expect, it } from 'vitest';
import { getHeroVideo, getSiteContent } from '@/lib/site-content';

const FILE = 'https://xyz.supabase.co/storage/v1/object/public/site-videos/acct/hero.mp4';

// This gate decides whether every template's hero renders a <video> or the <img>
// it has always rendered. It is on the critical path of every published site, so
// the interesting cases are all the ones where it must say NO.
describe('getHeroVideo', () => {
  it('is null for every site that exists today', () => {
    // No heroVideo key at all — which is the state of the entire customer base.
    expect(getHeroVideo({})).toBeNull();
    expect(getHeroVideo(null)).toBeNull();
    expect(getHeroVideo(undefined)).toBeNull();
  });

  it('is null when the field exists but is empty', () => {
    expect(getHeroVideo({ heroVideo: { url: '', posterUrl: '', playbackWarning: '' } })).toBeNull();
    expect(getHeroVideo({ heroVideo: { url: '   ' } })).toBeNull();
  });

  it('returns an uploaded file with its poster', () => {
    const video = getHeroVideo({ heroVideo: { url: FILE, posterUrl: 'https://x/p.jpg' } });
    expect(video).toEqual({ url: FILE, posterUrl: 'https://x/p.jpg' });
  });

  // A hero fills a shaped box, so its media must be croppable with object-fit.
  // A YouTube iframe letterboxes inside whatever box it gets and paints its own
  // title bar on top — so a link here would be a black bar behind the headline.
  it('refuses YouTube, which cannot cover a hero', () => {
    expect(getHeroVideo({ heroVideo: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })).toBeNull();
    expect(getHeroVideo({ heroVideo: { url: 'https://youtu.be/dQw4w9WgXcQ' } })).toBeNull();
  });

  it('refuses anything that is not a playable file', () => {
    expect(getHeroVideo({ heroVideo: { url: 'https://vimeo.com/12345' } })).toBeNull();
    expect(getHeroVideo({ heroVideo: { url: '/local/clip.mp4' } })).toBeNull(); // relative resolves to the tenant domain
    expect(getHeroVideo({ heroVideo: { url: 'https://example.com/page.html' } })).toBeNull();
    expect(getHeroVideo({ heroVideo: { url: 'javascript:alert(1)' } })).toBeNull();
  });

  it('survives junk in the stored field without throwing', () => {
    expect(getHeroVideo({ heroVideo: 'nope' })).toBeNull();
    expect(getHeroVideo({ heroVideo: 42 })).toBeNull();
    expect(getHeroVideo({ heroVideo: [] })).toBeNull();
    expect(getHeroVideo({ heroVideo: { url: null, posterUrl: {} } })).toBeNull();
  });

  it('parses to a stable empty shape so the builder always has fields to bind', () => {
    expect(getSiteContent({}).heroVideo).toEqual({ url: '', posterUrl: '', playbackWarning: '' });
  });

  it('keeps the playback warning through a round trip', () => {
    const content = getSiteContent({ heroVideo: { url: FILE, posterUrl: '', playbackWarning: 'This clip is HEVC.' } });
    expect(content.heroVideo.playbackWarning).toBe('This clip is HEVC.');
  });
});
