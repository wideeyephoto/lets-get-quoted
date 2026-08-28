'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './interactive-quote-upsell-demo.module.css';

type Addon = {
  id: string;
  name: string;
  desc: string;
  price: number;
};

type Tier = {
  id: 'standard' | 'premium' | 'deluxe';
  name: string;
  basePrice: number;
  summary: string;
  isPopular?: boolean;
};

type Scenario = {
  id: string;
  tabLabel: string;
  companyName: string;
  quoteNumber: string;
  trade: string;
  projectName: string;
  tiers: Tier[];
  addons: Addon[];
};

const SCENARIOS: Scenario[] = [
  {
    id: 'bathroom',
    tabLabel: '🚿 Bath Remodel',
    companyName: 'Brightline Bath & Tile',
    quoteNumber: '#1048',
    trade: 'Bathroom Remodeling',
    projectName: '60" Walk-In Shower Conversion',
    tiers: [
      {
        id: 'standard',
        name: 'Standard Package',
        basePrice: 5800,
        summary: 'Acrylic pan, subway tile surround & standard chrome fixtures.',
      },
      {
        id: 'premium',
        name: 'Premium Package',
        basePrice: 7600,
        summary: 'Low-threshold slate base, porcelain tile & brushed nickel hardware.',
        isPopular: true,
      },
      {
        id: 'deluxe',
        name: 'Deluxe Package',
        basePrice: 9900,
        summary: 'Zero-barrier curbless entry, frameless glass & dual thermostatic valves.',
      },
    ],
    addons: [
      {
        id: 'warranty',
        name: '5-Year Extended Workmanship Warranty',
        desc: '100% leak & grout coverage with annual checkup',
        price: 450,
      },
      {
        id: 'safety',
        name: 'Built-In Corner Bench & ADA Grab Bars',
        desc: 'Color-matched safety package anchored to framing',
        price: 520,
      },
      {
        id: 'niche',
        name: 'Dual Recessed Shampoo Niches with LED Accents',
        desc: 'Custom waterproofed tiled shelving',
        price: 380,
      },
    ],
  },
  {
    id: 'electrical',
    tabLabel: '⚡ Electrical & EV',
    companyName: 'Apex Electric Works',
    quoteNumber: '#2084',
    trade: 'Electrical Contracting',
    projectName: '200A Service Upgrade & Level 2 EV Charger',
    tiers: [
      {
        id: 'standard',
        name: 'Standard Upgrade',
        basePrice: 3200,
        summary: '200A main panel upgrade & whole-home surge protector.',
      },
      {
        id: 'premium',
        name: 'EV-Ready Package',
        basePrice: 4600,
        summary: '200A panel + 50A dedicated NEMA 14-50 garage circuit & charger.',
        isPopular: true,
      },
      {
        id: 'deluxe',
        name: 'Smart Energy Package',
        basePrice: 6800,
        summary: 'Smart electrical panel with app circuit monitoring & battery backup hookup.',
      },
    ],
    addons: [
      {
        id: 'conduit',
        name: 'Concealed Exterior Conduit Run',
        desc: 'Hidden wall routing with weatherized junction box',
        price: 340,
      },
      {
        id: 'generator',
        name: 'Manual Generator Interlock Kit',
        desc: 'Safe portable generator transfer switch for emergency power',
        price: 580,
      },
      {
        id: 'permit',
        name: 'City Permit & Expedited Inspection Fee',
        desc: 'Turnkey municipal paperwork & utility sign-off',
        price: 290,
      },
    ],
  },
  {
    id: 'roofing',
    tabLabel: '🏠 Roofing System',
    companyName: 'Summit Peak Roofing',
    quoteNumber: '#3142',
    trade: 'Roofing & Exteriors',
    projectName: '2,400 Sq Ft Architectural Shingle Replacement',
    tiers: [
      {
        id: 'standard',
        name: '30-Year Architectural',
        basePrice: 8900,
        summary: 'Class 3 architectural shingles, synthetic underlayment & drip edge.',
      },
      {
        id: 'premium',
        name: '50-Year High-Wind System',
        basePrice: 11400,
        summary: 'Class 4 impact shingles, ice & water barrier at eaves & ridge vents.',
        isPopular: true,
      },
      {
        id: 'deluxe',
        name: 'Lifetime Standing Seam Metal',
        basePrice: 16800,
        summary: 'Commercial-grade hidden fastener metal roof with maximum hail rating.',
      },
    ],
    addons: [
      {
        id: 'gutters',
        name: 'Seamless 6" Aluminum Gutters & Leaf Guards',
        desc: 'Complete perimeter drainage with custom downspouts',
        price: 1250,
      },
      {
        id: 'skylight',
        name: 'Velux Solar-Powered Fresh Air Skylight',
        desc: 'Double-glazed with rain sensor & wireless remote',
        price: 980,
      },
      {
        id: 'ventilation',
        name: 'Solar Attic Ventilation Fan',
        desc: 'Reduces attic heat by up to 30° to prolong roof lifespan',
        price: 620,
      },
    ],
  },
];

export default function InteractiveQuoteUpsellDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [selectedTierId, setSelectedTierId] = useState<'standard' | 'premium' | 'deluxe'>('premium');
  const [checkedAddonIds, setCheckedAddonIds] = useState<string[]>(['warranty']);
  const [paymentMode, setPaymentMode] = useState<'full' | 'plan'>('plan');
  const [signName, setSignName] = useState('Alex Morgan');
  const [isSigned, setIsSigned] = useState(false);

  const activeScenario = SCENARIOS[scenarioIndex];
  const activeTier = activeScenario.tiers.find((t) => t.id === selectedTierId) ?? activeScenario.tiers[1];

  const addonsTotal = activeScenario.addons
    .filter((a) => checkedAddonIds.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const grandTotal = activeTier.basePrice + addonsTotal;
  const depositAmount = Math.round(grandTotal * 0.5);
  const monthlyInstallment = Math.round((grandTotal - depositAmount) / 4);

  const toggleAddon = (id: string) => {
    setCheckedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleScenarioChange = (idx: number) => {
    setScenarioIndex(idx);
    setSelectedTierId('premium');
    setCheckedAddonIds([SCENARIOS[idx].addons[0].id]);
    setIsSigned(false);
  };

  const handleSign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signName.trim()) return;
    setIsSigned(true);
  };

  return (
    <section className={styles.section} id="quote-demo" aria-labelledby="quote-demo-title">
      <div className={styles.container}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>
            <span>✦</span> INTERACTIVE QUOTE &amp; UPSELL ENGINE
          </p>
          <h2 className={styles.title} id="quote-demo-title">
            Send quotes that sell upgrades for you.
          </h2>
          <p className={styles.subtitle}>
            Give homeowners good/better/best package options, optional add-ons, and payment plans they can approve from their phone in seconds.
          </p>
        </div>

        {/* Trade Switcher */}
        <div className={styles.tradeSwitcher} role="tablist" aria-label="Trade scenarios">
          {SCENARIOS.map((sc, idx) => (
            <button
              key={sc.id}
              type="button"
              role="tab"
              aria-selected={scenarioIndex === idx}
              className={`${styles.tradeTab} ${scenarioIndex === idx ? styles.active : ''}`}
              onClick={() => handleScenarioChange(idx)}
            >
              {sc.tabLabel}
            </button>
          ))}
        </div>

        {/* Main 2-Column Showcase */}
        <div className={styles.layout}>
          {/* Left Column: Interactive Phone Quote */}
          <div className={styles.quotePhone} role="region" aria-label="Interactive customer quote view">
            <div className={styles.phoneHeader}>
              <div className={styles.companyBadge}>
                <div className={styles.companyLogo}>
                  {activeScenario.companyName.charAt(0)}
                </div>
                <div>
                  <div className={styles.companyName}>{activeScenario.companyName}</div>
                  <div className={styles.quoteNumber}>Quote {activeScenario.quoteNumber} · {activeScenario.projectName}</div>
                </div>
              </div>
              <span className={styles.statusPill}>
                {isSigned ? 'SIGNED ✓' : 'READY TO APPROVE'}
              </span>
            </div>

            {/* Step 1: Tier Choice */}
            <p className={styles.tierLabel}>Step 1: Choose Your Package</p>
            <div className={styles.tiersGrid} role="radiogroup" aria-label="Package tiers">
              {activeScenario.tiers.map((tier) => {
                const isSelected = tier.id === selectedTierId;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`${styles.tierCard} ${isSelected ? styles.selectedTier : ''}`}
                    onClick={() => {
                      setSelectedTierId(tier.id);
                      setIsSigned(false);
                    }}
                  >
                    {tier.isPopular && <span className={styles.popularBadge}>Most Popular</span>}
                    <div className={styles.tierName}>{tier.name}</div>
                    <div className={styles.tierPrice}>${tier.basePrice.toLocaleString()}</div>
                    <div className={styles.tierSummary}>{tier.summary}</div>
                  </button>
                );
              })}
            </div>

            {/* Step 2: Interactive Optional Add-ons */}
            <div className={styles.addonsSection}>
              <div className={styles.addonsHead}>
                <h3 className={styles.addonsTitle}>Step 2: Optional Upgrades &amp; Add-ons</h3>
                <span className={styles.addonsHint}>+ Click to toggle</span>
              </div>
              <div className={styles.addonList}>
                {activeScenario.addons.map((addon) => {
                  const isChecked = checkedAddonIds.includes(addon.id);
                  return (
                    <div
                      key={addon.id}
                      className={`${styles.addonItem} ${isChecked ? styles.checked : ''}`}
                      onClick={() => {
                        toggleAddon(addon.id);
                        setIsSigned(false);
                      }}
                      role="checkbox"
                      aria-checked={isChecked}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleAddon(addon.id);
                          setIsSigned(false);
                        }
                      }}
                    >
                      <div className={styles.addonLeft}>
                        <span className={styles.customCheckbox} aria-hidden="true">
                          {isChecked ? '✓' : ''}
                        </span>
                        <div className={styles.addonText}>
                          <span className={styles.addonName}>{addon.name}</span>
                          <span className={styles.addonDesc}>{addon.desc}</span>
                        </div>
                      </div>
                      <span className={styles.addonPrice}>+${addon.price.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Payment Plan & Total */}
            <div className={styles.paymentSection}>
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total Investment</span>
                <span className={styles.totalAmount}>${grandTotal.toLocaleString()}</span>
              </div>

              <div className={styles.paymentModeTabs}>
                <button
                  type="button"
                  className={`${styles.payTab} ${paymentMode === 'full' ? styles.activePayTab : ''}`}
                  onClick={() => setPaymentMode('full')}
                >
                  Pay in Full (${grandTotal.toLocaleString()})
                </button>
                <button
                  type="button"
                  className={`${styles.payTab} ${paymentMode === 'plan' ? styles.activePayTab : ''}`}
                  onClick={() => setPaymentMode('plan')}
                >
                  Payment Plan (0% APR)
                </button>
              </div>

              {paymentMode === 'plan' ? (
                <div className={styles.planScheduleNote}>
                  <strong>${depositAmount.toLocaleString()} deposit today</strong>, followed by 4 monthly installments of <strong>${monthlyInstallment.toLocaleString()}/mo</strong>.
                </div>
              ) : (
                <div className={styles.planScheduleNote}>
                  100% payment settled directly to contractor bank account via Stripe.
                </div>
              )}
            </div>

            {/* Step 4: E-Signature Approval */}
            <div className={styles.eSignArea}>
              {!isSigned ? (
                <form onSubmit={handleSign} className={styles.signInputRow}>
                  <input
                    type="text"
                    className={styles.signInput}
                    placeholder="Type name to sign..."
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    aria-label="Homeowner electronic signature name"
                  />
                  <button type="submit" className={styles.signBtn}>
                    Approve &amp; E-Sign <span>→</span>
                  </button>
                </form>
              ) : (
                <div className={styles.signedConfirmation}>
                  <div className={styles.signedLeft}>
                    <span className={styles.signedCheck}>✓</span>
                    <div>
                      <div className={styles.signedTitle}>Quote {activeScenario.quoteNumber} Approved by {signName}</div>
                      <div className={styles.signedTime}>Locked with legal timestamp · ${depositAmount.toLocaleString()} deposit ready</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.resetBtn}
                    onClick={() => setIsSigned(false)}
                  >
                    Edit / Re-sign
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Contractor Advantages */}
          <div className={styles.insightColumn}>
            <div className={styles.insightCard}>
              <div className={styles.insightCardHead}>
                <div className={styles.insightIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <h3 className={styles.insightHeadline}>Why Interactive Quotes Win More Work</h3>
              </div>

              <div className={styles.insightPillRow}>
                <span className={styles.metricPill}>📈 +24% Higher Ticket Size</span>
                <span className={styles.metricPill}>⚡ 3x Faster Approvals</span>
              </div>

              <p className={styles.insightBody}>
                Static PDF quotes force contractors to guess what the homeowner wants. With Let’s Get Quoted, customers can customize their tier, add luxury upgrades, and pick payment terms without another phone call.
              </p>

              <ul className={styles.benefitList}>
                <li>
                  <i>✓</i>
                  <span><b>Multi-Tier Good/Better/Best:</b> Present options naturally without leaving money on the table.</span>
                </li>
                <li>
                  <i>✓</i>
                  <span><b>Self-Serve Upgrades:</b> Homeowners frequently tick warranty &amp; finish upgrades on their phone.</span>
                </li>
                <li>
                  <i>✓</i>
                  <span><b>0% In-House Installments:</b> Offer structured monthly payments without third-party lender fees.</span>
                </li>
                <li>
                  <i>✓</i>
                  <span><b>Legally Binding E-Signatures:</b> Locks scope, price, and terms with automatic IP &amp; timestamp audit logs.</span>
                </li>
              </ul>

              <Link className={styles.featureLink} href="/features/quotes">
                Explore comprehensive quoting software <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
