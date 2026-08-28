'use client';

import { useEffect, useState } from 'react';
import type { SiteIntroVideoContent } from '@/lib/site-content';
import { parseVideoSource, videoPoster } from '@/lib/video-source';
import { youTubeEmbedSrc } from '@/lib/youtube';
import styles from './themes.module.css';

// The owner's short intro, played on the "request sent" screen.
//
// Three rules shape everything here, and all three come from where it sits — it
// renders UNDER a price the visitor just waited for, on a page they have already
// converted on.
//
// 1. It never covers the estimate. No overlay, no modal, no scroll-jacking; it
//    is a block in the flow, below the number.
// 2. It cannot navigate the page away. The sandbox omits allow-top-navigation
//    and allow-popups, so neither an end-screen card nor the "Watch on YouTube"
//    button can take the visitor off the contractor's site — a guarantee the
//    player's own rel=0 / modestbranding params only ask for politely.
// 3. It starts muted. Not a preference: every current browser refuses an
//    unmuted autoplay from a frame the user hasn't interacted with, so an
//    "autoplay with sound" video is simply a video that does not start. Muted
//    autoplay plays, and the unmute control turns it into sound in one tap.

export default function IntroVideo({ video }: { video: SiteIntroVideoContent }) {
  const source = parseVideoSource(video.url);

  // Autoplaying video at someone who has asked their OS for less motion is the
  // exact thing that setting exists to stop. They get the same video behind a
  // poster instead, which is also the graceful path on any browser that refuses
  // the autoplay outright.
  const [autoplay, setAutoplay] = useState(true);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (query.matches) setAutoplay(false);
  }, []);

  if (!video.enabled || !source) return null;

  const playing = autoplay || started;
  const poster = videoPoster({ url: video.url, posterUrl: video.posterUrl || '' });

  return (
    <section className={styles.heroFormVideo} aria-label={video.title}>
      <p className={styles.heroFormVideoTitle}>{video.title}</p>
      <div className={styles.heroFormVideoFrame}>
        {source.kind === 'youtube' ? (
          playing ? (
            <iframe
              src={youTubeEmbedSrc(source.video, { autoplay: true })}
              title={video.title}
              loading="lazy"
              // autoplay must be granted explicitly to a cross-origin frame, or the
              // player's own autoplay=1 is ignored and it sits on the poster.
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              // allow-popups and allow-top-navigation are deliberately absent: with
              // them, YouTube's chrome can leave the page. Without them it cannot.
              // allow-same-origin is safe here precisely because the frame is
              // cross-origin — it grants YouTube its own origin, not ours.
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allowFullScreen
            />
          ) : (
            <button type="button" className={styles.heroFormVideoPoster} onClick={() => setStarted(true)}>
              {poster ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={poster} alt="" loading="lazy" />
              ) : null}
              <span className={styles.heroFormVideoPlay} aria-hidden="true" />
              <span className={styles.heroFormVideoPosterLabel}>Play video</span>
            </button>
          )
        ) : (
          <video
            src={source.url}
            poster={poster || undefined}
            controls
            autoPlay={autoplay}
            muted={autoplay}
            playsInline
            preload="metadata"
          />
        )}
      </div>
      {playing ? (
        <small className={styles.heroFormVideoHint}>
          {source.kind === 'youtube'
            ? 'Starts muted — tap the speaker in the player for sound.'
            : 'Starts muted — use the video controls for sound.'}
        </small>
      ) : null}
    </section>
  );
}
