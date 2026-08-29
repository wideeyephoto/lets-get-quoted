'use client';

import { useState } from 'react';
import { TRADES } from '@/lib/trades';
import styles from './sun-visor-card.module.css';

export default function SunVisorCardGenerator() {
  const [businessName, setBusinessName] = useState('Apex Electric & Contracting');
  const [selectedTrade, setSelectedTrade] = useState('Electrical');
  const [fieldPhone, setFieldPhone] = useState('(248) 555-0199');
  const [copied, setCopied] = useState(false);

  function handlePrint() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  function handleCopyPhone() {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(fieldPhone.replace(/[^\d+]/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>🪪 Printable Truck Sun-Visor Glovebox Card</span>
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
            <div className={styles.phoneInputRow}>
              <input
                id="sunvisor-phone"
                type="text"
                value={fieldPhone}
                onChange={(e) => setFieldPhone(e.target.value)}
                className={styles.textInput}
                placeholder="(248) 555-0199"
                aria-label="Dedicated Texting Hotline"
              />
              <button
                type="button"
                onClick={handleCopyPhone}
                className={styles.copyPhoneBtn}
                title="Copy phone number to clipboard"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          <button type="button" onClick={handlePrint} className={styles.printBtn}>
            <span>🖨️</span>
            <span>Print Sun-Visor Cheatsheet Card</span>
          </button>
        </div>

        {/* Right: Printable Card Preview */}
        <div className={styles.printableCardPreview}>
          <div className={styles.visorNotch} title="Visor Clip Slot" />
          
          <div className={styles.cardTopHeader}>
            <div>
              <h4 className={styles.cardCompanyTitle}>{businessName || 'Your Business Name'}</h4>
              <div className={styles.cardTradeSub}>
                <span>{selectedTrade}</span>
                <span>&bull;</span>
                <span>Text-to-Job Field Guide</span>
              </div>
            </div>
            <div className={styles.cardHotlineTag}>
              <span className={styles.hotlineTagIcon}>📱</span>
              <span>Text: {fieldPhone || '(248) 555-0199'}</span>
            </div>
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

            <div className={`${styles.cardPhraseBox} ${styles.cardPhraseBoxWide}`}>
              <span className={styles.cardPhraseLabel}>5. Receipts &amp; Photos</span>
              <p className={styles.cardPhraseText}>
                “Snap receipt at register or photo of site damage to auto-attach to job file.”
              </p>
            </div>
          </div>

          <div className={styles.cardFooterRules}>
            <span>↺ <strong>Rollback Safety:</strong> Reply <code>UNDO</code> within 15 mins to revert any change.</span>
            <span className={styles.cardPoweredBy}>Powered by Gemini AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
