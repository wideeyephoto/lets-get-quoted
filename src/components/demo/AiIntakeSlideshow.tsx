'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './ai-intake-slideshow.module.css';

const SLIDE_DURATION = 4200;

function MediaSlide() {
  return (
    <section className={`${styles.slide} ${styles.mediaSlide}`}>
      <div className={styles.storyPhoto}>
        <Image
          alt="Michelle photographing her existing bathtub for the AI intake"
          fill
          priority
          sizes="(max-width: 700px) 92vw, 430px"
          src="/demo/bath-to-shower/homeowner-tub-photo-v1.png"
        />
      </div>
      <div className={styles.storyShade} />
      <div className={styles.captureTarget} aria-hidden="true"><i /></div>

      <div className={styles.storyCopy}>
        <div className={styles.slideHeading}>
          <span>01 · LIVE PHOTO CAPTURE</span>
          <h2>See the job before you call.</h2>
          <p>Michelle sends the photos. AI checks the details.</p>
        </div>
        <div className={styles.channelProof} aria-label="One intake across every contact channel">
          <span>AI PHONE</span><span>TEXT</span><span>WEB</span><b>ONE INTAKE</b>
        </div>
        <div className={styles.captureStatus}><i /> CAMERA READY · ANALYZING LIVE</div>
        <div className={styles.captureChecks}>
          <span><i>✓</i> Lighting looks good</span>
          <span><i>✓</i> Focus is sharp</span>
        </div>
        <div className={styles.captureNext}>
          <small>ONE MORE ANGLE WOULD HELP</small>
          <strong>Show the tub edge and floor transition.</strong>
        </div>
      </div>
      <span className={styles.mediaCount}>3 PHOTOS · 1 VIDEO</span>
    </section>
  );
}

function PhotoCoachSlide() {
  return (
    <section className={`${styles.slide} ${styles.coachSlide}`}>
      <div className={styles.storyPhoto}>
        <Image
          alt="Michelle capturing the requested tub-edge and floor-transition detail"
          fill
          sizes="(max-width: 700px) 92vw, 640px"
          src="/demo/bath-to-shower/homeowner-threshold-detail-v1.png"
        />
      </div>
      <div className={styles.storyShade} />
      <div className={`${styles.captureTarget} ${styles.detailTarget}`} aria-hidden="true"><i /></div>

      <div className={styles.storyCopy}>
        <div className={styles.slideHeading}>
          <span>02 · GUIDED FOLLOW-UP</span>
          <h2>Get the photo that could change the price.</h2>
          <p>AI guides her to the tub edge and floor transition.</p>
        </div>
        <div className={styles.capturedNotice}><i>✓</i><span><small>REQUESTED ANGLE</small><strong>Captured and understood</strong></span></div>
        <div className={styles.detectedDetails}>
          <span><i>✓</i> Tub edge visible</span>
          <span><i>✓</i> Floor transition clear</span>
          <span><i>✓</i> Entry condition documented</span>
        </div>
        <div className={styles.mediaAnswered}><strong>3 details confirmed</strong><span>from one guided photo.</span></div>
      </div>
    </section>
  );
}

function VisionSlide() {
  return (
    <section className={`${styles.slide} ${styles.visionSlide}`}>
      <div className={styles.visionPhoto}>
        <Image
          alt="Bath-to-shower lead video frame analyzed by AI"
          fill
          sizes="(max-width: 700px) 92vw, 430px"
          src="/demo/bath-to-shower/before.png"
        />
        <span>VIDEO FRAME 2 / 3</span>
      </div>
      <div className={styles.visionContent}>
        <div className={styles.slideHeading}>
          <span>03 · JOB INTELLIGENCE</span>
          <h2>Open a lead—not a mystery.</h2>
          <p>Scope, risks, and materials are already organized.</p>
        </div>
        <div className={styles.observationCard}>
          <small>AI PHOTO SUMMARY</small>
          <strong>60-inch alcove tub · left-wall valve · tile surround</strong>
          <span>High step-over observed · low-threshold base suggested · grab-bar backing to confirm</span>
        </div>
      </div>
    </section>
  );
}

function QuestionsSlide() {
  return (
    <section className={`${styles.slide} ${styles.questionsSlide}`}>
      <div className={styles.slideHeading}>
        <span>04 · ADAPTIVE QUESTIONS</span>
        <h2>Ask only what can change the scope or price.</h2>
        <p>Everything visible in the photos is skipped.</p>
      </div>

      <div className={styles.questionPanel}>
        <div className={styles.microStepper} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => <span className={index < 4 ? styles.stepDone : undefined} key={index} />)}
        </div>
        <small>QUESTION 4 · PRICE-CHANGING DETAIL</small>
        <strong>Are the drain and shower controls staying on their current wall?</strong>
        <div className={styles.answerChoices}><span className={styles.answerSelected}>Yes</span><span>No</span><span>Not sure</span></div>
        <div className={styles.autoAnswered}>✓ 2 questions skipped—already answered by the photos</div>
        <div className={styles.questionFooter}><span>Confidence <b>88%</b></span><strong>Ready to estimate early</strong></div>
      </div>
      <div className={styles.escapeRow}><span>Urgent job? Skip to contact details</span><span>Skip questions · show ballpark</span></div>
    </section>
  );
}

function QuoteDraftSlide() {
  return (
    <section className={`${styles.slide} ${styles.quoteDraftSlide}`}>
      <div className={styles.slideHeading}>
        <span>05 · AI QUOTE DRAFT</span>
        <h2>Build the first draft in one click.</h2>
        <p>Lines fill from your price book, past jobs, and photos.</p>
      </div>

      <div className={styles.quoteForm} aria-label="AI-created quote draft">
        <div className={styles.quoteFormTop}>
          <span><i /> AI DRAFT COMPLETE</span>
          <strong>Bath-to-shower conversion</strong>
        </div>
        <div className={styles.intakeFields}>
          <div><small>PROJECT</small><strong>60&quot; alcove conversion</strong><span>FROM PHOTOS</span></div>
          <div><small>CONFIGURATION</small><strong>Left-wall valve · low threshold</strong><span>AI INTAKE</span></div>
        </div>
        <div className={styles.quoteColumns} aria-hidden="true"><span>LINE ITEM</span><span>SOURCE</span><span>AMOUNT</span></div>
        <div className={styles.quoteLines}>
          <div><strong>Demo + disposal</strong><span className={styles.sourceHistory}>PAST JOBS</span><b>$850</b></div>
          <div><strong>Low-threshold shower base</strong><span className={styles.sourceBook}>PRICE BOOK</span><b>$1,150</b></div>
          <div><strong>Waterproof wall system</strong><span className={styles.sourceBook}>PRICE BOOK</span><b>$1,900</b></div>
          <div><strong>Valve + trim allowance</strong><span className={styles.sourceSupplier}>SUPPLIER REF</span><b>$650</b></div>
        </div>
        <div className={styles.quoteFormBottom}><span>+ 3 more lines filled</span><strong>Draft total <b>$8,420</b></strong></div>
      </div>
    </section>
  );
}

function ReviewSlide() {
  return (
    <section className={`${styles.slide} ${styles.reviewSlide}`}>
      <div className={styles.slideHeading}>
        <span>06 · CONTRACTOR REVIEW</span>
        <h2>Nothing goes out without you.</h2>
        <p>Review every number, margin, and assumption.</p>
      </div>

      <div className={styles.reviewPanel}>
        <div className={styles.reviewTop}>
          <div><small>QUOTE DRAFT #Q-1048</small><strong>Michelle Carter</strong></div>
          <div><small>DRAFT TOTAL</small><strong>$8,420</strong></div>
        </div>
        <div className={styles.reviewRows}>
          <div><span><i>✓</i><b>Waterproof wall system</b></span><small>YOUR PRICE BOOK</small><strong>$1,900</strong></div>
          <div><span><i>!</i><b>Glass door allowance</b></span><small>CHECK THIS PRICE</small><strong>$1,250</strong></div>
          <div><span><i>✓</i><b>Installation labor</b></span><small>PAST JOBS</small><strong>$2,350</strong></div>
        </div>
        <div className={styles.marginRow}><span><small>PROJECTED MARGIN</small><strong>36%</strong></span><b>Margin protected</b></div>
        <div className={styles.reviewAction}><span>2 prices need review</span><strong>APPROVE BALLPARK →</strong></div>
      </div>
    </section>
  );
}

function TrustTransferSlide() {
  return (
    <section className={`${styles.slide} ${styles.guardrailSlide}`}>
      <div className={styles.slideHeading}>
        <span>07 · GUARDED BALLPARK</span>
        <h2>Give a useful answer while the lead is hot.</h2>
        <p>A guarded ballpark earns trust before your first call.</p>
      </div>

      <div className={styles.estimatePanel}>
        <div className={styles.estimateRecipient}><span>MC</span><div><small>PREPARED FOR</small><strong>Michelle Carter</strong></div><b>READY</b></div>
        <div className={styles.estimateTop}><span>YOUR PROJECT BALLPARK</span><strong>$7,600 – $9,200</strong></div>
        <div className={styles.estimateIncludes}>
          <span><i>✓</i> Based on your photos</span>
          <span><i>✓</i> Contractor guardrails applied</span>
        </div>
        <div className={styles.safetyRule}><b>FINAL PRICE AFTER SITE VISIT</b><span>Your contractor will confirm measurements, selections, and site conditions.</span></div>
        <div className={styles.trustHandoff}><span><i /> Owner notified</span><strong>Personal follow-up is next</strong></div>
      </div>
    </section>
  );
}

function BookingSlide() {
  return (
    <section className={`${styles.slide} ${styles.bookingSlide}`}>
      <div className={styles.bookingPhoto}>
        <Image
          alt="Finished low-threshold shower"
          fill
          sizes="(max-width: 700px) 92vw, 430px"
          src="/demo/bath-to-shower/after.png"
        />
      </div>
      <div className={styles.bookingShade} />
      <div className={styles.bookingContent}>
        <div className={styles.slideHeading}>
          <span>08 · BOOKING HANDOFF</span>
          <h2>Turn interest into a booked visit.</h2>
          <p>Michelle chooses a time. You arrive prepared.</p>
        </div>
        <div className={styles.bookingCard}>
          <div><span>ESTIMATE READY</span><strong>$7,600 – $9,200</strong></div>
          <small>Pick an arrival window · No card required</small>
          <div className={styles.timeChoices}><span>Thu 4:30</span><span>Fri 9:00</span><span>Sat 11:30</span></div>
          <b>Reserve final-measure visit →</b>
        </div>
      </div>
    </section>
  );
}

const slides = [
  MediaSlide,
  PhotoCoachSlide,
  VisionSlide,
  QuestionsSlide,
  QuoteDraftSlide,
  ReviewSlide,
  TrustTransferSlide,
  BookingSlide,
] as const;

type AiIntakeSlideshowProps = {
  autoStart?: boolean;
};

export default function AiIntakeSlideshow({ autoStart = false }: AiIntakeSlideshowProps) {
  const [slide, setSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInView, setIsInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!autoStart || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setIsPlaying(true);
  }, [autoStart]);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 1] },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying || !isInView || !pageVisible) return;
    const timer = window.setTimeout(() => {
      if (slide === slides.length - 1) {
        setIsPlaying(false);
      } else {
        setSlide((current) => current + 1);
      }
    }, SLIDE_DURATION);
    return () => window.clearTimeout(timer);
  }, [isInView, isPlaying, pageVisible, slide]);

  const CurrentSlide = slides[slide];
  const goToSlide = (nextSlide: number) => {
    setIsPlaying(false);
    setSlide(Math.max(0, Math.min(slides.length - 1, nextSlide)));
  };

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const isHorizontalSwipe = Math.abs(deltaX) >= 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15;

    dragStartRef.current = null;
    setDragOffset(0);
    setIsDragging(false);

    if (isHorizontalSwipe) goToSlide(slide + (deltaX < 0 ? 1 : -1));
  };

  const cancelSwipe = () => {
    dragStartRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  return (
    <div className={styles.player} ref={rootRef}>
      <div
        aria-label="AI intake feature slideshow"
        aria-roledescription="slideshow"
        className={styles.stage}
        data-dragging={isDragging ? 'true' : 'false'}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToSlide(slide - 1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToSlide(slide + 1);
          }
        }}
        onPointerCancel={cancelSwipe}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          setIsPlaying(false);
          dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = dragStartRef.current;
          if (!start || start.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
          setIsDragging(true);
          setDragOffset(Math.max(-72, Math.min(72, deltaX * 0.35)));
        }}
        onPointerUp={(event) => finishSwipe(event)}
        role="region"
        tabIndex={0}
      >
        <div
          className={styles.slideMotion}
          data-dragging={isDragging ? 'true' : 'false'}
          style={{ transform: `translate3d(${dragOffset}px, 0, 0)` }}
        >
          <CurrentSlide key={slide} />
        </div>
        <button
          aria-label="Previous slide"
          className={`${styles.edgeArrow} ${styles.edgeArrowPrevious}`}
          disabled={slide === 0}
          onClick={() => goToSlide(slide - 1)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          aria-label="Next slide"
          className={`${styles.edgeArrow} ${styles.edgeArrowNext}`}
          disabled={slide === slides.length - 1}
          onClick={() => goToSlide(slide + 1)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <span aria-hidden="true">›</span>
        </button>
        <div className={styles.slideCount}>{String(slide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</div>
      </div>

      <div className={styles.swipeNav}>
        <div aria-label="Choose a slide" className={styles.progress} role="group">
          {slides.map((_, index) => (
            <button
              aria-current={index === slide ? 'step' : undefined}
              aria-label={`Go to slide ${index + 1}`}
              className={index <= slide ? styles.progressActive : undefined}
              key={index}
              onClick={() => goToSlide(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
