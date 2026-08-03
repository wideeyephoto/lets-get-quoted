'use client';

import { useState } from 'react';
import type { SiteHeroVideo } from '@/lib/site-content';
import { heroDurationAdvice, MAX_HERO_VIDEO_BYTES, VIDEO_FILE_ACCEPT } from '@/lib/video-source';
import { uploadSiteVideo, videoUploadError } from './video-upload';
import styles from './SiteEditor.module.css';

// The hero's background clip, in the Brand tab beside the hero photos it
// replaces — because that is what it is. A video BAND is a section further down
// the page with its own headline and layout, and it lives in the video studio;
// this is the same slot as the hero photo, holding a moving picture instead.
//
// UPLOAD ONLY, NO YOUTUBE FIELD
//
// Not an omission. A hero fills a shaped box, so its media has to be croppable
// with object-fit: cover, and a YouTube iframe cannot be — it letterboxes inside
// whatever box it is given and paints its own title bar over the top. The video
// bands get away with it using a viewport-sized transform, which is affordable
// on a full-bleed band and not on a hero that all eight templates shape
// differently. Offering a link field here would mean accepting a paste we would
// then have to render as a black letterboxed rectangle behind somebody's
// headline, so there is no field to paste into.
export default function HeroVideoField({
  video,
  heroImage,
  onChange,
}: {
  video: SiteHeroVideo;
  heroImage: string | null;
  onChange: (video: SiteHeroVideo) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    // 'hero' — a much smaller ceiling than a band clip's, because this one
    // downloads for every first-time desktop visitor whether they watch it or
    // not. See videoSizeProblem.
    const problem = videoUploadError(file, 'hero');
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadSiteVideo(file, 'hero');
      onChange({
        url: uploaded.url,
        // The captured frame is what a phone, a reduced-motion visitor and the
        // first paint all show, so it matters more here than on a band: this is
        // the largest thing on the page.
        posterUrl: uploaded.posterUrl,
        playbackWarning: uploaded.playbackWarning,
        duration: uploaded.duration,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload didn’t finish. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const still = video.posterUrl || heroImage || '';

  return (
    <div className={styles.formField}>
      <span>Hero video <em className={styles.fieldOptional}>optional</em></span>

      {video.url ? (
        <>
          <div className={styles.imageSlot}>
            <div className={styles.heroSlotPreview}>
              {still
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={still} alt="Hero video still frame" />
                : <div className={styles.imageSlotEmpty}>No still frame</div>}
            </div>
            <div className={styles.imageSlotActions}>
              <label className={styles.vsRowUpload}>
                <input
                  type="file"
                  accept={VIDEO_FILE_ACCEPT}
                  disabled={busy}
                  onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }}
                />
                <span>{busy ? 'Uploading…' : 'Replace'}</span>
              </label>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => onChange({ url: '', posterUrl: '', playbackWarning: '', duration: 0 })}
              >
                Remove
              </button>
            </div>
          </div>
          {video.playbackWarning && (
            <p className={styles.vsWarn}>
              <strong>May not play for some visitors.</strong> {video.playbackWarning}
            </p>
          )}
          {/* Advice, not a warning, and never a block: a long loop is a matter
              of taste, and refusing one would be overruling an owner about their
              own site. Kept out of .vsWarn's tones for that reason. */}
          {heroDurationAdvice(video.duration) && (
            <small className={styles.vsHint}>{heroDurationAdvice(video.duration)}</small>
          )}
        </>
      ) : (
        <label className={styles.vsRowUpload}>
          <input
            type="file"
            accept={VIDEO_FILE_ACCEPT}
            disabled={busy}
            onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }}
          />
          <span>{busy ? 'Uploading…' : 'Add a hero video'}</span>
        </label>
      )}

      {error && <p className={styles.vsError} role="alert">{error}</p>}

      {/* Says what actually happens, including the parts an owner would
          otherwise discover by looking at their own site on a phone and
          wondering why the video is missing. */}
      <small className={styles.fieldHint}>
        Plays silently on a loop behind your headline, in place of the hero photo. Phones and anyone
        who prefers reduced motion see the still frame instead, so keep a good hero photo set — it’s
        the fallback. Shoot it wide, since every template crops it differently.
      </small>
      {/* The number, and the reason for it. A limit without a reason reads as an
          arbitrary rule to work around; this one is somebody else's data plan. */}
      <small className={styles.fieldHint}>
        Keep it under {Math.round(MAX_HERO_VIDEO_BYTES / (1024 * 1024))} MB — about 10 seconds at 720p.
        A background loop downloads for every visitor whether they watch it or not, so a big one makes
        your page slow for people who never look at it. Got a longer video worth watching? Add it as a
        video section further down the page instead, where people choose to press play.
      </small>
    </div>
  );
}
