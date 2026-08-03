import { describe, expect, it } from 'vitest';
import {
  heroDurationAdvice,
  MAX_HERO_VIDEO_BYTES,
  MAX_VIDEO_BYTES,
  sniffVideoCodec,
  videoPlaybackWarning,
  videoPosterAdvice,
  videoSizeProblem,
  type VideoCodec,
} from '@/lib/video-source';

// Real ISO base-media boxes, built byte by byte. The sniffer's whole job is to
// read a container correctly, so testing it against a hand-rolled mock of itself
// would prove nothing.

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** stsd: version+flags, entry count, then one sample entry box named for the codec. */
function stsd(fourcc: string): Uint8Array {
  const header = new Uint8Array(8); // version+flags (4) + entry count (4)
  new DataView(header.buffer).setUint32(4, 1);
  return box('stsd', concat(header, box(fourcc, new Uint8Array(16))));
}

/** A minimal but structurally real file: ftyp, then the moov path down to stsd. */
function file(fourcc: string, opts: { padding?: Uint8Array } = {}): Uint8Array {
  return concat(
    box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0])),
    opts.padding ?? new Uint8Array(0),
    box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd(fourcc)))))),
  );
}

describe('sniffVideoCodec', () => {
  const cases: Array<[string, VideoCodec]> = [
    ['avc1', 'h264'],
    ['avc3', 'h264'],
    ['hvc1', 'hevc'], // what an iPhone on "High Efficiency" writes
    ['hev1', 'hevc'],
    ['dvh1', 'hevc'],
    ['av01', 'av1'],
    ['vp09', 'vp9'],
  ];

  for (const [fourcc, expected] of cases) {
    it(`reads ${fourcc} as ${expected}`, () => {
      expect(sniffVideoCodec(file(fourcc))).toBe(expected);
    });
  }

  it('reports a codec it does not recognise as other, not as a guess', () => {
    expect(sniffVideoCodec(file('mp4v'))).toBe('other');
  });

  it('walks past a leading mdat instead of giving up at the first big box', () => {
    // Files written straight off a camera put the media data BEFORE moov.
    const mdat = box('mdat', new Uint8Array(4096));
    expect(sniffVideoCodec(file('hvc1', { padding: mdat }))).toBe('hevc');
  });

  it('handles a 64-bit box size', () => {
    // size=1 means the real length follows the type as a uint64.
    const inner = box('trak', box('mdia', box('minf', box('stbl', stsd('hvc1')))));
    const large = new Uint8Array(16 + inner.length);
    const view = new DataView(large.buffer);
    view.setUint32(0, 1);
    for (let i = 0; i < 4; i += 1) large[4 + i] = 'moov'.charCodeAt(i);
    view.setBigUint64(8, BigInt(large.length));
    large.set(inner, 16);
    expect(sniffVideoCodec(concat(box('ftyp', new Uint8Array(8)), large))).toBe('hevc');
  });

  // Never throwing matters more than being right: an unknown codec must fall
  // through to "upload it anyway", never to a crash mid-upload.
  it('returns unknown rather than throwing on rubbish', () => {
    expect(sniffVideoCodec(new Uint8Array(0))).toBe('unknown');
    expect(sniffVideoCodec(new Uint8Array([1, 2, 3]))).toBe('unknown');
    expect(sniffVideoCodec(new Uint8Array(64))).toBe('unknown'); // all zeroes
    expect(sniffVideoCodec(file('hvc1').slice(0, 30))).toBe('unknown'); // truncated
  });

  it('does not loop forever on a box that claims to contain itself', () => {
    // A zero-length box would advance the cursor by nothing.
    const evil = new Uint8Array(16);
    const view = new DataView(evil.buffer);
    view.setUint32(0, 8);
    for (let i = 0; i < 4; i += 1) evil[4 + i] = 'moov'.charCodeAt(i);
    view.setUint32(8, 0); // size 0 = "to end of file"
    for (let i = 0; i < 4; i += 1) evil[12 + i] = 'moov'.charCodeAt(i);
    expect(sniffVideoCodec(evil)).toBe('unknown');
  });
});

// A hero clip is decoration that downloads for everyone; a band clip is content
// somebody chose to watch. Different jobs, so different ceilings.
describe('videoSizeProblem', () => {
  const MB = 1024 * 1024;

  it('lets a band clip run to 50 MB', () => {
    expect(videoSizeProblem('band', 40 * MB)).toBeNull();
    expect(videoSizeProblem('band', MAX_VIDEO_BYTES)).toBeNull();
    expect(videoSizeProblem('band', MAX_VIDEO_BYTES + 1)).not.toBeNull();
  });

  it('holds a hero clip to a much smaller budget', () => {
    expect(videoSizeProblem('hero', 8 * MB)).toBeNull();
    expect(videoSizeProblem('hero', MAX_HERO_VIDEO_BYTES)).toBeNull();
    expect(videoSizeProblem('hero', MAX_HERO_VIDEO_BYTES + 1)).not.toBeNull();
  });

  it('rejects for the hero a file the band would happily take', () => {
    const thirty = 30 * MB;
    expect(videoSizeProblem('band', thirty)).toBeNull();
    expect(videoSizeProblem('hero', thirty)).not.toBeNull();
  });

  // The message has to leave someone able to act. "Too large" leaves an owner
  // with a phone full of clips and no idea which part to change.
  it('tells a hero upload what to do and where a long clip belongs', () => {
    const message = videoSizeProblem('hero', 30 * MB)!;
    expect(message).toContain('30 MB');
    expect(message).toMatch(/720p|10 seconds/);
    expect(message).toContain('video section');
  });

  it('names the actual size in both messages', () => {
    expect(videoSizeProblem('band', 60 * MB)).toContain('60 MB');
    expect(videoSizeProblem('hero', 20 * MB)).toContain('20 MB');
  });
});

describe('heroDurationAdvice', () => {
  it('says nothing about a short loop', () => {
    expect(heroDurationAdvice(8)).toBeNull();
    expect(heroDurationAdvice(15)).toBeNull();
    expect(heroDurationAdvice(0)).toBeNull();
  });

  it('advises on a long one without ever blocking it', () => {
    // Advice, not a veto — length is taste, and it returns a STRING, which no
    // caller treats as an error. The size cap is the only thing that refuses.
    const advice = heroDurationAdvice(45)!;
    expect(advice).toContain('45 seconds');
    expect(videoSizeProblem('hero', 1024)).toBeNull();
  });
});

describe('videoPlaybackWarning', () => {
  it('warns about HEVC even when the owner’s browser played it fine', () => {
    // The whole point: Safari decodes HEVC, so the decode succeeds and the owner
    // sees a perfect preview. Their Chrome visitors would not.
    const warning = videoPlaybackWarning({ codec: 'hevc', decode: 'ok' });
    expect(warning).toContain('HEVC');
    expect(warning).toMatch(/Most Compatible|H\.264/);
  });

  it('says nothing about an H.264 clip that played', () => {
    expect(videoPlaybackWarning({ codec: 'h264', decode: 'ok' })).toBe('');
  });

  it('warns when the browser genuinely refused the file', () => {
    expect(videoPlaybackWarning({ codec: 'unknown', decode: 'error' })).not.toBe('');
  });

  // The regression this whole split exists for. The first real upload was a
  // healthy H.264 clip that Chrome plays fine; the still-frame grab timed out,
  // and the owner was told their visitors couldn't see it. A timeout is a
  // missing POSTER, and says nothing at all about playback.
  it('stays silent when the frame grab merely timed out', () => {
    expect(videoPlaybackWarning({ codec: 'h264', decode: 'timeout' })).toBe('');
    expect(videoPlaybackWarning({ codec: 'unknown', decode: 'timeout' })).toBe('');
  });

  it('still calls out a bad codec even if the grab timed out', () => {
    // The container is evidence in its own right, independent of the probe.
    expect(videoPlaybackWarning({ codec: 'hevc', decode: 'timeout' })).toContain('HEVC');
  });

  it('never warns for a codec that plays everywhere, whatever the container said', () => {
    expect(videoPlaybackWarning({ codec: 'other', decode: 'ok' })).toBe('');
  });
});

describe('videoPosterAdvice', () => {
  it('says nothing when there is a poster', () => {
    expect(videoPosterAdvice({ hasPoster: true, isFile: true })).toBe('');
  });

  it('says nothing for a YouTube clip, which brings its own thumbnail', () => {
    expect(videoPosterAdvice({ hasPoster: false, isFile: false })).toBe('');
  });

  it('explains what a missing still actually costs, and what to do', () => {
    const advice = videoPosterAdvice({ hasPoster: false, isFile: true });
    expect(advice).toMatch(/phone/i);
    expect(advice).toMatch(/poster image|upload it again/i);
  });
});
