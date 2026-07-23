'use client';

import { Children, useEffect, useState, type ReactNode } from 'react';
import styles from './themes.module.css';

// Two auto-advancing testimonial layouts sharing the pre-rendered review cards
// (manual + Google) passed as children. 'carousel' is a seamless CSS marquee
// (transform-only so it never stalls in the preview iframe; pauses on hover).
// 'spotlight' cross-fades one card at a time on a JS timer.
export default function TestimonialSlider({ mode, children }: { mode: 'carousel' | 'spotlight'; children: ReactNode }) {
  const cards = Children.toArray(children);
  if (mode === 'spotlight') return <Spotlight cards={cards} />;
  return <Carousel cards={cards} />;
}

function Carousel({ cards }: { cards: ReactNode[] }) {
  // Too few cards to loop convincingly — just center them.
  if (cards.length < 3) {
    return <div className={styles.tCarouselStatic}>{cards.map((card, index) => <div key={index} className={styles.tSlide}>{card}</div>)}</div>;
  }
  return (
    <div className={styles.tCarousel}>
      <div className={styles.tCarouselTrack} style={{ animationDuration: `${cards.length * 6}s` }}>
        {cards.map((card, index) => <div key={`a-${index}`} className={styles.tSlide}>{card}</div>)}
        {cards.map((card, index) => <div key={`b-${index}`} className={styles.tSlide} aria-hidden="true">{card}</div>)}
      </div>
    </div>
  );
}

function Spotlight({ cards }: { cards: ReactNode[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (cards.length <= 1) return;
    const id = setInterval(() => setActive((current) => (current + 1) % cards.length), 5500);
    return () => clearInterval(id);
  }, [cards.length]);

  return (
    <div className={styles.tSpotlight}>
      <div className={styles.tSpotlightStage}>
        {cards.map((card, index) => (
          <div key={index} className={styles.tSpotlightSlide} style={{ opacity: index === active ? 1 : 0 }} aria-hidden={index !== active}>
            {card}
          </div>
        ))}
      </div>
      {cards.length > 1 && (
        <div className={styles.tDots}>
          {cards.map((_, index) => (
            <button key={index} type="button" className={index === active ? styles.tDotActive : styles.tDot} aria-label={`Show review ${index + 1}`} aria-current={index === active} onClick={() => setActive(index)} />
          ))}
        </div>
      )}
    </div>
  );
}
