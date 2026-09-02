"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./features-energy-flow-hero.module.css";

export interface FeaturePillarItem {
  id: string;
  number: string;
  name: string;
  shortName: string;
  tag: string;
  sub: string;
  replacesTool: string;
  squircleClass: string;
  capability: string;
  problemSolves: string;
  specs: string[];
  exploreHref: string;
  exploreLabel: string;
  icon: React.ReactNode;
  microPreview: React.ReactNode;
  storyTitle: string;
  storyTime: string;
  storyHomeowner: string;
  storyNarrative: string;
  storyOutcome: string;
  jobRecordStage: string;
}

export const FEATURE_PILLARS: FeaturePillarItem[] = [
  {
    id: "website-ads",
    number: "01",
    name: "Website & Google Ads",
    shortName: "Website & Ads",
    tag: "✦ Free Site & Ads",
    sub: "Get Found on Google",
    replacesTool: "Replaces: Squarespace, Wix & pricey ad agencies",
    squircleClass: styles.squircle_website,
    capability:
      "A fast, modern website built for your trade with built-in instant quoting, connected directly to Google Search & Local Services Ads.",
    problemSolves:
      "No more paying $2,000/mo to slow ad agencies. You get a clean site that puts you at the top of Google and brings in real local calls.",
    specs: [
      "Works on every phone with your own custom web address",
      "Shows up on Google Maps so local homeowners call you first",
      "$0 monthly website fee — free to build and launch",
    ],
    exploreHref: "/features/website-builder",
    exploreLabel: "Explore Website Builder",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetWebsite}>
        <div className={styles.snippetWebsiteHeader}>
          <span className={styles.websiteUrlBadge}>apex-electrical.com</span>
          <span className={styles.websiteLsaBadge}>✓ Google Guaranteed</span>
        </div>
        <div className={styles.snippetWebsiteHeadline}>Fast 24/7 Electrical Services in Austin, TX</div>
        <div className={styles.snippetWebsiteSub}>Instant Estimate Form · Live Booking · 5.0 ★ Rated</div>
      </div>
    ),
    storyTitle: "Step 1 · Homeowner Finds Your Free Website",
    storyTime: "7:14 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "Sarah searches \"emergency 200A panel upgrade austin\". She lands on Apex Electrical's free website, backed by Google Guaranteed.",
    storyOutcome: "✓ High-intent homeowner enters your job record in 1 click",
    jobRecordStage: "01: Website Lead Captured",
  },
  {
    id: "ai-intake",
    number: "02",
    name: "24/7 AI Intake & Voice",
    shortName: "AI Intake & Voice",
    tag: "⚡ 2-Ring Pickup",
    sub: "Never Miss a Call",
    replacesTool: "Replaces: CallRail, answering services & missed voicemails",
    squircleClass: styles.squircle_voice,
    capability:
      "Answers phone calls in 2 rings with a friendly voice, gathers job details, and collects customer photos so you know what's needed.",
    problemSolves:
      "You can't answer the phone while driving or on a ladder. AI catches the caller in seconds so they don't call your competitor next.",
    specs: [
      "Answers in 2 rings and logs clean notes so you can read them fast",
      "Reads equipment model numbers and serials directly from customer photos",
      "Talk into your phone to dictate job notes hands-free without typing",
    ],
    exploreHref: "/features/ai-intake",
    exploreLabel: "Explore AI Intake & Voice",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        <path d="M14.05 2a9 9 0 0 1 8 7.94" stroke="#34d399" strokeWidth="2" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetVoice}>
        <div className={styles.snippetVoiceTop}>
          <span className={styles.voiceLiveDot} />
          <span className={styles.voiceStatusText}>24/7 AI Receptionist Transcribing</span>
          <span className={styles.voiceDuration}>0:18</span>
        </div>
        <div className={styles.voiceTranscript}>
          &ldquo;Main panel is buzzing. Sized 200A Square-D QO replacement from customer photos.&rdquo;
        </div>
      </div>
    ),
    storyTitle: "Step 2 · 2-Ring Pickup & Scope Sized",
    storyTime: "7:15 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "Sarah calls at 7:15 PM after hours. AI answers in 2 rings, notes her buzzing breaker box, and analyzes 2 uploaded panel photos.",
    storyOutcome: "✓ 100% structured scope logged to Job Record #TX-8492",
    jobRecordStage: "02: Scope & Photos Sized",
  },
  {
    id: "customer-updates",
    number: "03",
    name: "SMS & Customer Updates",
    shortName: "Customer Updates",
    tag: "⚡ 2s Auto-Reply",
    sub: "Instant Texts & Alerts",
    replacesTool: "Replaces: Podium, phone tag & texting from personal cell",
    squircleClass: styles.squircle_updates,
    capability:
      "2-second automated text replies, 2-way homeowner texting, appointment reminders, and automated on-the-way arrival alerts.",
    problemSolves:
      "The first contractor to reply wins the job. Customers get instant answers, and you never have to give out your personal cell number.",
    specs: [
      "Auto-texts new leads in under 60 seconds before they look elsewhere",
      "Send texts directly from your business number with full message history",
      "Sends automatic appointment reminders and 30-minute arrival alerts",
    ],
    exploreHref: "/features/text-to-job",
    exploreLabel: "Explore Customer Updates",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        <circle cx="8.5" cy="12" r="1" fill="#8b5cf6" />
        <circle cx="12" cy="12" r="1" fill="#8b5cf6" />
        <circle cx="15.5" cy="12" r="1" fill="#8b5cf6" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetUpdates}>
        <div className={styles.smsBubbleReceived}>
          <span>Sarah:</span> &ldquo;Do you have an arrival slot tomorrow morning?&rdquo;
        </div>
        <div className={styles.smsBubbleSent}>
          <span className={styles.smsAutoTag}>⚡ 2s Auto-Update:</span> &ldquo;Hi Sarah! We have 8:30 AM held. Review your quote here: lgq.io/tx8492&rdquo;
        </div>
      </div>
    ),
    storyTitle: "Step 3 · Instant Speed-to-Lead Text",
    storyTime: "7:16 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "While other contractors are closed, Sarah receives a personalized SMS with her custom quote link and holds an 8:30 AM arrival window.",
    storyOutcome: "✓ Response time: 1.8 seconds; customer locked in",
    jobRecordStage: "03: SMS Quote Link Delivered",
  },
  {
    id: "quotes",
    number: "04",
    name: "Custom Quotes & E-Sign",
    shortName: "Custom Quotes",
    tag: "● Profit Lock",
    sub: "Quotes Signed on Phones",
    replacesTool: "Replaces: PandaDoc, DocuSign & late-night bidding",
    squircleClass: styles.squircle_quotes,
    capability:
      "Trade-specific line presets, built-in profit margin protection, 1-click price lookups, and instant mobile signatures.",
    problemSolves:
      "Stop sitting at the kitchen table at 9 PM doing paperwork. Quotes look sharp, protect your profit margin, and get approved fast.",
    specs: [
      "1-tap mobile signature on the homeowner's phone with deposit payment",
      "Automatic profit margin protection so you never undercharge for a job",
      "Clean 1-page PDF bids you can print or text in one click",
    ],
    exploreHref: "/features/quotes",
    exploreLabel: "Explore Custom Quotes",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff7137" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetQuote}>
        <div className={styles.quoteRow}>
          <span className={styles.quoteItem}>200A Main Service Panel Upgrade</span>
          <span className={styles.quotePrice}>$3,850.00</span>
        </div>
        <div className={styles.quoteFooter}>
          <span className={styles.quoteMarginBadge}>● Profit Margin: 44% (Locked)</span>
          <span className={styles.quoteSignBadge}>✓ 1-Tap E-Signed</span>
        </div>
      </div>
    ),
    storyTitle: "Step 4 · Proposal E-Signed in 60 Seconds",
    storyTime: "7:17 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "Sarah opens her proposal on her iPhone. She reviews the clear $3,850 line items and e-signs with her thumb on the screen.",
    storyOutcome: "✓ Legally binding proposal signed; gross margin locked at 44%",
    jobRecordStage: "04: Proposal Legally E-Signed",
  },
  {
    id: "scheduling-crew",
    number: "05",
    name: "Scheduling & Crew Dispatch",
    shortName: "Scheduling & Crew",
    tag: "🚚 Live Dispatch",
    sub: "Jobs, Loadouts & Maps",
    replacesTool: "Replaces: Jobber, whiteboards & forgotten tools",
    squircleClass: styles.squircle_scheduling,
    capability:
      "Visual calendar dispatch, morning truck loadout checklists, gate codes, driving routes, and live job status tracking.",
    problemSolves:
      "No more forgotten parts, wrong addresses, or morning confusion. Your crew knows exactly where to go and what parts to put on the truck.",
    specs: [
      "Drag-and-drop calendar to schedule jobs and assign trucks in seconds",
      "Morning truck loadout checklists and gate codes sent right to crew phones",
      "Live job status tracking from 'On The Way' to 'Job Done'",
    ],
    exploreHref: "/features/dispatch",
    exploreLabel: "Explore Scheduling & Crew",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetScheduling}>
        <div className={styles.dispatchHeader}>
          <span className={styles.dispatchTruck}>🚚 Crew #2 (Mike &amp; Dave)</span>
          <span className={styles.dispatchStatus}>Scheduled (8:30 AM)</span>
        </div>
        <div className={styles.dispatchDetails}>
          <span>Route: 142 Elm St</span> · <span>Gate Code: #4491</span> · <span>Loadout: 200A QO</span>
        </div>
      </div>
    ),
    storyTitle: "Step 5 · Job Scheduled & Crew Briefed",
    storyTime: "7:18 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "The job lands on tomorrow's calendar. Crew #2 receives their morning route, gate code #4491, and Square-D loadout on their phone.",
    storyOutcome: "✓ Crew loaded and dispatched with zero morning chaos",
    jobRecordStage: "05: Crew #2 Dispatched (8:30 AM)",
  },
  {
    id: "payments-invoicing",
    number: "06",
    name: "Instant Payments & Invoicing",
    shortName: "Payments & Invoicing",
    tag: "💳 Paid Job",
    sub: "Get Paid & Sync QuickBooks",
    replacesTool: "Replaces: Stripe Invoicing, chasing checks & late bookkeeping",
    squircleClass: styles.squircle_payments,
    capability:
      "Automatic upfront deposit collection upon e-sign, 1-tap Apple Pay and card invoices on site, and automatic QuickBooks sync.",
    problemSolves:
      "Stop waiting 30 days for paper checks or tracking down unpaid invoices. Get paid on the spot and keep your cash flow healthy.",
    specs: [
      "Collect upfront deposits automatically the second the quote is signed",
      "Take credit cards, Apple Pay, or bank transfers right from your phone",
      "Syncs every paid invoice automatically with QuickBooks so your books are done",
    ],
    exploreHref: "/features/payments",
    exploreLabel: "Explore Payments & Invoicing",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee0bc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
    microPreview: (
      <div className={styles.microSnippetPayments}>
        <div className={styles.paymentsTopRow}>
          <span className={styles.paymentsDepositTitle}>Deposit Collected via Stripe</span>
          <span className={styles.paymentsDepositAmount}>$1,000.00</span>
        </div>
        <div className={styles.paymentsFeeRow}>
          <span>Quote: $3,850.00 · Free to Quote</span>
          <span className={styles.paymentsFeeHighlight}>Flex Fee: 1.25% ($12.50)</span>
          <span className={styles.paymentsSyncTag}>✓ QuickBooks Synced</span>
        </div>
      </div>
    ),
    storyTitle: "Step 6 · $1,000 Deposit Paid in 3 Minutes",
    storyTime: "7:18 PM",
    storyHomeowner: "Sarah J. (Austin, TX)",
    storyNarrative:
      "Sarah pays a $1,000 deposit via Apple Pay directly on the quote. Funds settle directly to the contractor's bank account with 1.25% Flex fee ($12.50).",
    storyOutcome: "✓ From website lead to paid job in 4 minutes flat",
    jobRecordStage: "06: $1,000 Deposit Paid · Job Locked",
  },
];

const PIN_Y_COORDS = [24, 82, 139, 197, 254, 312];

export default function FeaturesEnergyFlowHero() {
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const CYCLE_TIME_MS = 4000;

  useEffect(() => {
    if (isHovered) return;

    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % FEATURE_PILLARS.length);
    }, CYCLE_TIME_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isHovered, activeIdx, CYCLE_TIME_MS]);

  const activePillar = FEATURE_PILLARS[activeIdx] || FEATURE_PILLARS[0];

  return (
    <div
      className={styles.flowContainer}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="region"
      aria-label="Interactive One Job Record Connected Engine"
    >
      <div className={styles.flowBackdropGlow} aria-hidden="true" />

      {/* Header telemetry status bar */}
      <div className={styles.flowHeaderBar}>
        <div className={styles.flowHeaderTitleGroup}>
          <span className={styles.flowLiveBadge}>
            <span className={styles.liveDot} aria-hidden="true" />
            ONE JOB RECORD · EVERY STEP CONNECTED
          </span>
          <span className={styles.flowReplacedToolsTag}>
            {activePillar.replacesTool}
          </span>
        </div>
      </div>

      {/* 3-Column Main Stage */}
      <div className={styles.flowStage}>
        {/* Left Column: 6 Feature Pillar Selectors */}
        <div
          className={styles.featureStack}
          role="group"
          aria-label="Core Feature Pillars"
        >
          {FEATURE_PILLARS.map((pillar, idx) => {
            const isActive = activeIdx === idx;
            return (
              <div
                key={pillar.id}
                className={`${styles.featureCard} ${
                  isActive ? styles.featureActive : ""
                }`}
                onClick={() => {
                  setActiveIdx(idx);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveIdx(idx);
                  }
                }}
                aria-label={`Feature ${pillar.number}: ${pillar.name}`}
                aria-pressed={isActive}
              >
                <div
                  className={`${styles.iconSquircle} ${pillar.squircleClass}`}
                >
                  {pillar.icon}
                </div>
                <div className={styles.featureTextGroup}>
                  <div className={styles.featureTitleRow}>
                    <span className={styles.featureNameDesktop}>
                      {pillar.name}
                    </span>
                    <span className={styles.featureNameMobile}>
                      {pillar.shortName}
                    </span>
                    <span
                      className={`${styles.featureMicroTag} ${
                        isActive ? styles.featureMicroTagActive : ""
                      }`}
                    >
                      {isActive ? "✦ Active" : pillar.tag}
                    </span>
                  </div>
                  <span className={styles.featureSub}>{pillar.sub}</span>
                </div>

                <div
                  className={`${styles.terminalPin} ${
                    isActive ? styles.terminalPinActive : ""
                  }`}
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>

        {/* Center Column: Telemetry Conduit & LIVE JOB RECORD HUB */}
        <div className={styles.conduitArea} aria-hidden="true">
          <svg
            className={styles.circuitSvgDesktop}
            viewBox="0 0 110 336"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="activeTraceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff7137" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#ffc44d" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#4ee0bc" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="outputTraceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ffc44d" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#4ee0bc" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#00f5ff" stopOpacity="0.85" />
              </linearGradient>
              <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {PIN_Y_COORDS.map((yPos, idx) => {
              const isActive = activeIdx === idx;
              const pathD = `M 0 ${yPos} C 25 ${yPos}, 35 168, 55 168`;
              return (
                <g key={idx}>
                  <path
                    d={pathD}
                    className={isActive ? styles.circuitTraceActive : styles.circuitTrace}
                    stroke={isActive ? "url(#activeTraceGrad)" : undefined}
                  />
                  {isActive && (
                    <g filter="url(#subtleGlow)">
                      <circle r="2.5" fill="#ffc44d">
                        <animateMotion path={pathD} dur="1.5s" repeatCount="indefinite" />
                      </circle>
                      <circle r="1.2" fill="#ffffff">
                        <animateMotion path={pathD} dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  )}
                </g>
              );
            })}

            <g>
              <path
                d="M 55 168 L 110 168"
                className={styles.circuitTraceActiveRight}
                stroke="url(#outputTraceGrad)"
              />
              <g filter="url(#subtleGlow)">
                <circle r="2.5" fill="#4ee0bc">
                  <animateMotion path="M 55 168 L 110 168" dur="1.5s" repeatCount="indefinite" />
                </circle>
                <circle r="1.2" fill="#ffffff">
                  <animateMotion path="M 55 168 L 110 168" dur="1.5s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          </svg>

          {/* Mobile Vertical SVG Circuit */}
          <svg
            className={styles.circuitSvgMobile}
            viewBox="0 0 300 76"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="mobileActiveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ff7137" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#ffc44d" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#4ee0bc" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="mobileOutputGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffc44d" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#4ee0bc" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#00f5ff" stopOpacity="0.85" />
              </linearGradient>
            </defs>

            {[
              { col: 0, pathD: "M 50 0 C 50 16, 110 30, 150 38", active: activeIdx === 0 || activeIdx === 3 },
              { col: 1, pathD: "M 150 0 L 150 38", active: activeIdx === 1 || activeIdx === 4 },
              { col: 2, pathD: "M 250 0 C 250 16, 190 30, 150 38", active: activeIdx === 2 || activeIdx === 5 },
            ].map((colItem) => (
              <g key={colItem.col}>
                <path
                  d={colItem.pathD}
                  className={colItem.active ? styles.circuitTraceActive : styles.circuitTrace}
                  stroke={colItem.active ? "url(#mobileActiveGrad)" : undefined}
                />
                {colItem.active && (
                  <g filter="url(#mobileSubtleGlow)">
                    <circle r="2.5" fill="#ffc44d">
                      <animateMotion path={colItem.pathD} dur="1.4s" repeatCount="indefinite" />
                    </circle>
                    <circle r="1.2" fill="#ffffff">
                      <animateMotion path={colItem.pathD} dur="1.4s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )}
              </g>
            ))}

            <g>
              <path
                d="M 150 38 L 150 76"
                className={styles.circuitTraceActiveRight}
                stroke="url(#mobileOutputGrad)"
              />
              <g filter="url(#mobileSubtleGlow)">
                <circle r="2.5" fill="#4ee0bc">
                  <animateMotion path="M 150 38 L 150 76" dur="1.4s" repeatCount="indefinite" />
                </circle>
                <circle r="1.2" fill="#ffffff">
                  <animateMotion path="M 150 38 L 150 76" dur="1.4s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          </svg>

          {/* Central AI Hub Node: ONE JOB RECORD CORE */}
          <div className={styles.hubNodeWrapper}>
            <span className={styles.hubRecordTag}>Let&rsquo;s Get Quoted AI</span>
            <div
              className={styles.hubOrb}
              onClick={() => {
                setActiveIdx((prev) => (prev + 1) % FEATURE_PILLARS.length);
              }}
              title="Click to advance the single unified job record"
            >
              <div className={styles.hubHaloRing} />
              <div className={styles.hubStarIcon}>✦</div>
            </div>
            <span className={styles.hubLabel}>ONE JOB RECORD</span>
          </div>
        </div>

        {/* Right Column: Interactive Feature Intelligence Card */}
        <div className={styles.cardContainer} aria-live="polite">
          <div key={activePillar.id} className={styles.intelligenceCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardTitleGroup}>
                <span>{activePillar.icon}</span>
                <span>{activePillar.name}</span>
              </div>
            </div>

            <div className={styles.microPreviewContainer}>
              {activePillar.microPreview}
            </div>

            <div className={styles.cardSectionBox}>
              <span className={styles.cardSectionLabel}>What It Does</span>
              <p className={styles.cardSectionText}>{activePillar.capability}</p>
            </div>

            <div className={styles.cardProblemBox}>
              <span className={styles.cardProblemLabel}>Why You Need It</span>
              <p className={styles.cardProblemText}>{activePillar.problemSolves}</p>
            </div>

            <ul className={styles.cardSpecsList} aria-label="What You Get">
              {activePillar.specs.map((spec, sIdx) => (
                <li key={sIdx} className={styles.cardSpecItem}>
                  <span className={styles.cardSpecIcon} aria-hidden="true">✓</span>
                  <span>{spec}</span>
                </li>
              ))}
            </ul>

            <div className={styles.cardActionBar}>
              <Link href={activePillar.exploreHref} className={styles.cardActionPrimary}>
                {activePillar.exploreLabel} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
