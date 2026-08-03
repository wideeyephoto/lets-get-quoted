import { parseYouTubeUrl, youTubeThumbnail, type YouTubeVideo } from '@/lib/youtube';

// Where a video section's clip actually comes from.
//
// Two sources, because contractors arrive with one of two things and neither
// substitutes for the other:
//
//   FILE     — the clip they shot on their phone, uploaded to our storage.
//              The only source that can be a silent looping background, because
//              a plain <video> can be cropped, scrimmed and muted without any
//              third-party chrome appearing over it.
//   YOUTUBE  — the video already on their channel. Free hosting and bandwidth,
//              at the cost of an iframe we don't control the inside of.
//
// Anything else (a Vimeo link, a Dropbox share page, a bare .mov on some other
// host) is rejected rather than guessed at, so a wrong paste shows a fixable
// message in the builder instead of a blank rectangle on a customer's screen.

export type VideoSource =
  | { kind: 'youtube'; video: YouTubeVideo }
  | { kind: 'file'; url: string };

// Upload limits live here, in the one video module with no server imports, so
// the browser check and the bucket's own ceiling can't drift apart.
//
// 50 MB is roughly 45 seconds of 1080p phone video, and it matches Supabase's
// default per-file ceiling — so an oversized file is caught by our sentence
// rather than by an opaque platform rejection at the end of a long upload.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov — what every iPhone records
  'video/webm',
  'video/ogg',
] as const;

export const VIDEO_FILE_ACCEPT = ALLOWED_VIDEO_TYPES.join(',');

// Extensions a <video> element can actually play. .mov is here because every
// iPhone produces one and most are H.264 in a QuickTime container, which Safari
// plays natively and Chrome usually does too — it's the file people have, so
// rejecting it outright would be worse than a rare no-play.
const VIDEO_FILE = /\.(mp4|m4v|mov|webm|ogv|ogg)(?:$|\?)/i;

// -- Will this actually play on someone else's phone? ------------------------
//
// The upload already learns the answer for free and used to throw it away: the
// poster grab decodes the file in the OWNER's browser, and a failure there is
// the cheapest possible warning that visitors will get a black rectangle.
//
// But that probe is blind to the case that matters most. Every iPhone on the
// default "High Efficiency" setting records HEVC (H.265) inside a .mov, and
// Safari plays HEVC happily. So a contractor uploading from their iPhone sees a
// perfect preview, publishes, and every Chrome and Android visitor sees nothing.
// The owner's browser is the one browser that works, so no amount of probing it
// will ever reveal the problem.
//
// The container knows, though. MP4 and MOV are the same ISO base-media box
// format, and the codec is a four-character code sitting in a fixed place:
//   moov > trak > mdia > minf > stbl > stsd > <fourcc>
// Reading it is deterministic, browser-independent, and needs only the head of
// the file — so it catches the Safari case that no decode test can.

export type VideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9' | 'other' | 'unknown';

// Sample-entry fourccs we care about. HEVC has two spellings depending on
// whether the parameter sets are in-band (hev1) or in the sample entry (hvc1);
// iPhones write hvc1, but both are the same decode problem off Apple hardware.
const CODEC_BY_FOURCC: Record<string, VideoCodec> = {
  avc1: 'h264', avc3: 'h264',
  hvc1: 'hevc', hev1: 'hevc', dvh1: 'hevc', dvhe: 'hevc',
  av01: 'av1',
  vp08: 'vp9', vp09: 'vp9',
};

// Boxes that contain other boxes on the path down to the sample description.
// Walking only these keeps us out of the media data, which is the whole file.
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/**
 * The video codec named in an MP4/MOV header, or 'unknown'.
 *
 * Give it the first chunk of the file — HEAD_BYTES is plenty, because `moov`
 * sits at the front in anything written for streaming and near enough the front
 * in everything else that a miss degrades to 'unknown' rather than a wrong
 * answer. Never throws: a truncated or non-ISO file is 'unknown', and an unknown
 * codec must never block an upload.
 */
export function sniffVideoCodec(bytes: Uint8Array): VideoCodec {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const fourccAt = (offset: number): string =>
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

  const walk = (start: number, end: number, depth: number): VideoCodec => {
    // Depth is a guard against a malformed file describing a cycle.
    if (depth > 8) return 'unknown';
    let offset = start;
    // 8 bytes is the smallest legal box: size + type.
    while (offset + 8 <= end) {
      let size = view.getUint32(offset);
      const type = fourccAt(offset + 4);
      let header = 8;
      // size 1 means the real size is a 64-bit value after the type.
      if (size === 1) {
        if (offset + 16 > end) return 'unknown';
        // Only the low 32 bits matter — a >4GB box is not something we parse.
        size = Number(view.getBigUint64(offset + 8));
        header = 16;
      }
      // size 0 means "to the end of the file".
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end) return 'unknown';

      if (type === 'stsd') {
        // stsd: 4 bytes version+flags, 4 bytes entry count, then entries — each
        // one a box whose TYPE is the codec.
        const entries = offset + header + 8;
        if (entries + 8 <= end) {
          const codec = CODEC_BY_FOURCC[fourccAt(entries + 4)];
          if (codec) return codec;
          return 'other';
        }
        return 'unknown';
      }

      if (CONTAINER_BOXES.has(type)) {
        const found = walk(offset + header, offset + size, depth + 1);
        if (found !== 'unknown') return found;
      }

      offset += size;
    }
    return 'unknown';
  };

  return walk(0, bytes.byteLength, 0);
}

// How much of the file to read for the sniff. `moov` is at the front in
// anything written for streaming; 1 MB covers the rest comfortably without
// pulling a whole clip into memory.
export const CODEC_SNIFF_BYTES = 1024 * 1024;

/**
 * The sentence to show an owner about a clip that may not play for their
 * visitors — or '' when there's nothing to say.
 *
 * Deliberately never blocks. Some of these clips are genuinely fine for a given
 * audience, and a false positive that refused a working video would be worse
 * than a warning that gets ignored. It names the fix, because "unsupported
 * codec" is not something a roofer should have to go and look up.
 */
export function videoPlaybackWarning(input: { codec: VideoCodec; decoded: boolean }): string {
  if (input.codec === 'hevc') {
    return 'This clip is HEVC (H.265) — it plays on iPhones and Macs, but not for most Chrome, Windows and Android visitors, who would see a blank player. On iPhone: Settings → Camera → Formats → Most Compatible, then re-record or re-export. Or export it as H.264 MP4 from any editor.';
  }
  if (input.codec === 'av1') {
    return 'This clip is AV1. Newer browsers play it, but older phones can’t and would see a blank player. Exporting as H.264 MP4 plays everywhere.';
  }
  // The decode probe is the backstop: whatever the container claimed, this
  // browser could not actually play the file.
  if (!input.decoded) {
    return 'This browser couldn’t play the file, which usually means your visitors’ browsers can’t either. Re-exporting it as H.264 MP4 is the reliable fix.';
  }
  return '';
}

export function parseVideoSource(input: string | null | undefined): VideoSource | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const youtube = parseYouTubeUrl(raw);
  if (youtube) return { kind: 'youtube', video: youtube };

  // A file has to be an absolute http(s) URL — a relative path would resolve
  // against the contractor's own domain and 404 there.
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!VIDEO_FILE.test(url.pathname)) return null;
  return { kind: 'file', url: raw };
}

// Whether a pasted link is something we can play at all. Used by the builder to
// say so before the owner publishes it.
export function isPlayableVideoUrl(input: string | null | undefined): boolean {
  return parseVideoSource(input) !== null;
}

// The still frame to show before playback. An owner-set poster always wins; a
// YouTube video falls back to YouTube's own thumbnail. An uploaded file with no
// poster has nothing to fall back to — the caller shows its placeholder.
export function videoPoster(item: { url: string; posterUrl: string }): string {
  if (item.posterUrl.trim()) return item.posterUrl.trim();
  const source = parseVideoSource(item.url);
  return source?.kind === 'youtube' ? youTubeThumbnail(source.video) : '';
}

// "0:42" / "1:05:30". Zero (unknown) renders as nothing rather than "0:00",
// which would read as an empty video.
export function formatVideoDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total <= 0) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
