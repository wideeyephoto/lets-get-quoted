'use client';

import { supabase } from '@/lib/supabase';
import {
  ALLOWED_VIDEO_TYPES,
  CODEC_SNIFF_BYTES,
  sniffVideoCodec,
  videoPlaybackWarning,
  videoSizeProblem,
  type VideoBudget,
} from '@/lib/video-source';
import { createSiteVideoUploadAction, uploadSiteImageAction } from './actions';

// Browser side of a website-video upload.
//
// Three things happen here that the owner never has to think about:
//
// 1. The file goes STRAIGHT to storage on a signed URL. It never passes through
//    a server action, whose request body caps at 4.5 MB — smaller than any real
//    video.
// 2. A poster frame is grabbed from the video itself. Without one, a section set
//    to "show the still frame on phones" would have no still frame, and the
//    owner would be asked to upload a screenshot of their own video — a step
//    most people would simply skip, leaving a black rectangle on the page.
// 3. The duration is read off the same element, so the tile can say "0:42"
//    instead of promising an unknown amount of someone's time.

const ALLOWED_TYPES = new Set<string>(ALLOWED_VIDEO_TYPES);

export type UploadedVideo = {
  url: string;
  posterUrl: string;
  duration: number;
  /** '' when the clip should play everywhere. See videoPlaybackWarning. */
  playbackWarning: string;
  /** Stamped here because this is the only moment anyone knows it. Feeds
      VideoObject's required uploadDate — see lib/seo/video-seo. */
  uploadedAt: string;
};

// Defaults to the band budget so every existing caller keeps its 50 MB ceiling;
// the hero passes 'hero' for the much smaller one. See videoSizeProblem.
export function videoUploadError(file: File, budget: VideoBudget = 'band'): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'That file type won’t play on a website. Use an MP4, MOV, WebM, or OGV.';
  return videoSizeProblem(budget, file.size);
}

// Pull a still frame and the duration out of the file itself, in the browser,
// before anything is uploaded.
//
// WHY THE OUTCOME MATTERS AND NOT JUST THE FRAME
//
// This used to return a bare null frame, and the caller read "no frame" as "this
// browser can't play the file" — which then told the owner their visitors would
// see nothing. Those are different claims, and the gap between them produced a
// false alarm on the first real upload this app ever took: a healthy H.264 clip
// that plays fine in Chrome was reported as broken because a still could not be
// grabbed from it.
//
// So the outcome is reported honestly. Only a real `error` event means the
// browser refused the file; a timeout means the frame grab didn't finish, which
// is a missing poster and nothing more.
type FrameOutcome = 'ok' | 'error' | 'timeout';

function readVideoFrame(file: File): Promise<{ frame: Blob | null; duration: number; outcome: FrameOutcome }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    // Captured as soon as metadata lands, so a later timeout still knows how
    // long the clip is. Losing the duration too meant a tile that couldn't say
    // "0:42" on a video whose length we had already read.
    let knownDuration = 0;

    const finish = (result: { frame: Blob | null; duration: number; outcome: FrameOutcome }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    // A decode that never fires an event would otherwise hang the upload.
    const timeout = window.setTimeout(() => finish({ frame: null, duration: knownDuration, outcome: 'timeout' }), 8000);

    // No crossOrigin: this is a blob: URL for a file the user just picked, so
    // there is no origin to negotiate and nothing that could taint the canvas.
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) knownDuration = Math.round(video.duration);
    });

    video.addEventListener('error', () => { window.clearTimeout(timeout); finish({ frame: null, duration: knownDuration, outcome: 'error' }); });

    video.addEventListener('loadeddata', () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : knownDuration;
      // A frame from the very first moment is often a black fade-in, so take one
      // a little way in — but never past the end of a very short clip.
      const at = Math.min(1, Math.max(0, (video.duration || 0) / 10));
      const draw = () => {
        window.clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          // Everything from here on is a POSTER problem, never a playback one:
          // the browser has already decoded a frame to get this far.
          if (!ctx) return finish({ frame: null, duration, outcome: 'ok' });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish({ frame: blob, duration, outcome: 'ok' }), 'image/jpeg', 0.82);
        } catch {
          finish({ frame: null, duration, outcome: 'ok' });
        }
      };
      video.addEventListener('seeked', draw, { once: true });
      try { video.currentTime = at; } catch { draw(); }
    });

    video.src = objectUrl;
  });
}

// What the container says the codec is. Reads only the head of the file.
//
// This is the check that catches the case the decode probe never can: Safari
// plays HEVC, so an owner uploading straight off their iPhone gets a flawless
// preview while their Chrome and Android visitors get a blank player. Their
// browser is the one browser that works, so asking it proves nothing.
async function readCodec(file: File): Promise<ReturnType<typeof sniffVideoCodec>> {
  try {
    const head = await file.slice(0, CODEC_SNIFF_BYTES).arrayBuffer();
    return sniffVideoCodec(new Uint8Array(head));
  } catch {
    // Unreadable head — fall through to whatever the decode probe found.
    return 'unknown';
  }
}

export async function uploadSiteVideo(file: File, budget: VideoBudget = 'band'): Promise<UploadedVideo> {
  const problem = videoUploadError(file, budget);
  if (problem) throw new Error(problem);

  // Read the frame first: it works on the local file, so a browser that can't
  // decode the container is discovered before anything is uploaded.
  const [{ frame, duration, outcome }, codec] = await Promise.all([readVideoFrame(file), readCodec(file)]);

  // Only a genuine decode ERROR is evidence about playback. A timed-out frame
  // grab says nothing about whether the clip plays — treating it as though it
  // did is what put a "your visitors can't see this" warning on a healthy H.264
  // file the browser plays perfectly well.
  const playbackWarning = videoPlaybackWarning({ codec, decode: outcome });

  const signed = await createSiteVideoUploadAction(file.name, file.type);
  const { error } = await supabase.storage
    .from(signed.bucket)
    // cacheControl matches every other upload path in the app (job photos, lead
    // photos, crew photos, site images all use a year). Videos were the one that
    // set nothing and fell back to Supabase's one-hour default — so the LARGEST
    // asset on a contractor's site was the only one expiring hourly, re-fetched
    // from origin by the CDN and re-downloaded by returning visitors, while a
    // 5 KB icon beside it was cached for a year.
    //
    // Safe because the path carries a UUID: a replaced video is a new URL, so
    // nothing stale can be served.
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw new Error(error.message || 'The upload didn’t finish. Check your connection and try again.');

  // The poster is small enough to go through a normal server action, and it
  // lands in the image library so it can be swapped like any other photo.
  let posterUrl = '';
  if (frame) {
    try {
      const formData = new FormData();
      formData.set('image', new File([frame], `${file.name.replace(/\.[^.]+$/, '')}-poster.jpg`, { type: 'image/jpeg' }));
      posterUrl = (await uploadSiteImageAction(formData)).url;
    } catch {
      // A missing poster degrades to "video loads its own first frame", which
      // is far better than losing an upload that already succeeded.
      posterUrl = '';
    }
  }

  return { url: signed.publicUrl, posterUrl, duration, playbackWarning, uploadedAt: new Date().toISOString() };
}
