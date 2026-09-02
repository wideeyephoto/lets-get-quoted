'use client';

import React from 'react';
import { useAssistant } from '@/components/ai-assistant/AssistantProvider';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';

export default function CopilotSettingsSection() {
  const {
    companionId,
    companionTrade,
    companion,
    openCompanionPicker,
    isFloatingEnabled,
    setFloatingEnabled,
  } = useAssistant();

  return (
    <section className="panel workspace-section-card" id="copilot">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">AI Sidekick &amp; Copilot</p>
        <h2>AI Copilot &amp; Screen Assistant</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1.1rem' }}>
        Your customizable AI assistant ({companion.name}) can draft quotes, analyze job photos and receipts, look up schedule openings, and answer questions with live screen awareness.
      </p>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {/* Floating Screen Widget On/Off Switch */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1rem 1.15rem',
          borderRadius: '10px',
          border: '1px solid var(--edge-t14)',
          background: 'rgba(var(--tint), 0.035)',
        }}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.92rem', marginBottom: '0.2rem', color: 'var(--text)' }}>
              Floating Copilot screen button
            </strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted-2)', lineHeight: 1.4 }}>
              Show the floating {companion.name} avatar in the bottom-right corner of your dashboard screens.
            </span>
          </div>

          <div className="automation-switch-wrap">
            <button
              type="button"
              className={`automation-switch${isFloatingEnabled ? ' on' : ''}`}
              onClick={() => setFloatingEnabled(!isFloatingEnabled)}
              aria-checked={isFloatingEnabled}
              role="switch"
              aria-label="Toggle floating AI Copilot button"
            >
              <span className="automation-switch-track">
                <span className="automation-switch-knob" />
              </span>
              <span className="automation-switch-text">
                {isFloatingEnabled ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        </div>

        {/* Companion Avatar & Persona Card */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1rem 1.15rem',
          borderRadius: '10px',
          border: '1px solid var(--edge-t14)',
          background: 'rgba(var(--tint), 0.035)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <SparkyAvatar
              companionId={companionId}
              trade={companionTrade}
              size={44}
              status="online"
              expression="avatar"
              alt={companion.name}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <strong style={{ fontSize: '0.94rem', color: 'var(--text)' }}>{companion.name}</strong>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(165, 180, 252, 0.35)',
                  color: '#c7d2fe',
                }}>
                  {companion.badgeLabel}
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted-2)' }}>
                {companion.role} · {companion.tagline}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn secondary"
            onClick={openCompanionPicker}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <span>✦</span>
            <span>Switch Avatar &amp; Uniform</span>
          </button>
        </div>

        {/* Keyboard Shortcut Hint */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(129, 140, 248, 0.2)',
          fontSize: '0.82rem',
          color: 'var(--text)',
        }}>
          <span style={{ fontSize: '1.1rem' }}>⚡</span>
          <span>
            <strong>Quick Shortcut:</strong> Press <kbd style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.78rem' }}>⌘J</kbd> or <kbd style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.78rem' }}>Ctrl+J</kbd> (or <kbd style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.78rem' }}>⌘K</kbd>) anywhere to open or close Copilot instantly.
          </span>
        </div>
      </div>
    </section>
  );
}
