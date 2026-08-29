'use client';

import { useState, useEffect } from 'react';
import styles from './undo-time-machine.module.css';

export default function UndoTimeMachine() {
  const [isRolledBack, setIsRolledBack] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(874); // ~14m 34s

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  function handleTriggerUndo() {
    setIsRolledBack(true);
  }

  function handleResetDemo() {
    setIsRolledBack(false);
    setSecondsLeft(874);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <span className={styles.badge}>↺ 15-Minute Undo Time-Machine Guarantee</span>
        <h3 className={styles.title}>Made a mistake while driving? Reply UNDO within 15 minutes.</h3>
        <p className={styles.subtitle}>
          Field mistakes happen. If you accidentally text the wrong job number, change order price, or mark the wrong task complete, simply reply <strong>UNDO</strong> to restore the previous state immediately.
        </p>
      </div>

      <div className={styles.machineGrid}>
        {/* Left: SMS Interaction Feed */}
        <div className={styles.phoneBox}>
          <div style={{ fontSize: '11px', color: '#7da0b3', fontWeight: 800 }}>
            📱 SMS Conversation · Job J-104 (Miller)
          </div>

          <div className={styles.chatBubbleSent}>
            Add $4,500 to Miller job for deck framing (Accidental Typo: Meant $450)
          </div>

          <div className={styles.chatBubbleAi}>
            <span style={{ fontSize: '11px', color: '#50e3bd', fontWeight: 800 }}>
              ⚡ Let’s Get Quoted AI
            </span>
            <span>
              Added $4,500.00 to Job J-104 (Miller). Total updated: $7,300.00.
            </span>
            <small style={{ color: '#f59e0b', fontWeight: 700 }}>
              ↺ Reply UNDO within 15 minutes to revert this change order.
            </small>
          </div>

          {isRolledBack && (
            <>
              <div className={styles.chatBubbleSent} style={{ background: '#f59e0b', color: '#000', fontWeight: 800 }}>
                UNDO
              </div>
              <div className={styles.chatBubbleAi} style={{ borderLeft: '3px solid #10b981' }}>
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 800 }}>
                  ✓ Atomic Rollback Successful
                </span>
                <span>
                  Reverted $4,500 line item. Job J-104 restored to original $2,800.00 balance.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: Rollback Control & Database State */}
        <div className={styles.rollbackCard}>
          <div>
            <div className={styles.countdownBar}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f5f0e7' }}>
                Active Rollback Safety Window:
              </span>
              <span className={styles.countdownTimer}>⏱ {timeFormatted}</span>
            </div>

            <div className={styles.stateDisplay} style={{ marginTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#7da0b3', textTransform: 'uppercase' }}>
                Live Database State:
              </div>
              <div className={styles.stateRow}>
                <span style={{ color: '#a7bcc8' }}>Target Job:</span>
                <strong style={{ color: '#f5f0e7' }}>J-104 (Miller Residence)</strong>
              </div>
              <div className={styles.stateRow}>
                <span style={{ color: '#a7bcc8' }}>Quote Amount:</span>
                <strong style={{ color: isRolledBack ? '#50e3bd' : '#f87171' }}>
                  {isRolledBack ? '$2,800.00 (Restored)' : '$7,300.00 (Typo Mutated)'}
                </strong>
              </div>
              <div className={styles.stateRow}>
                <span style={{ color: '#a7bcc8' }}>Audit Trail:</span>
                <span style={{ color: '#93c5fd' }}>
                  {isRolledBack ? 'Atomic Transaction Reverted' : 'Staged for Rollback'}
                </span>
              </div>
            </div>
          </div>

          {!isRolledBack ? (
            <button
              type="button"
              onClick={handleTriggerUndo}
              className={styles.undoActionBtn}
            >
              ↺ Test "Reply UNDO" Rollback
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResetDemo}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(174, 199, 211, 0.25)',
                color: '#d1e2eb',
                padding: '12px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              ↺ Re-test Rollback Demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
