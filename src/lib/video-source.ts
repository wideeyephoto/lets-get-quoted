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
