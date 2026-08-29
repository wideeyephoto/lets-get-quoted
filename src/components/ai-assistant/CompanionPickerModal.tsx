'use client';

import React from 'react';
import Image from 'next/image';
import { useAssistant } from './AssistantProvider';
import { COMPANIONS, type CompanionId, type CompanionProfile } from '@/lib/ai-assistant/companions';
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

  return (
    <div className={styles.overlay} onClick={closeCompanionPicker} aria-hidden="true">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose Your Copilot Companion"
      >
        {/* Top Accent Rim */}
        <div className={styles.topAccentRim} />

        {/* Modal Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.headerBadge}>Customize Sidekick</div>
            <h2 className={styles.title}>Choose Your Job Copilot</h2>
            <p className={styles.subtitle}>
              Pick the AI companion and trade style that best fits your jobsite workflow.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={closeCompanionPicker}
            aria-label="Close companion picker"
          >
            ✕
          </button>
        </div>

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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectCompanion(comp.id);
                  }
                }}
              >
                <div className={styles.avatarWrapper}>
                  <Image
                    src={comp.avatarSrc}
                    alt={comp.name}
                    width={80}
                    height={80}
                    className={styles.avatarImg}
                    unoptimized
                  />
                  {isSelected && (
                    <span className={styles.activeCheck} title="Active Companion">
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

                  <p className={styles.cardSpecies}>{comp.species}</p>
                  <p className={styles.cardTagline}>{comp.tagline}</p>

                  {/* If Sparky is selected or has trade options, show trade buttons */}
                  {comp.id === 'sparky' && isSelected && comp.tradeOptions && (
                    <div className={styles.tradePickerSection} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.tradePickerLabel}>Trade Uniform:</div>
                      <div className={styles.tradePillGrid}>
                        {comp.tradeOptions.map((trade) => {
                          const isTradeActive = companionTrade === trade.id;
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

                  <div className={styles.cardFooter}>
                    {isSelected ? (
                      <span className={styles.activeLabel}>
                        <span className={styles.activeDot} />
                        Active Companion
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={styles.selectBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectCompanion(comp.id);
                        }}
                      >
                        Select {comp.name}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className={styles.footer}>
          <p className={styles.footerNote}>
            Your Copilot companion is active across your dashboard, text-to-job workflows, and AI tools.
          </p>
          <button type="button" className={styles.doneBtn} onClick={closeCompanionPicker}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
