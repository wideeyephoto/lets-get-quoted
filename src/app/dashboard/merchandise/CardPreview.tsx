'use client';

import React, { useState } from 'react';
import { Maximize2, CheckCircle } from 'lucide-react';
import { renderCardArtwork, type CardDesignDocument } from '@/lib/merchandise/card-renderer';
import styles from './card-purchase.module.css';

interface CardPreviewProps {
  document: CardDesignDocument;
  onEditRequested?: () => void;
}

export default function CardPreview({ document, onEditRequested }: CardPreviewProps) {
  const [activeSide, setActiveSide] = useState<'both' | 'front' | 'back'>('both');
  const [isEnlarged, setIsEnlarged] = useState(false);

  const { frontSvg, backSvg } = renderCardArtwork(document);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* View Toggle Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.45rem 0.65rem',
          borderRadius: '12px',
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={() => setActiveSide('both')}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: activeSide === 'both' ? 'rgba(var(--tint), 0.12)' : 'transparent',
              color: activeSide === 'both' ? 'var(--text)' : 'var(--muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Both Sides
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('front')}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: activeSide === 'front' ? 'rgba(var(--tint), 0.12)' : 'transparent',
              color: activeSide === 'front' ? 'var(--text)' : 'var(--muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Front Only
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('back')}
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: activeSide === 'back' ? 'rgba(var(--tint), 0.12)' : 'transparent',
              color: activeSide === 'back' ? 'var(--text)' : 'var(--muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Back (QR) Only
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setIsEnlarged(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '8px',
              background: 'rgba(var(--tint), 0.06)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Enlarge proof"
          >
            <Maximize2 size={13} />
            <span>Enlarge</span>
          </button>
        </div>
      </div>

      {/* Cards Canvas Container */}
      <div
        style={{
          position: 'relative',
          padding: '1.75rem 1.25rem',
          borderRadius: '16px',
          background: 'var(--bg-3)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          minHeight: '340px',
        }}
      >
        {/* Front Card */}
        {(activeSide === 'both' || activeSide === 'front') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '380px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Front Side</span>
            <div
              className={styles.proofCardContainer}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
              onClick={() => setIsEnlarged(true)}
              dangerouslySetInnerHTML={{ __html: frontSvg }}
            />
          </div>
        )}

        {/* Back Card */}
        {(activeSide === 'both' || activeSide === 'back') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '380px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Back Side (QR)</span>
            <div
              className={styles.proofCardContainer}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
              onClick={() => setIsEnlarged(true)}
              dangerouslySetInnerHTML={{ __html: backSvg }}
            />
          </div>
        )}
      </div>

      {/* Specifications & Stock Badge */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--muted)', padding: '0 0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 600,
              color: 'var(--good, #3dd68c)',
              background: 'rgba(61, 214, 140, 0.12)',
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
              border: '1px solid rgba(61, 214, 140, 0.3)',
            }}
          >
            <CheckCircle size={13} />
            Verified Mohawk Uncoated Cover
          </span>
          <span>Standard US 3.5″ × 2.0″ Trim</span>
        </div>
        {onEditRequested && (
          <button
            type="button"
            onClick={onEditRequested}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: '0.75rem',
              padding: 0,
            }}
          >
            Edit info or change design →
          </button>
        )}
      </div>

      {/* Enlarged Modal */}
      {isEnlarged && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(6px)',
            padding: '1rem',
          }}
          onClick={() => setIsEnlarged(false)}
        >
          <div
            style={{
              background: 'var(--bg-elevated, var(--bg-2))',
              border: '1px solid var(--line)',
              borderRadius: '20px',
              maxWidth: '960px',
              width: '100%',
              padding: '1.75rem',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              color: 'var(--text)',
              boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.75)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>High-Resolution Production Proof</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>300 DPI full-bleed print vectors. Check all spelling and contact details.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEnlarged(false)}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: '8px',
                  background: 'rgba(var(--tint), 0.08)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Close Preview
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>Front Artwork</span>
                <div
                  className={styles.proofCardContainer}
                  style={{ width: '100%' }}
                  dangerouslySetInnerHTML={{ __html: frontSvg }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>Back Artwork (Dynamic QR)</span>
                <div
                  className={styles.proofCardContainer}
                  style={{ width: '100%' }}
                  dangerouslySetInnerHTML={{ __html: backSvg }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
