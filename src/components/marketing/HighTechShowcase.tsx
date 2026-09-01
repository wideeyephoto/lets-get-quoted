'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import styles from './high-tech-showcase.module.css';

type SparkyMultimodalMode = 'texts' | 'images' | 'videos' | 'voice';

type SparkyFeature = {
  id: SparkyMultimodalMode;
  tabIcon: string;
  tabLabel: string;
  tabBadge: string;
  tabSummary: string;
  badgeStyle: string;
  cardStyle: string;
  eyebrow: string;
  title: string;
  blurb: string;
  bullets: string[];
  testimonial: {
    quote: string;
    author: string;
    tradeLocation: string;
    avatar: string;
    verifiedProof: string;
  };
  primaryCtaText: string;
  primaryHref: string;
  secondaryCtaText: string;
  secondaryHref: string;
};

const SPARKY_FEATURES: SparkyFeature[] = [
  {
    id: 'texts',
    tabIcon: '💬',
    tabLabel: 'Texts & Inbound SMS',
    tabBadge: 'No App Needed',
    tabSummary: 'Run change orders & quotes straight via text',
    badgeStyle: styles.badgeCyan,
    cardStyle: styles.testimonialMicroCardCyan,
    eyebrow: 'TEXT-TO-JOB™ WITH YOUR AI COPILOT · RUN YOUR DAY VIA SMS',
    title: 'Text your AI Copilot change orders, quote tweaks & reminders.',
    blurb:
      'You don’t even need to open an app. Text your AI Copilot from Apple iMessage or Android Messages—it calculates line items, updates customer invoices, matches active job files, and texts back instant confirmation.',
    bullets: [
      'Zero app fatigue — execute entire jobs through native SMS & iMessage',
      'Zero Destructive Guesses — verifies ambiguous customer names with safety checks',
      'Texted reminders auto-schedule push alerts and dashboard tasks (e.g. "Remind me at 7:30 AM")',
      'Automatic client portal sync with no late-night desk paperwork',
    ],
    testimonial: {
      quote:
        '“I haven’t opened a laptop to write a change order in 6 months. I just text my AI Copilot from the top of the ladder and the customer gets an updated invoice in 10 seconds.”',
      author: 'Dave M.',
      tradeLocation: 'Master Electrician · Detroit, MI',
      avatar: '⚡',
      verifiedProof: '✓ Verified Master Electrician · 480+ SMS Jobs Synced',
    },
    primaryCtaText: 'Meet Your AI Copilot & Text-to-Job',
    primaryHref: '/features/sparky',
    secondaryCtaText: 'Explore Text-to-Job Docs →',
    secondaryHref: '/features/text-to-job',
  },
  {
    id: 'images',
    tabIcon: '📸',
    tabLabel: 'Images & Photo Scope',
    tabBadge: 'Computer Vision',
    tabSummary: 'Auto-detect damage & read equipment serial OCR',
    badgeStyle: styles.badgePurple,
    cardStyle: styles.testimonialMicroCardPurple,
    eyebrow: 'MULTIMODAL PHOTO SCOPE · COMPUTER VISION & OCR',
    title: 'Text job photos & receipts—your AI Copilot extracts OCR & files them.',
    blurb:
      'Snap a photo of equipment rating plates, subfloor rot, or supply house receipts and text it to your AI Copilot. Computer Vision reads model/serial numbers via OCR, assesses damage dimensions, and files photos to the right job.',
    bullets: [
      'Automated equipment rating plate OCR (model, serial, BTU, tonnage)',
      'Pre-visit damage detection (dry rot, non-compliant wiring, pipe corrosion)',
      'Instant material pick-lists and trade-specific labor estimations',
      'Texted photos auto-attach to the active customer folder without manual uploads',
    ],
    testimonial: {
      quote:
        '“I snapped a photo of a rusted 1998 boiler plate in a dark basement. My Copilot read the serial number via OCR, matched the 80k BTU specs, and drafted the quote before I got back to my van.”',
      author: 'Marcus R.',
      tradeLocation: 'HVAC & Hydronics Pro · Dallas, TX',
      avatar: '❄️',
      verifiedProof: '✓ Verified HVAC Contractor · 1,200+ Photos Filed',
    },
    primaryCtaText: 'Explore AI Vision Estimator',
    primaryHref: '/features/ai-vision',
    secondaryCtaText: 'Test Photo Sandbox →',
    secondaryHref: '/features/ai-intake',
  },
  {
    id: 'videos',
    tabIcon: '🎥',
    tabLabel: 'Videos & Reel Studio',
    tabBadge: 'Video Engine',
    tabSummary: 'Walkthrough scope analysis & website video sections',
    badgeStyle: styles.badgeAmber,
    cardStyle: styles.testimonialMicroCardAmber,
    eyebrow: 'MULTIMODAL VIDEO STUDIO & WALKTHROUGH SCOPE',
    title: 'Process video site walkthroughs & publish high-speed reels.',
    blurb:
      'Send a video walkthrough of a job site for automated scope notes, or upload your footage for your contractor website. Your AI Copilot verifies video codecs, checks file sizes, and generates trade video sections.',
    bullets: [
      'Site walkthrough video analysis for comprehensive job scope notes',
      '6 toggleable video website layouts (hero loops, project stories, testimonial reels)',
      'Automated codec & size verification (warns for HEVC or oversized files)',
      'Rich video schema JSON-LD for Google search video rich-results',
    ],
    testimonial: {
      quote:
        '“I take a 45-second phone video walking through the job site. My AI Copilot turns it into itemized line items, and our website hero video reel brought in 6 new high-ticket remodels last month alone.”',
      author: 'Sarah T.',
      tradeLocation: 'Design-Build Contractor · Seattle, WA',
      avatar: '🪵',
      verifiedProof: '✓ Verified Custom Remodeler · 85 Video Reels Published',
    },
    primaryCtaText: 'Explore Website Video Studio',
    primaryHref: '/features/website-builder',
    secondaryCtaText: 'View All Features →',
    secondaryHref: '/features',
  },
  {
    id: 'voice',
    tabIcon: '🎙️',
    tabLabel: 'Voice & Driveway Brain Dump',
    tabBadge: 'Speech-to-Quote',
    tabSummary: 'Walk-up voice brain dump to send-ready quotes',
    badgeStyle: styles.badgeEmerald,
    cardStyle: styles.testimonialMicroCardEmerald,
    eyebrow: 'WALK-UP ESTIMATE BRAIN DUMP & HANDS-FREE VOICE',
    title: 'Speak your raw thoughts—your AI Copilot builds the quote.',
    blurb:
      'Walk up to a job site, tap Create Quote, and just talk. Tell your AI Copilot the measurements, materials, and labor—it calculates quantities, structures line items, and gives you a send-ready quote before you leave the driveway.',
    bullets: [
      'Walk-up driveway brain dump turned into professional itemized quotes',
      'Hands-free steering wheel dictation with Apple Siri & Google Assistant shortcuts',
      'Gemini Multimodal noise cancellation filtering diesel trucks & job site tools',
      '24/7 AI Voice phone receptionist answering calls in 2 rings with audio transcripts',
    ],
    testimonial: {
      quote:
        '“I talk through measurements and labor while walking down the customer’s driveway. By the time I put the key in the ignition, the customer has a branded PDF quote with instant financing options.”',
      author: 'Brett K.',
      tradeLocation: 'Hardscaping & Masonry · Orlando, FL',
      avatar: '🧱',
      verifiedProof: '✓ Verified Hardscaper · $420k+ Quoted from Driveway',
    },
    primaryCtaText: 'Explore Voice & Smart Intake',
    primaryHref: '/features/ai-voice',
    secondaryCtaText: 'Try Voice in Demo →',
    secondaryHref: '/demo',
  },
];

const TRADES_PRESETS = [
  '⚡ All Trades',
  '🚿 Plumbing',
  '💡 Electrical',
  '❄️ HVAC',
  '🏠 Roofing',
  '🪵 Carpentry',
  '🌿 Landscaping',
];

const LIVE_TICKER_ITEMS = [
  '🟢 Royal Oak, MI · Electrician texted panel photo → AI Copilot extracted Zinsco 100A OCR (14s ago)',
  '🟢 Austin, TX · Roofer dictated quote via Siri while driving → $4,200 quote sent (38s ago)',
  '🟢 Scottsdale, AZ · Plumber captured Quick Stop detour → $149 pre-paid via Stripe (1m ago)',
  '🟢 Denver, CO · HVAC contractor walk-up brain dump → 3-ton heat pump quote ready (2m ago)',
  '🟢 Charlotte, NC · Carpenter texted supply receipt → $240 lumber auto-reconciled (3m ago)',
  '🟢 Seattle, WA · Remodeler uploaded walkthrough video → 4 scope line items drafted (4m ago)',
];

const TEXT_SCENARIOS = [
  {
    id: 'change-order-text',
    label: '💬 Text: +$450 Gutter Guards',
    userText: 'Add $450 for aluminum gutter guards to Miller\'s quote',
    userTimestamp: '10:14 AM · Sent from iPhone',
    sparkyReply: 'Done! Added $450 for Aluminum Gutter Guards to Quote #1048 for Miller. New quote total: $3,250. Client portal updated.',
    replyTimestamp: '10:14 AM · Instant Delivery',
    jobRef: 'Job #1048 · Alex Miller (84 Pine St)',
    financialDiff: '+$450.00 Aluminum Gutter Guards',
    marginPill: 'Margin: 48.2% (+$312 profit)',
    newTotal: '$3,250.00',
  },
  {
    id: 'reminder-text',
    label: '⏰ Text: Remind Me at 7:30 AM',
    userText: 'Remind me tomorrow at 7:30 AM to send a quote for 2 sheets of 3/4 plywood for 142 Elm St',
    userTimestamp: '2:45 PM · Sent from Truck',
    sparkyReply: 'Reminder scheduled for tomorrow at 7:30 AM: "Send quote for 2 sheets 3/4 plywood for 142 Elm St". Logged to Job #1039.',
    replyTimestamp: '2:45 PM · Instant Delivery',
    jobRef: 'Job #1039 · 142 Elm St',
    financialDiff: 'Task: 2 Sheets 3/4" CDX Plywood',
    marginPill: 'Scheduled: Tomorrow 7:30 AM Alert',
    newTotal: 'Alert Queued',
  },
  {
    id: 'reschedule-text',
    label: '🔄 Text: Reschedule to Friday',
    userText: 'Reschedule Jenkins to Friday at 9am, crew needs 4 hours',
    userTimestamp: '4:12 PM · Sent via Siri',
    sparkyReply: 'Moved Job #1052 (Sarah Jenkins) to Friday, 9:00 AM – 1:00 PM. Crew calendar updated and on-my-way alert queued.',
    replyTimestamp: '4:12 PM · Instant Delivery',
    jobRef: 'Job #1052 · Sarah Jenkins (Hallway Bath)',
    financialDiff: 'Slot: Friday, Sep 4 · 9:00 AM',
    marginPill: 'Crew Truck #2 Dispatched',
    newTotal: 'Schedule Synced',
  },
];

const IMAGE_SCENARIOS = [
  {
    id: 'plate-ocr',
    label: '🏷️ Water Heater Rating Plate',
    imageSrc: '/features/water-heater-plate.jpg',
    imageFile: 'water-heater-plate.jpg (2.4 MB)',
    plateOcr: 'Bradford White · MI-50-40T-CX-A',
    techSpecs: '40,000 BTU · 50 Gallon Natural Gas',
    diagnosedIssue: 'Heavy sediment scale & corroded T&P valve',
    materialsGenerated: 'Bradford White 50-Gal Gas Unit + 3/4" Brass Relief Valve ($940.00)',
    confidence: '99.4% OCR Confidence',
  },
  {
    id: 'subfloor-photo',
    label: '🪵 Subfloor Moisture Damage',
    imageSrc: '/features/subfloor-rot-bathroom.jpg',
    imageFile: 'subfloor-rot-bathroom.jpg (1.8 MB)',
    plateOcr: 'Visual Defect: 24 sq ft Subfloor Moisture Rot',
    techSpecs: 'Compromised 2x10 joist edge beneath tub',
    diagnosedIssue: 'Active dry rot extending 6ft from supply line',
    materialsGenerated: '1 Sheet 3/4" CDX Plywood + GRK Structural Fasteners ($112.50)',
    confidence: '97.2% Defect Segmentation',
  },
  {
    id: 'receipt-photo',
    label: '🧾 Supply House Receipt Scan',
    imageSrc: '/features/home-depot-receipt.jpg',
    imageFile: 'home-depot-receipt-j1039.jpg (980 KB)',
    plateOcr: 'Home Depot Store #4732 · Tax Invoice',
    techSpecs: '10x 3/4" Plywood ($419.80) · 1x Screws ($18.99)',
    diagnosedIssue: 'Verified against Job #1039 active material budget',
    materialsGenerated: 'Auto-reconciled $484.04 material cost into job ledger',
    confidence: '99.1% Expense Auto-Logged',
  },
];

const VIDEO_SCENARIOS = [
  {
    id: 'walkthrough-video',
    label: '🎥 45s Kitchen Walkthrough',
    videoTitle: 'Kitchen-Remodel-Walkthrough.mov',
    specs: '1080p 60fps · 34.2 MB · Duration: 0:45',
    timestamps: [
      { time: '0:12', note: '18ft Upper Cabinet Demo' },
      { time: '0:28', note: 'Relocate 4 Recessed Cans' },
      { time: '0:42', note: 'Drywall Patch around Soffit' },
    ],
    compliance: '✓ 3 Scope Actions Drafted to Quote #1056',
  },
  {
    id: 'hero-video-reel',
    label: '🎬 Website Hero Video Reel',
    videoTitle: 'Austin-Roofing-Project-Story.mp4',
    specs: 'H.264 WebM/MP4 · 8.4 MB (Under 12MB limit) · 1920x1080',
    timestamps: [
      { time: '0:05', note: 'Drone Ridge Cap Aerial' },
      { time: '0:18', note: 'Architectural Shingle Laydown' },
      { time: '0:30', note: 'Cleanup & Magnet Nail Sweep' },
    ],
    compliance: '✓ 60FPS iOS Safari Hardware Accelerated',
  },
  {
    id: 'testimonial-video',
    label: '📹 Client Video Review',
    videoTitle: 'Homeowner-Review-Bathroom.mp4',
    specs: '720p · 14.1 MB · Auto-Closed Captioned',
    timestamps: [
      { time: '0:08', note: '5-Star Quality Praise' },
      { time: '0:22', note: 'Completed 2 Days Early' },
    ],
    compliance: '✓ Emits Review & VideoObject JSON-LD',
  },
];

const VOICE_SCENARIOS = [
  {
    id: 'driveway-brain-dump',
    label: '🚶 Walk-Up Driveway Brain Dump',
    transcript: '"Starting an estimate for Miller at 84 Pine St. 12x16 paver patio, 4 inches crushed gravel, polymeric sand, plus $450 low-voltage lighting add-on. 2 days with 2 guys."',
    sparkyThought: 'Calculating materials (192 sq ft pavers, 3 tons gravel) -> Labor (32 hrs @ $65/hr) -> Structuring $450 lighting upsell...',
    quoteTitle: 'Quote #1049 · Alex Miller',
    lineItems: [
      { name: '12x16 Pavers + 3 Tons Crushed Gravel & Sand', cost: '$1,380.00' },
      { name: 'Site Prep, Excavation & Certified Masonry Labor (32 hrs)', cost: '$2,080.00' },
      { name: '✦ Optional: Low-Voltage LED Lighting Add-On', cost: '$450.00' },
    ],
    total: '$3,910.00',
    status: 'READY BEFORE LEAVING DRIVEWAY',
  },
  {
    id: 'siri-steering-wheel',
    label: '🚗 Steering-Wheel Siri Dictation',
    transcript: '"Siri, text my Copilot to add emergency shutoff valve replacement for $380 on today\'s 2pm visit."',
    sparkyThought: 'Voice command authenticated -> Matched to 2:00 PM visit (David Vance #1055) -> Generating change order...',
    quoteTitle: 'Job #1055 · Emergency Shutoff Valve',
    lineItems: [
      { name: '1" Brass Full-Port Ball Valve Replacement', cost: '$220.00' },
      { name: 'Emergency Plumbing Diagnostic & Labor', cost: '$160.00' },
    ],
    total: '$380.00',
    status: 'PROCESSED HANDS-FREE WHILE DRIVING',
  },
  {
    id: 'ai-receptionist',
    label: '📞 24/7 AI Phone Receptionist',
    transcript: '"Homeowner: My basement water heater is leaking all over the floor and making a hissing noise."',
    sparkyThought: 'AI answers in 2 rings -> Triages emergency severity -> Detects high-value replacement lead...',
    quoteTitle: 'Emergency Lead #1058 · Water Heater',
    lineItems: [
      { name: 'Emergency Diagnostic Callout & Shutoff Inspection', cost: '$189.00' },
      { name: '50-Gal Gas Water Heater Replacement Option', cost: '$1,650.00' },
    ],
    total: '$1,839.00',
    status: 'ANSWERED IN 2 RINGS · 24/7 HOTLINE',
  },
];

export default function HighTechShowcase() {
  const [activeTab, setActiveTab] = useState<SparkyMultimodalMode>('texts');
  const [activeTrade, setActiveTrade] = useState('⚡ All Trades');
  const [activeTextScenario, setActiveTextScenario] = useState(0);
  const [activeImageScenario, setActiveImageScenario] = useState(0);
  const [activeVideoScenario, setActiveVideoScenario] = useState(0);
  const [activeVoiceScenario, setActiveVoiceScenario] = useState(0);
  const [activeVisionLayer, setActiveVisionLayer] = useState<'ocr' | 'heatmap' | 'picklist'>('ocr');
  const [sliderPos, setSliderPos] = useState(52);

  // Live Ticker State
  const [tickerIndex, setTickerIndex] = useState(0);

  // Custom User Input Chat Sandbox State
  const [customInput, setCustomInput] = useState('');
  const [userChatHistory, setUserChatHistory] = useState<{
    userText: string;
    sparkyReply: string;
    time: string;
    diffTitle: string;
    diffAmount: string;
  } | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imageSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSliderRef = useRef(false);

  const updateSliderFromClientX = useCallback((clientX: number) => {
    const container = imageSliderRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;
    const percentage = ((clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(5, Math.min(95, Math.round(percentage)));
    setSliderPos(clamped);
  }, []);

  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingSliderRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback
    }
    updateSliderFromClientX(e.clientX);
  };

  const handleSliderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSliderRef.current) {
      updateSliderFromClientX(e.clientX);
    }
  };

  const handleSliderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSliderRef.current) {
      isDraggingSliderRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // fallback
      }
    }
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setSliderPos((prev) => Math.max(5, prev - 5));
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      setSliderPos((prev) => Math.min(95, prev + 5));
      e.preventDefault();
    } else if (e.key === 'Home') {
      setSliderPos(5);
      e.preventDefault();
    } else if (e.key === 'End') {
      setSliderPos(95);
      e.preventDefault();
    }
  };

  // Rotate Live Activity Ticker every 4.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % LIVE_TICKER_ITEMS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Pointer move handler for interactive stage spotlight
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    stageRef.current.style.setProperty('--mouse-x', `${x}px`);
    stageRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  const currentFeature = SPARKY_FEATURES.find((f) => f.id === activeTab) ?? SPARKY_FEATURES[0];

  const handleCustomSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customInput.trim()) return;

    const text = customInput.trim();
    setCustomInput('');
    setIsTyping(true);

    const now = new Date();
    const timeStr = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;

    setTimeout(() => {
      setIsTyping(false);
      let reply = `Done! Your AI Copilot identified your request: "${text}". Reconciled into active job records and notified customer.`;
      let diffTitle = 'Custom Field Update';
      let diffAmount = 'Applied';

      if (text.includes('$') || text.toLowerCase().includes('add')) {
        const amountMatch = text.match(/\$\d+(?:,\d+)*(?:\.\d+)?/);
        const amount = amountMatch ? amountMatch[0] : '+$350.00';
        reply = `Done! Added ${amount} line item for your request: "${text}". Quote balance recalculated and client portal updated.`;
        diffTitle = `Custom Line Item (${amount})`;
        diffAmount = '+$' + (amount.replace('$', '') || '350.00');
      } else if (text.toLowerCase().includes('remind')) {
        reply = `Reminder scheduled! Your AI Copilot logged an alert for your request: "${text}". Task attached to matching customer file.`;
        diffTitle = 'Scheduled Task Alert';
        diffAmount = 'Alert Queued';
      } else if (text.toLowerCase().includes('reschedule')) {
        reply = `Schedule updated! Your AI Copilot moved the job slot and synced your crew truck calendar.`;
        diffTitle = 'Calendar Re-booking';
        diffAmount = 'Slot Synced';
      }

      setUserChatHistory({
        userText: text,
        sparkyReply: reply,
        time: timeStr,
        diffTitle,
        diffAmount,
      });
    }, 750);
  };

  const handleTradeFilterKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const total = TRADES_PRESETS.length;
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % total;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + total) % total;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = total - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextTrade = TRADES_PRESETS[nextIndex];
    if (nextTrade) {
      setActiveTrade(nextTrade);
      document.getElementById(`trade-chip-${nextTrade.toLowerCase().replace(/[^a-z0-9]/g, '-')}`)?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const total = SPARKY_FEATURES.length;
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % total;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + total) % total;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = total - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextId = SPARKY_FEATURES[nextIndex]?.id;
    if (nextId) {
      setActiveTab(nextId);
      document.getElementById(`sparky-tab-${nextId}`)?.focus();
    }
  };

  return (
    <section className={styles.showcaseSection} id="high-tech-showcase" aria-labelledby="showcase-heading">
      <div className={`${styles.ambientGlow} ${styles.ambientTop}`} aria-hidden="true" />
      <div className={`${styles.ambientGlow} ${styles.ambientBottom}`} aria-hidden="true" />

      <div className={styles.container}>
        {/* Header */}
        <header className={styles.showcaseHeader}>
          <div className={styles.badgeRow}>
            <span className={styles.badgeSpark}>
              <span className={styles.sparkIcon}>⚡</span> NEXT-GEN AI ARCHITECTURE
            </span>
            <span className={styles.badgeSub}>2026 Live Multi-Modal Engine</span>
          </div>

          <h2 className={styles.mainTitle} id="showcase-heading">
            Run your contracting business from your truck.<br />
            <em>No laptops. No typing. Just text, photo &amp; voice.</em>
          </h2>

          <p className={styles.mainSubtitle}>
            You don’t even need to open an app. Meet your <strong>AI Copilot</strong>—the multimodal AI contractor sidekick that processes text messages, job site photos, video walkthroughs, and driveway voice notes directly into your live job files.
          </p>

          {/* LIVE ACTIVITY PULSE TICKER */}
          <div className={styles.liveTickerBar} role="status" aria-live="polite">
            <span className={styles.liveTickerPulseDot} aria-hidden="true" />
            <span className={styles.liveTickerLabel}>LIVE FIELD PULSE:</span>
            <span className={styles.liveTickerText}>{LIVE_TICKER_ITEMS[tickerIndex]}</span>
          </div>

          {/* Trade Filter Switcher */}
          <div className={styles.tradeFilterBar} role="radiogroup" aria-label="Preview for Trade">
            <span className={styles.tradeFilterLabel} id="trade-filter-label">Preview for Trade:</span>
            {TRADES_PRESETS.map((trade, tIdx) => {
              const isSelected = activeTrade === trade;
              return (
                <button
                  key={trade}
                  id={`trade-chip-${trade.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  className={`${styles.tradeChip} ${isSelected ? styles.tradeChipActive : ''}`}
                  onClick={() => setActiveTrade(trade)}
                  onKeyDown={(e) => handleTradeFilterKeyDown(e, tIdx)}
                >
                  {trade}
                </button>
              );
            })}
          </div>
        </header>

        {/* 4 Multimodal Tabs */}
        <div className={styles.tabList} role="tablist" aria-label="Sparky Multimodal AI Showcase">
          {SPARKY_FEATURES.map((feature, idx) => {
            const isActive = feature.id === activeTab;
            return (
              <button
                key={feature.id}
                type="button"
                role="tab"
                id={`sparky-tab-${feature.id}`}
                aria-selected={isActive}
                aria-controls={`sparky-panel-${feature.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`${styles.tabButton} ${isActive ? styles.tabButtonActive : ''}`}
                onClick={() => setActiveTab(feature.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              >
                <div className={styles.tabTopRow}>
                  <span className={styles.tabIcon} aria-hidden="true">
                    {feature.tabIcon}
                  </span>
                  <span className={styles.tabBadge}>{feature.tabBadge}</span>
                </div>
                <p className={styles.tabLabel}>{feature.tabLabel}</p>
                <p className={styles.tabSummary}>{feature.tabSummary}</p>
              </button>
            );
          })}
        </div>

        {/* Main Showcase Stage with Mouse Tracking Spotlight */}
        <div
          ref={stageRef}
          onMouseMove={handleMouseMove}
          className={styles.showcaseStage}
          id={`sparky-panel-${currentFeature.id}`}
          role="tabpanel"
          aria-labelledby={`sparky-tab-${currentFeature.id}`}
        >
          <div className={styles.stageGrid}>
            {/* Left Column: Feature Description, Capabilities & Authentic Field Testimonial */}
            <div className={styles.featureInfo}>
              <span className={`${styles.badgePill} ${currentFeature.badgeStyle}`}>
                <span>⚡</span> {currentFeature.eyebrow}
              </span>
              <h3 className={styles.featureTitle}>{currentFeature.title}</h3>
              <p className={styles.featureBlurb}>{currentFeature.blurb}</p>

              <ul className={styles.bulletList} aria-label={`${currentFeature.tabLabel} Capabilities`}>
                {currentFeature.bullets.map((bullet) => (
                  <li key={bullet} className={styles.bulletItem}>
                    <span className={styles.bulletIcon} aria-hidden="true">
                      ✓
                    </span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {/* AUTHENTIC FIELD TESTIMONIAL MICRO-CARD */}
              <aside className={`${styles.testimonialMicroCard} ${currentFeature.cardStyle}`} aria-label="Contractor field review">
                <p className={styles.testimonialQuote}>{currentFeature.testimonial.quote}</p>
                <div className={styles.testimonialAuthorRow}>
                  <div className={styles.testimonialAuthorInfo}>
                    <span className={styles.testimonialAvatar} aria-hidden="true">
                      {currentFeature.testimonial.avatar}
                    </span>
                    <div>
                      <span className={styles.testimonialName}>{currentFeature.testimonial.author}</span> ·{' '}
                      <span className={styles.testimonialTrade}>{currentFeature.testimonial.tradeLocation}</span>
                    </div>
                  </div>
                  <span className={styles.testimonialVerifiedPill}>
                    {currentFeature.testimonial.verifiedProof}
                  </span>
                </div>
              </aside>

              <div className={styles.actionRow}>
                <Link className={styles.primaryLink} href={currentFeature.primaryHref}>
                  {currentFeature.primaryCtaText} <span aria-hidden="true">→</span>
                </Link>
                <Link className={styles.secondaryLink} href={currentFeature.secondaryHref}>
                  {currentFeature.secondaryCtaText}
                </Link>
              </div>
            </div>

            {/* Right Column: Live Interactive Hardware & Software Simulators */}
            <div className={styles.interactiveCanvas}>
              <div className={styles.canvasHeader}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span className={styles.windowDot} />
                  <span className={styles.windowDot} />
                  <span className={styles.windowDot} />
                </div>
                <span className={styles.canvasStatusPill}>
                  <span className={styles.pulseDot} aria-hidden="true" />
                  AI COPILOT MULTIMODAL SIMULATOR
                </span>
              </div>

              {/* SIMULATOR 1: TEXTS (LIVE INPUT CHAT SANDBOX & IOS SHELL) */}
              {activeTab === 'texts' && (
                <>
                  <div className={styles.canvasScenarioBar} role="radiogroup" aria-label="Select Text Scenario">
                    {TEXT_SCENARIOS.map((sc, idx) => {
                      const isSelected = activeTextScenario === idx && !userChatHistory;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          className={`${styles.scenarioChip} ${isSelected ? styles.scenarioChipActive : ''}`}
                          onClick={() => {
                            setActiveTextScenario(idx);
                            setUserChatHistory(null);
                          }}
                        >
                          {sc.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.phoneShell}>
                      <div className={styles.phoneStatusBar}>
                        <span>9:41 AM</span>
                        <span>5G 📶 100% 🔋</span>
                      </div>
                      <div className={styles.phoneHeader}>
                        <div className={styles.phoneAvatar}>⚡</div>
                        <div>
                          <p className={styles.phoneHeaderTitle}>AI Copilot · Let’s Get Quoted</p>
                          <p className={styles.phoneHeaderSub}>● Active Now · SMS Field Copilot</p>
                        </div>
                      </div>

                      <div className={styles.chatStream} aria-live="polite" aria-atomic="false">
                        <div className={styles.chatBubbleUser}>
                          {userChatHistory ? userChatHistory.userText : TEXT_SCENARIOS[activeTextScenario]?.userText}
                          <div style={{ fontSize: '0.65rem', opacity: 0.75, textAlign: 'right', marginTop: '2px' }}>
                            {userChatHistory ? userChatHistory.time : TEXT_SCENARIOS[activeTextScenario]?.userTimestamp}
                          </div>
                        </div>

                        {isTyping && (
                          <div className={styles.typingIndicator}>
                            <span className={styles.typingDot} />
                            <span className={styles.typingDot} style={{ animationDelay: '0.2s' }} />
                            <span className={styles.typingDot} style={{ animationDelay: '0.4s' }} />
                          </div>
                        )}

                        {!isTyping && (
                          <div className={styles.chatBubbleSparky}>
                            {userChatHistory ? userChatHistory.sparkyReply : TEXT_SCENARIOS[activeTextScenario]?.sparkyReply}
                            <div style={{ fontSize: '0.65rem', color: '#38bdf8', marginTop: '4px' }}>
                              {userChatHistory ? 'Instant Delivery' : TEXT_SCENARIOS[activeTextScenario]?.replyTimestamp}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Interactive Custom Text Sandbox Input */}
                      <form className={styles.customChatForm} onSubmit={handleCustomSubmit}>
                        <div className={styles.chatInputRow}>
                          <input
                            type="text"
                            className={styles.chatInput}
                            placeholder="Type any test command (e.g. Add $500 for lighting to Miller)..."
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            aria-label="Text AI Copilot simulator input"
                          />
                          <button type="submit" className={styles.chatSendBtn}>
                            Send SMS ↗
                          </button>
                        </div>
                        <div className={styles.quickPromptPills}>
                          <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Try:</span>
                          <button
                            type="button"
                            className={styles.quickPromptPill}
                            onClick={() => {
                              setCustomInput('Add $650 for shower waterproofing to Miller');
                            }}
                          >
                            +$650 Shower Tile
                          </button>
                          <button
                            type="button"
                            className={styles.quickPromptPill}
                            onClick={() => {
                              setCustomInput('Remind me tomorrow at 8am to call Jenkins');
                            }}
                          >
                            ⏰ Call Reminder
                          </button>
                          <button
                            type="button"
                            className={styles.quickPromptPill}
                            onClick={() => {
                              setCustomInput('Reschedule 142 Elm St to Thursday 10am');
                            }}
                          >
                            🔄 Reschedule Job
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className={styles.liveJobPreviewCard}>
                      <div className={styles.liveJobHead}>
                        <span>LIVE RECONCILED JOB RECORD</span>
                        <span style={{ color: '#38bdf8' }}>PORTAL SYNCED</span>
                      </div>
                      <div className={styles.liveJobAmount}>
                        <span>
                          {userChatHistory
                            ? userChatHistory.diffTitle
                            : TEXT_SCENARIOS[activeTextScenario]?.financialDiff}
                        </span>
                        <span>
                          {userChatHistory
                            ? userChatHistory.diffAmount
                            : TEXT_SCENARIOS[activeTextScenario]?.newTotal}
                        </span>
                      </div>
                      <small style={{ color: '#94a3b8' }}>
                        Target: {TEXT_SCENARIOS[activeTextScenario]?.jobRef} · {TEXT_SCENARIOS[activeTextScenario]?.marginPill}
                      </small>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 2: IMAGES (BEFORE/AFTER SLIDER & AR VISION HUD) */}
              {activeTab === 'images' && (
                <>
                  <div className={styles.canvasScenarioBar} role="radiogroup" aria-label="Select Image Inspection">
                    {IMAGE_SCENARIOS.map((sc, idx) => {
                      const isSelected = activeImageScenario === idx;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          className={`${styles.scenarioChip} ${isSelected ? styles.scenarioChipActive : ''}`}
                          onClick={() => setActiveImageScenario(idx)}
                        >
                          {sc.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.arVisionFrame}>
                      {/* Interactive Before / After Split View */}
                      <div
                        ref={imageSliderRef}
                        className={styles.beforeAfterContainer}
                        onPointerDown={handleSliderPointerDown}
                        onPointerMove={handleSliderPointerMove}
                        onPointerUp={handleSliderPointerUp}
                        onPointerCancel={handleSliderPointerUp}
                        role="slider"
                        aria-label="Before and after AI vision comparison slider"
                        aria-valuemin={5}
                        aria-valuemax={95}
                        aria-valuenow={sliderPos}
                        tabIndex={0}
                        onKeyDown={handleSliderKeyDown}
                      >
                        <div className={styles.laserScanLine} aria-hidden="true" />

                        {/* Raw Unaltered Photo Side (Background) */}
                        <div className={styles.rawSide}>
                          <img
                            src={IMAGE_SCENARIOS[activeImageScenario]?.imageSrc}
                            alt={IMAGE_SCENARIOS[activeImageScenario]?.label}
                            className={styles.visionBgImage}
                            draggable={false}
                          />
                          <div className={styles.rawSideOverlay}>
                            <span className={styles.rawPhotoBadge}>
                              📷 RAW TEXTED PHOTO
                            </span>
                            <b className={styles.rawPhotoTitle}>
                              {IMAGE_SCENARIOS[activeImageScenario]?.imageFile}
                            </b>
                            <small className={styles.rawPhotoSub}>Unprocessed camera upload</small>
                          </div>
                        </div>

                        {/* AI Vision Layer (Clipped by slider position) */}
                        <div
                          className={styles.arSide}
                          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                        >
                          <img
                            src={IMAGE_SCENARIOS[activeImageScenario]?.imageSrc}
                            alt={IMAGE_SCENARIOS[activeImageScenario]?.label}
                            className={styles.visionBgImageAr}
                            draggable={false}
                          />
                          <div className={styles.arMeshOverlay} aria-hidden="true" />
                          <div className={styles.arHudLayer}>
                            <div className={styles.arReticleBox}>
                              <div className={styles.arTagHeader}>
                                ✦ AI VISION · {IMAGE_SCENARIOS[activeImageScenario]?.confidence}
                              </div>
                              <div className={styles.arMetadataRow}>
                                <div className={`${styles.arMetaBlock} ${activeVisionLayer === 'ocr' ? styles.arMetaBlockActive : ''}`}>
                                  <small className={styles.arMetaLabel}>OCR DETECTED</small>
                                  <b className={styles.arMetaValue}>{IMAGE_SCENARIOS[activeImageScenario]?.plateOcr}</b>
                                  <span className={styles.arMetaSub}>
                                    {IMAGE_SCENARIOS[activeImageScenario]?.techSpecs}
                                  </span>
                                </div>
                                <div className={`${styles.arMetaBlock} ${activeVisionLayer === 'heatmap' ? styles.arMetaBlockActive : ''}`}>
                                  <small className={styles.arMetaLabelRisk}>RISK SEGMENTATION</small>
                                  <span className={styles.arRiskValue}>
                                    {IMAGE_SCENARIOS[activeImageScenario]?.diagnosedIssue}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Draggable Divider Line & Knob Handle */}
                        <div
                          className={styles.sliderDivider}
                          style={{ left: `${sliderPos}%` }}
                          aria-hidden="true"
                        >
                          <div className={styles.sliderDividerHandle}>
                            <span>↔</span>
                          </div>
                        </div>
                      </div>

                      {/* Slider Control Bar */}
                      <div className={styles.sliderHintRow}>
                        <span>Drag slider to inspect AI optical layer:</span>
                        <input
                          type="range"
                          min="5"
                          max="95"
                          value={sliderPos}
                          onChange={(e) => setSliderPos(Number(e.target.value))}
                          className={styles.sliderRangeInput}
                          aria-label="Before/After AI vision comparison slider"
                        />
                        <span style={{ fontWeight: 700, color: '#c084fc', minWidth: '55px', textAlign: 'right' }}>
                          {sliderPos}% AI
                        </span>
                      </div>

                      <div className={styles.visionLayerToggle}>
                        <span style={{ color: '#94a3b8' }} id="vision-layer-label">Optical Inspection Layer:</span>
                        <div className={styles.visionLayerPills} role="radiogroup" aria-labelledby="vision-layer-label">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={activeVisionLayer === 'ocr'}
                            tabIndex={activeVisionLayer === 'ocr' ? 0 : -1}
                            className={`${styles.layerPill} ${activeVisionLayer === 'ocr' ? styles.layerPillActive : ''}`}
                            onClick={() => setActiveVisionLayer('ocr')}
                          >
                            ✦ Bounding OCR
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={activeVisionLayer === 'heatmap'}
                            tabIndex={activeVisionLayer === 'heatmap' ? 0 : -1}
                            className={`${styles.layerPill} ${activeVisionLayer === 'heatmap' ? styles.layerPillActive : ''}`}
                            onClick={() => setActiveVisionLayer('heatmap')}
                          >
                            🏷️ Defect Scan
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={activeVisionLayer === 'picklist'}
                            tabIndex={activeVisionLayer === 'picklist' ? 0 : -1}
                            className={`${styles.layerPill} ${activeVisionLayer === 'picklist' ? styles.layerPillActive : ''}`}
                            onClick={() => setActiveVisionLayer('picklist')}
                          >
                            📋 Material List
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className={styles.liveJobPreviewCard} style={{ borderColor: 'rgba(192, 132, 252, 0.35)' }}>
                      <div className={styles.liveJobHead}>
                        <span>AUTO-GENERATED PICK-LIST &amp; COST</span>
                        <span style={{ color: '#c084fc' }}>
                          {IMAGE_SCENARIOS[activeImageScenario]?.confidence}
                        </span>
                      </div>
                      <div className={styles.liveJobAmount} style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                        <span>{IMAGE_SCENARIOS[activeImageScenario]?.materialsGenerated}</span>
                      </div>
                      <small style={{ color: '#34d399', fontWeight: 600 }}>
                        ✓ Photos automatically tagged and filed into Customer Folder
                      </small>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 3: VIDEOS (INTERACTIVE REEL STUDIO & WALKTHROUGH SCOPE) */}
              {activeTab === 'videos' && (
                <>
                  <div className={styles.canvasScenarioBar} role="radiogroup" aria-label="Select Video Reel Scenario">
                    {VIDEO_SCENARIOS.map((sc, idx) => {
                      const isSelected = activeVideoScenario === idx;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isSelected ? 0 : -1}
                          className={`${styles.scenarioChip} ${isSelected ? styles.scenarioChipActive : ''}`}
                          onClick={() => setActiveVideoScenario(idx)}
                        >
                          {sc.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.videoStudioPlayer}>
                      <div className={styles.videoViewport}>
                        <button type="button" className={styles.videoPlayButton} aria-label="Play video simulation">
                          ▶
                        </button>
                        <b style={{ color: '#ffffff', fontSize: '0.92rem' }}>
                          {VIDEO_SCENARIOS[activeVideoScenario]?.videoTitle}
                        </b>
                        <small style={{ color: '#94a3b8' }}>
                          {VIDEO_SCENARIOS[activeVideoScenario]?.specs} · 4K 60FPS
                        </small>
                        <div className={styles.videoScrubberBar}>
                          <div className={styles.videoScrubberProgress} />
                        </div>
                      </div>

                      <div className={styles.videoScopeTimestamps}>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
                          AI COPILOT EXTRACTED SCOPE TIMESTAMPS:
                        </span>
                        {VIDEO_SCENARIOS[activeVideoScenario]?.timestamps.map((ts) => (
                          <div key={ts.time} className={styles.timestampRow}>
                            <span className={styles.timestampTag}>{ts.time}</span>
                            <span>{ts.note}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.liveJobPreviewCard} style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}>
                      <div className={styles.liveJobHead}>
                        <span>MOBILE VIDEO SPEED &amp; CODEC COMPLIANCE</span>
                        <span style={{ color: '#34d399' }}>HARDWARE ACCELERATED</span>
                      </div>
                      <p style={{ color: '#f8fafc', margin: '4px 0 0', fontSize: '0.86rem', fontWeight: 600 }}>
                        {VIDEO_SCENARIOS[activeVideoScenario]?.compliance}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* SIMULATOR 4: VOICE (18-BAR EQUALIZER & DRIVEWAY-TO-QUOTE CONVERTER) */}
              {activeTab === 'voice' && (
                <>
                  <div className={styles.canvasScenarioBar} role="group" aria-label="Select Voice Scenario">
                    {VOICE_SCENARIOS.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`${styles.scenarioChip} ${activeVoiceScenario === idx ? styles.scenarioChipActive : ''}`}
                        onClick={() => setActiveVoiceScenario(idx)}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.canvasBody}>
                    <div className={styles.voiceEqualizerBox}>
                      <div className={styles.spectrumHeader}>
                        <small style={{ color: '#38bdf8', fontWeight: 700 }}>
                          🎙️ LIVE MULTIMODAL AUDIO SPECTRUM (18-BAND NOISE FILTER)
                        </small>
                        <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>
                          ● RECORDING LIVE
                        </span>
                      </div>

                      <div className={styles.spectrumBars} aria-hidden="true">
                        {[0.1, 0.4, 0.2, 0.6, 0.3, 0.8, 0.5, 0.2, 0.7, 0.4, 0.9, 0.3, 0.6, 0.2, 0.5, 0.7, 0.3, 0.1].map(
                          (delay, i) => (
                            <span
                              key={i}
                              className={styles.spectrumBar}
                              style={{ animationDelay: `${delay}s` }}
                            />
                          ),
                        )}
                      </div>

                      <p style={{ color: '#cbd5e1', fontSize: '0.82rem', fontFamily: 'monospace', margin: 0 }}>
                        {VOICE_SCENARIOS[activeVoiceScenario]?.transcript}
                      </p>
                    </div>

                    <div className={styles.drivewayQuoteCard}>
                      <div className={styles.drivewayQuoteHead}>
                        <span>{VOICE_SCENARIOS[activeVoiceScenario]?.quoteTitle}</span>
                        <span style={{ color: '#34d399' }}>
                          {VOICE_SCENARIOS[activeVoiceScenario]?.status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', margin: '4px 0' }}>
                        {VOICE_SCENARIOS[activeVoiceScenario]?.lineItems.map((item) => (
                          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#e2e8f0' }}>
                            <span>{item.name}</span>
                            <span style={{ fontWeight: 600 }}>{item.cost}</span>
                          </div>
                        ))}
                      </div>

                      <div className={styles.drivewayQuoteTotal}>
                        <span>Total Quote Amount:</span>
                        <span>{VOICE_SCENARIOS[activeVoiceScenario]?.total}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bottom Trust & Tech Benchmarks */}
          <div className={styles.bottomTrustRow}>
            <div className={styles.trustStat}>
              <b>⚡ Zero App Friction</b>
              <span>Run quotes, jobs &amp; reminders directly through Apple iMessage &amp; Android SMS</span>
            </div>
            <div className={styles.trustStat}>
              <b>📸 Multimodal Vision OCR</b>
              <span>Reads equipment plates, logs receipts &amp; detects structural damage from photos</span>
            </div>
            <div className={styles.trustStat}>
              <b>🎥 Video &amp; Voice Grounded</b>
              <span>Analyzes walkthrough videos &amp; turns driveway brain dumps into send-ready quotes</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
