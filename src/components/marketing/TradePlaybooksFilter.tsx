'use client';

import { useState } from 'react';
import styles from './trade-playbooks-filter.module.css';

interface Playbook {
  trade: string;
  icon: string;
  category: 'electrical' | 'plumbing' | 'hvac' | 'gc' | 'roofing' | 'landscaping' | 'painting';
  quote: string;
  extractedPillars: { pillar: string; detail: string }[];
  result: string;
}

const PLAYBOOKS: Playbook[] = [
  {
    trade: 'Electrical',
    icon: '⚡',
    category: 'electrical',
    quote: '“Add $450 to Miller job: ran 65ft of 12/2 Romex for pantry dedicated 20A circuit.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: '+$450.00 quote line item (12/2 Romex & 20A dedicated circuit)' },
      { pillar: 'Cost Truth', detail: 'Allocated $85 material cost; updated margin to 81.2%' },
    ],
    result: 'Recalculates Miller quote from $2,800 to $3,250 with revised invoice draft.',
  },
  {
    trade: 'Plumbing',
    icon: '🔧',
    category: 'plumbing',
    quote: '“Rough-in passed on Elm St. Main sewer line tied in, waiting on inspector sign-off card.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: 'Milestone: Rough-In Plumbing Inspection Passed' },
      { pillar: 'Schedule', detail: 'Unblocks drywall crew arrival window on calendar' },
    ],
    result: 'Attaches timestamped voice recording to Elm St activity feed.',
  },
  {
    trade: 'HVAC & Refrigeration',
    icon: '❄️',
    category: 'hvac',
    quote: '“Customer added 4-inch media filter cabinet to the furnace install on Oak Ave, add $280.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: '+$280.00 Change Order #2 (4-inch media cabinet)' },
      { pillar: 'Crew', detail: 'Pushes filter cabinet pickup task to supply run checklist' },
    ],
    result: 'Updates Oak Ave total and generates 1-tap customer approval text link.',
  },
  {
    trade: 'General Contractor',
    icon: '🔨',
    category: 'gc',
    quote: '“Subcontractor tile crew finished master bath waterproofing, scheduling tile lay for Monday 8am.”',
    extractedPillars: [
      { pillar: 'Schedule', detail: 'Stage 3: Tile Installation scheduled Monday 8:00 AM' },
      { pillar: 'Crew', detail: 'Notifies lead tile setter with job site gate code' },
    ],
    result: 'Advances project stage and syncs subcontractor dispatch board.',
  },
  {
    trade: 'Roofing & Siding',
    icon: '🏠',
    category: 'roofing',
    quote: '“Found 3 rotted CDX plywood sheets on south dormer of Smith roof. Add $225 material and labor.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: '+$225.00 Plywood Decking Deck Repair' },
      { pillar: 'Leads', detail: 'Attaches structural defect note to job warranty file' },
    ],
    result: 'Instantly increases approved contract amount before shingle installation begins.',
  },
  {
    trade: 'Landscaping & Hardscaping',
    icon: '🌿',
    category: 'landscaping',
    quote: '“Added 2 extra yards of dark brown cedar mulch and 15 perennial shrubs to Westridge patio, $380.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: '+$380.00 Mulch & Plant Material Expansion' },
      { pillar: 'Crew', detail: 'Logs extra hour of skid-steer labor on field timecard' },
    ],
    result: 'Updates material totals and gross profit margin on the job card.',
  },
  {
    trade: 'Painting & Finishing',
    icon: '🎨',
    category: 'painting',
    quote: '“Customer upgraded dining room ceiling to flat white enamel with double coat primer, add $190.”',
    extractedPillars: [
      { pillar: 'Jobs', detail: '+$190.00 Premium Ceiling Finish Upgrade' },
      { pillar: 'Crew', detail: 'Updates paint formulation code on van crew tablet' },
    ],
    result: 'Adds line item and reflects color selection sign-off in customer portal.',
  },
];

const CATEGORIES = [
  { key: 'all', label: 'All Trades', icon: '🛠️' },
  { key: 'electrical', label: 'Electrical', icon: '⚡' },
  { key: 'plumbing', label: 'Plumbing', icon: '🔧' },
  { key: 'hvac', label: 'HVAC', icon: '❄️' },
  { key: 'gc', label: 'General Contractor', icon: '🔨' },
  { key: 'roofing', label: 'Roofing', icon: '🏠' },
  { key: 'landscaping', label: 'Landscaping', icon: '🌿' },
  { key: 'painting', label: 'Painting', icon: '🎨' },
] as const;

export default function TradePlaybooksFilter() {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredPlaybooks =
    activeCategory === 'all'
      ? PLAYBOOKS
      : PLAYBOOKS.filter((p) => p.category === activeCategory);

  function scrollToSimulator() {
    const el = document.getElementById('simulator-frame');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 400, behavior: 'smooth' });
    }
  }

  return (
    <div className={styles.playbooksContainer}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Trade-Specific Field Ingestion</span>
        <h3 className={styles.title}>Built for the real vocabulary of your job site.</h3>
        <p className={styles.subtitle}>
          Whether you speak in 200-amp panels, PEX-A fittings, SEER ratings, or CDX decking, your AI Copilot extracts exact trade context without manual translation.
        </p>
      </div>

      {/* Category Filter Pills */}
      <div className={styles.filterPillsRow}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`${styles.filterPill} ${activeCategory === cat.key ? styles.filterPillActive : ''}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Playbooks Grid */}
      <div className={styles.grid}>
        {filteredPlaybooks.map((playbook, idx) => (
          <div key={idx} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>{playbook.icon}</span>
              <h4 className={styles.cardTrade}>{playbook.trade}</h4>
            </div>

            <div className={styles.quoteBox}>
              <span className={styles.quoteMark}>“</span>
              <p className={styles.quoteText}>{playbook.quote.replace(/^[“"]|[”"]$/g, '')}</p>
            </div>

            <div className={styles.pillarsList}>
              <div className={styles.pillarsLabel}>Extracted Database Delta:</div>
              {playbook.extractedPillars.map((pillar, pIdx) => (
                <div key={pIdx} className={styles.pillarItem}>
                  <span className={styles.pillarTag}>{pillar.pillar}</span>
                  <span className={styles.pillarDetail}>{pillar.detail}</span>
                </div>
              ))}
            </div>

            <div className={styles.cardFooter}>
              <div className={styles.resultText}>
                <strong>Result:</strong> {playbook.result}
              </div>
              <button
                type="button"
                onClick={scrollToSimulator}
                className={styles.trySimBtn}
              >
                <span>Try Live in Simulator</span>
                <span aria-hidden="true">&uarr;</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
