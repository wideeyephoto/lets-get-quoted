/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from './site-chrome';
import { COMMAND_CENTER_SCREENS } from '@/components/command-center-deck';
import HeroAiIntakeShowcase from './hero-ai-intake-showcase';
import { HOME_FAQS } from '@/lib/home-faqs';
import { PLAN_PRICE_OPTIONS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './flagship.module.css';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';

const TradeOrbit = dynamic(() => import('./trade-orbit'), { ssr: true });
const CommandCenterDeck = dynamic(() => import('@/components/command-center-deck'), { ssr: true });

/* The URL and the words both come from site-chrome, which is where the header,
   the phone bar and the closing band already read them. This page used to
   declare its own copy of the URL and then say three different things next to
   it — "Start free" at the price, "Create my account" at the close, and
   whatever the header said above both. */
import { SIGNUP_LABEL } from './site-chrome';

/**
 * THREE DECLARED PLANES.
 *
 * Depth is a rule the whole page follows rather than an effect applied per
 * section: every element that should read as nearer or further than the page
 * carries data-plane, and gets exactly one of these rates. Nothing invents its
 * own number, which is what keeps eleven sections looking like one page.
 *
 * The rate is a TRAVEL multiplier, not a scroll speed. A front-plane element
 * sweeps past faster than the page — which is what "close to you" looks like —
 * and a back-plane element barely moves. Real parallax works the same way: the
 * hedge at the roadside blurs past, the hills hold still.
 */
const PLANES: Record<string, number> = { back: 0.15, mid: 0.45, front: 0.8 };

/** Half the sweep of a rate-1.0 element, in px. The whole system's one dial. */
const PLANE_TRAVEL = 118;

/** Type-safe inline custom properties, which React's CSSProperties omits. */
const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/**
 * THREE NON-COMPETING PROOF POINTS UNDER THE HERO.
 *
 * Replaces the four linked feature tiles with clear, static proof points so
 * the first viewport remains uncluttered and easy to digest before the visitor
 * sees the 5-step workflow below.
 */
const PROOF_POINTS = [
  {
    label: 'ONE-CLICK AI WEBSITE',
    blurb: 'Launch with instant estimate',
    href: '#flagships',
    ariaLabel: 'Jump to the contractor website builder section',
  },
  {
    label: 'SMART PHOTO INTAKE',
    blurb: 'See scope & risks before you call',
    href: '/features/ai-intake',
    ariaLabel: 'Learn about AI photo intake and lead qualification',
  },
  {
    label: 'QUOTE-TO-PAYMENT WORKFLOW',
    blurb: 'One connected system',
    href: '#workflow',
    ariaLabel: 'Jump to connected quote-to-payment workflow features',
  },
];

/**
 * Quick Stops has its own wordmark, and the mocks were spelling the name in
 * body type instead — a product with a logo, drawn without it. Same asset the
 * dashboard rail and the demo sidebar use, so there is one file to change.
 */
function QuickStopsMark({ width }: { width: number }) {
  return (
    <Image
      className="qs-mark"
      src="/brand/quick-stops-wordmark.png"
      alt="Quick Stops"
      width={287}
      height={50}
      style={{ width, height: 'auto' }}
      unoptimized
    />
  );
}

type Feature = {
  number: string;
  kicker: string;
  title: string;
  body: string;
  proof: string[];
  input: string;
  output: string;
  /** The page that answers the card. All three had none — this section made
      the strongest claims on the page and was the only one a visitor could not
      follow up on. */
  href: string;
};

const features: Feature[] = [
  {
    number: "01",
    kicker: "ONE-CLICK AI WEBSITE",
    title: "Go from no website to ready for business—in one click.",
    body: "Start with a complete contractor site, then edit every word, service and service area before you publish.",
    proof: ["Your own domain", "Built for 49 contractor trades", "Edit everything before you publish"],
    input: "Three business basics",
    output: "A complete, editable site",
    href: "/features/website-builder",
  },
  {
    number: "02",
    kicker: "SMART INTAKE",
    title: "Your website asks the questions a great estimator would.",
    body: "Every inquiry becomes a clear project summary with fit, urgency, value and location already considered.",
    proof: ["Hot, warm and low lead scoring", "Project-specific follow-ups", "Instant high-value alerts"],
    input: "One homeowner request",
    output: "A prioritized lead with context",
    href: "/features/ai-intake",
  },
  {
    number: "03",
    kicker: "QUICK STOPS",
    title: "Get paid to fit nearby customers into today’s route.",
    body: "Offer a nearby homeowner a same-day arrival window and price you choose. Nothing books until they pay.",
    proof: ["Route-aware matching", "You control every offer", "Always optional—never auto-booked"],
    input: "A gap in today’s route",
    output: "A paid priority visit you approved",
    href: "/features/quick-stops",
  },
];


/**
 * The rest of the job, and where each part is explained in full.
 *
 * SEVEN, NOT EIGHT. "Texts + client portal" was here as a one-line card, one
 * section below a full-width demonstration of the texting and the portal with
 * a live conversation playing in it. Naming a thing in a sentence directly
 * after showing it working is not reinforcement, it is the reader wondering
 * whether they missed something. The section above is the version that stays.
 *
 * EVERY CARD NOW HAS A PAGE OF ITS OWN. They used to land on a capability group
 * on /features or on an anchor part-way down /features/back-office — so a
 * visitor who read "Cash flow · See payroll, bills and customer money before it
 * moves" and pressed it arrived at a heading called Money, in a list of
 * seventeen capabilities, on a page about something broader. The card made a
 * specific promise and the destination answered a general one.
 */
/** How long each product screen holds before the next one. */
const SUITE_DWELL = 1250;

/**
 * The narrowest width the screens rotate at.
 *
 * Not a performance guard — a layout one. The five mockups are different
 * heights, and a panel that resizes every 1.25s drags every section below it up
 * and down the page. Above this width the spread is 123px and is absorbed by a
 * reserved min-height with the shorter screens centerd (see §97). Below it the
 * spread is 476px — the leads pipeline is more than twice the height of the
 * schedule at 390px — and reserving for that would put a screen and a half of
 * empty space under every short one.
 *
 * The tabs still work below it. They just wait to be pressed.
 */
const SUITE_ROTATE_MIN = 1024;

const suite: Array<[title: string, body: string, href: string]> = [
  ["Quotes + e-sign", "Professional, itemized quotes with optional upgrades.", "/features/quotes"],
  ["Scheduling", "Arrival windows, capacity and weather-aware planning.", "/features/scheduling"],
  ["Crew + labor", "Assignments, time clock, hours and estimated pay.", "/features/crew"],
  ["Payments", "Deposits, balances and payment plans through Stripe.", "/features/payments"],
  ["Recurring work", "Automatic visits, saved cards and predictable revenue.", "/features/recurring"],
  ["Cash flow", "See payroll, bills and customer money before it moves.", "/features/cash-flow"],
  ["Reviews + growth", "Follow-ups, review requests and AI-assisted marketing.", "/features/reviews"],
];


/**
 * A slow band of light crossing a section's background.
 *
 * WHY AN ELEMENT AND NOT A PSEUDO. Of the seven bands that carry one, four
 * already spend both ::before and ::after on the hairline grid overlay, the
 * ambient orbs and the CTA's rings. A real node also lets one observer pause
 * every glare that is off screen, which matters when the alternative is seven
 * blurred layers compositing forever on a page that already animates five
 * other things.
 *
 * It is absolutely positioned, so the three sections that are CSS grids do not
 * gain an eighth column — out-of-flow children are not grid items.
 *
 * `tone` picks the light: white reads as a sheen on the dark bands and as
 * nothing at all on cream, where the same gesture has to be a shadow instead.
 */
function Glare({ tone = 'dark' }: { tone?: 'dark' | 'cream' | 'orange' }) {
  return <i className="glare" data-tone={tone} aria-hidden="true" />;
}

/**
 * THE MOCKUPS ARE PICTURES, AND NOW THEY SAY SO.
 *
 * Each of the four frames below draws a product screen out of real markup —
 * real <button> elements, at 7–9px, in orange on white. That made them
 * focusable: tabbing through the homepage stopped on "Yes", "No", "Send offer",
 * "Generate full site with AI" and five others, each a control that does
 * nothing, several of them below the 4.5:1 contrast minimum and far below any
 * sensible target size. The `aria-label` they carried did nothing at all —
 * aria-label is ignored on a plain <div> with no role — so a screen reader
 * walked the whole fake dashboard as if it were the page.
 *
 * `role="img"` + the label fixes both halves: the frame is announced once, as
 * the illustration it is, and its innards leave the accessibility tree.
 * role="img" does NOT remove anything from the tab order, so every decorative
 * control also takes tabIndex={-1}.
 *
 * They stay <button>s rather than becoming <span>s because the stylesheet is
 * generated (flagship.module.css, from scripts/generate-flagship-css.mjs) and
 * selects on the element name in a dozen places. Changing the tag here would
 * silently unstyle them; changing it in the generator is a bigger edit than the
 * bug warrants.
 *
 * WHAT THIS DOES NOT FIX: the text is still 7–9px. It is now text inside a
 * picture rather than an interactive control, which is the audit's own
 * suggested remedy ("make illustrative UI inert"), but a genuinely legible
 * version means redrawing the frames larger.
 */
function SiteBuilderVisual() {
  return (
    <div className="product-frame builder-frame" role="img" aria-label="Illustration: the AI website builder generating a contractor site from a business name, trade and service area.">
      <div className="frame-top">
        <span className="frame-dots"><i /><i /><i /></span>
        <span>Website builder</span>
        <span className="live-pill">LIVE PREVIEW</span>
      </div>
      <div className="builder-layout">
        <aside className="builder-controls">
          <p className="mini-label">BUSINESS BASICS</p>
          <div className="fake-field"><small>Company</small><strong>Brightline Electric</strong></div>
          <div className="fake-field"><small>Trade</small><strong>Electrician</strong></div>
          <div className="fake-field"><small>Service area</small><strong>Royal Oak, MI</strong></div>
          <button className="generate-button" tabIndex={-1}><span>✦</span> Generate full site with AI</button>
          <div className="generation-status"><span /><span /><span /></div>
        </aside>
        <div className="site-preview">
          <div className="preview-nav"><b>BRIGHTLINE</b><span>Services&nbsp;&nbsp; Work&nbsp;&nbsp; Reviews</span><em>Free estimate</em></div>
          <div className="preview-hero">
            {/* The trade and the town — the two things the panel on the left
                has just entered, so the preview visibly answers the form beside
                it. This read "LICENSED · INSURED · LOCAL": three regulated
                claims, invented by us, on a page selling the tool that would
                publish them. The builder does not know whether a contractor
                holds any of them, and the site templates were changed this week
                to stop asserting them by default. */}
            <p>ELECTRICIAN · ROYAL OAK, MI</p>
            <p className="preview-headline">Power your home.<br />Protect what matters.</p>
            <button tabIndex={-1}>Get an instant estimate →</button>
          </div>
          {/* Three things the generated site genuinely ships with, in place
              of a "4.9★ Local rating" and "12 yrs Experience" belonging to a
              business that does not exist. A star rating is the figure a
              homeowner is most likely to believe, and we have no basis for it. */}
          <div className="preview-stats"><span><b>24/7</b> Instant estimate</span><span><b>Online</b> Booking</span><span><b>Your</b> Own domain</span></div>
        </div>
      </div>
    </div>
  );
}

function IntakeVisual() {
  return (
    <div className="product-frame intake-frame" role="img" aria-label="Illustration: a homeowner answering the AI intake about a drain backup, and the scored lead it produces for the contractor.">
      <div className="frame-top">
        <span className="frame-dots"><i /><i /><i /></span>
        <span>Smart intake</span>
        <span className="live-pill hot">HOT LEAD</span>
      </div>
      <div className="intake-layout">
        <div className="phone-shell">
          <div className="phone-notch" />
          <p className="mini-label">INSTANT ESTIMATE</p>
          <p className="intake-headline">What do you need done?</p>
          <div className="message-bubble">My basement drain is backing up and water is spreading.</div>
          <p className="ai-question"><span>✦</span> Is wastewater actively entering the room?</p>
          <div className="choice-row"><button tabIndex={-1}>Yes</button><button tabIndex={-1}>No</button></div>
          <div className="step-meter"><span /></div>
        </div>
        <div className="lead-card">
          <div className="lead-card-head"><span className="avatar">AM</span><div><small>NEW WEBSITE REQUEST</small><strong>Emergency drain backup</strong></div><b>HOT</b></div>
          <div className="ai-summary"><span>✦ AI SUMMARY</span><p>Active indoor backup. In service area, wants help today, photos included.</p></div>
          <div className="lead-grid"><span><small>ESTIMATE</small><b>$450–$780</b></span><span><small>SERVICE AREA</small><b>In your area</b></span><span><small>URGENCY</small><b>Today</b></span><span><small>CONTACT</small><b>Text first</b></span></div>
          <button className="alert-button" tabIndex={-1}>Call this lead first →</button>
        </div>
      </div>
    </div>
  );
}

function QuickStopVisual() {
  return (
    <div className="product-frame route-frame" role="img" aria-label="Illustration: a same-day Quick Stop request 0.7 miles off today’s route, with the fee and the arrival window the contractor would offer.">
      <div className="frame-top">
        <span className="frame-dots"><i /><i /><i /></span>
        <span>Plan my day</span>
        <span className="live-pill paid">PAID TO CONFIRM</span>
      </div>
      <div className="route-layout">
        <div className="route-map">
          <div className="street s1" /><div className="street s2" /><div className="street s3" /><div className="street s4" />
          <div className="route-line"><span className="route-stop first">1</span><span className="route-stop second">2</span><span className="route-stop quick">+</span></div>
          <span className="route-home">SHOP</span>
          <div className="detour-label">0.7 mi off route</div>
        </div>
        <div className="quick-card">
          <p className="mini-label">NEAR TODAY’S ROUTE</p>
          {/* The wordmark replaces a "QS" square that was standing in for it.
              It is 5.7:1, so it cannot sit in the square's place inside the
              title row — it goes above, and the row keeps its two lines. */}
          <QuickStopsMark width={116} />
          <div className="quick-title"><div><p className="quick-headline">Leaking shutoff valve</p><p>Royal Oak · same-day request</p></div></div>
          <div className="quick-metrics"><span><small>ADDED DRIVE</small><b>6 min</b></span><span><small>OPEN WINDOW</small><b>2:15–4:15</b></span></div>
          <div className="offer-row"><div><small>YOUR QUICK STOP FEE</small><strong>$149</strong></div><button tabIndex={-1}>Send offer</button></div>
          <p className="paid-note"><i>✓</i> Nothing books until the customer pays.</p>
        </div>
      </div>
    </div>
  );
}

function ProductVisual({ active }: { active: number }) {
  return (
    <div className="visual-stage">
      <div className="glow glow-one" /><div className="glow glow-two" />
      <div className="visual-stack" data-active={active}>
        <div className={`visual-layer ${active === 0 ? "is-active" : ""}`}><SiteBuilderVisual /></div>
        <div className={`visual-layer ${active === 1 ? "is-active" : ""}`}><IntakeVisual /></div>
        <div className={`visual-layer ${active === 2 ? "is-active" : ""}`}><QuickStopVisual /></div>
      </div>
    </div>
  );
}

export default function FlagshipHome() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  /* Which product screen the merged suite section is showing. Seeded from the
     deck's own list so this cannot start on a screen that does not exist. */
  const [screen, setScreen] = useState(COMMAND_CENTER_SCREENS[0]?.id ?? '');

  /**
   * THE SCREENS ADVANCE ON THEIR OWN, UNTIL SOMEBODY TAKES OVER.
   *
   * A tab strip that never moves reads as five labels rather than as five
   * things to look at, and most visitors will see the first screen and scroll
   * past. Rotating them shows the product does more than one thing without
   * asking anyone to press anything.
   *
   * FOUR CONDITIONS STOP IT, and all four matter:
   *
   *   off screen      this sits most of the way down a very long page; a timer
   *                   swapping DOM for the whole scroll is work nobody sees.
   *   pointer inside  you are reading it. Moving it under a reader is the thing
   *                   that makes carousels hated.
   *   focus inside    the keyboard equivalent, and the one usually forgotten —
   *                   tabbing into a strip that then changes under you is worse
   *                   than a mouse, because you cannot see where it went.
   *   a click         you have said which screen you want. It never resumes.
   *
   * Plus prefers-reduced-motion, where it never starts, and document.hidden.
   */
  const suiteRef = useRef<HTMLElement>(null);
  const [suitePaused, setSuitePaused] = useState(false);
  const [suiteTaken, setSuiteTaken] = useState(false);

  useEffect(() => {
    if (suiteTaken || suitePaused) return;
    if (COMMAND_CENTER_SCREENS.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if (!window.matchMedia(`(min-width: ${SUITE_ROTATE_MIN}px)`).matches) return;

    let onScreen = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const advance = () => setScreen((current) => {
      const ids = COMMAND_CENTER_SCREENS.map((option) => option.id);
      const at = ids.indexOf(current);
      return ids[(at + 1) % ids.length] ?? current;
    });
    const start = () => { timer ??= setInterval(advance, SUITE_DWELL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };

    let io: IntersectionObserver | undefined;
    if (suiteRef.current && 'IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen && !document.hidden) start(); else stop();
      }, { threshold: 0.25 });
      io.observe(suiteRef.current);
    } else {
      start();
    }

    const onVisibility = () => { if (document.hidden) stop(); else if (onScreen) start(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [suitePaused, suiteTaken]);

  /* A tablist is expected to move with the arrow keys, and Home/End to the
     ends. Without this the strip is a row of buttons that happens to say
     role="tab" — the role promises behavior a screen-reader user will look
     for and not find. */
  const onScreenKeys = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const ids = COMMAND_CENTER_SCREENS.map((option) => option.id);
    const at = ids.indexOf(screen);
    const step =
      event.key === 'ArrowRight' ? 1
        : event.key === 'ArrowLeft' ? -1
          : 0;
    let next: string | null = null;
    if (step !== 0) next = ids[(at + step + ids.length) % ids.length] ?? null;
    if (event.key === 'Home') next = ids[0] ?? null;
    if (event.key === 'End') next = ids[ids.length - 1] ?? null;
    if (!next) return;
    event.preventDefault();
    setSuiteTaken(true);
    setScreen(next);
    // Focus follows selection, which is what a tablist with automatic
    // activation does; the panel below has already changed.
    document.getElementById(`suite-tab-${next}`)?.focus();
  };

  /**
   * Hide the sticky mobile bar while the hero's own button is on screen.
   *
   * SiteFooter renders a fixed full-width "Build my free site" bar for phones,
   * and the hero renders a "Build my free site" button — so the first thing a
   * contractor saw on a phone was the same orange button twice, one directly
   * above the other, saying the same words. The bar exists for the rest of the
   * page, where there is nothing else to press; it has no job while the real
   * one is visible.
   *
   * A data attribute on the root rather than a change to SiteFooter, because
   * that footer is shared with /features and the five detail pages, and none of
   * them has a hero CTA for it to collide with.
   */
  const heroCtaRef = useRef<HTMLAnchorElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const cta = heroCtaRef.current;
    const root = rootRef.current;
    if (!cta || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => root.setAttribute('data-hero-cta', entry.isIntersecting ? 'visible' : 'gone'),
      { threshold: 0 },
    );
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  /**
   * The motion system: three planes, section progress, and reveal.
   *
   * One rAF loop for the whole page, and it only ever writes custom
   * properties — every transform stays in the stylesheet where it can be read.
   *
   *   --plane-y  on [data-plane]  · how far this element has drifted
   *   --sp       on [data-track]  · 0–1 progress of this section's own range
   *
   * data-motion on the root is the switch. It is set HERE rather than in the
   * markup, so the pre-JS render and the reduced-motion render both show the
   * page fully composed: the hidden-then-revealed state cannot strand content
   * at opacity 0 if this effect never runs.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    root.setAttribute('data-motion', 'on');

    const planes = Array.from(root.querySelectorAll<HTMLElement>('[data-plane]'));
    const tracks = Array.from(root.querySelectorAll<HTMLElement>('[data-track]'));
    let queued = false;

    const paint = () => {
      queued = false;
      const vh = window.innerHeight;

      for (const el of planes) {
        const box = el.getBoundingClientRect();
        // -1 at the viewport's bottom edge, +1 at its top: the element's own
        // journey across the screen, independent of where the page is.
        const journey = (box.top + box.height / 2 - vh / 2) / vh;
        const rate = PLANES[el.dataset.plane ?? 'mid'] ?? PLANES.mid;
        el.style.setProperty('--plane-y', `${(journey * rate * PLANE_TRAVEL).toFixed(1)}px`);
      }

      for (const el of tracks) {
        const box = el.getBoundingClientRect();
        let progress: number;
        if (el.dataset.track === 'hero') {
          // The hero starts at the top of the document, so a viewport-crossing
          // measure would already read past halfway on first paint. Measured
          // from the scroll position instead, it starts where the visitor does.
          progress = window.scrollY / (vh * 0.55);
        } else {
          // 0 when the section's top passes 85% of the viewport, 1 when its
          // bottom reaches 60% — so a section finishes its move while it is
          // still being looked at, whether it is 400px tall or 4,000.
          progress = (vh * 0.85 - box.top) / (vh * 0.25 + box.height);
        }
        el.style.setProperty('--sp', Math.min(1, Math.max(0, progress)).toFixed(4));
      }
    };

    const tick = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    };

    const rise = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        rise.unobserve(entry.target);
      }),
      { rootMargin: '0px 0px -9% 0px', threshold: 0.06 },
    );
    root.querySelectorAll('[data-rise]').forEach((el) => rise.observe(el));

    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    paint();

    return () => {
      window.removeEventListener('scroll', tick);
      window.removeEventListener('resize', tick);
      rise.disconnect();
      root.removeAttribute('data-motion');
    };
  }, []);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    stepRefs.current.forEach((element, index) => {
      if (!element) return;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(index); },
        { rootMargin: "-38% 0px -38% 0px", threshold: 0 }
      );
      observer.observe(element);
      observers.push(observer);
    });
    return () => observers.forEach((observer) => observer.disconnect());
  }, []);

  /**
   * Run each section's glare only while its section is on screen.
   *
   * Seven blurred, transformed layers animating forever is a real cost on a
   * page that already runs the hero orbs, the dashboard float, the two alert
   * cards and the CTA's rings — and six of the seven are off screen at any
   * moment. A compositor with nothing to composite still wakes up for the
   * frame; `animation-play-state: paused` is how it goes back to sleep.
   *
   * One observer for all of them, and a generous margin so a band is already
   * moving by the time it is looked at rather than starting as you arrive.
   */
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const glares = rootRef.current?.querySelectorAll('.glare');
    if (!glares?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          (entry.target as HTMLElement).dataset.on = entry.isIntersecting ? 'true' : 'false';
        }
      },
      { rootMargin: '240px 0px' },
    );
    glares.forEach((glare) => io.observe(glare));
    return () => io.disconnect();
  }, []);

  const goToStep = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className={styles.root} ref={rootRef} data-hero-cta="visible">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <LaunchBanner offsetHeader />
      <ThemeFab />

      {/* THE HERO, TO THE MOCKUP.
          Copy left, product right, four pillars along the bottom of the copy.

          The dashboard here is no longer DRAWN. It was a stack of divs shaped
          like a product — an "EXAMPLE BUSINESS" title bar, invented figures,
          and a layout that only ever resembled the app. It is now four real
          screenshots of the running product, captured from the /demo routes by
          scripts/capture-product-shots.mjs, rotating. That is the audit's
          "show the actual product, not only a stylized representation", and it
          means the hero cannot drift from the thing it is selling.

          Gone with it: the two floating badges and the one-truck/ten-crews
          scale row. Neither is in the mockup, and the badges in particular
          would now be sitting on top of real UI rather than beside a drawing
          of it. */}
      <section className="hero hero-split" id="main-content">
        <Glare />
        {/* Five trade objects on a 68-second orbit around the copy. After the
            glare so it sits above it — both are z-index:-1 children of a section
            that isolates, so they stack in DOM order and both stay behind the
            headline, the buttons and the product frame. */}
        <TradeOrbit />
        <div className="hero-copy" data-rise>
          <p className="eyebrow"><span>✦</span> FULL CONTRACTOR AI SUITE—THE ONLY SOFTWARE YOU NEED TO RUN YOUR BUSINESS</p>
          <h1>Let AI qualify the lead.<br /><em>You win the right work.</em></h1>
          <p className="hero-sub">
            Launch a contractor website that collects photos, asks the right questions, and turns inquiries into quote-ready opportunities—then keeps every quote, schedule, message, and payment connected.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="https://app.letsgetquoted.com/start?goal=build_site&source=home_hero" ref={heroCtaRef}>{SIGNUP_LABEL} <span>→</span></a>
            <Link className="button secondary" href="/demo">Explore a live demo</Link>
          </div>
          <ul className="hero-proof-list" aria-label="Key contractor capabilities">
            <li><i>✓</i> AI photo &amp; smart intake</li>
            <li><i>✓</i> Instant quote drafts with profit guardrails</li>
            <li><i>✓</i> Connected schedule, crew &amp; payments</li>
          </ul>
        </div>

        <div className="hero-product">
          <HeroAiIntakeShowcase />
        </div>
      </section>

      {/* THREE INTERACTIVE PROOF POINTS */}
      <section className="trust-strip trust-strip-3" aria-label="Key guarantees">
        {PROOF_POINTS.map(({ label, blurb, href, ariaLabel }) => (
          <span key={label}>
            <a href={href} aria-label={ariaLabel}>
              <b>{label}</b> {blurb}
            </a>
          </span>
        ))}
      </section>

      <section className="flagships" id="flagships" data-track>
        <Glare />
        <div className="section-intro" data-rise>
          <p className="eyebrow"><span>✦</span> A SMARTER WAY TO WORK</p>
          {/* Its own line rather than a second clause on the eyebrow: the
              eyebrow is a category, this is the promise, and running them
              together made one long strip of uppercase nobody reads to the end
              of. */}
          <p className="section-kicker">BUILT TO DO MORE</p>
          {/* Was "Your website should work as hard as you do." Two of the three
              cards under it are not website capabilities — Quick Stops fills
              gaps in a route and Smart Intake ranks leads — so the heading was
              promising less than the section delivers. "Front door" keeps the
              website first without claiming it is the whole building. */}
          <h2>Turn your website into<br /><em>the front door of your business.</em></h2>
          <p>Let it capture job details, prioritize leads, and help fill gaps in your schedule.</p>
        </div>

        <div className="scrolly-layout">
          <div className="steps-column">
            {/* THE RAIL LIVES IN THE STEPS COLUMN, not in the product panel.
                It was inside .sticky-product, which is sticky above 1100px and
                STATIC below it — so on a phone the rail was absolutely
                positioned inside a block that sits after all three steps, and
                it scrolled past once instead of following you down the tour.
                Measured on an iPhone 13: on screen at one of seven scroll
                positions through the section.

                .steps-column spans the whole tour in both layouts, so a sticky
                rail in here follows the reading at every width. It is zero-tall
                and its list hangs off it absolutely, so it takes no space in the
                column's flow and cannot push a card. */}
            <nav className="step-rail" aria-label={`Feature ${active + 1} of ${features.length}`}>
              <ol>
                {features.map((feature, index) => (
                  <li
                    key={feature.number}
                    data-state={index < active ? 'done' : index === active ? 'current' : 'todo'}
                  >
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      aria-label={`View ${feature.kicker}`}
                      aria-current={active === index ? 'step' : undefined}
                    >
                      <span className="step-rail-num">{feature.number}</span>
                      <span className="step-rail-name">{feature.kicker}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {features.map((feature, index) => (
              <article
                className={`feature-step ${active === index ? "is-active" : ""}`}
                key={feature.number}
                ref={(node) => { stepRefs.current[index] = node; }}
              >
                <span className="step-number">{feature.number} / 03</span>
                <p className="feature-kicker">{feature.kicker}</p>
                <h3>{feature.title}</h3>
                <p className="feature-body">{feature.body}</p>
                <div className="feature-handoff">
                  <span><small>START WITH</small><b>{feature.input}</b></span>
                  <i>→</i>
                  <span><small>GET</small><b>{feature.output}</b></span>
                </div>
                <ul>{feature.proof.map((proof) => <li key={proof}><span>✓</span>{proof}</li>)}</ul>
                {/* All three cards ended here, with nothing to press. This is
                    the section that makes the page's strongest claims, and it
                    was the only one a visitor could not follow up on. Same
                    wording on all three so it reads as one affordance rather
                    than three different offers. */}
                <Link className="feature-step-link" href={feature.href}>
                  Explore this feature <span aria-hidden="true">→</span>
                  <span className="sr-only">: {feature.title}</span>
                </Link>
              </article>
            ))}
          </div>

          <div className="sticky-product">
            <ProductVisual active={active} />
            {/* An "Example — an invented business" pill sat here, between the
                product panels and the progress rail. Removed on request. The
                three panels still quote an estimate range, a fee and a drive
                time, so nothing on this section now marks those figures as
                invented; the copy around them is written as illustration. */}
            {/* How far through the three you are, without having to count the
                steps. The wheel says which one; this says how much is left. */}
            <div className="tour-rail" aria-hidden="true"><s /></div>
            <div className="scroll-prompt"><span>SCROLL TO EXPLORE</span><i>↓</i></div>
          </div>
        </div>

      </section>

      <section className="client-experience" id="workflow" aria-labelledby="client-experience-title">
        <Glare />
        <div className="client-copy" data-rise>
          <p className="eyebrow"><span>✦</span> TEXT MESSAGING + A CLIENT PORTAL FOR EVERY JOB</p>
          <h2 id="client-experience-title">Every job gets its own client portal.<br /><em>Every message stays attached.</em></h2>
          <p>Give each homeowner one clear place to review the quote, see the schedule, follow updates and pay. Your team can text from the same job record, so the conversation and the work never drift apart.</p>
          <ul className="client-benefits">
            <li><span>✓</span><div><b>Two-way texting</b><small>Replies stay connected to the right customer and job.</small></div></li>
            <li><span>✓</span><div><b>One portal for every job</b><small>Quote, schedule, updates and payment share one customer view.</small></div></li>
            <li><span>✓</span><div><b>A simpler customer experience</b><small>One direct link gives homeowners everything they need.</small></div></li>
          </ul>
        </div>

        {/* THE CONVERSATION PLAYS.
            Two static panels side by side made the section's own claim — that
            they are the same job record — the one thing the layout never said.
            The messages now arrive in order and the portal step each one causes
            lights a beat later, so the homeowner texting "approved" visibly
            moves the job. The sequence is CSS on a shared clock rather than
            JavaScript, and it plays once when the section is reached rather
            than looping: a loop beside body copy is a distraction, and this is
            evidence, not decoration.

            data-plays is what starts it, added by the reveal observer, so a
            visitor who arrives here directly sees it from the beginning
            instead of walking in halfway through. */}
        <div className="client-product client-plays" data-rise role="img" aria-label="Illustration: a text conversation where a homeowner approves a quote, and the job portal beside it advancing to scheduled.">
          <div className="text-console">
            <div className="console-top"><span>Messages</span><small>JOB #1048 · KITCHEN REMODEL</small></div>
            <div className="contact-row"><span className="contact-avatar">AM</span><div><b>Alex Morgan</b><small>Text conversation · synced to job</small></div><i>ACTIVE</i></div>
            <div className="message-stream">
              <div className="msg outgoing" style={cssVars({ '--beat': 0 })}><small>BRIGHTLINE</small><p>Your estimate is ready. You can review and approve it here.</p><span>10:14 AM · Delivered</span></div>
              <div className="msg incoming" style={cssVars({ '--beat': 1 })}><p>Approved—Tuesday morning works for us.</p><span>10:21 AM</span></div>
              <div className="msg outgoing" style={cssVars({ '--beat': 2 })}><small>BRIGHTLINE</small><p>You’re scheduled for Tuesday, 9–11 AM. We’ll text when the crew is on the way.</p><span>10:22 AM · Delivered</span></div>
            </div>
            <div className="message-footer"><span>Reply by text…</span><button type="button" tabIndex={-1}>Send</button></div>
          </div>

          <div className="portal-window">
            <div className="portal-top"><b>BRIGHTLINE ELECTRIC</b><small>YOUR JOB PORTAL</small></div>
            <div className="portal-status"><span><small>JOB #1048</small><b>Kitchen lighting upgrade</b></span><em>SCHEDULED</em></div>
            <div className="portal-timeline">
              <span className="done" style={cssVars({ '--beat': 1.4 })}><i>✓</i><div><b>Quote approved</b><small>Today · 10:21 AM</small></div></span>
              <span className="next" style={cssVars({ '--beat': 2.4 })}><i>2</i><div><b>Installation visit</b><small>Tuesday · 9–11 AM</small></div></span>
              <span><i>3</i><div><b>Final payment</b><small>Due after work is complete</small></div></span>
            </div>
            <div className="portal-actions"><button type="button" tabIndex={-1}>View approved quote</button><button type="button" tabIndex={-1}>Message contractor</button></div>
            <p className="portal-note"><span>✓</span> This portal is unique to this job.</p>
          </div>
        </div>
      </section>

      {/* ONE SECTION, NOT TWO. This was the largest duplication on the page.

          "One system from quote to review" NAMED eight capabilities in a
          sentence each. The command center directly under it SHOWED six of
          them, each a heading plus a dashboard mockup taller than most
          viewports — six screens of scrolling to see one product from six
          angles, immediately after being told about it in a grid.

          The grid now drives the screens. Choosing a card changes what is
          rendered underneath, so the two halves are one thing: the claim and
          the evidence for it, in the same place, at the visitor's pace rather
          than the page's.

          A card with no screen behind it is still a link to the page that
          explains it — which is the honest version of "we have this too". */}
      <section
        className="included"
        id="included"
        ref={suiteRef}
        /* Hovering or tabbing in stops the rotation. onFocus/onBlur rather than
           focusin/focusout listeners because React's versions already bubble,
           which the DOM ones do not. */
        onMouseEnter={() => setSuitePaused(true)}
        onMouseLeave={() => setSuitePaused(false)}
        onFocus={() => setSuitePaused(true)}
        onBlur={() => setSuitePaused(false)}
      >
        <Glare tone="cream" />
        <div className="included-head" data-rise>
          <p className="eyebrow"><span>✦</span> THE REST OF THE JOB IS INCLUDED</p>
          <h2>One system from quote to review.</h2>
          <p>Your website is the front door. Quotes, scheduling, crews, payments and follow-up are already connected behind it in your <Link href="/features/back-office">back office</Link>.</p>
        </div>

        {/* The screens that exist, as a tab strip. Built from the deck itself
            (COMMAND_CENTER_SCREENS) rather than from a list written here, so a
            tab can never name a screen that is not in the markup. */}
        <div className="suite-tabs" role="tablist" aria-label="Product screens">
          {COMMAND_CENTER_SCREENS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              id={`suite-tab-${option.id}`}
              aria-selected={option.id === screen}
              aria-controls="suite-screen"
              tabIndex={option.id === screen ? 0 : -1}
              className={option.id === screen ? 'is-on' : undefined}
              onClick={() => { setSuiteTaken(true); setScreen(option.id); }}
              onKeyDown={onScreenKeys}
            >
              {option.label}
              {/* The dwell, drawn on the active tab. Without it the screens
                  change for no visible reason and the strip looks broken; with
                  it the rotation is something you can see coming and stop. */}
              {option.id === screen && !suiteTaken ? (
                <i className="suite-tab-dwell" aria-hidden="true" style={cssVars({ '--dwell': `${SUITE_DWELL}ms` })} />
              ) : null}
            </button>
          ))}
        </div>

        <div className="suite-screen" id="suite-screen" role="tabpanel" aria-labelledby={`suite-tab-${screen}`}>
          <CommandCenterDeck activeId={screen} />
        </div>

        <div className="suite-grid suite-linked">
          {suite.map(([title, body, href], index) => (
            <article key={title} data-rise style={cssVars({ '--rise-i': index })}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3><Link className="suite-card-link" href={href}>{title}</Link></h3>
              <p>{body}</p>
              <b className="suite-card-go" aria-hidden="true">→</b>
            </article>
          ))}
        </div>
      </section>

      {/* The four plan summaries are projected from the canonical billing
          catalog. The full calculator and allowance detail live on /pricing. */}
      <section className="pricing-band" id="pricing">
        <Glare />
        <div className="price-zero" data-plane="back"><span>$</span><strong>0</strong><small>/ MONTH</small></div>
        <div className="pricing-copy" data-rise>
          <p className="eyebrow"><span>✦</span> FOUR PLANS. START AT $0.</p>
          <h2>Start free.<br /><em>Upgrade when the math works.</em></h2>
          <p>Flex is $0/month plus a 1.25% LGQ platform fee. Paid plans trade a predictable base price for a lower fee and more included capacity.</p>
          <div className="pricing-points"><span>✓ Free onboarding</span><span>✓ No contract</span><span>✓ Core workflow on every plan</span><span>✓ Fee set by your plan</span></div>

          <ul className="fee-tiers" aria-label="LGQ base plans and platform fees">
            {PLAN_PRICE_OPTIONS.map((plan) => (
              <li key={plan.id}><b>{plan.platformFee}</b><small>{plan.name} · {plan.monthlyPrice}</small></li>
            ))}
          </ul>
          <p className="fee-note">
            The LGQ fee applies to eligible service subtotal collected through LGQ. Your rate changes when you change plans—not when you cross a volume bracket.
          </p>

          {/* The price is where the decision actually gets made, and this band
              had nothing to press — you read "$0 / month", agreed with it, and
              then scrolled on looking for somewhere to act.

              Two buttons now, because the calculator that used to sit above
              them is gone: the visitor who wanted to work out their own number
              needs somewhere to go, and a sentence-ending text link is not it.
              Secondary, so the primary action still reads as the primary one. */}
          <div className="pricing-actions">
            <Link className="button primary" href="/pricing">
              Compare plans <span aria-hidden="true">→</span>
            </Link>
          </div>
          <small className="pricing-fineprint">
            Card payments run through <b>Stripe Checkout</b>, so card details are entered on
            Stripe&apos;s own page and never reach our servers. Stripe&apos;s processing fee
            ({STRIPE_PROCESSING_NOTE}) are separate from the LGQ prices above.
          </small>
        </div>
      </section>

      {/* The questions, visible. Condensed to top 3 questions on the homepage. */}
      <section className="home-faq home-faq-dark" id="faq" aria-labelledby="faq-title">
        <Glare />
        <div className="home-faq-head" data-rise>
          <p className="eyebrow"><span>✦</span> BEFORE YOU START</p>
          <h2 id="faq-title">The questions contractors actually ask.</h2>
        </div>
        <div className="home-faq-list">
          {HOME_FAQS.slice(0, 3).map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
        <div className="home-faq-more" data-rise>
          <Link className="button secondary" href="/faq">
            Read all FAQs <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="final-cta" id="final-cta">
        {/* No data-plane here on purpose: .cta-rays already runs rayPulse, and
            an animation's transform beats a stylesheet one at computed-value
            time — the plane offset would have been silently ignored. */}
        <Glare tone="orange" />
        <div className="cta-rays" />
        <p className="eyebrow"><span>✦</span> BUILT FOR THE ONE-TRUCK OPERATOR—AND THE CREW DOING $2M</p>
        <h2>One truck or ten crews.<br />Your next stage starts here.</h2>
        <p>Launch the site, connect the work and give your growing business one place to run.</p>
        <a className="button primary light" href="https://app.letsgetquoted.com/start?goal=build_site&source=footer">{SIGNUP_LABEL} <span>→</span></a>
        <small>Flex starts at $0/month · Free onboarding · Cancel anytime from Settings</small>
      </section>

      <SiteFooter />
    </main>
  );
}
