// Turns whatever a contractor pastes into a YouTube video id.
//
// Nobody copies the "right" link. They paste the address bar (watch?v=), the
// share sheet (youtu.be), the Shorts URL, an embed snippet they found, or just
// the id on its own — and often with a "start at 0:45" timestamp attached. All
// of those describe the same video, so all of them are accepted.
//
// Anything that isn't YouTube is rejected rather than passed through: a Vimeo or
// Facebook link would render as a blank frame on the customer's screen with no
// hint as to why, and the owner would never see it (the video only appears
// AFTER a lead submits). Better to say so in the builder.

export type YouTubeVideo = {
  /** The 11-character video id. */
  id: string;
  /** Start offset in whole seconds; 0 when the link had no timestamp. */
  start: number;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// youtube.com, www.youtube.com, m.youtube.com, youtube-nocookie.com, youtu.be.
const YOUTUBE_HOST = /^(?:(?:www|m|music)\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)$/i;

// "90", "90s", "1m30s", "1h2m3s" — YouTube writes all of these depending on
// where the link was copied from.
function parseStart(raw: string | null): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed), 86_400);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(trimmed);
  if (!match || (!match[1] && !match[2] && !match[3])) return 0;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Math.min(seconds, 86_400);
}

export function parseYouTubeUrl(input: string | null | undefined): YouTubeVideo | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  // A bare id, pasted on its own.
  if (VIDEO_ID.test(raw)) return { id: raw, start: 0 };

  // Owners paste "youtube.com/watch?v=..." without the scheme constantly, and
  // URL() rejects that outright.
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOST.test(url.hostname)) return null;

  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  const segments = url.pathname.split('/').filter(Boolean);

  // youtu.be/<id>
  if (/youtu\.be$/i.test(url.hostname)) {
    return segments[0] && VIDEO_ID.test(segments[0]) ? { id: segments[0], start } : null;
  }

  // youtube.com/watch?v=<id>
  const queryId = url.searchParams.get('v');
  if (queryId && VIDEO_ID.test(queryId)) return { id: queryId, start };

  // youtube.com/{embed,shorts,live,v}/<id>
  if (segments.length >= 2 && /^(embed|shorts|live|v)$/i.test(segments[0]) && VIDEO_ID.test(segments[1])) {
    return { id: segments[1], start };
  }

  return null;
}

// The privacy-enhanced host: no YouTube cookie is written unless the visitor
// actually presses play, which keeps a contractor's site out of "this page
// tracks you" territory for a video most visitors will only glance at.
//
// autoplay is always paired with mute. Every current browser blocks an unmuted
// autoplay outright — asking for one doesn't get sound, it gets a video that
// never starts. Muted-then-unmute-on-tap is the only version that actually
// plays. rel=0 keeps the end-screen suggestions on the owner's own channel, and
// playsinline stops iOS from yanking the video fullscreen over the estimate.
// `loop` and `controls` are optional so the intro-video caller is unchanged;
// omitted, the player keeps its own defaults (play once, show controls).
//
// YouTube's loop=1 does nothing on its own — a single-video loop only works when
// the video is also its own one-item playlist, which is why playlist is set to
// the same id.
export function youTubeEmbedSrc(video: YouTubeVideo, opts: { autoplay: boolean; loop?: boolean; controls?: boolean }): string {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
    autoplay: opts.autoplay ? '1' : '0',
    mute: opts.autoplay ? '1' : '0',
  });
  if (opts.loop) {
    params.set('loop', '1');
    params.set('playlist', video.id);
  }
  if (opts.controls === false) params.set('controls', '0');
  if (video.start > 0) params.set('start', String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${params.toString()}`;
}

// Thumbnail for the builder's confirmation preview and the click-to-play poster.
// mqdefault exists for every video; maxresdefault does not.
export function youTubeThumbnail(video: YouTubeVideo): string {
  return `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
}
