/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from 'next/image';
import { SiteFooter, SiteHeader } from './site-chrome';
import HomeFeeCalculator from '@/components/home-fee-calculator';
import CommandCenterDeck from '@/components/command-center-deck';
import { HOME_FAQS } from '@/lib/home-faqs';
import styles from './flagship.module.css';

/** One place, so a rename cannot leave a button pointing at the old host. */
const SIGNUP_URL = 'https://app.letsgetquoted.com/';

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
  },
  {
    number: "02",
    kicker: "SMART INTAKE",
    title: "Your website asks the questions a great estimator would.",
    body: "Every inquiry becomes a clear project summary with fit, urgency, value and location already considered.",
    proof: ["Hot, warm and low lead scoring", "Project-specific follow-ups", "Instant high-value alerts"],
    input: "One homeowner request",
    output: "A prioritized lead with context",
  },
  {
    number: "03",
    kicker: "QUICK STOPS",
    title: "Turn gaps in the day into prepaid work nearby.",
    body: "Offer a nearby homeowner a same-day arrival window and price you choose. Nothing books until they pay.",
    proof: ["Route-aware matching", "You control every offer", "Always optional—never auto-booked"],
    input: "A gap in today’s route",
    output: "A prepaid offer you approve",
  },
];

const suite = [
  ["Quotes + e-sign", "Professional, itemized quotes with optional upgrades."],
  ["Scheduling", "Arrival windows, capacity and weather-aware planning."],
  ["Crew + labor", "Assignments, time clock, hours and estimated pay."],
  ["Payments", "Deposits, balances and payment plans through Stripe."],
  ["Recurring work", "Automatic visits, saved cards and predictable revenue."],
  ["Cash flow", "See payroll, bills and customer money before it moves."],
  ["Texts + client portal", "Two-way messages, job updates, quotes, scheduling and payment in one customer view."],
  ["Reviews + growth", "Follow-ups, review requests and AI-assisted marketing."],
];

function SiteBuilderVisual() {
  return (
    <div className="product-frame builder-frame" aria-label="AI website builder product demonstration">
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
          <button className="generate-button"><span>✦</span> Generate full site with AI</button>
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
            <h3>Power your home.<br />Protect what matters.</h3>
            <button>Get an instant estimate →</button>
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
    <div className="product-frame intake-frame" aria-label="AI smart intake product demonstration">
      <div className="frame-top">
        <span className="frame-dots"><i /><i /><i /></span>
        <span>Smart intake</span>
        <span className="live-pill hot">HOT LEAD</span>
      </div>
      <div className="intake-layout">
        <div className="phone-shell">
          <div className="phone-notch" />
          <p className="mini-label">INSTANT ESTIMATE</p>
          <h3>What do you need done?</h3>
          <div className="message-bubble">My basement drain is backing up and water is spreading.</div>
          <p className="ai-question"><span>✦</span> Is wastewater actively entering the room?</p>
          <div className="choice-row"><button>Yes</button><button>No</button></div>
          <div className="step-meter"><span /></div>
        </div>
        <div className="lead-card">
          <div className="lead-card-head"><span className="avatar">AM</span><div><small>NEW WEBSITE REQUEST</small><strong>Emergency drain backup</strong></div><b>HOT</b></div>
          <div className="ai-summary"><span>✦ AI SUMMARY</span><p>Active indoor backup. In service area, wants help today, photos included.</p></div>
          <div className="lead-grid"><span><small>ESTIMATE</small><b>$450–$780</b></span><span><small>SERVICE AREA</small><b>In your area</b></span><span><small>URGENCY</small><b>Today</b></span><span><small>CONTACT</small><b>Text first</b></span></div>
          <button className="alert-button">Call this lead first →</button>
        </div>
      </div>
    </div>
  );
}

function QuickStopVisual() {
  return (
    <div className="product-frame route-frame" aria-label="Quick Stops route matching product demonstration">
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
          <div className="quick-title"><div><h3>Leaking shutoff valve</h3><p>Royal Oak · same-day request</p></div></div>
          <div className="quick-metrics"><span><small>ADDED DRIVE</small><b>6 min</b></span><span><small>OPEN WINDOW</small><b>2:15–4:15</b></span></div>
          <div className="offer-row"><div><small>YOUR QUICK STOP FEE</small><strong>$149</strong></div><button>Send offer</button></div>
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
  const rotations = useMemo(() => [0, -120, -240], []);

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

  const goToStep = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className={styles.root} ref={rootRef} data-hero-cta="visible">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />

      {/* THE RISING CONSOLE.
          This was a 50/50 split with the dashboard at about 40% of the screen —
          the best asset on the page rendered at the smallest size on it. The
          copy is centred and the console goes full width beneath it, tilted
          back on arrival and levelling as you scroll (see .hero-stage in the
          generator). Two things had to move for that: the floating badges now
          hang off the console's corners rather than the panel's sides, and the
          one-truck/ten-crews scale row is a footer under the console instead of
          a column under the copy. */}
      <section className="hero hero-stage" id="main-content" data-track="hero">
        <div className="hero-copy" data-rise>
          <p className="eyebrow"><span>✦</span> ONE TRUCK OR TEN CREWS. THE FULL SUITE IS YOURS.</p>
          <h1>Build the website.<br />Win better jobs.<br /><em>Run everything behind it.</em></h1>
          <p className="hero-sub">Launch a professional site in minutes. AI qualifies every request, alerts you to the best opportunities, and keeps each job moving from quote to payment.</p>
          {/* The primary CTA goes to the app, not to an anchor.
              It used to be href="#final-cta" — the loudest button on the page,
              at the top of the page, scrolling you to the bottom of the page to
              find another button. Anyone ready to start had to be asked twice.
              The secondary keeps its in-page jump, which is what a secondary is
              for. */}
          <div className="hero-actions">
            <a className="button primary" href={SIGNUP_URL} ref={heroCtaRef}>Build my free site <span>→</span></a>
            <a className="button secondary" href="#included">Explore everything included</a>
          </div>
          <p className="hero-note"><i>✓</i> Free to start &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Pay only when you get paid</p>
        </div>
        <div className="hero-product" aria-label="Let's Get Quoted dashboard preview">
          <div className="hero-orbit orbit-one" data-plane="back" /><div className="hero-orbit orbit-two" data-plane="back" />
          <div className="dashboard-card">
            <div className="dash-top"><b>Let’s Get <span>Quoted</span></b><small>EXAMPLE BUSINESS · LIVE</small><i>BA</i></div>
            <div className="dash-body">
              <aside><span className="selected">⌂</span><span>◎</span><span>□</span><span>↗</span><span>✦</span></aside>
              <div className="dash-main">
                <div className="dash-greeting"><div><small>FRIDAY, AUGUST 7</small><h2>Good morning.</h2></div><button>+ New</button></div>
                <div className="attention-card"><small>NEEDS YOUR ATTENTION</small><div className="attention-row"><b>3</b><span>New leads need a response</span><em>Review leads →</em></div><div className="attention-row"><b>2</b><span>Quotes awaiting approval</span><em>Follow up →</em></div></div>
                <div className="dash-grid"><div><small>NEXT 7 DAYS</small><strong>6 jobs</strong><p>3 crews assigned</p></div><div><small>ESTIMATED REVENUE</small><strong>$18.4k</strong><p className="up">↑ 14% this month</p></div><div className="quick-mini"><QuickStopsMark width={104} /><strong>Nearby request</strong><p>0.7 mi off route · $149</p></div></div>
              </div>
            </div>
          </div>
          <div className="floating-alert" data-plane="front"><span className="alert-icon">✦</span><div><small>AI LEAD ALERT</small><b>Kitchen remodel · in your service area</b></div><em>NOW</em></div>
          <div className="floating-paid" data-plane="front"><i>✓</i><div><small>PAYMENT RECEIVED</small><b>$4,250 headed to your bank</b></div></div>
          {/* The panel quotes $18.4k of revenue, six booked jobs and a $4,250
              payment. None of it happened. "EXAMPLE BUSINESS" in the title bar
              is the kind of label you notice only once you already believed the
              numbers — /features carries this same marker under its mock for
              the same reason. */}
          <p className="example-mark">
            <b>Example</b> — invented figures, not a real customer.{' '}
            <a href="/demo">See the live demo</a>
          </p>
        </div>
        <div className="hero-scale" data-rise>
          <span><small>STARTING OUT?</small><b>Look established on day one.</b></span>
          <span><small>ALREADY GROWING?</small><b>Give every crew one system.</b></span>
        </div>
      </section>

      <section className="trust-strip" aria-label="Product promises">
        <span><b>WEBSITE INCLUDED</b> One-click AI builder</span>
        <span><b>SMART INTAKE INCLUDED</b> Qualify every request</span>
        <span><b>BACK OFFICE INCLUDED</b> Quote, schedule and collect</span>
        <span><b>QUICK STOPS INCLUDED</b> Nearby prepaid work</span>
      </section>

      <section className="flagships" id="flagships" data-track>
        <div className="section-intro" data-rise>
          <p className="eyebrow"><span>✦</span> THREE FEATURES YOU WON’T FIND TOGETHER ANYWHERE ELSE</p>
          <h2>Three advantages your ordinary<br /><em>website can’t give you.</em></h2>
          <p>A better first impression, better-qualified leads and new revenue hiding inside the route you already drive.</p>
        </div>

        <div className="scrolly-layout">
          <div className="steps-column">
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
              </article>
            ))}
          </div>

          <div className="sticky-product">
            <div className="wheel-wrap" aria-label={`Feature ${active + 1} of 3`}>
              <div className="wheel-ring" style={{ transform: `rotate(${rotations[active]}deg)` }}>
                {features.map((feature, index) => (
                  <button
                    key={feature.number}
                    className={`wheel-node node-${index + 1} ${active === index ? "is-active" : ""}`}
                    onClick={() => goToStep(index)}
                    aria-label={`View ${feature.kicker}`}
                    aria-current={active === index ? "step" : undefined}
                  >{feature.number}</button>
                ))}
              </div>
              <div className="wheel-core"><b>{features[active].number}</b><small>OF 03</small></div>
            </div>
            <ProductVisual active={active} />
            {/* Same reason as the hero's: these three panels quote an estimate
                range, a fee and a drive time, and a visitor has no way to tell
                a worked example from a screenshot. */}
            <p className="example-mark">
              <b>Example</b> — an invented business, not a real customer.
            </p>
            {/* How far through the three you are, without having to count the
                steps. The wheel says which one; this says how much is left. */}
            <div className="tour-rail" aria-hidden="true"><s /></div>
            <div className="scroll-prompt"><span>SCROLL TO EXPLORE</span><i>↓</i></div>
          </div>
        </div>
      </section>

      {/* The five-stage pipeline band used to sit here. Removed: the five
          labels named the same stages the feature tour above had just walked
          through in full, so the band re-listed what the visitor had already
          been shown, and the wandering stroke never touched the boxes it was
          meant to connect. The sequence itself is not lost — /how-it-works is
          built on those five stages and goes into each one. */}

      <section className="ai-layer ai-split-story" aria-labelledby="ai-title" data-track>
        <div className="ai-layer-head" data-rise>
          <p className="eyebrow"><span>✦</span> FOUR PLACES AI SAVES YOU TIME</p>
          <h2 id="ai-title">It writes the site.<br />Qualifies every lead.<br /><em>Tells you who to call first.</em></h2>
          <p>Then it keeps those same details attached to the quote, schedule and follow-up—so nobody has to start over.</p>
          <div className="ai-context-note"><span>REQUEST + PHOTOS</span><i>→</i><span>FIT + VALUE + SERVICE AREA</span><i>→</i><span>READY-TO-ACT LEAD</span></div>
        </div>
        {/* WATCH IT THINK.
            The four handoffs used to describe a machine without ever showing it
            run. Each now carries the trace of the SAME request the feature tour
            demonstrates above — a backing-up basement drain — so the page tells
            one story end to end instead of four summaries. The traces land in
            sequence as the section arrives (--rise-i), which is what turns a
            list of claims into something you watch happen.

            Every word of the original copy is still here. The trace is added
            evidence, not a replacement for the explanation. */}
        <div className="ai-rail ai-rail-traced" aria-label="AI-supported contractor workflow">
          <div className="ai-list-head"><span>FOUR BUILT-IN HANDOFFS</span><small>ONE CONNECTED WORKFLOW</small></div>
          <article data-rise style={cssVars({ '--rise-i': 0 })}>
            <span>01</span>
            <div>
              <small>ATTRACT</small><h3>Launches a job-ready website</h3>
              <p>Writes service pages, FAQs and local copy, then connects Smart Intake.</p>
              <code className="ai-trace"><i>▸</i> Site published · <b>Smart Intake connected</b></code>
            </div>
          </article>
          <i>→</i>
          <article data-rise style={cssVars({ '--rise-i': 1 })}>
            <span>02</span>
            <div>
              <small>QUALIFY</small><h3>Turns a request into a real scope</h3>
              <p>Asks trade-specific follow-ups and collects photos, timing, budget and contact details.</p>
              <code className="ai-trace"><i>▸</i> Asked: <b>is wastewater entering the room?</b> · 2 photos in</code>
            </div>
          </article>
          <i>→</i>
          <article data-rise style={cssVars({ '--rise-i': 2 })}>
            <span>03</span>
            <div>
              <small>PRIORITIZE</small><h3>Ranks what deserves attention</h3>
              <p>Scores fit, urgency, estimated value and whether it’s in your service area—then sends instant high-value alerts.</p>
              <code className="ai-trace"><i>▸</i> In service area · wants help today · <b>HOT</b></code>
            </div>
          </article>
          <i>→</i>
          <article data-rise style={cssVars({ '--rise-i': 3 })}>
            <span>04</span>
            <div>
              <small>FOLLOW THROUGH</small><h3>Keeps the job record moving</h3>
              <p>Carries the same details into quote, schedule, texts, the client portal and payment—without retyping.</p>
              <code className="ai-trace"><i>▸</i> Quote drafted · <b>nothing retyped</b></code>
            </div>
          </article>
        </div>
      </section>

      <section className="client-experience" aria-labelledby="client-experience-title">
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
        <div className="client-product client-plays" data-rise aria-label="Example showing a job text conversation connected to its client portal">
          <div className="text-console">
            <div className="console-top"><span>Messages</span><small>JOB #1048 · KITCHEN REMODEL</small></div>
            <div className="contact-row"><span className="contact-avatar">AM</span><div><b>Alex Morgan</b><small>Text conversation · synced to job</small></div><i>ACTIVE</i></div>
            <div className="message-stream">
              <div className="msg outgoing" style={cssVars({ '--beat': 0 })}><small>BRIGHTLINE</small><p>Your estimate is ready. You can review and approve it here.</p><span>10:14 AM · Delivered</span></div>
              <div className="msg incoming" style={cssVars({ '--beat': 1 })}><p>Approved—Tuesday morning works for us.</p><span>10:21 AM</span></div>
              <div className="msg outgoing" style={cssVars({ '--beat': 2 })}><small>BRIGHTLINE</small><p>You’re scheduled for Tuesday, 9–11 AM. We’ll text when the crew is on the way.</p><span>10:22 AM · Delivered</span></div>
            </div>
            <div className="message-footer"><span>Reply by text…</span><button type="button">Send</button></div>
          </div>

          <div className="portal-window">
            <div className="portal-top"><b>BRIGHTLINE ELECTRIC</b><small>YOUR JOB PORTAL</small></div>
            <div className="portal-status"><span><small>JOB #1048</small><b>Kitchen lighting upgrade</b></span><em>SCHEDULED</em></div>
            <div className="portal-timeline">
              <span className="done" style={cssVars({ '--beat': 1.4 })}><i>✓</i><div><b>Quote approved</b><small>Today · 10:21 AM</small></div></span>
              <span className="next" style={cssVars({ '--beat': 2.4 })}><i>2</i><div><b>Installation visit</b><small>Tuesday · 9–11 AM</small></div></span>
              <span><i>3</i><div><b>Final payment</b><small>Due after work is complete</small></div></span>
            </div>
            <div className="portal-actions"><button type="button">View approved quote</button><button type="button">Message contractor</button></div>
            <p className="portal-note"><span>✓</span> This portal is unique to this job.</p>
          </div>
        </div>
      </section>

      {/* BENTO.
          Eight identical boxes told a visitor that nothing here matters more
          than anything else. Something does: quotes and payments are what turn
          a lead into money, and the client portal is the one a homeowner
          actually touches. Those three get the room (see .suite-bento in the
          generator) and the other five stay legible without competing.

          Nothing is dropped and no copy changes — this is a grid decision. */}
      <section className="included" id="included">
        <div className="included-head" data-rise>
          <p className="eyebrow"><span>✦</span> THE REST OF THE JOB IS INCLUDED</p>
          <h2>One system from quote to review.</h2>
          <p>Your website is the front door. Quotes, scheduling, crews, payments and follow-up are already connected behind it.</p>
        </div>
        <div className="suite-grid suite-bento">
          {suite.map(([title, body], index) => (
            <article key={title} data-rise style={cssVars({ '--rise-i': index })}>
              <span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* THE CARDS THAT WERE ALREADY BUILT.
          The bento above NAMES eight capabilities in a sentence each. These six
          cards SHOW them — a real screen per capability, at a size you can
          actually read. They were built for the previous homepage and have been
          stranded on /home-classic ever since; nothing was redrawn to bring
          them here.

          Directly after the bento on purpose: it is the one place on the page
          where a visitor has just been told what is included and has no reason
          yet to believe it. */}
      <section className="command-band" aria-label="What each part looks like">
        <CommandCenterDeck />
      </section>

      <section className="difference" id="difference">
        <div className="difference-copy" data-rise>
          <p className="eyebrow"><span>✦</span> BUILT IN. NOT BOLTED ON.</p>
          <h2>Every handoff stays connected.</h2>
          <p>One login and one customer record—from the first website question through the final payment.</p>
          <div className="difference-proof">
            <span><b>One customer record</b><small>From first question to final payment</small></span>
            <span><b>One place to work</b><small>For the owner, office and crew</small></span>
            <span><b>One aligned price</b><small>No monthly fee before you earn</small></span>
          </div>
        </div>
        {/* THE SCROLL WIPE.
            Two neutral columns with "VS" between them described a choice. A lit
            edge travelling left to right, replacing the patchwork with the
            connected suite, performs one — the comparison gains a direction and
            an outcome.

            Both cards keep their full markup and stay in the same DOM order, so
            a screen reader still reads "the patchwork" and then "Let's Get
            Quoted". The wipe is a paint, not a reordering — and it is gated on
            data-motion, because with the edge parked at 0 the section would
            show nothing but the column arguing against us. */}
        <div className="stack-compare stack-wipe" aria-label="Software stack comparison" data-track>
          <div className="stack-card patchwork">
            <div className="stack-label"><span>THE PATCHWORK</span><small>Separate tools</small></div>
            <ul>
              <li><span>Website builder</span><b>Separate</b></li>
              <li><span>Lead form + inbox</span><b>Separate</b></li>
              <li><span>CRM + scheduling</span><b>Separate</b></li>
              <li><span>Payments + reviews</span><b>Separate</b></li>
            </ul>
            <p>More logins. More copying. More places for a lead to stall.</p>
          </div>
          <div className="versus" aria-hidden="true"><b>VS</b></div>
          <div className="stack-card connected">
            <div className="stack-label"><span>LET’S GET QUOTED</span><small>One connected suite</small></div>
            <ul>
              <li><span>Website + smart intake</span><b>Connected</b></li>
              <li><span>Lead + quote</span><b>Connected</b></li>
              <li><span>Schedule + crew</span><b>Connected</b></li>
              <li><span>Payment + growth</span><b>Connected</b></li>
            </ul>
            <p>One job record moving forward from first click to paid.</p>
          </div>
        </div>
      </section>

      {/* THEIR OWN NUMBERS.
          "$0 / month" is the strongest claim on the page and it got one glance —
          you agreed with it and scrolled on. The calculator makes it arithmetic
          the visitor does themselves.

          It is the EXISTING HomeFeeCalculator, not a second one. That component
          reads FEE_TIERS from lib/pricing.ts, which is the source of truth the
          /pricing page and the fee calculator already share, so the rate here
          cannot drift from the rate we charge. A hand-rolled slider on the
          homepage would have been a published number with no owner — and it is
          deliberately written to show the honest figure and the structural
          difference rather than a fabricated "you save $X". */}
      <section className="pricing-band" id="pricing">
        <div className="price-zero" data-plane="back"><span>$</span><strong>0</strong><small>/ MONTH</small></div>
        <div className="pricing-copy" data-rise>
          <p className="eyebrow"><span>✦</span> FULL SUITE. NO MONTHLY SUBSCRIPTION.</p>
          <h2>When business is slow,<br /><em>your software bill is $0.</em></h2>
          <p>Use the full suite without a monthly subscription. A small platform fee applies only when a homeowner pays you.</p>
          <div className="pricing-points"><span>✓ No setup fee</span><span>✓ No contract</span><span>✓ No per-seat fee</span><span>✓ Rate drops as you grow</span></div>
          <HomeFeeCalculator />
          {/* The price is where the decision actually gets made, and this band
              had nothing to press — you read "$0 / month", agreed with it, and
              then scrolled on looking for somewhere to act. */}
          <a className="button primary" href={SIGNUP_URL}>Start free <span>→</span></a>
          <small className="pricing-fineprint">Payment processing and platform fees apply to completed transactions.</small>
        </div>
      </section>

      {/* The questions, visible.
          These carry the site's FAQPage structured data, and Google's policy is
          that marked-up content has to be on the page — schema describing
          questions nobody can read is grounds for a manual action rather than a
          rich result. They come from the same array the JSON-LD reads
          (src/lib/home-faqs.ts), so the two cannot drift.

          <details> rather than an always-open list: seven answers at this
          length is a wall directly before the closing CTA, and the questions
          alone are what most people scan for. */}
      <section className="home-faq home-faq-dark" id="faq" aria-labelledby="faq-title">
        <div className="home-faq-head" data-rise>
          <p className="eyebrow"><span>✦</span> BEFORE YOU START</p>
          <h2 id="faq-title">The questions contractors actually ask.</h2>
        </div>
        <div className="home-faq-list">
          {HOME_FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="final-cta" id="final-cta">
        {/* No data-plane here on purpose: .cta-rays already runs rayPulse, and
            an animation's transform beats a stylesheet one at computed-value
            time — the plane offset would have been silently ignored. */}
        <div className="cta-rays" />
        <p className="eyebrow"><span>✦</span> BUILT FOR THE ONE-TRUCK OPERATOR—AND THE CREW DOING $2M</p>
        <h2>One truck or ten crews.<br />Your next stage starts here.</h2>
        <p>Launch the site, connect the work and give your growing business one place to run.</p>
        <a className="button primary light" href={SIGNUP_URL}>Create my account <span>→</span></a>
        <small>No card required · No monthly subscription · Cancel anytime</small>
      </section>

      <SiteFooter />
    </main>
  );
}
