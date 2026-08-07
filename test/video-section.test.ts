import { describe, expect, it } from 'vitest';
import {
  getPublishedVideoSection,
  getSiteContent,
  videoStyleCapacity,
  type SiteVideoItem,
} from '@/lib/site-content';
import { formatVideoDuration, isPlayableVideoUrl, parseVideoSource, videoPoster } from '@/lib/video-source';
import { youTubeEmbedSrc } from '@/lib/youtube';

const YT = 'dQw4w9WgXcQ';
const FILE = 'https://xyz.supabase.co/storage/v1/object/public/site-videos/acct/clip.mp4';

function video(overrides: Partial<SiteVideoItem> = {}): SiteVideoItem {
  // playbackWarning and uploadedAt are required and both use '' for "nothing to
  // say" — '' is a real value on this type, not a placeholder for a missing one.
  return { id: 'v1', url: FILE, posterUrl: '', label: '', duration: 0, playbackWarning: '', uploadedAt: '', quote: '', author: '', authorLabel: '', ...overrides };
}

describe('video section defaults', () => {
  const content = getSiteContent({}).videoSections[0];

  it('starts on the safest arrangement with sane playback', () => {
    expect(content.style).toBe('split');
    expect(content.enabled).toBe(true);
    expect(content.autoplay).toBe(true);
    expect(content.loop).toBe(true);
    // Controls default OFF: a chrome-free clip is the one that looks designed.
    expect(content.controls).toBe(false);
    expect(content.overlay).toBe(55);
    expect(content.mobilePoster).toBe(true);
  });

  it('ships wording an owner can publish or replace, not empty fields', () => {
    expect(content.headline).toBeTruthy();
    expect(content.eyebrow).toBeTruthy();
    expect(content.ctaLabel).toBeTruthy();
    expect(content.ctaHref).toBe('#contact');
    expect(content.steps.map((step) => step.title)).toEqual(['Free estimate', 'Approve quote', 'We get to work', 'Final walkthrough']);
  });

  it('respects an explicitly emptied step list instead of re-seeding it', () => {
    expect(getSiteContent({ videoSection: { steps: [] } }).videoSections[0].steps).toEqual([]);
  });

  it('clamps the overlay slider and falls back when it is nonsense', () => {
    expect(getSiteContent({ videoSection: { overlay: 200 } }).videoSections[0].overlay).toBe(90);
    expect(getSiteContent({ videoSection: { overlay: -5 } }).videoSections[0].overlay).toBe(55);
    expect(getSiteContent({ videoSection: { overlay: 'dark' } }).videoSections[0].overlay).toBe(55);
    expect(getSiteContent({ videoSection: { overlay: 0 } }).videoSections[0].overlay).toBe(0);
  });

  it('falls back to a known style when the saved one is unrecognized', () => {
    expect(getSiteContent({ videoSection: { style: 'carousel' } }).videoSections[0].style).toBe('split');
    expect(getSiteContent({ videoSection: { style: 'reel' } }).videoSections[0].style).toBe('reel');
  });
});

// One band became a list, and these tests kept reading the old single object.
// getSiteContent() returns undefined for it, so twelve of them died on
// "Cannot read properties of undefined" — which is not a failure that tells you
// the shape changed, and left the migration below covered by nothing at all.
describe('the single-band shape still loads', () => {
  it('reads a site saved before there could be more than one video band', () => {
    // Legacy on disk: a `videoSection` OBJECT, no `videoSections` array. Nothing
    // rewrites it until the owner next saves, so this has to keep working for
    // as long as any unsaved site exists — which is every site, until it doesn't.
    const legacy = getSiteContent({
      videoSection: { style: 'reel', headline: 'Twenty years on these roofs', videos: [video({ id: 'a' })] },
    });
    expect(legacy.videoSections).toHaveLength(1);
    expect(legacy.videoSections[0].style).toBe('reel');
    expect(legacy.videoSections[0].headline).toBe('Twenty years on these roofs');
    expect(legacy.videoSections[0].videos).toHaveLength(1);
  });

  it('prefers the array when a site has been saved since', () => {
    const migrated = getSiteContent({
      videoSection: { headline: 'the old one' },
      videoSections: [{ id: 'video-1', headline: 'the new one' }],
    });
    expect(migrated.videoSections).toHaveLength(1);
    expect(migrated.videoSections[0].headline).toBe('the new one');
  });
});

describe('publishing gate', () => {
  it('publishes nothing until there is something to play', () => {
    expect(getPublishedVideoSection({})).toBeNull();
    expect(getPublishedVideoSection({ videoSection: { videos: [video({ url: '' })] } })).toBeNull();
    expect(getPublishedVideoSection({ videoSection: { videos: [video({ url: '   ' })] } })).toBeNull();
  });

  it('stays off when the owner switched it off, video or not', () => {
    expect(getPublishedVideoSection({ videoSection: { enabled: false, videos: [video()] } })).toBeNull();
  });

  it('publishes once a clip is attached', () => {
    const published = getPublishedVideoSection({ videoSection: { videos: [video()] } });
    expect(published?.videos).toHaveLength(1);
  });

  it('drops unplayable clips rather than rendering an empty frame', () => {
    const published = getPublishedVideoSection({
      videoSection: { style: 'reel', videos: [video({ id: 'a', url: '' }), video({ id: 'b' }), video({ id: 'c' })] },
    });
    expect(published?.videos.map((item) => item.id)).toEqual(['b', 'c']);
  });
});

describe('style capacity', () => {
  it('single-video layouts show one, galleries show the set', () => {
    expect(videoStyleCapacity('hero')).toBe(1);
    expect(videoStyleCapacity('split')).toBe(1);
    expect(videoStyleCapacity('story')).toBe(1);
    expect(videoStyleCapacity('process')).toBe(1);
    expect(videoStyleCapacity('reel')).toBe(6);
    expect(videoStyleCapacity('testimonial')).toBe(6);
  });

  it('a single-video layout renders one clip but never deletes the rest', () => {
    const saved = {
      videoSection: {
        style: 'split',
        videos: [video({ id: 'a' }), video({ id: 'b' }), video({ id: 'c' })],
      },
    };
    // The page gets one...
    expect(getPublishedVideoSection(saved)?.videos.map((item) => item.id)).toEqual(['a']);
    // ...and all three are still saved, so switching back brings them home.
    expect(getSiteContent(saved).videoSections[0].videos).toHaveLength(3);
  });
});

// The promise the whole feature is built on: a style is a LAYOUT. Changing it
// rearranges content and never asks for any of it again.
describe('switching style keeps every field', () => {
  const authored = {
    videoSection: {
      style: 'testimonial',
      eyebrow: 'Meet the owner',
      headline: 'Twenty years on these roofs',
      body: 'A quick hello.',
      ctaLabel: 'Get a free estimate',
      ctaHref: '#contact',
      location: 'Royal Oak, MI',
      timeline: '2 days',
      service: 'Roofing',
      steps: [{ id: 's1', title: 'Free estimate', description: '' }],
      videos: [
        video({ id: 'a', label: 'Roof reveal', quote: 'They showed up when they said they would.', author: 'Sarah M.', authorLabel: 'Royal Oak homeowner' }),
        video({ id: 'b', label: 'Before + after' }),
      ],
    },
  };

  for (const style of ['hero', 'split', 'story', 'reel', 'testimonial', 'process'] as const) {
    it(`keeps testimonial words, project details and reel captions under "${style}"`, () => {
      const switched = getSiteContent({ ...authored, videoSection: { ...authored.videoSection, style } }).videoSections[0];
      expect(switched.style).toBe(style);
      expect(switched.headline).toBe('Twenty years on these roofs');
      expect(switched.location).toBe('Royal Oak, MI');
      expect(switched.timeline).toBe('2 days');
      expect(switched.service).toBe('Roofing');
      expect(switched.steps).toHaveLength(1);
      expect(switched.videos).toHaveLength(2);
      // Fields only one layout renders survive under all of them.
      expect(switched.videos[0].quote).toBe('They showed up when they said they would.');
      expect(switched.videos[0].author).toBe('Sarah M.');
      expect(switched.videos[0].label).toBe('Roof reveal');
    });
  }
});

describe('parseVideoSource', () => {
  it('takes a YouTube link in any shape a contractor pastes', () => {
    for (const input of [YT, `https://youtu.be/${YT}`, `https://www.youtube.com/watch?v=${YT}`, `https://www.youtube.com/shorts/${YT}`]) {
      expect(parseVideoSource(input), input).toEqual({ kind: 'youtube', video: { id: YT, start: 0 } });
    }
  });

  it('takes a direct video file, including the .mov every iPhone makes', () => {
    for (const input of [FILE, 'https://cdn.test/a.webm', 'https://cdn.test/a.MOV', 'https://cdn.test/clip.mp4?token=abc']) {
      expect(parseVideoSource(input)?.kind, input).toBe('file');
    }
  });

  it('rejects anything that would render as a blank rectangle', () => {
    for (const input of [
      '',
      '   ',
      null,
      undefined,
      'https://vimeo.com/123456789',
      'https://www.dropbox.com/s/abc/clip', // a share PAGE, not the file
      'https://example.com/page.html',
      '/uploads/clip.mp4', // relative — would 404 on the contractor's own domain
      'ftp://example.com/clip.mp4',
    ]) {
      expect(parseVideoSource(input), String(input)).toBeNull();
      expect(isPlayableVideoUrl(input), String(input)).toBe(false);
    }
  });
});

describe('poster + duration', () => {
  it('prefers the owner’s still, then YouTube’s, then nothing', () => {
    expect(videoPoster({ url: FILE, posterUrl: 'https://cdn.test/p.jpg' })).toBe('https://cdn.test/p.jpg');
    expect(videoPoster({ url: `https://youtu.be/${YT}`, posterUrl: '' })).toBe(`https://i.ytimg.com/vi/${YT}/mqdefault.jpg`);
    expect(videoPoster({ url: FILE, posterUrl: '' })).toBe('');
  });

  it('reads a duration as a time, and an unknown one as nothing at all', () => {
    expect(formatVideoDuration(0)).toBe('');
    expect(formatVideoDuration(-4)).toBe('');
    expect(formatVideoDuration(42)).toBe('0:42');
    expect(formatVideoDuration(65)).toBe('1:05');
    expect(formatVideoDuration(3725)).toBe('1:02:05');
  });
});

describe('youTubeEmbedSrc playback options', () => {
  it('loops via a one-item playlist, because loop=1 alone does nothing', () => {
    const src = youTubeEmbedSrc({ id: YT, start: 0 }, { autoplay: true, loop: true });
    expect(src).toContain('loop=1');
    expect(src).toContain(`playlist=${YT}`);
  });

  it('hides the chrome only when asked', () => {
    expect(youTubeEmbedSrc({ id: YT, start: 0 }, { autoplay: true, controls: false })).toContain('controls=0');
    expect(youTubeEmbedSrc({ id: YT, start: 0 }, { autoplay: true, controls: true })).not.toContain('controls=0');
  });

  it('leaves the intro-video caller’s output exactly as it was', () => {
    const src = youTubeEmbedSrc({ id: YT, start: 0 }, { autoplay: true });
    expect(src).not.toContain('loop=');
    expect(src).not.toContain('playlist=');
    expect(src).not.toContain('controls=');
  });
});
