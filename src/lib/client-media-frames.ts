'use client';

import { compressImage } from './client-images';

/**
 * Converts a File to a base64 data URL.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file as data URL.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read error.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Extracts 2-3 keyframe image data URLs from a video file in the browser using HTML5 video/canvas.
 */
export async function extractVideoKeyframes(
  videoFile: File,
  maxFrames = 3,
  maxDimension = 1200,
  quality = 0.8
): Promise<string[]> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return [];

  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      URL.revokeObjectURL(url);
      video.remove();
    };

    // Safety timeout: resolve whatever we have if video takes too long to load/seek
    const timeout = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 6000);

    video.onloadedmetadata = async () => {
      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const fractions = maxFrames === 1 ? [0.5] : maxFrames === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
        const timestamps = fractions.map((f) => Math.max(0.1, Math.min(duration - 0.1, duration * f)));
        const frames: string[] = [];

        for (const time of timestamps) {
          video.currentTime = time;
          await new Promise<void>((r) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              r();
            };
            video.addEventListener('seeked', onSeeked);
            setTimeout(onSeeked, 1000); // Seek timeout fallback
          });

          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;
          const scale = Math.min(1, maxDimension / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL('image/webp', quality));
          }
        }

        clearTimeout(timeout);
        cleanup();
        resolve(frames);
      } catch {
        clearTimeout(timeout);
        cleanup();
        resolve([]);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve([]);
    };
  });
}

/**
 * Extracts compressed WebP data URLs from an array of image and/or video files.
 * Perfect for sending to multimodal AI endpoints without large bandwidth.
 */
export async function extractMediaDataUrls(
  files: File[],
  maxTotalImages = 4
): Promise<string[]> {
  const results: string[] = [];

  for (const file of files) {
    if (results.length >= maxTotalImages) break;

    if (file.type.startsWith('video/')) {
      const needed = maxTotalImages - results.length;
      const keyframes = await extractVideoKeyframes(file, Math.min(3, needed));
      results.push(...keyframes);
    } else if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file, 1400, 0.8);
        const dataUrl = await fileToDataUrl(compressed);
        results.push(dataUrl);
      } catch {
        // Fallback to direct data URL if compression fails
        try {
          const rawUrl = await fileToDataUrl(file);
          results.push(rawUrl);
        } catch {
          // Ignore unreadable file
        }
      }
    }
  }

  return results.slice(0, maxTotalImages);
}
