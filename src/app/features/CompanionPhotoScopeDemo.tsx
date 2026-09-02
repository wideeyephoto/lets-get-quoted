'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import styles from './features-theme.module.css';

interface OcrTarget {
  top: string;
  left: string;
  label: string;
  isWarning?: boolean;
}

interface PhotoScenario {
  id: string;
  title: string;
  badge: string;
  icon: string;
  trade: string;
  imageSrc: string;
  imageAlt: string;
  sampleImgDescription: string;
  ocrTargets: OcrTarget[];
  detectedSpecs: { label: string; value: string }[];
  risksDetected: string[];
  billOfMaterials: { item: string; qty: string; unitPrice: number }[];
  totalEstimate: number;
  companionTip: string;
}

const SCENARIOS: PhotoScenario[] = [
  {
    id: 'electrical',
    title: '200A Panel Replacement',
    badge: 'ELECTRICAL OCR',
    icon: '⚡',
    trade: 'Electrical',
    imageSrc: '/images/ai-vision/electrical-panel.jpg',
    imageAlt: 'Basement Federal Pacific electrical panel with breakers and wiring',
    sampleImgDescription: 'Basement 100A Federal Pacific panel with double-tapped breakers & corroded main lug',
    ocrTargets: [
      { top: '32%', left: '26%', label: '⚡ Federal Pacific 100A' },
      { top: '56%', left: '50%', label: '⚠️ Double-Tapped Breaker', isWarning: true },
      { top: '82%', left: '52%', label: '🔍 Corroded Main Lug' },
    ],
    detectedSpecs: [
      { label: 'Existing Brand', value: 'Federal Pacific Stab-Lok 100A' },
      { label: 'Bus Rating', value: '100A Max / 20-Circuit' },
      { label: 'Feeder Service', value: '2/0 Aluminum Overhead' },
      { label: 'Grounding', value: 'Single cold water clamp (no ground rod)' },
    ],
    risksDetected: [
      'Hazardous Stab-Lok fire risk breaker pattern',
      'Double-tapped 30A dryer breaker requires sub-feed splice',
      'Missing 2x 8ft copper ground rods for 2026 NEC compliance',
    ],
    billOfMaterials: [
      { item: 'Square D QO 200A 42-Space Main Breaker Panel', qty: '1 unit', unitPrice: 420 },
      { item: 'Dual 8ft 5/8" Copper Ground Rods & #4 Bare Copper Bond', qty: '1 kit', unitPrice: 185 },
      { item: 'Whole-Home Type 2 Surge Protection Device', qty: '1 unit', unitPrice: 220 },
      { item: 'Standard 1-Day Master Electrician Labor & Permit Filing', qty: '8 hrs', unitPrice: 1400 },
    ],
    totalEstimate: 2225,
    companionTip: 'I automatically pulled the panel model number via OCR, flagged the safety hazard, and itemized the permit and grounding requirements so you can quote in under 30 seconds.',
  },
  {
    id: 'hvac',
    title: '4-Ton Condenser & Air Handler',
    badge: 'HVAC VISION SCOPE',
    icon: '❄️',
    trade: 'HVAC',
    imageSrc: '/images/ai-vision/hvac-condenser.jpg',
    imageAlt: 'Outdoor AC condenser unit with rating plate and line set on gravel pad',
    sampleImgDescription: 'Outdoor condenser rating plate & rusted suction line showing R-22 Freon system',
    ocrTargets: [
      { top: '38%', left: '54%', label: '❄️ Carrier 4-Ton 10 SEER' },
      { top: '70%', left: '26%', label: '⚠️ R-22 Phased Out', isWarning: true },
      { top: '82%', left: '58%', label: '📐 3° Settled Tilt' },
    ],
    detectedSpecs: [
      { label: 'Unit Model', value: 'Carrier 38TKB048300 (4-Ton 10 SEER)' },
      { label: 'Refrigerant', value: 'R-22 Freon (Phased Out)' },
      { label: 'Electrical MOP', value: '40A 208/230V 1-Phase' },
      { label: 'Pad / Clearance', value: 'Settled concrete pad (3" pitch towards foundation)' },
    ],
    risksDetected: [
      'Obsolete R-22 system requires full line set flush or replacement',
      'Condenser pad tilted requiring new composite leveling base',
      'Whip & disconnect box show extreme UV oxidation',
    ],
    billOfMaterials: [
      { item: 'Carrier 16 SEER2 4-Ton R-454B Inverter Heat Pump', qty: '1 unit', unitPrice: 3850 },
      { item: 'Composite Leveling Pad & Vibration Isolators', qty: '1 unit', unitPrice: 165 },
      { item: '60A Fused Outdoor Disconnect & 3/4" Whip Kit', qty: '1 kit', unitPrice: 135 },
      { item: 'EPA Certified Refrigerant Recovery & Installation Labor', qty: '1 day', unitPrice: 1950 },
    ],
    totalEstimate: 6100,
    companionTip: 'I read the 10 SEER rating plate and immediately calculated the R-454B conversion needs and disconnect whip replacement before your tech arrived.',
  },
  {
    id: 'plumbing',
    title: '50-Gal Hybrid Water Heater',
    badge: 'PLUMBING SCOPE',
    icon: '🚰',
    trade: 'Plumbing',
    imageSrc: '/images/ai-vision/water-heater.jpg',
    imageAlt: 'Basement gas water heater tank with draft hood and copper piping',
    sampleImgDescription: 'Leaking 12-year-old atmospheric gas water heater with corroded galvanized nipples',
    ocrTargets: [
      { top: '44%', left: '50%', label: '🚰 Rheem 40-Gal Gas' },
      { top: '16%', left: '50%', label: '⚠️ Corroded 3" B-Vent', isWarning: true },
      { top: '78%', left: '46%', label: '💧 Leaking Union' },
    ],
    detectedSpecs: [
      { label: 'Existing Unit', value: 'Rheem 40-Gal Gas Natural Draft' },
      { label: 'Gas Supply', value: '1/2" Black Iron Pipe' },
      { label: 'Venting', value: '3" B-Vent chimney run (8ft rise)' },
      { label: 'Expansion Tank', value: 'Waterlogged / bladder failed' },
    ],
    risksDetected: [
      'Corroded dielectric unions leaking onto electrical wiring',
      'Failed thermal expansion tank causing pressure spikes (85 PSI)',
      'Missing code-compliant drain pan and shutoff flood sensor',
    ],
    billOfMaterials: [
      { item: 'Rheem ProTerra 50-Gal Hybrid Heat Pump / Electric', qty: '1 unit', unitPrice: 1780 },
      { item: '2-Gal Thermal Expansion Tank & Brass Tee Kit', qty: '1 unit', unitPrice: 145 },
      { item: 'Aluminum Drain Pan with Auto-Shutoff Flood Valve', qty: '1 kit', unitPrice: 195 },
      { item: 'Licensed Plumbing Labor, Old Unit Haul-Away & Code Inspection', qty: '5 hrs', unitPrice: 950 },
    ],
    totalEstimate: 3070,
    companionTip: 'Homeowner photos detected the high water pressure and leaking unions. I pre-loaded the expansion tank and emergency flood sensor directly into your quote draft.',
  },
];

export default function CompanionPhotoScopeDemo() {
  const [activeTab, setActiveTab] = useState<string>('electrical');
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const scenario = SCENARIOS.find((s) => s.id === activeTab) || SCENARIOS[0];

  const scenarioTabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleSelectTab = (id: string) => {
    setIsScanning(true);
    setActiveTab(id);
    setTimeout(() => setIsScanning(false), 600);
  };

  const handleScenarioKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % SCENARIOS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + SCENARIOS.length) % SCENARIOS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = SCENARIOS.length - 1;
    }
    if (nextIndex !== index) {
      handleSelectTab(SCENARIOS[nextIndex].id);
      scenarioTabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className={styles.photoDemoContainer} id="companion-photo-demo">
      <div className={styles.photoDemoHeader}>
        <div>
          <span className={styles.photoDemoEyebrow}>
            <span className={styles.pulseDot} aria-hidden="true" />
            ⚡ INTERACTIVE AI VISION SCOPE SCANNER
          </span>
          <h3 className={styles.photoDemoTitle}>
            See what happens when a homeowner uploads a jobsite photo
          </h3>
          <p className={styles.photoDemoSub}>
            Select a trade example below to watch your AI Copilot extract rating plates via OCR, spot hidden site risks, and generate an itemized quote draft in 2 seconds.
          </p>
        </div>
      </div>

      <div className={styles.photoDemoTabs} role="tablist" aria-label="Trade photo scenarios">
        {SCENARIOS.map((sc, index) => {
          const isActive = activeTab === sc.id;
          return (
            <button
              key={sc.id}
              ref={(el) => { scenarioTabRefs.current[index] = el; }}
              id={`photo-tab-${sc.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="photo-scenario-panel"
              tabIndex={isActive ? 0 : -1}
              className={`${styles.photoDemoTabBtn} ${isActive ? styles.photoDemoTabActive : ''}`}
              onClick={() => handleSelectTab(sc.id)}
              onKeyDown={(e) => handleScenarioKeyDown(e, index)}
            >
              <span className={styles.photoDemoTabIcon}>{sc.icon}</span>
              <span className={styles.photoDemoTabName}>{sc.title}</span>
              <span className={styles.photoDemoTabBadge}>{sc.trade}</span>
            </button>
          );
        })}
      </div>

      <div
        className={styles.photoDemoCardGrid}
        id="photo-scenario-panel"
        role="tabpanel"
        aria-labelledby={`photo-tab-${activeTab}`}
      >
        {/* Left: Photo + Live Scanning Laser */}
        <div className={styles.photoScannerBox}>
          <div className={styles.photoScannerVisual}>
            {/* Real Jobsite Photo */}
            <div className={styles.photoJobImageWrap}>
              <Image
                src={scenario.imageSrc}
                alt={scenario.imageAlt}
                fill
                sizes="(max-width: 900px) 100vw, 450px"
                className={styles.photoJobImage}
                priority
              />
              <div className={styles.photoImageGradientOverlay} aria-hidden="true" />
            </div>

            {/* OCR Live Laser */}
            <div className={`${styles.photoLaser} ${isScanning ? styles.photoLaserActive : ''}`} />

            {/* Top Badge */}
            <div className={styles.photoOverlayBadge}>
              <span>{scenario.badge}</span>
              <small>OCR &amp; Multimodal Analysis</small>
            </div>

            {/* In-Image OCR Pinpoint Targets */}
            <div className={styles.photoOcrTargetsContainer} aria-hidden="true">
              {scenario.ocrTargets.map((target, tIdx) => (
                <div
                  key={tIdx}
                  className={`${styles.photoOcrTarget} ${target.isWarning ? styles.photoOcrTargetWarning : ''}`}
                  style={{ top: target.top, left: target.left }}
                >
                  <span className={`${styles.photoOcrDot} ${target.isWarning ? styles.photoOcrDotWarning : ''}`} />
                  <span className={styles.photoOcrLabel}>{target.label}</span>
                </div>
              ))}
            </div>

            {/* Bottom Caption Bar */}
            <div className={styles.photoMockupBar}>
              <div className={styles.photoMockupBarTitle}>
                <span>{scenario.icon}</span>
                <span>Uploaded Jobsite Photo</span>
              </div>
              <p className={styles.photoMockupBarDesc}>{scenario.sampleImgDescription}</p>
            </div>
          </div>

          <div className={styles.photoCompanionBubble}>
            <div className={styles.photoCompanionAvatar}>
              <span>⚡</span>
            </div>
            <div className={styles.photoCompanionSpeech}>
              <strong className={styles.photoCompanionName}>AI Copilot · Field Vision OCR</strong>
              <p>{scenario.companionTip}</p>
            </div>
          </div>
        </div>

        {/* Right: Detected Specs, Risks & Auto-Itemized BOM */}
        <div className={styles.photoResultsBox}>
          <div className={styles.photoResultsHeader}>
            <div>
              <span className={styles.photoResultsKicker}>AI EXTRACTION SUMMARY</span>
              <h4>{scenario.title}</h4>
            </div>
            <div className={styles.photoTotalPill}>
              <small>ESTIMATE DRAFT</small>
              <strong>${scenario.totalEstimate.toLocaleString()}</strong>
            </div>
          </div>

          {/* Detected Specs */}
          <div className={styles.photoSpecsGrid}>
            {scenario.detectedSpecs.map((spec) => (
              <div key={spec.label} className={styles.photoSpecItem}>
                <small>{spec.label}</small>
                <span>{spec.value}</span>
              </div>
            ))}
          </div>

          {/* Detected Risks */}
          <div className={styles.photoRisksBox}>
            <span className={styles.photoRisksTitle}>⚠️ Detected Site Risks &amp; Code Notes:</span>
            <ul>
              {scenario.risksDetected.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>

          {/* Itemized Materials & Labor */}
          <div className={styles.photoBomTable}>
            <div className={styles.photoBomHead}>
              <span>Item &amp; Scope</span>
              <span>Qty</span>
              <span>Subtotal</span>
            </div>
            {scenario.billOfMaterials.map((bom) => (
              <div key={bom.item} className={styles.photoBomRow}>
                <span>{bom.item}</span>
                <span>{bom.qty}</span>
                <strong>${bom.unitPrice.toLocaleString()}</strong>
              </div>
            ))}
          </div>

          <div className={styles.photoActionRow}>
            <a
              href="https://app.letsgetquoted.com/start?goal=feature&feature=quotes&source=feature_photo_demo"
              className={styles.photoActionButton}
            >
              Start Quoting with AI Vision <span aria-hidden="true">→</span>
            </a>
            <span className={styles.photoActionNote}>Included on all plans · Free to test</span>
          </div>
        </div>
      </div>
    </div>
  );
}
