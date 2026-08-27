'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import styles from './ai-intake-slideshow.module.css';

const SLIDE_DURATION = 4800;

function PresetSlide() {
  return (
    <section className={`${styles.slide} ${styles.setupSlide}`}>
      <div className={styles.slideHeading}>
        <span>01 · SETUP</span>
        <h2>Teach the intake your trade in one click.</h2>
        <p>Load the right questions, job minimum, exclusions, and photo prompt together.</p>
      </div>

      <div className={styles.presetPanel}>
        <div className={styles.presetChips}>
          <span className={styles.chipActive}>General remodeling</span>
          <span>Plumbing</span>
          <span>HVAC</span>
        </div>
        <div className={styles.loadedNotice}><i>✓</i> General Contracting preset loaded</div>
        <div className={styles.settingRows}>
          <div><span>Minimum job</span><strong>$1,000</strong></div>
          <div><span>Smart questions</span><strong>2 required</strong></div>
          <div><span>Trade exclusions</span><strong>3 suggested</strong></div>
          <div><span>Photo prompt</span><strong>Current room layout</strong></div>
        </div>
        <div className={styles.qualityRow}>
          <span>Qualification coverage</span>
          <strong>HIGH</strong>
        </div>
      </div>
    </section>
  );
}

function VoiceSlide() {
  return (
    <section className={`${styles.slide} ${styles.voiceSlide}`}>
      <div className={styles.slideHeading}>
        <span>02 · ANY CHANNEL</span>
        <h2>The lead can talk, text, or type.</h2>
        <p>The shared AI line turns a natural conversation into structured intake.</p>
      </div>

      <div className={styles.channelRow}>
        <span>Website</span><span>Text</span><span className={styles.chipActive}>AI phone line</span>
      </div>
      <div className={`${styles.insightBadge} ${styles.firstImpressionBadge}`}>
        <b>50 ms</b>
        <span>That is how quickly people form a visual first impression.</span>
        <small>Lindgaard et al.</small>
      </div>
      <div className={styles.callCard}>
        <div className={styles.callTop}>
          <span className={styles.waveform}>|||||||||</span>
          <span>00:38</span>
        </div>
        <blockquote>“Tub out. Low-threshold shower. Keep the plumbing wall. Hoping for next month.”</blockquote>
        <div className={styles.parsedGrid}>
          <span><small>PROJECT</small><b>Bath conversion</b></span>
          <span><small>TIMELINE</small><b>Within 30 days</b></span>
          <span><small>URGENCY</small><b>Warm lead</b></span>
          <span><small>NEXT ACTION</small><b>Request photos</b></span>
        </div>
      </div>
    </section>
  );
}

function MediaSlide() {
  return (
    <section className={`${styles.slide} ${styles.mediaSlide}`}>
      <div className={styles.mediaPhoto}>
        <Image
          alt="Existing bathtub submitted for AI intake"
          fill
          priority
          sizes="(max-width: 700px) 92vw, 430px"
          src="/demo/bath-to-shower/before.png"
        />
        <span className={styles.mediaCount}>3 PHOTOS · 1 VIDEO</span>
      </div>

      <div className={styles.mediaContent}>
        <div className={styles.slideHeading}>
          <span>03 · PHOTO + VIDEO</span>
          <h2>Every upload becomes scoping context.</h2>
          <p>Up to six photos or video clips—35 MB each—with quality coaching before they send.</p>
        </div>
        <div className={styles.mediaChecks}>
          <span><i>✓</i> Lighting looks good</span>
          <span><i>✓</i> Focus is sharp</span>
          <span><i>✓</i> Video keyframes ready</span>
        </div>
      </div>
    </section>
  );
}

function PhotoCoachSlide() {
  return (
    <section className={`${styles.slide} ${styles.coachSlide}`}>
      <div className={styles.slideHeading}>
        <span>04 · QUALITY COACH</span>
        <h2>It asks for the photo that changes the estimate.</h2>
        <p>Before upload, the intake checks lighting and focus, then gives trade-aware camera guidance.</p>
      </div>

      <div className={styles.coachPanel}>
        <div className={styles.uploadRow}>
          <span>JPG</span>
          <div><strong>shower-wall.jpg</strong><small>1.8 MB · checking quality</small></div>
          <b>✓</b>
        </div>
        <div className={styles.coachCheck}><i>!</i><span><strong>One more angle would help.</strong><small>Show the threshold and the wall with the shower controls.</small></span></div>
        <div className={styles.tradeTip}>
          <small>TRADE-AWARE TIP</small>
          <strong>Take one wide room photo and one close view of the plumbing wall.</strong>
        </div>
        <div className={styles.photoPrompt}>
          <span>AI FOLLOW-UP</span>
          <p>Can you snap the tub edge and floor transition?</p>
          <b>Snap photo</b>
        </div>
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
          <span>05 · MULTIMODAL VISION</span>
          <h2>The AI sees what the homeowner forgot to type.</h2>
        </div>
        <div className={styles.observationCard}>
          <small>WHAT WE SPOTTED</small>
          <strong>60-inch alcove tub. Controls on the left wall. Clear front access.</strong>
          <span>Three questions answered from the media—so the intake will not ask them again.</span>
        </div>
      </div>
    </section>
  );
}

function QuestionsSlide() {
  return (
    <section className={`${styles.slide} ${styles.questionsSlide}`}>
      <div className={styles.slideHeading}>
        <span>06 · ADAPTIVE QUESTIONS</span>
        <h2>Ask only what can change the scope or price.</h2>
        <p>One short question at a time, up to six—and the AI stops early as soon as it is confident.</p>
      </div>

      <div className={styles.questionPanel}>
        <div className={styles.microStepper} aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => <span className={index < 4 ? styles.stepDone : undefined} key={index} />)}
        </div>
        <small>QUESTION 4 · PRICE-CHANGING DETAIL</small>
        <strong>Are the drain and shower controls staying on their current wall?</strong>
        <div className={styles.answerChoices}><span className={styles.answerSelected}>Yes</span><span>No</span><span>Not sure</span></div>
        <div className={styles.autoAnswered}>✓ Alcove width skipped—already visible in the video</div>
        <div className={styles.questionFooter}><span>Confidence <b>88%</b></span><strong>Ready to estimate early</strong></div>
      </div>
      <div className={styles.escapeRow}><span>Urgent job? Skip to contact details</span><span>Skip questions · show ballpark</span></div>
    </section>
  );
}

function IntelligenceSlide() {
  return (
    <section className={`${styles.slide} ${styles.intelligenceSlide}`}>
      <div className={styles.slideHeading}>
        <span>07 · LEAD INTELLIGENCE</span>
        <h2>The contractor opens a lead—not a mystery.</h2>
        <p>Vision converts the homeowner media into practical field and supply-house context.</p>
      </div>

      <div className={styles.intelPanel}>
        <div><small>DETECTED</small><strong>60&quot; steel alcove tub</strong><span>Left-wall valve · tile surround</span></div>
        <div><small>OBSERVED ISSUE</small><strong>High step-over</strong><span>Limited support at entry</span></div>
        <div><small>PICK LIST</small><strong>Low-threshold pan</strong><span>Grab bar · seat · glass kit</span></div>
        <div><small>SAFETY / CODE</small><strong>Backing required</strong><span>Confirm grab-bar anchoring</span></div>
      </div>
      <div className={styles.intelFooter}><span>URGENCY · MEDIUM</span><strong>92% visual confidence</strong></div>
    </section>
  );
}

function TrustTransferSlide() {
  return (
    <section className={`${styles.slide} ${styles.guardrailSlide}`}>
      <div className={styles.slideHeading}>
        <span>08 · THE TRUST TRANSFER</span>
        <h2>Answer now. Hand the trust to the contractor next.</h2>
        <p>A useful ballpark proves the homeowner was heard.</p>
      </div>

      <div className={styles.estimatePanel}>
        <div className={styles.estimateTop}><span>INSTANT, GUARDED BALLPARK</span><strong>$7,600 – $9,200</strong></div>
        <div className={styles.trustFlow}>
          <span><b>AI</b> creates the first impression</span>
          <i>→</i>
          <span><b>YOU</b> take the relationship</span>
        </div>
        <div className={styles.evidenceCards} aria-label="Research-backed outcomes">
          <div><strong>+15–20%</strong><span>customer satisfaction potential</span><small>AI personalization · McKinsey</small></div>
          <div><strong>+5–8%</strong><span>revenue potential</span><small>AI personalization · McKinsey</small></div>
        </div>
        <div className={styles.safetyRule}><b>TRUST NEEDS GUARDRAILS</b><span>61% say AI makes trust more important (Salesforce). Price bounds and site-visit rules keep the contractor in control.</span></div>
      </div>
    </section>
  );
}

function RankingSlide() {
  return (
    <section className={`${styles.slide} ${styles.rankingSlide}`}>
      <div className={styles.slideHeading}>
        <span>09 · PREMIUM LEAD SIGNALS</span>
        <h2>High-expectation homeowners feel the difference.</h2>
        <p>Fit, timing, and project value become one honest priority.</p>
      </div>

      <div className={`${styles.insightBadge} ${styles.premiumBadge}`}>
        <b>TABLE STAKES</b>
        <span>Top-tier clients expect personalized experiences—not generic follow-up.</span>
        <small>BCG–Altagamma, 2024</small>
      </div>
      <div className={styles.rankCard}>
        <div className={styles.rankPerson}><span>MC</span><div><strong>Michelle Carter</strong><small>Bath-to-shower conversion</small></div><b>HOT · HIGH VALUE</b></div>
        <div className={styles.rankSignals}>
          <span><i>✓</i> In service area</span>
          <span><i>✓</i> Starting within 30 days</span>
          <span><i>✓</i> Phone verified</span>
          <span><i>✓</i> Value above $8k threshold</span>
        </div>
        <div className={styles.alertRow}><span>Owner alert sent</span><strong>Low-quality leads stay quiet</strong></div>
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
          <span>10 · BOOKING HANDOFF</span>
          <h2>End the intake with a next step.</h2>
          <p>The homeowner can choose an arrival window while the job is still top of mind.</p>
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
  PresetSlide,
  VoiceSlide,
  MediaSlide,
  PhotoCoachSlide,
  VisionSlide,
  QuestionsSlide,
  IntelligenceSlide,
  TrustTransferSlide,
  RankingSlide,
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
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className={styles.player} ref={rootRef}>
      <div
        aria-label="AI intake feature slideshow"
        aria-roledescription="slideshow"
        className={styles.stage}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setIsPlaying(false);
            setSlide((current) => Math.max(0, current - 1));
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            setIsPlaying(false);
            setSlide((current) => Math.min(slides.length - 1, current + 1));
          }
        }}
        role="region"
        tabIndex={0}
      >
        <CurrentSlide key={slide} />
        <div className={styles.slideCount}>{String(slide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</div>
      </div>

      <div className={styles.controls}>
        <span aria-live="polite" className={styles.srOnly}>Slide {slide + 1} of {slides.length}</span>
        <button aria-label="Previous slide" disabled={slide === 0} onClick={() => { setIsPlaying(false); setSlide((current) => Math.max(0, current - 1)); }} type="button">←</button>
        <button
          className={styles.playButton}
          onClick={() => {
            if (slide === slides.length - 1) setSlide(0);
            setIsPlaying((current) => slide === slides.length - 1 || !current);
          }}
          type="button"
        >
          {isPlaying ? 'Pause' : slide === slides.length - 1 ? 'Play again' : 'Play slideshow'}
        </button>
        <div aria-hidden="true" className={styles.progress}>
          {slides.map((_, index) => <span className={index <= slide ? styles.progressActive : undefined} key={index} />)}
        </div>
        <button aria-label="Next slide" disabled={slide === slides.length - 1} onClick={() => { setIsPlaying(false); setSlide((current) => Math.min(slides.length - 1, current + 1)); }} type="button">→</button>
      </div>
    </div>
  );
}
