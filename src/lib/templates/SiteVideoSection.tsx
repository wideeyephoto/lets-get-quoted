'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SiteVideoItem, SiteVideoSectionContent } from '@/lib/site-content';
import { formatVideoDuration, parseVideoSource, videoPoster } from '@/lib/video-source';
import { youTubeEmbedSrc } from '@/lib/youtube';
import styles from './themes.module.css';

// The video band. Six arrangements, one set of content, one player.
//
// The split that makes this work: nothing below decides WHAT to show, only WHERE
// to put it. `content` arrives already resolved (getPublishedVideoSection), so a
// style is purely a layout and switching one rearranges the same words and the
// same clips. Anything a style doesn't lay out simply isn't read here — it stays
// in the saved content, waiting for a style that does.

type Behavior = Pick<SiteVideoSectionContent, 'autoplay' | 'loop' | 'controls' | 'mobilePoster'>;

// Below this width a video is expensive: a visitor is likely on cellular data
// and a background clip they never asked for costs them real money. The "show
// the still frame on phones" behavior turns autoplay off here.
const PHONE = '(max-width: 720px)';

// Whether this device should be allowed to start a video by itself. Answered on
// the client only, so the server always renders the still-frame state and the
// two agree — the poster is the same image either way, so there is nothing to
// flash when the answer comes back.
function useAutoplayAllowed(mobilePoster: boolean): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const phone = window.matchMedia(PHONE);
    const decide = () => setAllowed(!reduced.matches && !(mobilePoster && phone.matches));
    decide();
    reduced.addEventListener('change', decide);
    phone.addEventListener('change', decide);
    return () => {
      reduced.removeEventListener('change', decide);
      phone.removeEventListener('change', decide);
    };
  }, [mobilePoster]);
  return allowed;
}

type VideoFrameProps = {
  item: SiteVideoItem;
  behavior: Behavior;
  /** Reel tiles never start on their own — a row of self-starting videos is a
   *  bandwidth bill the visitor didn't agree to. */
  neverAutoplay?: boolean;
  className?: string;
  /** Shown over the poster before playback, e.g. "Watch project". */
  playLabel?: string;
  /** Decorative — the hero's background video, which has copy over it. */
  cover?: boolean;
};

function VideoFrame({ item, behavior, neverAutoplay, className, playLabel, cover }: VideoFrameProps) {
  const source = parseVideoSource(item.url);
  const poster = videoPoster(item);
  const autoplayAllowed = useAutoplayAllowed(behavior.mobilePoster);
  const wantsAutoplay = behavior.autoplay && !neverAutoplay && autoplayAllowed;

  // "Started" means a real person pressed play, which is also the moment sound
  // becomes appropriate. Autoplay is tracked separately because it is always
  // muted, no exceptions — every browser refuses an unmuted autoplay outright.
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !wantsAutoplay || started) return;
    video.muted = true;
    // A rejected play() is normal (a browser can refuse for its own reasons);
    // the poster stays up and the play button still works.
    video.play().catch(() => {});
  }, [wantsAutoplay, started]);

  const play = useCallback(() => {
    setStarted(true);
    setMuted(false);
    const video = videoRef.current;
    if (video) {
      video.muted = false;
      video.play().catch(() => {});
    }
  }, []);

  const frameClass = `${styles.videoFrame}${cover ? ` ${styles.videoFrameCover}` : ''}${className ? ` ${className}` : ''}`;
  const duration = formatVideoDuration(item.duration);

  if (!source) return null;

  if (source.kind === 'youtube') {
    // The iframe is mounted only once it should be playing: an embed that loads
    // on page load costs the visitor a YouTube player's worth of scripts for a
    // video most of them will never press.
    const live = started || wantsAutoplay;
    return (
      <div className={frameClass}>
        {live ? (
          <iframe
            src={youTubeEmbedSrc(source.video, { autoplay: true, loop: behavior.loop, controls: behavior.controls || started })}
            title={item.label || 'Video'}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <PosterButton poster={poster} label={playLabel || item.label} duration={duration} onPlay={play} />
        )}
      </div>
    );
  }

  const showPoster = !started && !wantsAutoplay;
  return (
    <div className={frameClass}>
      <video
        ref={videoRef}
        src={source.url}
        poster={poster || undefined}
        muted={muted}
        loop={behavior.loop}
        controls={behavior.controls && (started || wantsAutoplay)}
        playsInline
        preload={wantsAutoplay ? 'auto' : 'metadata'}
        // A silent looping backdrop is decoration, not content — announcing it
        // to a screen reader interrupts the copy it sits behind.
        aria-hidden={cover && !behavior.controls ? true : undefined}
        tabIndex={cover && !behavior.controls ? -1 : undefined}
      />
      {showPoster && <PosterButton poster={poster} label={playLabel || item.label} duration={duration} onPlay={play} />}
      {/* An autoplaying muted video with no controls is unwatchable if there is
          no way to hear it — this is that way. */}
      {!showPoster && !behavior.controls && (
        <button
          type="button"
          className={styles.videoSound}
          aria-pressed={!muted}
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
            if (!video.muted) video.play().catch(() => {});
          }}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
          {muted ? 'Unmute' : 'Mute'}
        </button>
      )}
    </div>
  );
}

function PosterButton({ poster, label, duration, onPlay }: { poster: string; label: string; duration: string; onPlay: () => void }) {
  return (
    <button type="button" className={styles.videoPoster} onClick={onPlay}>
      {poster
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={poster} alt="" loading="lazy" decoding="async" />
        : <span className={styles.videoPosterBlank} aria-hidden="true" />}
      <span className={styles.videoPlay} aria-hidden="true" />
      <span className={styles.videoPosterLabel}>{label || 'Play video'}</span>
      {duration && <span className={styles.videoDuration}>{duration}</span>}
    </button>
  );
}

export default function SiteVideoSection({ content }: { content: SiteVideoSectionContent }) {
  const behavior: Behavior = {
    autoplay: content.autoplay,
    loop: content.loop,
    controls: content.controls,
    mobilePoster: content.mobilePoster,
  };
  const primary = content.videos[0];
  const scrim = { '--video-scrim': String(content.overlay / 100) } as CSSProperties;
  const cta = content.ctaLabel.trim()
    ? <a className={`${styles.primaryCta} ${styles.videoCta}`} href={content.ctaHref || '#contact'}>{content.ctaLabel}</a>
    : null;

  if (!primary) return null;

  // Hero — a full-bleed band, so it opts out of the shared section padding.
  if (content.style === 'hero') {
    return (
      <section className={styles.videoHeroBand} id="video" data-edit="video" style={scrim} aria-label={content.headline || 'Video'}>
        <VideoFrame item={primary} behavior={behavior} cover className={styles.videoHeroMedia} playLabel={content.eyebrow} />
        <div className={styles.videoHeroCopy} data-reveal>
          {content.eyebrow && <p className={styles.kicker}>{content.eyebrow}</p>}
          {content.headline && <h2>{content.headline}</h2>}
          {content.body && <p className={styles.videoBody}>{content.body}</p>}
          {cta}
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.extraSection} ${styles.videoSection}`} id="video" data-edit="video" data-video-style={content.style} style={scrim}>
      {content.style === 'split' && (
        <div className={styles.videoSplit}>
          <VideoFrame item={primary} behavior={behavior} playLabel={primary.label || 'Play video'} />
          <div className={styles.videoCopy} data-reveal>
            {content.eyebrow && <p className={styles.kicker}>{content.eyebrow}</p>}
            {content.headline && <h2>{content.headline}</h2>}
            {content.body && <p className={styles.videoBody}>{content.body}</p>}
            {cta}
          </div>
        </div>
      )}

      {content.style === 'story' && (
        <div className={styles.videoSplit}>
          <VideoFrame item={primary} behavior={behavior} playLabel={primary.label || 'Watch project'} />
          <div className={styles.videoCopy} data-reveal>
            {content.location && <p className={styles.videoLocation}>{content.location}</p>}
            {content.headline && <h2>{content.headline}</h2>}
            {content.body && <p className={styles.videoBody}>{content.body}</p>}
            {(content.timeline || content.service) && (
              <dl className={styles.videoFacts}>
                {content.timeline && <div><dt>Timeline</dt><dd>{content.timeline}</dd></div>}
                {content.service && <div><dt>Service</dt><dd>{content.service}</dd></div>}
              </dl>
            )}
            {cta}
          </div>
        </div>
      )}

      {content.style === 'reel' && (
        <>
          <div className={styles.extraSectionHeader} data-reveal>
            {content.eyebrow && <p className={styles.kicker}>{content.eyebrow}</p>}
            {content.headline && <h2>{content.headline}</h2>}
            {content.body && <p>{content.body}</p>}
          </div>
          <div className={styles.videoReel} data-stagger>
            {content.videos.map((item) => (
              <VideoFrame key={item.id} item={item} behavior={behavior} neverAutoplay className={styles.videoReelTile} playLabel={item.label} />
            ))}
          </div>
          {cta && <div className={styles.videoCtaRow}>{cta}</div>}
        </>
      )}

      {content.style === 'testimonial' && <VideoTestimonials content={content} behavior={behavior} cta={cta} />}

      {content.style === 'process' && (
        <>
          <div className={styles.extraSectionHeader} data-reveal>
            {content.eyebrow && <p className={styles.kicker}>{content.eyebrow}</p>}
            {content.headline && <h2>{content.headline}</h2>}
            {content.body && <p>{content.body}</p>}
          </div>
          <VideoFrame item={primary} behavior={behavior} className={styles.videoWide} playLabel={primary.label || 'Watch how it works'} />
          {content.steps.some((step) => step.title.trim()) && (
            <ol className={styles.videoSteps} data-stagger>
              {content.steps.filter((step) => step.title.trim()).map((step, index) => (
                <li key={step.id}>
                  <span className={styles.videoStepNum}>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step.title}</strong>
                  {step.description && <span className={styles.videoStepDesc}>{step.description}</span>}
                </li>
              ))}
            </ol>
          )}
          {cta && <div className={styles.videoCtaRow}>{cta}</div>}
        </>
      )}
    </section>
  );
}

// Several customers on camera. It never advances on its own: rotating away from
// a testimonial someone chose to watch is the one thing a carousel must not do.
function VideoTestimonials({ content, behavior, cta }: { content: SiteVideoSectionContent; behavior: Behavior; cta: ReactNode }) {
  const [index, setIndex] = useState(0);
  const items = content.videos;
  const item = items[Math.min(index, items.length - 1)];

  return (
    <>
      <div className={styles.videoSplit}>
        <VideoFrame key={item.id} item={item} behavior={behavior} playLabel={item.label || 'Customer story'} />
        <div className={styles.videoCopy}>
          {content.eyebrow && <p className={styles.kicker}>{content.eyebrow}</p>}
          {content.headline && <h2>{content.headline}</h2>}
          {item.quote && <blockquote className={styles.videoQuote}>“{item.quote}”</blockquote>}
          {(item.author || item.authorLabel) && (
            <p className={styles.videoAuthor}>
              <strong>{item.author || 'Homeowner'}</strong>
              {item.authorLabel && <span>{item.authorLabel}</span>}
            </p>
          )}
          {cta}
        </div>
      </div>
      {items.length > 1 && (
        <div className={styles.videoDots} role="group" aria-label="Customer stories">
          {items.map((entry, entryIndex) => (
            <button
              key={entry.id}
              type="button"
              className={`${styles.videoDot}${entryIndex === index ? ` ${styles.videoDotOn}` : ''}`}
              aria-label={`Story ${entryIndex + 1}${entry.author ? ` — ${entry.author}` : ''}`}
              aria-current={entryIndex === index}
              onClick={() => setIndex(entryIndex)}
            />
          ))}
        </div>
      )}
    </>
  );
}
