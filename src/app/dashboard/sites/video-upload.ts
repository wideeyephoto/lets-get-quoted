'use client';

import { supabase } from '@/lib/supabase';
import {
  ALLOWED_VIDEO_TYPES,
  CODEC_SNIFF_BYTES,
  MAX_VIDEO_BYTES,
  sniffVideoCodec,
  videoPlaybackWarning,
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

export function videoUploadError(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'That file type won’t play on a website. Use an MP4, MOV, WebM, or OGV.';
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    return `That video is ${mb} MB — the limit is 50 MB (about 45 seconds of phone video). Trim it, or export at a lower resolution.`;
  }
  return null;
}

// Pull a still frame and the duration out of the file itself, in the browser,
// before anything is uploaded. Returns a null frame rather than throwing when
// the browser can't decode the container (some .mov files): a missing poster is
// a small cosmetic loss, a failed upload is not.
function readVideoFrame(file: File): Promise<{ frame: Blob | null; duration: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: { frame: Blob | null; duration: number }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    // A decode that never fires an event would otherwise hang the upload.
    const timeout = window.setTimeout(() => finish({ frame: null, duration: 0 }), 8000);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.addEventListener('error', () => { window.clearTimeout(timeout); finish({ frame: null, duration: 0 }); });

    video.addEventListener('loadeddata', () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
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
          if (!ctx) return finish({ frame: null, duration });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish({ frame: blob, duration }), 'image/jpeg', 0.82);
        } catch {
          finish({ frame: null, duration });
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

export async function uploadSiteVideo(file: File): Promise<UploadedVideo> {
  const problem = videoUploadError(file);
  if (problem) throw new Error(problem);

  // Read the frame first: it works on the local file, so a browser that can't
  // decode the container is discovered before anything is uploaded.
  const [{ frame, duration }, codec] = await Promise.all([readVideoFrame(file), readCodec(file)]);

  // The decode probe already knew this and used to throw it away. A null frame
  // means this browser could not play the file, which is the cheapest warning
  // there is that the owner's visitors won't be able to either.
  const playbackWarning = videoPlaybackWarning({ codec, decoded: frame !== null });

  const signed = await createSiteVideoUploadAction(file.name, file.type);
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
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
