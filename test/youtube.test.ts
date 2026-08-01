import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl, youTubeEmbedSrc, youTubeThumbnail } from '@/lib/youtube';
import { getSiteContent, isIntroVideoLive } from '@/lib/site-content';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeUrl', () => {
  it('accepts every shape a contractor might paste', () => {
    for (const input of [
      ID,
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      // No scheme — what you get pasting from a phone's address bar.
      `www.youtube.com/watch?v=${ID}`,
      `youtu.be/${ID}`,
      // Extra params riding along from a share link.
      `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2&pp=abc`,
    ]) {
      expect(parseYouTubeUrl(input), input).toEqual({ id: ID, start: 0 });
    }
  });

  it('reads the timestamp in each format YouTube writes', () => {
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?t=90s`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.start).toBe(90);
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)?.start).toBe(3723);
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=45`)?.start).toBe(45);
  });

  it('rejects anything that is not a YouTube video', () => {
    for (const input of [
      '',
      '   ',
      null,
      undefined,
      'not a url',
      'https://vimeo.com/123456789',
      // Lookalike host — the check is on the hostname, not a substring.
      `https://youtube.com.evil.test/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      // Right host, but no video on it.
      'https://www.youtube.com/@somechannel',
      'https://www.youtube.com/watch?v=tooshort',
      'https://www.youtube.com/results?search_query=plumber',
    ]) {
      expect(parseYouTubeUrl(input), String(input)).toBeNull();
    }
  });
});

describe('youTubeEmbedSrc', () => {
  it('pairs autoplay with mute, because an unmuted autoplay never starts', () => {
    const src = youTubeEmbedSrc({ id: ID, start: 0 }, { autoplay: true });
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
  });

  it('uses the no-cookie host and keeps suggestions off other channels', () => {
    const src = youTubeEmbedSrc({ id: ID, start: 0 }, { autoplay: false });
    expect(src.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(src).toContain('rel=0');
    // iOS takes the video fullscreen over the estimate without this.
    expect(src).toContain('playsinline=1');
  });

  it('only sends a start offset when there is one', () => {
    expect(youTubeEmbedSrc({ id: ID, start: 0 }, { autoplay: true })).not.toContain('start=');
    expect(youTubeEmbedSrc({ id: ID, start: 42 }, { autoplay: true })).toContain('start=42');
  });

  it('builds a thumbnail that exists for every video', () => {
    expect(youTubeThumbnail({ id: ID, start: 0 })).toBe(`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  });
});

describe('intro video content', () => {
  it('defaults to off with no link', () => {
    const video = getSiteContent({}).estimateRanges.introVideo;
    expect(video.enabled).toBe(false);
    expect(isIntroVideoLive(video)).toBe(false);
  });

  it('keeps the owner switch raw so ticking it in the builder sticks', () => {
    // Switched on before a link is pasted: `enabled` must survive, or the
    // builder's checkbox un-ticks itself and the URL field never appears.
    const video = getSiteContent({ estimateRanges: { introVideo: { enabled: true } } }).estimateRanges.introVideo;
    expect(video.enabled).toBe(true);
    expect(isIntroVideoLive(video)).toBe(false);
  });

  it('goes live only once the link actually parses', () => {
    const good = getSiteContent({ estimateRanges: { introVideo: { enabled: true, url: `https://youtu.be/${ID}` } } });
    expect(isIntroVideoLive(good.estimateRanges.introVideo)).toBe(true);

    const bad = getSiteContent({ estimateRanges: { introVideo: { enabled: true, url: 'https://vimeo.com/123' } } });
    expect(isIntroVideoLive(bad.estimateRanges.introVideo)).toBe(false);
  });

  it('never renders when the owner has switched it off, link or not', () => {
    const off = getSiteContent({ estimateRanges: { introVideo: { enabled: false, url: `https://youtu.be/${ID}` } } });
    expect(isIntroVideoLive(off.estimateRanges.introVideo)).toBe(false);
  });
});
