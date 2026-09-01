'use client';

import React from 'react';
import Image from 'next/image';
import { useAssistant } from './AssistantProvider';
import { COMPANIONS, type CompanionId, type CompanionProfile } from '@/lib/ai-assistant/companions';
import MiniFusionReactor from '@/components/mascot/MiniFusionReactor';
import styles from './companion-picker.module.css';

export default function CompanionPickerModal() {
  const {
    isCompanionPickerOpen,
    closeCompanionPicker,
    companionId,
    companionTrade,
    setCompanion,
  } = useAssistant();

  if (!isCompanionPickerOpen) return null;

  const handleSelectCompanion = (id: CompanionId) => {
    setCompanion(id);
  };

  const handleSelectTrade = (tradeId: string) => {
    setCompanion('sparky', tradeId);
  };

  const selectedCompanion = COMPANIONS.find((c) => c.id === companionId) || COMPANIONS[0];

  return (
    <div className={styles.overlay} onClick={closeCompanionPicker} aria-hidden="true">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose Your AI Avatar"
      >
        {/* Top Accent Rim */}
        <div className={styles.topAccentRim} />

        {/* Modal Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.headerBadge}>AI Assistant</div>
            <h2 className={styles.title}>Choose Your AI Avatar</h2>
            <p className={styles.subtitle}>
              Pick the avatar style for your AI assistant across your dashboard and tools.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={closeCompanionPicker}
            aria-label="Close avatar picker"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.body}>
          {/* Companions Grid */}
          <div className={styles.grid}>
            {COMPANIONS.map((comp: CompanionProfile) => {
              const isSelected = companionId === comp.id;
              return (
                <div
                  key={comp.id}
                  className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                  onClick={() => handleSelectCompanion(comp.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectCompanion(comp.id);
                    }
                  }}
                >
                  <div className={styles.avatarWrapper}>
                    {comp.id === 'assistant' || comp.avatarSrc?.includes('spark') ? (
                      <MiniFusionReactor
                        size={60}
                        interactive={true}
                        alt={`${comp.name} Mini Fusion Reactor`}
                      />
                    ) : (
                      <Image
                        src={comp.avatarSrc}
                        alt={comp.name}
                        width={64}
                        height={64}
                        className={styles.avatarImg}
                        unoptimized
                      />
                    )}
                    {isSelected && (
                      <span className={styles.activeCheck} title="Active Avatar">
                        ✓
                      </span>
                    )}
                  </div>

                  <div className={styles.cardContent}>
                    <div className={styles.cardHeaderRow}>
                      <h3 className={styles.cardName}>{comp.name}</h3>
                      <span
                        className={styles.roleBadge}
                        style={{
                          borderColor: `${comp.accentColor}55`,
                          color: comp.accentColor,
                          background: `${comp.accentColor}18`,
                        }}
                      >
                        {comp.badgeLabel}
                      </span>
                    </div>

                    <p className={styles.cardTagline}>{comp.tagline}</p>

                    <div className={styles.cardFooter}>
                      {isSelected ? (
                        <span className={styles.activeLabel}>
                          <span className={styles.activeDot} />
                          Active
                        </span>
                      ) : (
                        <span className={styles.selectHint}>Click to select</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* If Sparky is selected, show trade options cleanly underneath */}
          {companionId === 'sparky' && selectedCompanion.tradeOptions && (
            <div className={styles.tradeCustomizationSection}>
              <div className={styles.tradeSectionHeader}>
                <span className={styles.tradeSectionIcon}>🎨</span>
                <span className={styles.tradeSectionTitle}>Optional: Customize Sparky&apos;s Trade Uniform</span>
              </div>
              <div className={styles.tradePillGrid}>
                {selectedCompanion.tradeOptions.map((trade) => {
                  const isTradeActive = (companionTrade || 'general').toLowerCase() === trade.id.toLowerCase();
                  return (
                    <button
                      key={trade.id}
                      type="button"
                      className={`${styles.tradePill} ${isTradeActive ? styles.tradePillActive : ''}`}
                      onClick={() => handleSelectTrade(trade.id)}
                    >
                      <span className={styles.tradeEmoji}>{trade.emoji}</span>
                      <span>{trade.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className={styles.footer}>
          <p className={styles.footerNote}>
            Your selected avatar is active across your dashboard, AI assistant, and job workflows.
          </p>
          <button type="button" className={styles.doneBtn} onClick={closeCompanionPicker}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
