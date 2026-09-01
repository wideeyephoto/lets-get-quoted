'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { TRADES } from '@/lib/trades';
import { TRADE_CATEGORIES } from '@/lib/trade-categories';
import { seasonalTrades } from '@/lib/trade-collections';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './for-mockup.module.css';

const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

interface HeroTradeDemo {
  id: string;
  name: string;
  companyName: string;
  domainUrl: string;
  badge: string;
  icon: string;
  serviceTitle: string;
  unitLabel: string;
  defaultUnits: number;
  unitStep: number;
  minUnits: number;
  maxUnits: number;
  baseRate: number;
  unitSuffix: string;
  defaultOptions: { name: string; cost: number; checked: boolean }[];
  quoteItems: { name: string; qty: string; total: number }[];
  crewTech: string;
  vanNumber: string;
  dispatchTime: string;
  customerName: string;
  customerAddress: string;
}

const HERO_TRADES: Record<string, HeroTradeDemo> = {
  plumbers: {
    id: 'plumbers',
    name: 'Plumbing & Drains',
    companyName: 'Apex Flow Plumbing & Mechanical',
    domainUrl: 'apexflowplumbing.letsgetquoted.site/estimate',
    badge: 'EMERGENCY · HOT LEAD',
    icon: '🔧',
    serviceTitle: 'Tankless Water Heater Replacement',
    unitLabel: 'Home Fixtures & Capacity',
    defaultUnits: 3,
    unitStep: 1,
    minUnits: 1,
    maxUnits: 8,
    baseRate: 950,
    unitSuffix: 'baths',
    defaultOptions: [
      { name: 'Rheem 199k BTU High-Efficiency Condensing Tankless', cost: 1850, checked: true },
      { name: 'Gas Line Expansion, Shutoff Valve & Thermal Tank', cost: 420, checked: true },
      { name: 'Same-Day Priority Master Plumber Dispatch', cost: 250, checked: false },
    ],
    quoteItems: [
      { name: 'Rheem RTGH-95DVLN Condensing Unit (199k BTU)', qty: '1 unit', total: 1850 },
      { name: 'Gas line adapt, expansion tank & shutoff kit', qty: '1 pkg', total: 420 },
      { name: 'Licensed Master Plumber Install, Permit & Haul-Away', qty: '5 hrs', total: 1250 },
    ],
    crewTech: 'Dave M. & Jason K. (Master Techs)',
    vanNumber: 'Service Van #04',
    dispatchTime: 'Today · 8:30 AM – 10:30 AM',
    customerName: 'Sarah Jenkins',
    customerAddress: '1428 Elm Ridge Rd · 3.4 mi',
  },
  hvac: {
    id: 'hvac',
    name: 'HVAC & Heat Pumps',
    companyName: 'Arctic Air Solutions & Geothermal',
    domainUrl: 'arcticairpros.com/instant-quote',
    badge: 'HIGH VALUE · REPLACEMENT',
    icon: '❄️',
    serviceTitle: '4-Ton Inverter Heat Pump & Air Handler',
    unitLabel: 'Home Size (Sq Ft)',
    defaultUnits: 2400,
    unitStep: 100,
    minUnits: 1000,
    maxUnits: 4500,
    baseRate: 3.6,
    unitSuffix: 'sq ft',
    defaultOptions: [
      { name: 'Bosch 20 SEER2 Variable Speed Inverter Condenser', cost: 5800, checked: true },
      { name: '10 kW Electric Heat Strip & Custom Transition Plenum', cost: 950, checked: true },
      { name: 'Ecobee Smart Thermostat Pro with Remote Room Sensors', cost: 350, checked: true },
    ],
    quoteItems: [
      { name: 'Bosch BOVA-60HDN1 Variable Inverter 20 SEER2', qty: '1 unit', total: 5800 },
      { name: 'Air handler transition, lineset & electrical disconnect', qty: '1 lot', total: 1450 },
      { name: 'Complete system install, nitrogen test & vacuum', qty: '1 day', total: 2200 },
    ],
    crewTech: 'Carlos M. & Derek T.',
    vanNumber: 'Install Rig #02',
    dispatchTime: 'Tomorrow · 7:30 AM – 4:00 PM',
    customerName: 'Marcus Vance',
    customerAddress: '884 Meadow View Dr · 5.8 mi',
  },
  roofers: {
    id: 'roofers',
    name: 'Roofing & Gutters',
    companyName: 'Summit Shield Roofing & Exteriors',
    domainUrl: 'summitshieldroofs.com/estimate',
    badge: 'STORM SCOPE · HIGH TICKET',
    icon: '🏠',
    serviceTitle: 'Architectural Shingle Roof Replacement',
    unitLabel: 'Roof Area (Squares)',
    defaultUnits: 28,
    unitStep: 1,
    minUnits: 12,
    maxUnits: 65,
    baseRate: 460,
    unitSuffix: 'squares (2,800 sq ft)',
    defaultOptions: [
      { name: 'GAF Timberline HDZ Architectural Shingles with StainGuard', cost: 7200, checked: true },
      { name: 'Ice & Water Shield on Eaves, Valleys & Pipe Boots', cost: 1100, checked: true },
      { name: '6" Seamless Aluminum Gutters & Micro-Mesh Leaf Guards', cost: 1650, checked: false },
    ],
    quoteItems: [
      { name: 'GAF Timberline Shingles + Deck Armor Synthetic Underlay', qty: '28 sq', total: 8400 },
      { name: 'Ice & Water shield, starter strip, Cobra ridge vent', qty: '1 pkg', total: 1850 },
      { name: 'Tear-off, dump trailer & 6-tech crew roof labor', qty: '1 day', total: 3950 },
    ],
    crewTech: 'Roof Crew Alpha (Lead: Brian)',
    vanNumber: 'Dump Trailer + Truck #01',
    dispatchTime: 'Monday · 7:00 AM Sharp',
    customerName: 'Robert & Emily Chen',
    customerAddress: '204 Whispering Pines · 4.1 mi',
  },
  electricians: {
    id: 'electricians',
    name: 'Electrical & Solar',
    companyName: 'VoltCraft Master Electric & EV',
    domainUrl: 'voltcraftenergy.site/panel-upgrade',
    badge: 'HOT LEAD · PANEL UPGRADE',
    icon: '⚡',
    serviceTitle: '200A Service Upgrade + Tesla Level 2 EV Charger',
    unitLabel: 'Circuit Scope',
    defaultUnits: 4,
    unitStep: 1,
    minUnits: 1,
    maxUnits: 12,
    baseRate: 650,
    unitSuffix: 'dedicated circuits',
    defaultOptions: [
      { name: 'Square D QO 200A 42-Space Main Breaker Panel', cost: 1950, checked: true },
      { name: 'Tesla Universal Wall Connector 48A (60A Breaker)', cost: 750, checked: true },
      { name: 'Whole-Home Type 2 Surge Protective Device', cost: 380, checked: true },
    ],
    quoteItems: [
      { name: 'Square D 200A 42-Space Meter-Main Combo Panel', qty: '1 panel', total: 1950 },
      { name: '60A EV dedicated line with 6/3 Romex conduit run', qty: '45 ft', total: 850 },
      { name: 'Utility disconnect coordination & electrical permit', qty: '1 job', total: 1100 },
    ],
    crewTech: 'Kevin R. (Licensed Master Electrician)',
    vanNumber: 'Service Van #07',
    dispatchTime: 'Today · 1:00 PM – 3:00 PM',
    customerName: 'David Sterling',
    customerAddress: '512 Oakwood Lane · 2.9 mi',
  },
  landscapers: {
    id: 'landscapers',
    name: 'Landscaping & Hardscape',
    companyName: 'Stone & Timber Outdoor Living',
    domainUrl: 'stoneandtimber.site/quote',
    badge: 'HARDSCAPE · HIGH MARGIN',
    icon: '🌿',
    serviceTitle: '600 Sq Ft Paver Patio & Stone Fire Pit',
    unitLabel: 'Patio Area (Sq Ft)',
    defaultUnits: 600,
    unitStep: 25,
    minUnits: 200,
    maxUnits: 1800,
    baseRate: 14.5,
    unitSuffix: 'sq ft pavers',
    defaultOptions: [
      { name: 'Belgard Dimensions Slate 3-Piece Pavers', cost: 4600, checked: true },
      { name: 'Built-In Freestanding Gas Fire Pit with Lava Rock', cost: 1850, checked: true },
      { name: 'Low-Voltage LED Paver Step & Perimeter Lighting', cost: 850, checked: false },
    ],
    quoteItems: [
      { name: 'Belgard Slate pavers + polymeric sand joint lock', qty: '600 sq ft', total: 5400 },
      { name: '6" crushed aggregate base with geotextile sub-wrap', qty: '14 tons', total: 1650 },
      { name: 'Excavation, grading, compaction & mason crew labor', qty: '3 days', total: 3200 },
    ],
    crewTech: 'Hardscape Crew (Lead: Mateo)',
    vanNumber: 'Skid Steer + Flatbed #03',
    dispatchTime: 'Thursday · 8:00 AM',
    customerName: 'Jessica Morales',
    customerAddress: '730 Highland Crest · 6.2 mi',
  },
};

const TESTIMONIALS = [
  {
    quote: "Our old website had a generic 'Contact Us' box that gave us zero job details. Now customers get an instant tankless estimate, pick their model, and we close 4x more jobs from our phone.",
    author: 'Dan Kowalski',
    business: 'Apex Flow Plumbing & Heating',
    location: 'Columbus, OH · 4 Techs',
    metric: '4x Higher Quote Acceptance',
    trade: 'Plumbing',
  },
  {
    quote: "In roofing, storm season is chaotic. Let's Get Quoted sends itemized proposals with deposit links while our drone is still in the air. Homeowners e-sign before the competitor even calls back.",
    author: 'Tyler Vance',
    business: 'Summit Shield Roofing',
    location: 'Dallas-Fort Worth, TX · 12 Techs',
    metric: '$1.4M Quoted in 6 Months',
    trade: 'Roofing',
  },
  {
    quote: "We used to pay Jobber $350/mo all 12 months, even in January and February when snow work was light. On Flex, our base bill is $0/mo in the winter. That alone saved our crew over $3,500/year.",
    author: 'Elena Rostova',
    business: 'GreenScape Outdoor Living',
    location: 'Minneapolis, MN · 6 Techs',
    metric: '$3,800 Annual Software Savings',
    trade: 'Landscaping & Snow',
  },
];

const FAQS = [
  {
    q: 'Can I customize the pre-loaded services, rates, and intake questions for my trade?',
    a: 'Yes, 100%. Every trade comes with ready-to-use services, typical price formulas, and intake checklists out of the box, but you have complete control to edit prices, change formulas, upload your real photos, or add custom line items in seconds.',
  },
  {
    q: 'How does the $0/month Flex plan work for seasonal contractor businesses?',
    a: 'On Flex, there is no recurring monthly subscription fee. You get your contractor website, AI intake, quotes, dispatching, and Stripe checkout for $0/month. You only pay a 1.25% LGQ platform fee on completed payments. In slow or off-season months with zero card volume, your software bill is exactly $0.',
  },
  {
    q: 'Can I connect my own custom domain (e.g. yourbusiness.com) to my contractor website?',
    a: 'Absolutely. Custom domain hosting with automated SSL encryption is included on every plan—including the $0/mo Flex plan. You can also use a free letsgetquoted.site address until your domain is connected.',
  },
  {
    q: 'What if my contracting company operates across multiple trades (e.g. HVAC + Plumbing + Electrical)?',
    a: 'Let\'s Get Quoted fully supports multi-trade businesses. You can activate service catalogs and intake flows for multiple trades under one unified dashboard, schedule shared crews, and keep all customer records in one place.',
  },
  {
    q: 'How do deposits and customer payments reach my bank account?',
    a: 'Payments are processed directly through Stripe to your business checking account. When a customer accepts a quote and pays a deposit or invoice online, funds transfer directly on your standard Stripe payout schedule with zero middleman hold.',
  },
  {
    q: 'Does Let\'s Get Quoted sync with QuickBooks Online?',
    a: 'Yes. Direct real-time QuickBooks Online synchronization connects your customers, itemized invoices, sales tax, and payment records without any manual double entry.',
  },
];

export default function ForMockupExperience() {
  const [selectedHeroTradeKey, setSelectedHeroTradeKey] = useState<string>('plumbers');
  const [activeSimulatorTab, setActiveSimulatorTab] = useState<'intake' | 'quote' | 'dispatch' | 'payout'>('intake');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isAutoCycling, setIsAutoCycling] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'good' | 'better' | 'best'>('better');

  // Live Simulator state for the hero
  const heroData = HERO_TRADES[selectedHeroTradeKey] || HERO_TRADES.plumbers;
  const [unitCount, setUnitCount] = useState<number>(heroData.defaultUnits);
  const [options, setOptions] = useState(heroData.defaultOptions);
  const [quoteSigned, setQuoteSigned] = useState(false);
  const [estimateRequested, setEstimateRequested] = useState(false);

  // Seasonal savings calculator state
  const [seasonalActiveMonths, setSeasonalActiveMonths] = useState(7);
  const [seasonalMonthlyRevenue, setSeasonalMonthlyRevenue] = useState(35000);

  const searchInputId = useId();
  const tradeKeys = Object.keys(HERO_TRADES);

  // Auto-tour cycler
  useEffect(() => {
    if (!isAutoCycling) return;
    const interval = setInterval(() => {
      setSelectedHeroTradeKey((curr) => {
        const nextIdx = (tradeKeys.indexOf(curr) + 1) % tradeKeys.length;
        const nextKey = tradeKeys[nextIdx];
        const newHero = HERO_TRADES[nextKey];
        if (newHero) {
          setUnitCount(newHero.defaultUnits);
          setOptions(newHero.defaultOptions);
          setQuoteSigned(false);
          setEstimateRequested(false);
        }
        return nextKey;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [isAutoCycling, tradeKeys]);

  // Switch hero trade
  const handleSelectTrade = (tradeKey: string) => {
    setIsAutoCycling(false);
    setSelectedHeroTradeKey(tradeKey);
    const newHero = HERO_TRADES[tradeKey];
    if (newHero) {
      setUnitCount(newHero.defaultUnits);
      setOptions(newHero.defaultOptions);
      setQuoteSigned(false);
      setEstimateRequested(false);
    }
  };

  const toggleOption = (index: number) => {
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, checked: !opt.checked } : opt))
    );
  };

  // Calculate live estimate values
  const optionsTotal = options.filter((o) => o.checked).reduce((sum, o) => sum + o.cost, 0);
  const tierMultiplier = selectedTier === 'good' ? 0.88 : selectedTier === 'best' ? 1.25 : 1.0;
  const calculatedSubtotal = Math.round((unitCount * heroData.baseRate + optionsTotal) * tierMultiplier);
  const estimateLow = Math.round(calculatedSubtotal * 0.92);
  const estimateHigh = Math.round(calculatedSubtotal * 1.15);
  const depositAmount = Math.round(calculatedSubtotal * 0.2);

  // Stripe & fee calculations for the payout tab
  const flexFee = calculatedSubtotal * 0.0125;
  const growthFee = calculatedSubtotal * 0.0025;
  const stripeFee = calculatedSubtotal * 0.029 + 0.3;
  const netPayoutFlex = calculatedSubtotal - flexFee - stripeFee;

  // Filter 49+ trades from actual TRADES dataset
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    TRADE_CATEGORIES.forEach((cat) => {
      cat.slugs.forEach((slug) => map.set(slug, cat.id));
    });
    return map;
  }, []);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    TRADE_CATEGORIES.forEach((cat) => map.set(cat.id, cat.label));
    return map;
  }, []);

  const filteredTrades = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return TRADES.filter((trade) => {
      const catId = categoryMap.get(trade.slug) || 'other';
      const matchCategory = selectedCategory === 'all' || catId === selectedCategory;
      if (!matchCategory) return false;
      if (!q) return true;
      const haystack = `${trade.name} ${trade.headline} ${trade.services.join(' ')} ${categoryLabelMap.get(catId) || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, searchQuery, categoryMap, categoryLabelMap]);

  // Seasonal savings comparison math
  const competitorAnnualCost = 299 * 12 + 600; // $4,188/yr (Jobber/ServiceTitan base + seat add-ons)
  const lgqAnnualVolume = seasonalMonthlyRevenue * seasonalActiveMonths;
  const lgqFlexAnnualFee = lgqAnnualVolume * 0.0125; // Flex 1.25% fee on volume

  return (
    <div className={styles.pageWrapper}>
      {/* Background ambient light orbs & grid textures matching Pricing theme */}
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />

      {/* Nav */}
      <header className={styles.siteNav}>
        <Link className={styles.brandLockup} href="/">
          <span className={styles.brandMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18">
              <path d="M4 14.5L9.5 20 20 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={styles.brandName}>Let’s Get Quoted</span>
        </Link>

        <nav className={styles.navLinks} aria-label="Main Navigation">
          <Link href="/features/website-builder">Website</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/for-mockup" aria-current="page" className={styles.activeNav}>For your trade</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/founder">Founder</Link>
          <a href="https://app.letsgetquoted.com/login">Sign in</a>
          <a href={APP_SIGNUP_URL} className={styles.navCta}>
            Build my free site <span aria-hidden="true">→</span>
          </a>
        </nav>
      </header>

      <main className={styles.pageContainer}>
        {/* =========================================================================
            1. HERO SECTION: SPLIT 2-COL WITH ENHANCED LUXURY TRADE ENGINE SIMULATOR
            ========================================================================= */}
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.pulseDot} aria-hidden="true" />
              PRECONFIGURED FOR {TRADES.length}+ TRADES · ZERO SETUP FEE
            </p>
            <h1 id="hero-title">
              Your trade. Your workflow. <em>Pre-tuned from day one.</em>
            </h1>
            <p className={styles.heroDescription}>
              From an AI contractor website and instant smart estimator to itemized quotes, crew dispatch, and Stripe payouts—all pre-loaded with the exact services, rates, and intake questions your trade uses.
            </p>

            <div className={styles.heroActions}>
              <a className={styles.btnPrimary} href={APP_SIGNUP_URL}>
                Build my free site ($0/mo) <span aria-hidden="true">→</span>
              </a>
              <a className={styles.btnSecondary} href="#trades-directory">
                Search all {TRADES.length} trades <span aria-hidden="true">↓</span>
              </a>
            </div>

            <ul className={styles.assurances} aria-label="Included with every trade plan">
              <li>✓ Trade website included</li>
              <li>✓ Pre-loaded service menu</li>
              <li>✓ Flex plan is $0/month</li>
              <li>✓ Direct Stripe payouts</li>
            </ul>

            <div className={styles.momentumNote} aria-label="Seasonal contractor economics">
              <span aria-hidden="true">↗</span>
              <div>
                <strong>Seasonal trade? Pay $0/month in the off-season.</strong>
                <small>Flex base fee is $0/mo. Never pay a $300/mo software bill during quiet winter months.</small>
              </div>
            </div>
          </div>

          {/* Right Column: Enhanced Luxury Multi-Trade Engine Showcase with Browser Chrome & Floating Stat Badges */}
          <div className={styles.heroVisualWrapper}>
            {/* Top-Right Floating Live Stat Card */}
            <div className={`${styles.floatingStatBadge} ${styles.topRightStat}`} aria-hidden="true">
              <div className={`${styles.statIconWrap} ${styles.mintGlow}`}>✓</div>
              <div>
                <strong>+${money.format(calculatedSubtotal)}.00 Deposit Paid</strong>
                <small>Stripe Direct Payout · {heroData.customerName}</small>
              </div>
            </div>

            {/* Bottom-Left Floating Live Crew Status */}
            <div className={`${styles.floatingStatBadge} ${styles.bottomLeftStat}`} aria-hidden="true">
              <div className={`${styles.statIconWrap} ${styles.orangeGlow}`}>🚐</div>
              <div>
                <strong>{heroData.crewTech.split(' ')[0]} En Route</strong>
                <small>{heroData.vanNumber} · {heroData.dispatchTime.split('·')[1] || 'On Schedule'}</small>
              </div>
            </div>

            {/* Main Showcase Stage */}
            <div className={styles.tradeEngineCard} aria-label="Interactive Trade Engine Simulator">
              <div className={`${styles.visualOrbit} ${styles.orbitOne}`} aria-hidden="true" />
              <div className={`${styles.visualOrbit} ${styles.orbitTwo}`} aria-hidden="true" />

              {/* Mac/Browser Top Window Header */}
              <div className={styles.browserWindowHeader}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span className={`${styles.dot} ${styles.dotRed}`} />
                  <span className={`${styles.dot} ${styles.dotYellow}`} />
                  <span className={`${styles.dot} ${styles.dotGreen}`} />
                </div>

                <div className={styles.browserDomainPill}>
                  <span className={styles.sslLock}>🔒</span>
                  <span className={styles.domainText}>{heroData.domainUrl}</span>
                </div>

                <div>
                  <button
                    type="button"
                    className={`${styles.btnTourToggle} ${isAutoCycling ? styles.btnTourTouring : ''}`}
                    onClick={() => setIsAutoCycling(!isAutoCycling)}
                    title="Automatically tour through trade setups"
                  >
                    {isAutoCycling ? '⏸ Pause Tour' : '▶ Auto-Tour'}
                  </button>
                </div>
              </div>

              {/* Trade Switcher Pills Row */}
              <div className={styles.tradePillSelector} role="tablist" aria-label="Select Trade to Preview">
                {Object.keys(HERO_TRADES).map((key) => {
                  const item = HERO_TRADES[key];
                  const active = key === selectedHeroTradeKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`${styles.tradePillBtn} ${active ? styles.tradePillBtnActive : ''}`}
                      onClick={() => handleSelectTrade(key)}
                    >
                      <span>{item.icon}</span>
                      <b>{item.name.split(' ')[0]}</b>
                    </button>
                  );
                })}
              </div>

              {/* Simulator Header & View Mode Switcher */}
              <div className={styles.simulatorHeader}>
                <div className={styles.simTitleGroup}>
                  <div className={styles.companyMetaRow}>
                    <span className={styles.simBadge}>{heroData.badge}</span>
                    <span className={styles.simCompanyName}>{heroData.companyName}</span>
                  </div>
                  <h3>{heroData.serviceTitle}</h3>
                </div>
                <div className={styles.simTabControls} role="tablist" aria-label="Simulator Views">
                  <button
                    type="button"
                    className={`${styles.simTab} ${activeSimulatorTab === 'intake' ? styles.simTabActive : ''}`}
                    onClick={() => setActiveSimulatorTab('intake')}
                  >
                    1. AI Intake
                  </button>
                  <button
                    type="button"
                    className={`${styles.simTab} ${activeSimulatorTab === 'quote' ? styles.simTabActive : ''}`}
                    onClick={() => setActiveSimulatorTab('quote')}
                  >
                    2. Proposal & E-Sign
                  </button>
                  <button
                    type="button"
                    className={`${styles.simTab} ${activeSimulatorTab === 'dispatch' ? styles.simTabActive : ''}`}
                    onClick={() => setActiveSimulatorTab('dispatch')}
                  >
                    3. Dispatch
                  </button>
                  <button
                    type="button"
                    className={`${styles.simTab} ${activeSimulatorTab === 'payout' ? styles.simTabActive : ''}`}
                    onClick={() => setActiveSimulatorTab('payout')}
                  >
                    4. Stripe Payout
                  </button>
                </div>
              </div>

              {/* Live Interactive Views */}
              <div className={styles.simulatorViewPane}>
                {/* VIEW 1: AI INTAKE & SMART ESTIMATOR */}
                {activeSimulatorTab === 'intake' && (
                  <div className={styles.fadeIn}>
                    <div className={styles.intakeStepBar}>
                      <span className={styles.intakeStepTag}>CUSTOMER WEBSITE EXPERIENCE · INSTANT ESTIMATE</span>
                      <span className={styles.intakeTime}>Calculated live in 45s</span>
                    </div>

                    <div className={styles.intakeSliderGroup}>
                      <div className={styles.sliderLabelRow}>
                        <label htmlFor="unit-slider">{heroData.unitLabel}:</label>
                        <strong>{unitCount} {heroData.unitSuffix}</strong>
                      </div>
                      <input
                        id="unit-slider"
                        type="range"
                        min={heroData.minUnits}
                        max={heroData.maxUnits}
                        step={heroData.unitStep}
                        value={unitCount}
                        onChange={(e) => setUnitCount(Number(e.target.value))}
                        className={styles.rangeInput}
                      />
                    </div>

                    <div className={styles.intakeOptionsList}>
                      <span className={styles.optionsTitle}>Scope & Specifications:</span>
                      {options.map((opt, idx) => (
                        <label key={opt.name} className={`${styles.optionCheckRow} ${opt.checked ? styles.optionSelected : ''}`}>
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={() => toggleOption(idx)}
                          />
                          <span className={styles.optionName}>{opt.name}</span>
                          <span className={styles.optionCost}>+${money.format(opt.cost)}</span>
                        </label>
                      ))}
                    </div>

                    <div className={styles.estimateResultBox}>
                      <div className={styles.calcPriceCol}>
                        <span className={styles.resultKicker}>AI CALCULATED ESTIMATE RANGE</span>
                        <strong className={styles.calcRange}>${money.format(estimateLow)} – ${money.format(estimateHigh)}</strong>
                        <small>20% Deposit required upon e-sign: ${money.format(depositAmount)}</small>
                      </div>
                      <button
                        type="button"
                        className={`${styles.btnDemoAction} ${estimateRequested ? styles.btnDemoSent : ''}`}
                        onClick={() => setEstimateRequested(true)}
                      >
                        {estimateRequested ? '✓ Inquiry Sent to Dashboard!' : 'Request Formal Quote →'}
                      </button>
                    </div>
                  </div>
                )}

                {/* VIEW 2: QUOTE & E-SIGN PROPOSAL */}
                {activeSimulatorTab === 'quote' && (
                  <div className={styles.fadeIn}>
                    <div className={styles.proposalHeader}>
                      <div>
                        <span className={styles.proposalNumber}>QUOTE #LGQ-2048 · PREPARED FOR HOMEOWNER</span>
                        <h4>{heroData.serviceTitle}</h4>
                        <p className={styles.customerMeta}>{heroData.customerName} · {heroData.customerAddress}</p>
                      </div>
                      <div>
                        {quoteSigned ? (
                          <span className={styles.statusSigned}>✓ E-SIGNED & DEPOSIT PAID</span>
                        ) : (
                          <span className={styles.statusPending}>PENDING CLIENT SIGNATURE</span>
                        )}
                      </div>
                    </div>

                    {/* Tier Switcher */}
                    <div className={styles.tierToggleStrip} role="group" aria-label="Proposal Option Tiers">
                      <button
                        type="button"
                        className={`${styles.tierBtn} ${selectedTier === 'good' ? styles.tierBtnActive : ''}`}
                        onClick={() => setSelectedTier('good')}
                      >
                        Good (Basic)
                      </button>
                      <button
                        type="button"
                        className={`${styles.tierBtn} ${selectedTier === 'better' ? styles.tierBtnActive : ''}`}
                        onClick={() => setSelectedTier('better')}
                      >
                        Better (Recommended)
                      </button>
                      <button
                        type="button"
                        className={`${styles.tierBtn} ${selectedTier === 'best' ? styles.tierBtnActive : ''}`}
                        onClick={() => setSelectedTier('best')}
                      >
                        Best (Premium Warranty)
                      </button>
                    </div>

                    <div className={styles.quoteLineItems}>
                      {heroData.quoteItems.map((item) => (
                        <div key={item.name} className={styles.lineItemRow}>
                          <div className={styles.itemDetails}>
                            <strong>{item.name}</strong>
                            <small>Qty: {item.qty} · Trade Certified Materials</small>
                          </div>
                          <span className={styles.itemPrice}>${money.format(Math.round(item.total * tierMultiplier))}</span>
                        </div>
                      ))}
                    </div>

                    {quoteSigned && (
                      <div className={styles.signatureStampBox}>
                        <span className={styles.signedStampCursive}>{heroData.customerName}</span>
                        <span className={styles.signedStampMeta}>Digitally e-signed via phone · IP Verified & Staged Deposit Captured</span>
                      </div>
                    )}

                    <div className={styles.quoteSummaryFooter}>
                      <div className={styles.quoteTotalsCol}>
                        <div className={styles.totalRow}><span>Total Proposal:</span><strong>${money.format(calculatedSubtotal)}</strong></div>
                        <div className={styles.depositRow}><span>20% Staged Deposit:</span><b>${money.format(depositAmount)}</b></div>
                      </div>
                      <button
                        type="button"
                        className={`${styles.btnSignDemo} ${quoteSigned ? styles.btnSigned : ''}`}
                        onClick={() => setQuoteSigned(!quoteSigned)}
                      >
                        {quoteSigned ? '✓ Accepted via Mobile E-Sign' : '1-Tap E-Sign & Pay Deposit →'}
                      </button>
                    </div>
                  </div>
                )}

                {/* VIEW 3: SMART DISPATCH & CREW CALENDAR */}
                {activeSimulatorTab === 'dispatch' && (
                  <div className={styles.fadeIn}>
                    <div className={styles.dispatchCard}>
                      <div className={styles.dispatchHeader}>
                        <div className={styles.crewAvatarIcon}>👷</div>
                        <div>
                          <span className={styles.dispatchKicker}>ASSIGNED FIELD CREW</span>
                          <h4>{heroData.crewTech}</h4>
                          <span className={styles.vanTag}>{heroData.vanNumber} · GPS Active</span>
                        </div>
                        <span className={styles.timeBadge}>{heroData.dispatchTime}</span>
                      </div>

                      <div className={styles.jobRouteDetails}>
                        <div className={styles.routeStep}>
                          <span className={styles.stepDot} />
                          <div>
                            <strong>Job Location: {heroData.customerAddress}</strong>
                            <p>Customer: {heroData.customerName} (Automated SMS window sent)</p>
                          </div>
                        </div>
                        <div className={styles.routeStep}>
                          <span className={styles.stepDot} />
                          <div>
                            <strong>Work Scope & Trade Equipment</strong>
                            <p>{heroData.serviceTitle} · Inventory staged on {heroData.vanNumber}</p>
                          </div>
                        </div>
                      </div>

                      <div className={styles.crewQuickActions}>
                        <span className={styles.actionPill}>📞 Call Client</span>
                        <span className={styles.actionPill}>🗺️ Launch Route Navigation</span>
                        <span className={styles.actionPill}>📷 Attach Job Photos</span>
                        <span className={`${styles.actionPill} ${styles.actionPillReady}`}>✓ On Schedule</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 4: STRIPE PAYOUT WATERFALL */}
                {activeSimulatorTab === 'payout' && (
                  <div className={styles.fadeIn}>
                    <div className={styles.payoutHeader}>
                      <span className={styles.payoutKicker}>DIRECT STRIPE BANK DEPOSIT</span>
                      <h4>${money.format(calculatedSubtotal)} Total Collected Online</h4>
                      <p>Funds transfer directly to your business bank account with zero middleman hold</p>
                    </div>

                    <div className={styles.payoutWaterfall}>
                      <div className={styles.waterfallRow}>
                        <span>Total Invoice Amount</span>
                        <strong>+${money.format(calculatedSubtotal)}.00</strong>
                      </div>
                      <div className={`${styles.waterfallRow} ${styles.feeRow}`}>
                        <span>Flex Platform Fee (1.25%)</span>
                        <strong className={styles.feeText}>-${flexFee.toFixed(2)}</strong>
                      </div>
                      <div className={`${styles.waterfallRow} ${styles.feeRow}`}>
                        <span>Stripe Processing (2.9% + 30¢)</span>
                        <strong className={styles.feeText}>-${stripeFee.toFixed(2)}</strong>
                      </div>
                      <div className={`${styles.waterfallRow} ${styles.totalDepositRow}`}>
                        <div>
                          <strong>Net Bank Payout (Flex $0/mo)</strong>
                          <small>Direct to checking · Zero monthly subscription bill</small>
                        </div>
                        <strong className={styles.depositAmount}>+${netPayoutFlex.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div className={styles.growthUpgradeCallout}>
                      <span>💡 On the <strong>Growth Plan</strong> (0.25% fee), you keep <strong>+${(flexFee - growthFee).toFixed(2)} more</strong> on this single job.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.simFooterNote}>
                <span>All {TRADES.length} trades include pre-built intake models, proposal templates, and dispatch workflows.</span>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            2. TRUST METRIC STRIP
            ========================================================================= */}
        <section className={styles.proofStrip} aria-label="Platform proof points">
          <div className={styles.proofItem}>
            <strong className={styles.proofMetric}>{TRADES.length} Trades</strong>
            <span>Pre-tuned service catalogs</span>
          </div>
          <div className={styles.proofItem}>
            <strong className={styles.proofMetric}>$0 / Month</strong>
            <span>Flex plan with no monthly bill</span>
          </div>
          <div className={styles.proofItem}>
            <strong className={styles.proofMetric}>No Card</strong>
            <span>Needed to build your site</span>
          </div>
          <div className={styles.proofItem}>
            <strong className={styles.proofMetric}>Direct Stripe</strong>
            <span>Payouts straight to your bank</span>
          </div>
          <div className={styles.proofItem}>
            <strong className={styles.proofMetric}>2-Way Sync</strong>
            <span>QuickBooks Online integrated</span>
          </div>
        </section>

        {/* =========================================================================
            3. "FOUR THINGS THAT CHANGE WHEN YOU PICK YOUR TRADE"
            ========================================================================= */}
        <section className={styles.featuresSection} aria-labelledby="features-title">
          <div className={styles.sectionHeaderCenter}>
            <p className={styles.eyebrow}>WHAT &ldquo;TUNED TO YOUR TRADE&rdquo; MEANS</p>
            <h2 id="features-title">Four things change the moment you select your trade.</h2>
            <p className={styles.sectionSubtitle}>
              Generic software forces you to spend weeks typing price lists and designing pages. Let’s Get Quoted launches with your trade’s real terminology pre-configured.
            </p>
          </div>

          <div className={styles.fourPillarsGrid}>
            <article className={styles.pillarCard}>
              <span className={styles.pillarNumber}>01</span>
              <div className={styles.pillarIcon}>🌐</div>
              <h3>Your Website & Domain</h3>
              <p>
                Professional templates built for your trade, with localized SEO copy for your towns and an instant quoting estimator pre-calibrated for your typical jobs.
              </p>
              <ul className={styles.pillarChecks}>
                <li>Pre-written trade service descriptions</li>
                <li>Instant estimate calculation widgets</li>
                <li>Custom domain with free SSL included</li>
              </ul>
            </article>

            <article className={styles.pillarCard}>
              <span className={styles.pillarNumber}>02</span>
              <div className={styles.pillarIcon}>📋</div>
              <h3>Your Service Menu & Rates</h3>
              <p>
                The jobs your trade actually quotes are already organized in your price book. You tweak your local hourly and material prices instead of starting from a blank page.
              </p>
              <ul className={styles.pillarChecks}>
                <li>Square-foot, linear-foot, or fixture pricing</li>
                <li>Pre-configured material & labor lines</li>
                <li>Good / Better / Best option tiers</li>
              </ul>
            </article>

            <article className={styles.pillarCard}>
              <span className={styles.pillarNumber}>03</span>
              <div className={styles.pillarIcon}>✍️</div>
              <h3>Your Quotes & Change Orders</h3>
              <p>
                Proposals start with the exact specifications, warranty terms, and staged deposit schedules standard in your trade. Clients can e-sign and pay from their phone.
              </p>
              <ul className={styles.pillarChecks}>
                <li>Mobile-friendly instant e-signatures</li>
                <li>Staged deposit milestones before work begins</li>
                <li>Itemized change orders with real-time totals</li>
              </ul>
            </article>

            <article className={styles.pillarCard}>
              <span className={styles.pillarNumber}>04</span>
              <div className={styles.pillarIcon}>📅</div>
              <h3>Your Seasonal Marketing & SMS</h3>
              <p>
                Seasonal reminders, tune-up campaigns, and review requests timed around your trade’s busy surges—like spring aeration, summer AC prep, and winter freeze checks.
              </p>
              <ul className={styles.pillarChecks}>
                <li>Automated 5-star Google review invites</li>
                <li>Seasonal re-engagement SMS broadcasts</li>
                <li>Maintenance membership auto-billing</li>
              </ul>
            </article>
          </div>
        </section>

        {/* =========================================================================
            4. SEASONAL TRADES ADVANTAGE & $0/MO OFF-SEASON CALCULATOR
            ========================================================================= */}
        <section className={styles.seasonalAdvantageSection} aria-labelledby="seasonal-title">
          <div className={styles.seasonalGridLayout}>
            <div className={styles.seasonalCopySide}>
              <span className={styles.seasonalPillBadge}>SEASONAL BUSINESS ADVANTAGE</span>
              <h2 id="seasonal-title">Busy season shouldn’t mean paying software bills all year.</h2>
              <p className={styles.seasonalLede}>
                Competitors like Jobber and ServiceTitan charge $250–$400+ every single month regardless of whether you have 30 jobs or zero jobs in the off-season.
              </p>
              <p className={styles.seasonalBody}>
                On the <strong>Let’s Get Quoted Flex Plan ($0/month)</strong>, you only pay a 1.25% fee when you collect card payments from homeowners. During quiet winter or off-season months, your base subscription is <strong>$0.00</strong>.
              </p>

              <div className={styles.seasonalTradeTags}>
                {seasonalTrades().map((st) => (
                  <Link key={st.slug} href={`/for/${st.slug}`} className={styles.tagChip}>
                    {st.name} {st.seasonality?.peakLabel ? `(${st.seasonality.peakLabel})` : ''}
                  </Link>
                ))}
              </div>
            </div>

            {/* Interactive Seasonal Calculator Card */}
            <div className={styles.seasonalCalcCard}>
              <div className={styles.calcCardHeader}>
                <h3>Seasonal Software Cost Comparison</h3>
                <span className={styles.calcSub}>See how much you save vs traditional monthly SaaS</span>
              </div>

              <div className={styles.calcSlidersContainer}>
                <div className={styles.calcSliderBlock}>
                  <div className={styles.calcLabelLine}>
                    <span>Active Busy Months Per Year:</span>
                    <strong>{seasonalActiveMonths} months</strong>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="12"
                    value={seasonalActiveMonths}
                    onChange={(e) => setSeasonalActiveMonths(Number(e.target.value))}
                    className={styles.rangeInput}
                  />
                  <div className={styles.rangeHints}><span>3 mo (Snow/Lights)</span><span>7 mo (Landscaping)</span><span>12 mo (Year-round)</span></div>
                </div>

                <div className={styles.calcSliderBlock}>
                  <div className={styles.calcLabelLine}>
                    <span>Avg Monthly Card Revenue in Season:</span>
                    <strong>${money.format(seasonalMonthlyRevenue)} / mo</strong>
                  </div>
                  <input
                    type="range"
                    min="10000"
                    max="100000"
                    step="5000"
                    value={seasonalMonthlyRevenue}
                    onChange={(e) => setSeasonalMonthlyRevenue(Number(e.target.value))}
                    className={styles.rangeInput}
                  />
                </div>
              </div>

              <div className={styles.calcComparisonResults}>
                <div className={`${styles.compareCol} ${styles.competitorCol}`}>
                  <span className={styles.colLabel}>Jobber / ServiceTitan</span>
                  <strong className={styles.colPrice}>${money.format(competitorAnnualCost)}<small>/yr</small></strong>
                  <span className={styles.colDesc}>Fixed $299/mo + fees all 12 months</span>
                </div>

                <div className={`${styles.compareCol} ${styles.lgqCol}`}>
                  <span className={styles.colLabel}>LGQ Flex ($0/mo base)</span>
                  <strong className={styles.colPrice}>${money.format(lgqFlexAnnualFee)}<small>/yr</small></strong>
                  <span className={styles.colDesc}>1.25% only when paid · $0 off-season</span>
                </div>
              </div>

              <div className={styles.savingsHighlightBanner}>
                <span className={styles.savingsKicker}>ESTIMATED ANNUAL SAVINGS</span>
                <strong className={styles.savingsAmount}>${money.format(Math.max(0, competitorAnnualCost - lgqFlexAnnualFee))} / year</strong>
                <small>Keep your cash flow in the off-season. Upgrade to subscription plans only when volume makes it cheaper.</small>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            5. INTERACTIVE 49-TRADE DIRECTORY & SEARCH FINDER
            ========================================================================= */}
        <section className={styles.directorySection} id="trades-directory" aria-labelledby="directory-title">
          <div className={styles.sectionHeaderCenter}>
            <p className={styles.eyebrow}>{TRADES.length} TRADES AND COUNTING</p>
            <h2 id="directory-title">Find your specific trade.</h2>
            <p className={styles.sectionSubtitle}>
              Search by your work type or specialty keyword—&ldquo;water heater&rdquo; finds plumbers, &ldquo;paver&rdquo; finds hardscapers, &ldquo;panel&rdquo; finds electricians.
            </p>
          </div>

          {/* Search & Category Filter Controls */}
          <div className={styles.directoryControlsBar}>
            <div className={styles.searchInputWrapper}>
              <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                id={searchInputId}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any trade or service (e.g. plumbing, turf, shingles, mini-split)..."
                className={styles.directorySearchInput}
              />
              {searchQuery && (
                <button type="button" className={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>

            <div className={styles.categoryPillsRow} role="tablist" aria-label="Filter trades by category">
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                className={`${styles.categoryPill} ${selectedCategory === 'all' ? styles.categoryPillActive : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All {TRADES.length} Trades
              </button>
              {TRADE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat.id}
                  className={`${styles.categoryPill} ${selectedCategory === cat.id ? styles.categoryPillActive : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.label} ({cat.slugs.length})
                </button>
              ))}
            </div>
          </div>

          <div className={styles.directoryResultsMeta}>
            <span className={styles.resultsCount}>
              Showing <strong>{filteredTrades.length}</strong> of {TRADES.length} trades
            </span>
          </div>

          {/* Trade Cards Grid */}
          <div className={styles.tradesCardsGrid}>
            {filteredTrades.map((trade) => {
              const catId = categoryMap.get(trade.slug) || 'other';
              const catLabel = categoryLabelMap.get(catId) || 'Specialty';
              return (
                <Link key={trade.slug} href={`/for/${trade.slug}`} className={styles.tradeDirectoryCard}>
                  <div className={styles.tradeCardTop}>
                    <span className={styles.tradeIconBox}>
                      {trade.slug.includes('roof') ? '🏠' :
                       trade.slug.includes('plumb') || trade.slug.includes('drain') ? '🔧' :
                       trade.slug.includes('electr') || trade.slug.includes('solar') ? '⚡' :
                       trade.slug.includes('hvac') || trade.slug.includes('heat') || trade.slug.includes('air') ? '❄️' :
                       trade.slug.includes('land') || trade.slug.includes('lawn') || trade.slug.includes('tree') ? '🌿' :
                       trade.slug.includes('paint') ? '🎨' :
                       trade.slug.includes('clean') || trade.slug.includes('wash') ? '🧹' :
                       trade.slug.includes('remodel') || trade.slug.includes('floor') || trade.slug.includes('carp') ? '🔨' : '🛠️'}
                    </span>
                    <div>
                      <span className={styles.tradeCategoryTag}>{catLabel}</span>
                      <h3 className={styles.tradeName}>{trade.name}</h3>
                    </div>
                    {trade.seasonality?.peakLabel && (
                      <span className={styles.tradeSeasonChip}>{trade.seasonality.peakLabel}</span>
                    )}
                  </div>

                  <p className={styles.tradeHeadline}>{trade.headline}</p>

                  <div className={styles.tradeServicesTags}>
                    {trade.services.slice(0, 4).map((srv) => (
                      <span key={srv} className={styles.srvTag}>{srv}</span>
                    ))}
                    {trade.services.length > 4 && (
                      <span className={`${styles.srvTag} ${styles.srvTagMore}`}>+{trade.services.length - 4} more</span>
                    )}
                  </div>

                  <div className={styles.tradeCardFooter}>
                    <span className={styles.avgTicketNote}>
                      {trade.economics?.avgTicket ? `Avg: ~$${money.format(trade.economics.avgTicket)}` : 'Full Software Suite'}
                    </span>
                    <span className={styles.tradeLink}>
                      Explore trade page <span aria-hidden="true">&rarr;</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className={styles.customTradeCallout}>
            <div className={styles.customTradeIcon}>🛠️</div>
            <div>
              <strong>Don&rsquo;t see your exact trade or run a custom specialty?</strong>
              <p>Every tool in Let&rsquo;s Get Quoted is 100% customizable. You can define your own services, formulas, questions, and templates in minutes.</p>
            </div>
            <a className={styles.btnSecondary} href={APP_SIGNUP_URL}>
              Start free with custom trade &rarr;
            </a>
          </div>
        </section>

        {/* =========================================================================
            6. CONTRACTOR SUCCESS STORIES
            ========================================================================= */}
        <section className={styles.testimonialsSection} aria-labelledby="testimonials-title">
          <div className={styles.sectionHeaderCenter}>
            <p className={styles.eyebrow}>PROVEN ON REAL JOBSITES</p>
            <h2 id="testimonials-title">Built for trade owners who want to win more work.</h2>
          </div>

          <div className={styles.testimonialsGrid}>
            {TESTIMONIALS.map((item) => (
              <article key={item.author} className={styles.testimonialCard}>
                <div className={styles.testimonialHeader}>
                  <span className={styles.tradeBadgeTag}>{item.trade}</span>
                  <span className={styles.metricPill}>{item.metric}</span>
                </div>
                <p className={styles.testimonialQuote}>&ldquo;{item.quote}&rdquo;</p>
                <div className={styles.testimonialAuthorBlock}>
                  <div className={styles.authorAvatar}>{item.author.charAt(0)}</div>
                  <div>
                    <strong>{item.author}</strong>
                    <span className={styles.authorBiz}>{item.business}</span>
                    <small className={styles.authorLoc}>{item.location}</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =========================================================================
            7. TRADE FAQS ACCORDION
            ========================================================================= */}
        <section className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.sectionHeaderCenter}>
            <p className={styles.eyebrow}>COMMON QUESTIONS</p>
            <h2 id="faq-title">Everything you need to know before starting.</h2>
            <p className={styles.sectionSubtitle}>Transparent answers about trade customization, pricing, and payouts.</p>
          </div>

          <div className={styles.faqAccordionList}>
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.q} className={`${styles.faqItem} ${isOpen ? styles.faqOpen : ''}`}>
                  <button
                    type="button"
                    className={styles.faqQuestionBtn}
                    aria-expanded={isOpen}
                    aria-controls={`for-mockup-faq-answer-${index}`}
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                  >
                    <span>{faq.q}</span>
                    <span className={styles.faqToggleIcon} aria-hidden="true">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div id={`for-mockup-faq-answer-${index}`} className={styles.faqAnswerPane}>
                      <p>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* =========================================================================
            8. HIGH-IMPACT CLOSING CTA BANNER
            ========================================================================= */}
        <section className={styles.closingCtaCard} aria-label="Get started today">
          <div className={styles.closingContent}>
            <p className={styles.eyebrow}>READY WHEN YOU ARE</p>
            <h2>Start on Flex for your trade. Upgrade only when the math works.</h2>
            <p className={styles.closingSub}>
              Flex is $0/month with zero monthly subscription bills. Paid plans lower the payment fee as low as 0.25% as your crew grows.
            </p>
            <div className={styles.closingButtonsRow}>
              <a className={styles.btnPrimary} href={APP_SIGNUP_URL}>
                Build my free trade website ($0/mo) <span aria-hidden="true">→</span>
              </a>
              <Link className={styles.btnSecondary} href="/pricing">
                Compare all plans on Pricing <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className={styles.closingFine}>No credit card required to start · Instant setup in under 3 minutes</p>
          </div>
        </section>
      </main>
    </div>
  );
}
