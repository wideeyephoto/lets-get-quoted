'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { isOptimizableHost } from './SafeImage';
import styles from './themes.module.css';

type HeroVideo = { url: string; posterUrl: string };

type HeroImageCycleProps = {
  images: string[];
  className?: string;
  alt: string;
  interval?: number;
  /** A silent looping clip in place of the photo. See getHeroVideo. */
  video?: HeroVideo | null;
};

// Cross-fades through the hero image set. With 0–1 images it renders a plain
// <img> identical to before (so single-hero sites are untouched). With more, the
// FIRST image stays in normal flow — it sizes the wrapper exactly like the
// original <img> did — and the extras stack absolutely on top, fading in when
// active. When active is 0 the overlays are hidden and the base shows through.
//
// THE HERO VIDEO RIDES THE SAME SEAM
//
// All eight templates call this component the same way and hand it their own
// hero className, which is the only thing that knows what shape that template's
// hero is. So a <video> carrying that SAME className lands in the same box with
// the same object-fit, and one change covers every template without editing any
// of them. That is why this lives here rather than in each template.
//
// Everything below is the photo path untouched unless a video is actually set,
// because this is on the critical render path of every published site: the cost
// of a mistake here is every customer's homepage, so an absent, unset or
// unplayable video has to fall through to exactly the markup that shipped before.
// A dispatcher with NO hooks of its own, so branching on `video` is safe.
// Putting the branch above a useEffect would be a Rules-of-Hooks violation that
// only bites in the one place it matters most: the builder's live preview, where
// the owner setting a hero video flips this prop on a MOUNTED component and the
// hook order would change under React mid-edit.
export default function HeroImageCycle({ images, className, alt, interval = 5000, video }: HeroImageCycleProps) {
  if (video?.url) return <HeroVideoBackdrop video={video} className={className} alt={alt} poster={images[0]} />;
  return <HeroPhotoCycle images={images} className={className} alt={alt} interval={interval} />;
}

// Unchanged from before the video existed, deliberately: this renders on every
// published site, so the no-video path is the original code rather than a
// refactor of it.
function HeroPhotoCycle({ images, className, alt, interval }: Omit<HeroImageCycleProps, 'video'> & { interval: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setActive((current) => (current + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  if (images.length <= 1) {
    if (isOptimizableHost(images[0])) {
      return (
        <Image
          className={className}
          src={images[0]}
          alt={alt}
          fill
          priority
          sizes="100vw"
          draggable={false}
        />
      );
    }
    return <img className={className} src={images[0]} alt={alt} fetchPriority="high" decoding="async" draggable={false} />;
  }

  return (
    <span className={styles.heroCycle}>
      {images.map((src, index) => {
        const itemClassName = index === 0 ? className : `${className ? `${className} ` : ''}${styles.heroCycleOverlay}`;
        const itemStyle = index === 0 ? undefined : ({ opacity: active === index ? 1 : 0 } as CSSProperties);
        if (isOptimizableHost(src)) {
          return (
            <Image
              key={`${index}-${src}`}
              className={itemClassName}
              src={src}
              alt={index === 0 ? alt : ''}
              aria-hidden={index === 0 ? undefined : true}
              style={itemStyle}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : 'lazy'}
              sizes="100vw"
              draggable={false}
            />
          );
        }
        return (
          <img
            key={`${index}-${src}`}
            className={itemClassName}
            src={src}
            alt={index === 0 ? alt : ''}
            aria-hidden={index === 0 ? undefined : true}
            style={itemStyle}
            loading={index === 0 ? undefined : 'lazy'}
            fetchPriority={index === 0 ? 'high' : undefined}
            decoding="async"
            draggable={false}
          />
        );
      })}
    </span>
  );
}

// The clip itself, following the same rules the video bands already established
// (see SiteVideoSection): muted always, because no browser will autoplay sound;
// poster first so SSR renders a still and there is nothing to flash; and the
// poster kept for anyone who asked for less motion.
function HeroVideoBackdrop({
  video,
  className,
  alt,
  poster,
}: {
  video: HeroVideo;
  className?: string;
  alt: string;
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // Decided in an effect, never during render, so the server and the first
  // client paint agree on the still frame.
  const [play, setPlay] = useState(false);

  useEffect(() => {
    // A hero video is decoration. Someone who has asked their system for reduced
    // motion has asked for exactly this not to happen, and a phone gets the
    // poster because a looping background is a data bill they did not agree to
    // on a connection they may be paying for by the megabyte.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const small = window.matchMedia('(max-width: 720px)').matches;
    if (reduced || small) return;

    // Same argument, asked directly rather than inferred from screen width: a
    // browser in data-saver mode, or on a connection it knows is slow, is one
    // where a decorative background clip is the wrong thing to spend on. Both
    // are non-standard, hence the cautious read.
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData) return;
    if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return;

    // WAIT FOR THE PAGE TO FINISH BEFORE PULLING DOWN A VIDEO.
    //
    // The clip can be tens of megabytes, and the hero POSTER is the largest
    // contentful paint — the thing the page is measured on. Starting the video
    // during load puts the two in a fight for the same bandwidth that the
    // decoration wins, because it is bigger. Deferring past `load` costs a
    // second of still frame, which is what a poster is for, and keeps the
    // measured paint the image.
    let idle = 0;
    const begin = () => {
      const requestIdle = window.requestIdleCallback;
      // Idle if the browser offers it, with a timeout so a busy page still
      // starts; a plain timeout otherwise.
      idle = requestIdle
        ? requestIdle(() => setPlay(true), { timeout: 2000 })
        : window.setTimeout(() => setPlay(true), 200);
    };

    if (document.readyState === 'complete') {
      begin();
      return () => { if (idle) (window.cancelIdleCallback ?? window.clearTimeout)(idle); };
    }
    window.addEventListener('load', begin, { once: true });
    return () => {
      window.removeEventListener('load', begin);
      if (idle) (window.cancelIdleCallback ?? window.clearTimeout)(idle);
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || !play) return;
    element.muted = true;
    // A refused play() is normal and self-correcting: the poster stays up.
    element.play().catch(() => {});
  }, [play]);

  // The owner's own poster wins; otherwise the hero photo it replaced, which is
  // already sized and cropped for this exact box.
  const still = video.posterUrl || poster || undefined;

  if (!play) {
    return still ? (
      <img className={className} src={still} alt={alt} fetchPriority="high" decoding="async" draggable={false} />
    ) : (
      // No still to show and not playing yet — render the element anyway so the
      // hero keeps its size rather than collapsing for a frame.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video className={className} poster={still} muted playsInline preload="metadata" aria-hidden tabIndex={-1} />
    );
  }

  return (
    // aria-hidden + tabIndex -1: it is a silent, wordless backdrop behind the
    // headline. Announcing it interrupts the copy that carries the actual
    // message, and there are no controls to tab to.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      className={className}
      src={video.url}
      poster={still}
      muted
      loop
      playsInline
      // NOT "auto". preload is a hint about what to fetch BEFORE anyone asks —
      // and nobody has to ask here, because the play() below starts the fetch
      // itself. So "auto" bought nothing except a head start against the hero
      // image during the critical window, on a file that can be 50 MB.
      preload="none"
      aria-hidden
      tabIndex={-1}
      draggable={false}
    />
  );
}
