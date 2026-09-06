'use client';

import React from 'react';
import type { MerchandiseOrderItem, ShippingAddress } from '@/lib/merchandise/types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkoutItems: MerchandiseOrderItem[];
  businessName: string;
  tagline?: string;
  phone?: string;
  website?: string;
  license?: string;
  accentColor?: string;
  secondaryColor?: string;
  shippingAddress: ShippingAddress;
  setShippingAddress: React.Dispatch<React.SetStateAction<ShippingAddress>>;
  shippingMethod: 'standard' | 'rush';
  setShippingMethod: (method: 'standard' | 'rush') => void;
  proofApproved: boolean;
  setProofApproved: (approved: boolean) => void;
  checkoutError: string | null;
  isCheckingOut: boolean;
  onExecuteCheckout: () => void;
  onUpdateCartItemQuantity: (index: number, delta: number) => void;
  onRemoveFromCart: (index: number) => void;
  cart: MerchandiseOrderItem[];
}

export default function CheckoutModal({
  isOpen,
  onClose,
  checkoutItems,
  businessName,
  tagline,
  phone,
  website,
  license,
  accentColor,
  secondaryColor,
  shippingAddress,
  setShippingAddress,
  shippingMethod,
  setShippingMethod,
  proofApproved,
  setProofApproved,
  checkoutError,
  isCheckingOut,
  onExecuteCheckout,
  onUpdateCartItemQuantity,
  onRemoveFromCart,
  cart,
}: CheckoutModalProps) {
  if (!isOpen) return null;

  const itemSubtotal = checkoutItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const estimatedShipping = shippingMethod === 'rush' ? 24.0 : itemSubtotal >= 150 ? 0.0 : 12.0;
  const subtotalWithShipping = itemSubtotal + estimatedShipping;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Instant Purchasing Checkout"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0e1219',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          color: 'var(--text)',
          borderRadius: '16px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#131924',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#ffffff' }}>
              Instant Purchasing Checkout
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              Direct print run for {businessName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout modal"
            className="focus-ring"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 8px',
              color: '#ffffff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {checkoutError && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                fontSize: '0.82rem',
                fontWeight: 700,
              }}
            >
              {checkoutError}
            </div>
          )}

          {/* Order Items Summary */}
          <div
            style={{
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.65rem 1rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em' }}>
                Order Items ({checkoutItems.reduce((acc, it) => acc + it.quantity, 0)} units)
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
                {checkoutItems.length} {checkoutItems.length === 1 ? 'line item' : 'line items'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {checkoutItems.map((item, idx) => (
                <div
                  key={`${item.productId}-${idx}`}
                  style={{
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    borderBottom: idx < checkoutItems.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.productName}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(var(--tint), 0.1)',
                          color: 'var(--muted)',
                          fontWeight: 700,
                        }}
                      >
                        ×{item.quantity}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                      Color: {item.colorName}
                      {item.customizationDetails?.finish ? ` • Finish: ${item.customizationDetails.finish}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      ${item.totalPrice.toFixed(2)}
                    </strong>
                    {cart.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => onUpdateCartItemQuantity(idx, -1)}
                          aria-label="Decrease quantity"
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateCartItemQuantity(idx, 1)}
                          aria-label="Increase quantity"
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveFromCart(idx)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            borderRadius: '5px',
                            padding: '3px 7px',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            fontWeight: 700,
                            marginLeft: '0.2rem',
                          }}
                          title="Remove from order"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Address Inputs */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Shipping &amp; Delivery Address
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label htmlFor="merch-ship-fullname" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Recipient Name:
                  </label>
                  <input
                    id="merch-ship-fullname"
                    type="text"
                    placeholder="Recipient Full Name"
                    value={shippingAddress.fullName}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="merch-ship-company" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Company Name (Optional):
                  </label>
                  <input
                    id="merch-ship-company"
                    type="text"
                    placeholder="Company Name"
                    value={shippingAddress.companyName || ''}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, companyName: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="merch-ship-street" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Street Address:
                </label>
                <input
                  id="merch-ship-street"
                  type="text"
                  placeholder="Street Address (e.g. 100 Main St)"
                  value={shippingAddress.streetAddress}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, streetAddress: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label htmlFor="merch-ship-city" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    City:
                  </label>
                  <input
                    id="merch-ship-city"
                    type="text"
                    placeholder="City"
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="merch-ship-state" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    State:
                  </label>
                  <input
                    id="merch-ship-state"
                    type="text"
                    placeholder="State (e.g. CO)"
                    value={shippingAddress.state}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="merch-ship-zip" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    ZIP Code:
                  </label>
                  <input
                    id="merch-ship-zip"
                    type="text"
                    placeholder="ZIP Code"
                    value={shippingAddress.postalCode}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label htmlFor="merch-ship-phone" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Delivery Phone #:
                  </label>
                  <input
                    id="merch-ship-phone"
                    type="tel"
                    placeholder="Phone #"
                    value={shippingAddress.phone}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="merch-ship-email" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Order Receipt Email:
                  </label>
                  <input
                    id="merch-ship-email"
                    type="email"
                    placeholder="Receipt Email"
                    value={shippingAddress.email}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '7px', border: '1px solid var(--line, rgba(var(--tint), 0.14))', background: 'var(--input-bg, rgba(var(--tint), 0.05))', color: 'var(--text)', fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Speed Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Delivery Speed
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShippingMethod('standard')}
                style={{
                  padding: '0.65rem',
                  borderRadius: '8px',
                  border: shippingMethod === 'standard' ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.12)',
                  background: shippingMethod === 'standard' ? 'rgba(255, 122, 33, 0.15)' : 'rgba(var(--tint), 0.04)',
                  color: 'var(--text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ fontSize: '0.82rem', display: 'block' }}>Standard Tracked Ground</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {itemSubtotal >= 150 ? 'FREE (Orders $150+)' : '$12.00 • 3–5 business days'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShippingMethod('rush')}
                style={{
                  padding: '0.65rem',
                  borderRadius: '8px',
                  border: shippingMethod === 'rush' ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.12)',
                  background: shippingMethod === 'rush' ? 'rgba(255, 122, 33, 0.15)' : 'rgba(var(--tint), 0.04)',
                  color: 'var(--text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong style={{ fontSize: '0.82rem', display: 'block' }}>Rush Priority Air Freight</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>$24.00 • 2-day priority</span>
              </button>
            </div>
          </div>

          {/* MANDATORY DIGITAL PROOF SIGN-OFF GATE */}
          <div
            style={{
              padding: '0.9rem',
              borderRadius: '10px',
              background: proofApproved ? 'rgba(34, 197, 94, 0.12)' : 'rgba(var(--tint), 0.04)',
              border: proofApproved ? '1.5px solid #22c55e' : '1.5px solid rgba(var(--tint), 0.14)',
              transition: 'all 0.2s ease',
            }}
          >
            <label
              htmlFor="merchandise-proof-checkbox"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.65rem',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--text)',
                lineHeight: 1.45,
              }}
            >
              <input
                id="merchandise-proof-checkbox"
                type="checkbox"
                checked={proofApproved}
                onChange={(e) => setProofApproved(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <span>
                  I have verified and approve all customized fields on this production proof: business name (<strong>{businessName}</strong>)
                  {tagline ? <>, tagline (<strong>{tagline}</strong>)</> : null}
                  {phone ? <>, phone (<strong>{phone}</strong>)</> : null}
                  {website ? <>, website (<strong>{website}</strong>)</> : null}
                  {license ? <>, license (<strong>{license}</strong>)</> : null}
                  {accentColor ? <>, colors (<strong>{accentColor}</strong> / <strong>{secondaryColor}</strong>)</> : null}.
                  I understand custom merchandise goes directly to manufacturing and cannot be refunded for typographical errors.
                </span>
                <div style={{ marginTop: '0.35rem' }}>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline', fontSize: '0.78rem' }}
                  >
                    View Terms of Sale &amp; Custom Merchandise Order Policy →
                  </a>
                </div>
              </div>
            </label>
          </div>

          {/* Cost Breakdown */}
          <div style={{ borderTop: '1px solid rgba(var(--tint), 0.12)', paddingTop: '0.75rem', fontSize: '0.84rem', color: 'var(--muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Merchandise Subtotal:</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>${itemSubtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Shipping ({shippingMethod === 'rush' ? 'Rush Priority' : 'Standard Ground'}):</span>
              <span style={{ color: estimatedShipping === 0 ? 'var(--good, #22c55e)' : 'var(--text)', fontWeight: 600 }}>
                {estimatedShipping === 0 ? 'FREE' : `$${estimatedShipping.toFixed(2)}`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Sales Tax:</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, fontStyle: 'italic', fontSize: '0.8rem' }}>
                Calculated at Checkout (Stripe Tax)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(var(--tint), 0.12)', paddingTop: '8px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>
              <span>Total (before tax):</span>
              <span style={{ color: 'var(--accent)' }}>${subtotalWithShipping.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(var(--tint), 0.08)',
            background: 'var(--surface, #131924)',
            display: 'flex',
            gap: '0.6rem',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '7px',
              border: '1px solid rgba(var(--tint), 0.12)',
              background: 'rgba(var(--tint), 0.06)',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onExecuteCheckout}
            disabled={isCheckingOut || !proofApproved}
            style={{
              padding: '0.6rem 1.35rem',
              borderRadius: '7px',
              border: 'none',
              background: !proofApproved ? 'rgba(var(--tint), 0.1)' : 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: '0.88rem',
              cursor: isCheckingOut ? 'wait' : !proofApproved ? 'not-allowed' : 'pointer',
              boxShadow: !proofApproved ? 'none' : '0 4px 16px rgba(255,122,33,0.35)',
            }}
          >
            {isCheckingOut ? 'Redirecting to Stripe...' : `Pay $${subtotalWithShipping.toFixed(2)} via Stripe →`}
          </button>
        </div>
      </div>
    </div>
  );
}
