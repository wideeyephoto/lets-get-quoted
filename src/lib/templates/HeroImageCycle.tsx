'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import styles from './themes.module.css';

type HeroImageCycleProps = {
  images: string[];
  className?: string;
  alt: string;
  interval?: number;
};

// Cross-fades through the hero image set. With 0–1 images it renders a plain
// <img> identical to before (so single-hero sites are untouched). With more, the
// FIRST image stays in normal flow — it sizes the wrapper exactly like the
// original <img> did — and the extras stack absolutely on top, fading in when
// active. When active is 0 the overlays are hidden and the base shows through.
export default function HeroImageCycle({ images, className, alt, interval = 5000 }: HeroImageCycleProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => setActive((current) => (current + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  if (images.length <= 1) {
    return <img className={className} src={images[0]} alt={alt} fetchPriority="high" decoding="async" draggable={false} />;
  }

  return (
    <span className={styles.heroCycle}>
      {images.map((src, index) => (
        <img
          key={`${index}-${src}`}
          className={index === 0 ? className : `${className ? `${className} ` : ''}${styles.heroCycleOverlay}`}
          src={src}
          alt={index === 0 ? alt : ''}
          aria-hidden={index === 0 ? undefined : true}
          style={index === 0 ? undefined : ({ opacity: active === index ? 1 : 0 } as CSSProperties)}
          loading={index === 0 ? undefined : 'lazy'}
          fetchPriority={index === 0 ? 'high' : undefined}
          decoding="async"
          draggable={false}
        />
      ))}
    </span>
  );
}
