/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import styles from '@/components/flagship/flagship.module.css';

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
            <p>LICENSED · INSURED · LOCAL</p>
            <h3>Power your home.<br />Protect what matters.</h3>
            <button>Get an instant estimate →</button>
          </div>
          <div className="preview-stats"><span><b>4.9★</b> Local rating</span><span><b>24/7</b> AI estimate</span><span><b>12 yrs</b> Experience</span></div>
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
          <div className="lead-grid"><span><small>ESTIMATE</small><b>$450–$780</b></span><span><small>DISTANCE</small><b>3.2 miles</b></span><span><small>URGENCY</small><b>Today</b></span><span><small>CONTACT</small><b>Text first</b></span></div>
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
          <div className="quick-title"><span>QS</span><div><h3>Leaking shutoff valve</h3><p>Royal Oak · same-day request</p></div></div>
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

export default function Home() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const rotations = useMemo(() => [0, -120, -240], []);

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
    <main className={styles.root}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />

      <section className="hero" id="main-content">
        <div className="hero-copy">
          <p className="eyebrow"><span>✦</span> ONE TRUCK OR TEN CREWS. THE FULL SUITE IS YOURS.</p>
          <h1>Build the website.<br />Win better jobs.<br /><em>Run everything behind it.</em></h1>
          <p className="hero-sub">Launch a professional site in minutes. AI qualifies every request, alerts you to the best opportunities, and keeps each job moving from quote to payment.</p>
          <div className="hero-actions">
            <a className="button primary" href="#final-cta">Build my free site <span>→</span></a>
            <a className="button secondary" href="#included">Explore everything included</a>
          </div>
          <p className="hero-note"><i>✓</i> Free to start &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Pay only when you get paid</p>
          <div className="hero-scale">
            <span><small>STARTING OUT?</small><b>Look established on day one.</b></span>
            <span><small>ALREADY GROWING?</small><b>Give every crew one system.</b></span>
          </div>
        </div>
        <div className="hero-product" aria-label="Let's Get Quoted dashboard preview">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="dashboard-card">
            <div className="dash-top"><b>Let’s Get <span>Quoted</span></b><small>EXAMPLE BUSINESS · LIVE</small><i>BA</i></div>
            <div className="dash-body">
              <aside><span className="selected">⌂</span><span>◎</span><span>□</span><span>↗</span><span>✦</span></aside>
              <div className="dash-main">
                <div className="dash-greeting"><div><small>FRIDAY, AUGUST 7</small><h2>Good morning, Brett.</h2></div><button>+ New</button></div>
                <div className="attention-card"><small>NEEDS YOUR ATTENTION</small><div className="attention-row"><b>3</b><span>New leads need a response</span><em>Review leads →</em></div><div className="attention-row"><b>2</b><span>Quotes awaiting approval</span><em>Follow up →</em></div></div>
                <div className="dash-grid"><div><small>NEXT 7 DAYS</small><strong>6 jobs</strong><p>3 crews assigned</p></div><div><small>ESTIMATED REVENUE</small><strong>$18.4k</strong><p className="up">↑ 14% this month</p></div><div className="quick-mini"><small>QUICK STOP</small><strong>Nearby request</strong><p>0.7 mi off route · $149</p></div></div>
              </div>
            </div>
          </div>
          <div className="floating-alert"><span className="alert-icon">✦</span><div><small>AI LEAD ALERT</small><b>High-value job · 3.2 miles away</b></div><em>NOW</em></div>
          <div className="floating-paid"><i>✓</i><div><small>PAYMENT RECEIVED</small><b>$4,250 headed to your bank</b></div></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Product promises">
        <span><b>WEBSITE INCLUDED</b> One-click AI builder</span>
        <span><b>SMART INTAKE INCLUDED</b> Qualify every request</span>
        <span><b>BACK OFFICE INCLUDED</b> Quote, schedule and collect</span>
        <span><b>QUICK STOPS INCLUDED</b> Nearby prepaid work</span>
      </section>

      <section className="flagships" id="flagships">
        <div className="section-intro">
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
            <div className="scroll-prompt"><span>SCROLL TO EXPLORE</span><i>↓</i></div>
          </div>
        </div>
      </section>

      <section className="workflow workflow-pipeline" aria-label="Connected contractor workflow">
        <div className="pipeline-head">
          <p>THE JOB PIPELINE</p>
          <span><i /> ONE CUSTOMER RECORD · START TO FINISH</span>
        </div>
        <div className="workflow-row">
          <span><small>01</small><b>Build the site</b></span>
          <span><small>02</small><b>Qualify the lead</b></span>
          <span><small>03</small><b>Win the job</b></span>
          <span><small>04</small><b>Run the work</b></span>
          <span><small>05</small><b>Get paid + grow</b></span>
        </div>
      </section>

      <section className="ai-layer ai-split-story" aria-labelledby="ai-title">
        <div className="ai-layer-head">
          <p className="eyebrow"><span>✦</span> FOUR PLACES AI SAVES YOU TIME</p>
          <h2 id="ai-title">It writes the site.<br />Qualifies every lead.<br /><em>Tells you who to call first.</em></h2>
          <p>Then it keeps those same details attached to the quote, schedule and follow-up—so nobody has to start over.</p>
          <div className="ai-context-note"><span>REQUEST + PHOTOS</span><i>→</i><span>FIT + VALUE + DISTANCE</span><i>→</i><span>READY-TO-ACT LEAD</span></div>
        </div>
        <div className="ai-rail" aria-label="AI-supported contractor workflow">
          <div className="ai-list-head"><span>FOUR BUILT-IN HANDOFFS</span><small>ONE CONNECTED WORKFLOW</small></div>
          <article><span>01</span><div><small>ATTRACT</small><h3>Launches a job-ready website</h3><p>Writes service pages, FAQs and local copy, then connects Smart Intake.</p></div></article>
          <i>→</i>
          <article><span>02</span><div><small>QUALIFY</small><h3>Turns a request into a real scope</h3><p>Asks trade-specific follow-ups and collects photos, timing, budget and contact details.</p></div></article>
          <i>→</i>
          <article><span>03</span><div><small>PRIORITIZE</small><h3>Ranks what deserves attention</h3><p>Scores fit, urgency, estimated value and distance—then sends instant high-value alerts.</p></div></article>
          <i>→</i>
          <article><span>04</span><div><small>FOLLOW THROUGH</small><h3>Keeps the job record moving</h3><p>Carries the same details into quote, schedule, texts, the client portal and payment—without retyping.</p></div></article>
        </div>
      </section>

      <section className="client-experience" aria-labelledby="client-experience-title">
        <div className="client-copy">
          <p className="eyebrow"><span>✦</span> TEXT MESSAGING + A CLIENT PORTAL FOR EVERY JOB</p>
          <h2 id="client-experience-title">Every job gets its own client portal.<br /><em>Every message stays attached.</em></h2>
          <p>Give each homeowner one clear place to review the quote, see the schedule, follow updates and pay. Your team can text from the same job record, so the conversation and the work never drift apart.</p>
          <ul className="client-benefits">
            <li><span>✓</span><div><b>Two-way texting</b><small>Replies stay connected to the right customer and job.</small></div></li>
            <li><span>✓</span><div><b>One portal for every job</b><small>Quote, schedule, updates and payment share one customer view.</small></div></li>
            <li><span>✓</span><div><b>A simpler customer experience</b><small>One direct link gives homeowners everything they need.</small></div></li>
          </ul>
        </div>

        <div className="client-product" aria-label="Example showing a job text conversation connected to its client portal">
          <div className="text-console">
            <div className="console-top"><span>Messages</span><small>JOB #1048 · KITCHEN REMODEL</small></div>
            <div className="contact-row"><span className="contact-avatar">AM</span><div><b>Alex Morgan</b><small>Text conversation · synced to job</small></div><i>ACTIVE</i></div>
            <div className="message-stream">
              <div className="msg outgoing"><small>BRIGHTLINE</small><p>Your estimate is ready. You can review and approve it here.</p><span>10:14 AM · Delivered</span></div>
              <div className="msg incoming"><p>Approved—Tuesday morning works for us.</p><span>10:21 AM</span></div>
              <div className="msg outgoing"><small>BRIGHTLINE</small><p>You’re scheduled for Tuesday, 9–11 AM. We’ll text when the crew is on the way.</p><span>10:22 AM · Delivered</span></div>
            </div>
            <div className="message-footer"><span>Reply by text…</span><button type="button">Send</button></div>
          </div>

          <div className="portal-window">
            <div className="portal-top"><b>BRIGHTLINE ELECTRIC</b><small>YOUR JOB PORTAL</small></div>
            <div className="portal-status"><span><small>JOB #1048</small><b>Kitchen lighting upgrade</b></span><em>SCHEDULED</em></div>
            <div className="portal-timeline">
              <span className="done"><i>✓</i><div><b>Quote approved</b><small>Today · 10:21 AM</small></div></span>
              <span className="next"><i>2</i><div><b>Installation visit</b><small>Tuesday · 9–11 AM</small></div></span>
              <span><i>3</i><div><b>Final payment</b><small>Due after work is complete</small></div></span>
            </div>
            <div className="portal-actions"><button type="button">View approved quote</button><button type="button">Message contractor</button></div>
            <p className="portal-note"><span>✓</span> This portal is unique to this job.</p>
          </div>
        </div>
      </section>

      <section className="included" id="included">
        <div className="included-head">
          <p className="eyebrow"><span>✦</span> THE REST OF THE JOB IS INCLUDED</p>
          <h2>One system from quote to review.</h2>
          <p>Your website is the front door. Quotes, scheduling, crews, payments and follow-up are already connected behind it.</p>
        </div>
        <div className="suite-grid">
          {suite.map(([title, body], index) => (
            <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="difference" id="difference">
        <div className="difference-copy">
          <p className="eyebrow"><span>✦</span> BUILT IN. NOT BOLTED ON.</p>
          <h2>Every handoff stays connected.</h2>
          <p>One login and one customer record—from the first website question through the final payment.</p>
          <div className="difference-proof">
            <span><b>One customer record</b><small>From first question to final payment</small></span>
            <span><b>One place to work</b><small>For the owner, office and crew</small></span>
            <span><b>One aligned price</b><small>No monthly fee before you earn</small></span>
          </div>
        </div>
        <div className="stack-compare" aria-label="Software stack comparison">
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
          <div className="versus">VS</div>
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

      <section className="pricing-band" id="pricing">
        <div className="price-zero"><span>$</span><strong>0</strong><small>/ MONTH</small></div>
        <div className="pricing-copy">
          <p className="eyebrow"><span>✦</span> FULL SUITE. NO MONTHLY SUBSCRIPTION.</p>
          <h2>When business is slow,<br /><em>your software bill is $0.</em></h2>
          <p>Use the full suite without a monthly subscription. A small platform fee applies only when a homeowner pays you.</p>
          <div className="pricing-points"><span>✓ No setup fee</span><span>✓ No contract</span><span>✓ No per-seat fee</span><span>✓ Rate drops as you grow</span></div>
          <small className="pricing-fineprint">Payment processing and platform fees apply to completed transactions.</small>
        </div>
      </section>

      <section className="final-cta" id="final-cta">
        <div className="cta-rays" />
        <p className="eyebrow"><span>✦</span> BUILT FOR THE ONE-TRUCK OPERATOR—AND THE CREW DOING $2M</p>
        <h2>One truck or ten crews.<br />Your next stage starts here.</h2>
        <p>Launch the site, connect the work and give your growing business one place to run.</p>
        <a className="button primary light" href="https://app.letsgetquoted.com/">Create my account <span>→</span></a>
        <small>No card required · No monthly subscription · Cancel anytime</small>
      </section>

      <SiteFooter />
    </main>
  );
}
