'use client';

import { useState } from 'react';
import styles from './photo-scope-estimator.module.css';

type PhotoScenario = {
  id: string;
  tabLabel: string;
  icon: string;
  trade: string;
  detectedDamage: string;
  boundingNote: string;
  scopeSummary: string;
  materials: { name: string; cost: string }[];
  laborEstimate: string;
  changeOrderTotal: string;
};

const PHOTO_SCENARIOS: PhotoScenario[] = [
  {
    id: 'subfloor',
    tabLabel: 'Subfloor Water Damage',
    icon: '🪵',
    trade: 'Carpentry & Flooring',
    detectedDamage: 'Severe moisture rot on 3/4" subfloor beneath dishwasher leak (4ft x 6ft area)',
    boundingNote: 'Detected: 24 sq ft dry rot + compromised 2x10 joist edge',
    scopeSummary:
      'Cut out and replace 24 sq ft rotted subfloor, sister one 2x10 joist with structural screws, and apply anti-microbial subfloor seal.',
    materials: [
      { name: '3/4" x 4x8 CDX Plywood (1 Sheet)', cost: '$54.00' },
      { name: '2x10 x 8ft Doug Fir Joist (Sistering)', cost: '$26.50' },
      { name: 'Subfloor Adhesive & GRK Structural Screws', cost: '$32.00' },
    ],
    laborEstimate: '3.5 hours ($385.00)',
    changeOrderTotal: '$497.50',
  },
  {
    id: 'electrical-panel',
    tabLabel: '100A Outdated Panel',
    icon: '⚡',
    trade: 'Electrical',
    detectedDamage: 'Crowded 100-Amp Zinsco split-bus panel with double-tapped 20A breakers',
    boundingNote: 'Detected: Zinsco non-compliant busbar + zero open breaker slots',
    scopeSummary:
      'Install 50A subpanel adjacent to main service, relocate 4 branch circuits, and label panel schedule per NEC 2024.',
    materials: [
      { name: 'Square D 100A 8-Space Subpanel Enclosure', cost: '$98.00' },
      { name: '6/3 NM-B Romex Feeder Cable (15ft)', cost: '$68.50' },
      { name: '20A Single-Pole Tandem Breakers (x4)', cost: '$56.00' },
    ],
    laborEstimate: '4.0 hours ($520.00)',
    changeOrderTotal: '$742.50',
  },
  {
    id: 'siding-rot',
    tabLabel: 'Siding Trim & Flashing',
    icon: '🏠',
    trade: 'Siding & Exteriors',
    detectedDamage: 'Water penetration along corner trim with missing Z-flashing above window',
    boundingNote: 'Detected: 8ft rotted LP SmartSide corner board + exposed sheathing',
    scopeSummary:
      'Remove rotted corner board, install drip cap Z-flashing, re-tape housewrap with ZIP tape, and install prepainted PVC trim.',
    materials: [
      { name: '5/4 x 4 x 10ft Cellular PVC Corner Trim', cost: '$42.00' },
      { name: '10ft Aluminum Z-Flashing Drip Cap', cost: '$18.50' },
      { name: 'ZIP System Flashing Tape & Quad Max Sealant', cost: '$28.00' },
    ],
    laborEstimate: '2.5 hours ($275.00)',
    changeOrderTotal: '$363.50',
  },
];

export default function PhotoScopeEstimator() {
  const [activeId, setActiveId] = useState<string>('subfloor');
  const scenario = PHOTO_SCENARIOS.find((s) => s.id === activeId) || PHOTO_SCENARIOS[0];

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <span className={styles.badge}>📸 Gemini Vision Photo-to-Scope AI Estimator</span>
        <h3 className={styles.title}>
          Snap a photo of site damage. Gemini drafts the material takeoff &amp; change order.
        </h3>
        <p className={styles.subtitle}>
          Contractors text photos from the field. Multimodal Gemini Vision detects damaged components, measures surface area, and calculates change order pricing in seconds.
        </p>
      </div>

      {/* Scenario Tabs */}
      <div className={styles.sampleBar}>
        {PHOTO_SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => setActiveId(sc.id)}
            className={`${styles.sampleTab} ${sc.id === activeId ? styles.sampleTabActive : ''}`}
          >
            <span>{sc.icon}</span>
            <span>{sc.tabLabel}</span>
          </button>
        ))}
      </div>

      {/* Inspector Grid */}
      <div className={styles.inspectorGrid}>
        {/* Left: Photo Scanner Viewport */}
        <div className={styles.photoViewport}>
          <div className={styles.scannerOverlay}></div>

          <div className={styles.photoCardContent}>
            <div className={styles.photoHeader}>
              <span className={styles.photoTag}>📸 MMS Field Photo Upload</span>
              <span style={{ fontSize: '11px', color: '#7da0b3' }}>{scenario.trade}</span>
            </div>

            <div className={styles.photoGraphic}>
              <span style={{ fontSize: '42px' }}>{scenario.icon}</span>
              <span className={styles.boundingBadge}>
                [AI Bounding Box] {scenario.boundingNote}
              </span>
              <p style={{ fontSize: '12px', color: '#d1e2eb', margin: 0 }}>
                {scenario.detectedDamage}
              </p>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#8fa6b5', textAlign: 'center' }}>
            ⚡ Laser scan active · OCR + spatial defect detection
          </div>
        </div>

        {/* Right: Extracted Materials & Change Order Pricing */}
        <div className={styles.materialsCol}>
          <div className={styles.materialsHead}>
            <h4 className={styles.materialsTitle}>Auto-Generated Scope &amp; Materials</h4>
            <span style={{ fontSize: '11.5px', color: '#50e3bd', fontWeight: 800 }}>
              ✓ Auto-Estimated
            </span>
          </div>

          <div className={styles.scopeBox}>
            <p className={styles.scopeText}>
              <strong>Recommended Scope:</strong> {scenario.scopeSummary}
            </p>
          </div>

          <div className={styles.materialList}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#7da0b3', textTransform: 'uppercase' }}>
              Itemized Material Takeoff:
            </span>
            {scenario.materials.map((mat, idx) => (
              <div key={idx} className={styles.materialRow}>
                <span className={styles.materialName}>{mat.name}</span>
                <span className={styles.materialCost}>{mat.cost}</span>
              </div>
            ))}
            <div className={styles.materialRow}>
              <span className={styles.materialName}>Estimated Labor &amp; Installation:</span>
              <span className={styles.materialCost}>{scenario.laborEstimate}</span>
            </div>
          </div>

          {/* Change Order Total */}
          <div className={styles.totalChangeOrderCard}>
            <div>
              <span className={styles.totalLabel}>Auto-Calculated Change Order:</span>
              <div style={{ fontSize: '11px', color: '#9cb1c0' }}>
                Ready to text customer approval link with 1 tap
              </div>
            </div>
            <div className={styles.totalVal}>{scenario.changeOrderTotal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
