'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './features-theme.module.css';

interface SectionContext {
  id: string;
  selector: string;
  name: string;
  badge: string;
  speech: string;
  actionLabel?: string;
  actionHref?: string;
}

const SECTION_CONTEXTS: SectionContext[] = [
  {
    id: 'hero',
    selector: '#main-content',
    name: 'Single Connected Job Record',
    badge: '24/7 FIELD COPILOT',
    speech: "Hey! I'm your contractor Field Co-Pilot. While you're on the jobsite or driving, I capture homeowner inquiries, draft itemized quotes, and keep your schedule moving.",
    actionLabel: 'Watch one job move →',
    actionHref: '#tour',
  },
  {
    id: 'website-builder',
    selector: '#website-builder',
    name: 'One-Click Trade Website',
    badge: 'FRONT DOOR',
    speech: 'Your generated website writes trade-specific pages, town SEO, and instant estimate questions so high-value homeowners qualify themselves.',
    actionLabel: 'Preview site templates →',
    actionHref: '/demo/sites',
  },
  {
    id: 'smart-intake',
    selector: '#smart-intake',
    name: 'Smart Intake & Vision',
    badge: 'AI PHOTO ESTIMATOR',
    speech: 'When homeowners upload photos, I scan rating plates, calculate footage, and flag hazards before you spend 20 minutes on the phone.',
    actionLabel: 'Try the live photo scanner →',
    actionHref: '#companion-photo-demo',
  },
  {
    id: 'quotes',
    selector: '#quotes',
    name: 'Quotes & Approvals',
    badge: 'PRICE & SIGN',
    speech: 'Send good/better/best options with optional add-ons. Clients sign on their phone and the required deposit clears before you buy materials.',
    actionLabel: 'Explore Quotes →',
    actionHref: '/features/quotes',
  },
  {
    id: 'scheduling',
    selector: '#scheduling',
    name: 'Scheduling & Crew Dispatch',
    badge: 'CALENDAR & ROUTE',
    speech: 'Approved quotes turn into booked jobs instantly. I map the route and send morning loadout checklists and gate codes to the crew.',
    actionLabel: 'Explore Scheduling →',
    actionHref: '/features/scheduling',
  },
  {
    id: 'client-portal',
    selector: '#client-portal',
    name: 'Client Portal & Texting',
    badge: 'TWO-WAY SMS',
    speech: 'Homeowners follow the job, view on-my-way alerts, and pay balances through one branded link without logging in.',
    actionLabel: 'Explore Client Portal →',
    actionHref: '/features/client-portal',
  },
  {
    id: 'quick-stops',
    selector: '#quick-stops',
    name: 'Quick Stops Route Monetizer',
    badge: 'DRIVE TIME REVENUE',
    speech: 'Nearby emergency requests pop up along your existing driving route. Set your priority fee and collect payment before turning the wheel.',
    actionLabel: 'Test detour simulator →',
    actionHref: '#quick-stops',
  },
  {
    id: 'calculator',
    selector: '#sprawl-calculator',
    name: 'Software Sprawl Calculator',
    badge: 'COST & ROI',
    speech: 'Stitching together 5 separate SaaS tools costs contractors $3,600+/year. See how much you save with everything in one connected account.',
    actionLabel: 'Calculate my savings →',
    actionHref: '#sprawl-calculator',
  },
  {
    id: 'breakthroughs',
    selector: '#breakthroughs',
    name: 'AI Voice & Vision Suite',
    badge: 'NEW FIELD TECH',
    speech: '24/7 AI call answering in 2 rings, photo OCR estimating, and hands-free voice dictation designed for dirty hands on site.',
    actionLabel: 'Explore AI Voice →',
    actionHref: '/features/ai-voice',
  },
  {
    id: 'catalog',
    selector: '#catalog-explorer',
    name: 'Complete Feature Catalog',
    badge: '56 BUILT-IN CAPABILITIES',
    speech: 'From instant PDF exports to automated review requests—everything is included without paid tier lockouts.',
    actionLabel: 'Browse full catalog →',
    actionHref: '#catalog-explorer',
  },
  {
    id: 'contractor-tools',
    selector: '#contractor-tools',
    name: 'Free Contractor Calculators',
    badge: 'FREE TOOLS',
    speech: 'Try our free 1-page PDF estimate generator or calculate your true billable hourly rate based on overhead and gross margin.',
    actionLabel: 'Open Estimate Generator →',
    actionHref: '/tools/estimate-generator',
  },
  {
    id: 'everything',
    selector: '.everything-index',
    name: 'Everything Behind the Website',
    badge: 'ONE DATA RECORD',
    speech: 'Quotes, crew, schedules, invoices, and QuickBooks sync—no double entry, no lost paperwork, and no missed follow-ups.',
    actionLabel: 'See back office suite →',
    actionHref: '/features/back-office',
  },
  {
    id: 'faq',
    selector: '#faq',
    name: 'Questions & Clear Answers',
    badge: 'BEFORE YOU START',
    speech: 'Flex starts at $0/mo, Stripe pays directly to your bank account, and you own your custom domain and client records 100%.',
    actionLabel: 'Compare plan pricing →',
    actionHref: '/pricing',
  },
];

const PRESET_QUESTIONS = [
  {
    q: 'How does the $0/month Flex tier work?',
    a: 'Flex has no monthly software fee. You can build your site, use AI photo intake, and send unlimited quotes for free. A 1.25% platform fee applies only when you collect payment through Stripe.',
    href: '/pricing',
    btn: 'Compare Plans',
  },
  {
    q: 'Can I keep my existing domain name?',
    a: 'Yes! You publish instantly on your free .letsgetquoted.com subdomain, then point your existing custom domain (e.g. smithplumbing.com) with one simple CNAME record whenever you are ready.',
    href: '/features/website-builder',
    btn: 'Website Builder Details',
  },
  {
    q: 'Do you hold my customer payments?',
    a: 'Never. Payments process directly into your own Stripe connected account and settle on Stripe’s normal payout schedule directly to your bank.',
    href: '/pricing',
    btn: 'Payment & Fee Terms',
  },
  {
    q: 'How does AI Photo Estimating work?',
    a: 'Homeowners upload photos of their electrical panel, HVAC unit, or remodel area. The AI extracts model numbers, calculates dimensions, spots site hazards, and pre-populates your draft quote.',
    href: '#companion-photo-demo',
    btn: 'Try Photo Demo',
  },
];

export default function CompanionHUD() {
  const [activeSection, setActiveSection] = useState<SectionContext>(SECTION_CONTEXTS[0]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showQAPanel, setShowQAPanel] = useState<boolean>(false);
  const [activeAnswer, setActiveAnswer] = useState<number | null>(null);
  const [isTouring, setIsTouring] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(0);
  const [hasDismissedSpeech, setHasDismissedSpeech] = useState<boolean>(false);

  const observerRef = useRef<IntersectionObserver | null>(null);

  // Set up section scroll observers
  useEffect(() => {
    const handleIntersect: IntersectionObserverCallback = (entries) => {
      // Find the topmost intersecting section
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const match = SECTION_CONTEXTS.find((c) => entry.target.matches(c.selector));
          if (match) {
            setActiveSection(match);
            setHasDismissedSpeech(false);
            break;
          }
        }
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: null,
      rootMargin: '-20% 0px -40% 0px',
      threshold: 0.15,
    });

    SECTION_CONTEXTS.forEach((c) => {
      const el = document.querySelector(c.selector);
      if (el && observerRef.current) {
        observerRef.current.observe(el);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Guided Tour sequence
  const TOUR_SECTIONS = [
    { target: '#main-content', title: '1. Single Job Record', desc: 'Every quote, text, and payment stays linked to one record.' },
    { target: '#website-builder', title: '2. One-Click Website', desc: 'Generated with local SEO and instant estimate forms.' },
    { target: '#smart-intake', title: '3. AI Photo Intake', desc: 'Extracts equipment specs and jobsite risks automatically.' },
    { target: '#quotes', title: '4. Quotes & Upsells', desc: 'Itemized pricing with mobile e-signatures and deposits.' },
    { target: '#scheduling', title: '5. Smart Scheduling & Crew', desc: 'One-click morning dispatch and route planning.' },
    { target: '#quick-stops', title: '6. Quick Stops Detours', desc: 'Monetize drive time with paid same-day stops.' },
  ];

  const handleStartTour = () => {
    setIsTouring(true);
    setTourStep(0);
    setIsExpanded(true);
    const firstTarget = document.querySelector(TOUR_SECTIONS[0].target);
    firstTarget?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleNextTourStep = () => {
    const next = tourStep + 1;
    if (next < TOUR_SECTIONS.length) {
      setTourStep(next);
      const target = document.querySelector(TOUR_SECTIONS[next].target);
      target?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setIsTouring(false);
      setTourStep(0);
    }
  };

  const handleEndTour = () => {
    setIsTouring(false);
    setTourStep(0);
  };

  return (
    <aside className={styles.companionHUD} aria-label="AI Contractor Field Companion">
      {/* Floating Mini Speech Bubble (when collapsed and not dismissed) */}
      {!isExpanded && !hasDismissedSpeech && (
        <div className={styles.companionMiniBubble}>
          <div className={styles.companionBubbleHeader}>
            <span className={styles.companionBadge}>{activeSection.badge}</span>
            <button
              type="button"
              className={styles.companionDismissBtn}
              onClick={() => setHasDismissedSpeech(true)}
              aria-label="Dismiss speech tip"
            >
              ✕
            </button>
          </div>
          <p className={styles.companionBubbleText}>{activeSection.speech}</p>
          <div className={styles.companionBubbleActions}>
            {activeSection.actionHref && (
              <a href={activeSection.actionHref} className={styles.companionActionLink}>
                {activeSection.actionLabel || 'Explore →'}
              </a>
            )}
            <button
              type="button"
              className={styles.companionOpenBtn}
              onClick={() => setIsExpanded(true)}
            >
              Ask Co-Pilot 💬
            </button>
          </div>
        </div>
      )}

      {/* Expanded Companion Panel */}
      {isExpanded && (
        <div className={styles.companionPanel}>
          <div className={styles.companionPanelHead}>
            <div className={styles.companionPanelTitleWrap}>
              <div className={styles.companionAvatarLarge}>
                <span>🤖</span>
                <span className={styles.companionOnlineDot} aria-hidden="true" />
              </div>
              <div>
                <strong className={styles.companionName}>Ace · LGQ Field Co-Pilot</strong>
                <small className={styles.companionLocationNote}>
                  Active Context: {activeSection.name}
                </small>
              </div>
            </div>
            <button
              type="button"
              className={styles.companionClosePanelBtn}
              onClick={() => setIsExpanded(false)}
              aria-label="Minimize companion panel"
            >
              ✕
            </button>
          </div>

          {/* Touring Mode Banner */}
          {isTouring && (
            <div className={styles.companionTourBanner}>
              <div className={styles.companionTourHeader}>
                <span className={styles.companionTourStepPill}>
                  STEP {tourStep + 1} OF {TOUR_SECTIONS.length}
                </span>
                <button type="button" onClick={handleEndTour} className={styles.companionTourExit}>
                  Exit Tour
                </button>
              </div>
              <h5>{TOUR_SECTIONS[tourStep].title}</h5>
              <p>{TOUR_SECTIONS[tourStep].desc}</p>
              <button
                type="button"
                className={styles.companionTourNextBtn}
                onClick={handleNextTourStep}
              >
                {tourStep + 1 === TOUR_SECTIONS.length ? 'Finish Tour ✦' : 'Next Stage →'}
              </button>
            </div>
          )}

          {/* Regular Active Speech View */}
          {!isTouring && !showQAPanel && (
            <div className={styles.companionBody}>
              <div className={styles.companionSectionCard}>
                <div className={styles.companionSectionKicker}>
                  <span className={styles.pulseDot} aria-hidden="true" />
                  <span>ON THIS SCREEN</span>
                </div>
                <h4>{activeSection.name}</h4>
                <p>{activeSection.speech}</p>
                {activeSection.actionHref && (
                  <a href={activeSection.actionHref} className={styles.companionExploreLink}>
                    {activeSection.actionLabel || 'Jump to section →'}
                  </a>
                )}
              </div>

              {/* Quick Prompt Chips */}
              <div className={styles.companionChipsWrap}>
                <span className={styles.companionChipsTitle}>QUICK ACTIONS &amp; SIMULATIONS</span>
                <div className={styles.companionChips}>
                  <button type="button" onClick={handleStartTour} className={styles.companionChip}>
                    🚀 60s Guided Tour
                  </button>
                  <a href="#companion-photo-demo" className={styles.companionChip}>
                    📸 Test Photo OCR
                  </a>
                  <a href="#quick-stops" className={styles.companionChip}>
                    🗺️ Route Detour Demo
                  </a>
                  <a href="#sprawl-calculator" className={styles.companionChip}>
                    💰 Calculate Savings
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowQAPanel(true)}
                    className={styles.companionChip}
                  >
                    💡 Contractor FAQs
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Q&A Panel */}
          {showQAPanel && !isTouring && (
            <div className={styles.companionQABody}>
              <div className={styles.companionQAHead}>
                <span>COMMON QUESTIONS</span>
                <button
                  type="button"
                  className={styles.companionBackBtn}
                  onClick={() => setShowQAPanel(false)}
                >
                  ← Back to active screen
                </button>
              </div>

              <div className={styles.companionQAList}>
                {PRESET_QUESTIONS.map((item, idx) => (
                  <div key={idx} className={styles.companionQAItem}>
                    <button
                      type="button"
                      className={styles.companionQAQuestion}
                      onClick={() => setActiveAnswer(activeAnswer === idx ? null : idx)}
                    >
                      <span>{item.q}</span>
                      <span>{activeAnswer === idx ? '−' : '+'}</span>
                    </button>
                    {activeAnswer === idx && (
                      <div className={styles.companionQAAnswer}>
                        <p>{item.a}</p>
                        <Link href={item.href} className={styles.companionQABtnLink}>
                          {item.btn} →
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.companionFooter}>
            <a
              href="https://app.letsgetquoted.com/start?goal=build_site&source=companion_hud"
              className={styles.companionCtaBtn}
            >
              Build my free site <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      )}

      {/* Docked Launcher Button (Always visible) */}
      <button
        type="button"
        className={`${styles.companionDockBtn} ${isExpanded ? styles.companionDockActive : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Close companion' : 'Open contractor field companion'}
      >
        <span className={styles.companionDockPulseRing} aria-hidden="true" />
        <span className={styles.companionDockIcon} aria-hidden="true">🤖</span>
        <span className={styles.companionDockLabel}>
          {isExpanded ? 'Minimize Co-Pilot' : 'Co-Pilot Active'}
        </span>
      </button>
    </aside>
  );
}
