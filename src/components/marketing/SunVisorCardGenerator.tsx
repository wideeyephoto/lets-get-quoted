'use client';

import { useState } from 'react';
import { TRADES } from '@/lib/trades';
import styles from './sun-visor-card.module.css';

export default function SunVisorCardGenerator() {
  const [businessName, setBusinessName] = useState('Apex Electric & Contracting');
  const [selectedTrade, setSelectedTrade] = useState('Electrical');
  const [fieldPhone, setFieldPhone] = useState('(248) 555-0199');

  function handlePrint() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>📄 Sun-Visor Glovebox Card Generator</span>
          <h3 className={styles.title}>
            Print a laminated quick-reference card for your truck cab.
          </h3>
          <p className={styles.subtitle}>
            Clip this reference card to your sun visor or keep it in the glovebox so you and your crew always have the exact phone number and dictation phrases at your fingertips.
          </p>
        </div>
      </div>

      <div className={styles.generatorGrid}>
        {/* Left: Customizer Form */}
        <div className={styles.controlsCol}>
          <div className={styles.inputField}>
            <label htmlFor="sunvisor-biz-name" className={styles.inputLabel}>
              Your Business Name:
            </label>
            <input
              id="sunvisor-biz-name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={styles.textInput}
              placeholder="e.g. Apex Electric"
              aria-label="Your Business Name"
            />
          </div>

          <div className={styles.inputField}>
            <label htmlFor="sunvisor-trade" className={styles.inputLabel}>
              Primary Trade:
            </label>
            <select
              id="sunvisor-trade"
              value={selectedTrade}
              onChange={(e) => setSelectedTrade(e.target.value)}
              className={styles.selectInput}
              aria-label="Primary Trade"
            >
              {TRADES.map((t) => (
                <option key={t.slug} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.inputField}>
            <label htmlFor="sunvisor-phone" className={styles.inputLabel}>
              Dedicated Texting Hotline:
            </label>
            <input
              id="sunvisor-phone"
              type="text"
              value={fieldPhone}
              onChange={(e) => setFieldPhone(e.target.value)}
              className={styles.textInput}
              placeholder="(248) 555-0199"
              aria-label="Dedicated Texting Hotline"
            />
          </div>

          <button type="button" onClick={handlePrint} className={styles.printBtn}>
            🖨️ Print Sun-Visor Cheatsheet Card
          </button>
        </div>

        {/* Right: Printable Card Preview */}
        <div className={styles.printableCardPreview}>
          <div className={styles.cardTopHeader}>
            <div>
              <h4 className={styles.cardCompanyTitle}>{businessName || 'Your Business Name'}</h4>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                {selectedTrade} &middot; Text-to-Job Field Quick Card
              </span>
            </div>
            <div className={styles.cardHotlineTag}>📱 Text: {fieldPhone || '(248) 555-0199'}</div>
          </div>

          <div className={styles.cardPhrasesGrid}>
            <div className={styles.cardPhraseBox}>
              <span className={styles.cardPhraseLabel}>1. Change Order</span>
              <p className={styles.cardPhraseText}>
                “Add $[Amount] to [Client Name] for [Materials &amp; Labor]”
              </p>
            </div>

            <div className={styles.cardPhraseBox}>
              <span className={styles.cardPhraseLabel}>2. Milestones</span>
              <p className={styles.cardPhraseText}>
                “[Client Name] passed [Rough / Final] inspection. Schedule crew [Day].”
              </p>
            </div>

            <div className={styles.cardPhraseBox}>
              <span className={styles.cardPhraseLabel}>3. Punch List</span>
              <p className={styles.cardPhraseText}>
                “Punch list for [Client]: 1)... 2)... 3)...”
              </p>
            </div>

            <div className={styles.cardPhraseBox}>
              <span className={styles.cardPhraseLabel}>4. New Lead</span>
              <p className={styles.cardPhraseText}>
                “New lead: [Name], [Phone], [Service needed], [When]”
              </p>
            </div>
          </div>

          <div className={styles.cardFooterRules}>
            <span>↺ <strong>Rollback Rule:</strong> Reply <code>UNDO</code> within 15 mins to revert any field change.</span>
            <span>Powered by Gemini AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
