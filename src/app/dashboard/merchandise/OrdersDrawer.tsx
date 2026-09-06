'use client';

import React from 'react';
import type { MerchandiseOrder } from '@/lib/merchandise/types';

interface OrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orders: MerchandiseOrder[];
  onReorder: (orderId: string) => void;
  isReordering: boolean;
}

export default function OrdersDrawer({
  isOpen,
  onClose,
  orders,
  onReorder,
  isReordering,
}: OrdersDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Merchandise Order History"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          height: '100%',
          background: '#0e1219',
          borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
          color: 'var(--text)',
          boxShadow: '-15px 0 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#ffffff' }}>
            Merchandise Order History
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring"
            aria-label="Close order history"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
            <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>📦</p>
            <strong style={{ display: 'block', color: 'var(--text)' }}>No orders yet</strong>
            <span style={{ fontSize: '0.8rem' }}>Customize your business cards or notepads and place your first order!</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.map((ord) => (
              <div
                key={ord.id}
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.035)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.88rem', color: '#ffffff' }}>{ord.orderNumber}</strong>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '3px 9px',
                      borderRadius: '999px',
                      background: ord.status === 'delivered' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: ord.status === 'delivered' ? '#86efac' : '#93c5fd',
                      border: ord.status === 'delivered' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    {ord.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                  {ord.items.map((it, idx) => (
                    <div key={idx}>
                      &bull; {it.productName} ({it.quantity}x) &ndash; {it.colorName}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '0.5rem', fontSize: '0.74rem' }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {ord.trackingNumber ? (
                      <>
                        Tracking: <strong style={{ color: 'var(--gold-ink)' }}>{ord.trackingNumber}</strong>
                        {ord.trackingCarrier ? ` (${ord.trackingCarrier})` : ''}
                      </>
                    ) : (
                      <span style={{ fontStyle: 'italic' }}>Tracking: Pending dispatch</span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.88rem', color: '#ffffff' }}>${ord.totalAmount.toFixed(2)}</strong>
                    <button
                      type="button"
                      onClick={() => onReorder(ord.id)}
                      disabled={isReordering}
                      className="focus-ring"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid var(--accent)',
                        background: 'rgba(255, 122, 33, 0.15)',
                        color: '#ff9d5c',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        cursor: isReordering ? 'wait' : 'pointer',
                      }}
                      title="Instant 1-click reorder of this exact design"
                    >
                      ⚡ Reorder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
