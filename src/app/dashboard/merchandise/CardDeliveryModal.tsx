'use client';

import React, { useState } from 'react';
import { X, Truck, Lock, ArrowRight, Loader2 } from 'lucide-react';
import type { ShippingAddress } from '@/lib/merchandise/types';
import {
  type SupportedCardQuantity,
  CARD_RETAIL_SUBTOTAL_CENTS,
  centsToDollars,
} from '@/lib/merchandise/card-catalog-types';
import styles from './card-purchase.module.css';

interface CardDeliveryModalProps {
  quantity: SupportedCardQuantity;
  initialAddress: ShippingAddress;
  companyName: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: (address: ShippingAddress) => void;
  onBack: () => void;
  onClose: () => void;
}

export default function CardDeliveryModal({
  quantity,
  initialAddress,
  companyName,
  isSubmitting,
  errorMessage,
  onConfirm,
  onBack,
  onClose,
}: CardDeliveryModalProps) {
  const [address, setAddress] = useState<ShippingAddress>(initialAddress);
  const [validationError, setValidationError] = useState<string | null>(null);

  const subtotalDollars = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[quantity]);
  const shippingDollars = 0;
  const totalDollars = subtotalDollars + shippingDollars;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!address.fullName?.trim() || address.fullName.trim().length < 2) {
      setValidationError('Please enter a valid recipient full name.');
      return;
    }
    if (!address.streetAddress?.trim() || address.streetAddress.trim().length < 3) {
      setValidationError('Please enter a valid delivery street address.');
      return;
    }
    if (!address.city?.trim() || address.city.trim().length < 2) {
      setValidationError('Please enter a valid delivery city.');
      return;
    }
    if (!address.state?.trim() || !/^[A-Za-z]{2}$/.test(address.state.trim())) {
      setValidationError('Please enter a 2-letter US state code (e.g. CO, NY, TX).');
      return;
    }
    if (!address.postalCode?.trim() || !/^\d{5}(-\d{4})?$/.test(address.postalCode.trim())) {
      setValidationError('Please enter a valid 5-digit US ZIP code.');
      return;
    }
    if (!address.phone?.trim() || address.phone.replace(/\D/g, '').length < 10) {
      setValidationError('Please enter a valid 10-digit phone number for carrier delivery updates.');
      return;
    }
    if (!address.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.email.trim())) {
      setValidationError('Please enter a valid email address for delivery tracking.');
      return;
    }

    onConfirm(address);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div style={{ marginBottom: '0.35rem' }}>
              <span className={styles.badge}>
                Step 2 of 2: Shipping
              </span>
            </div>
            <h3 className={styles.modalTitle}>Delivery Destination &amp; Checkout</h3>
            <p className={styles.modalSubtitle}>
              Confirm where to send your cards. Shipping and tax are shown for review before payment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={styles.modalCloseBtn}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Order Breakdown Snapshot */}
        <div className={styles.deliverySummaryCard}>
          <div className={styles.deliverySummaryRow}>
            <span>{quantity} Cards (Mohawk Uncoated)</span>
            <strong>${subtotalDollars.toFixed(2)}</strong>
          </div>
          <div className={styles.deliverySummaryRow}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
              <Truck size={14} style={{ color: 'var(--good, #3dd68c)' }} />
              <span>Shipping (US)</span>
            </span>
            <span>Quoted at checkout</span>
          </div>
          <div className={styles.deliverySummaryTotal}>
            <span>Cards before shipping and tax</span>
            <span className={styles.deliveryTotalAmount}>${totalDollars.toFixed(2)}</span>
          </div>
        </div>

        {/* Error Alert */}
        {(validationError || errorMessage) && (
          <div className={styles.deliveryAlertError}>
            {validationError || errorMessage}
          </div>
        )}

        {/* Address Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="card-delivery-1" className={styles.inputLabel}>
                Recipient Full Name *
              </label>
              <input id="card-delivery-1"
                type="text"
                required
                value={address.fullName}
                onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                placeholder="First and Last Name"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="card-delivery-2" className={styles.inputLabel}>
                Company Name (Optional)
              </label>
              <input id="card-delivery-2"
                type="text"
                value={address.companyName || companyName}
                onChange={(e) => setAddress({ ...address, companyName: e.target.value })}
                placeholder="Company / Business Name"
                className={styles.formInput}
              />
            </div>
          </div>

          <div className={styles.formField}>
            <label htmlFor="card-delivery-3" className={styles.inputLabel}>
              Street Address *
            </label>
            <input id="card-delivery-3"
              type="text"
              required
              value={address.streetAddress}
              onChange={(e) => setAddress({ ...address, streetAddress: e.target.value })}
              placeholder="123 Main Street"
              className={styles.formInput}
            />
          </div>

          <div className={styles.formCol3}>
            <div className={styles.formField}>
              <label htmlFor="card-delivery-4" className={styles.inputLabel}>
                City *
              </label>
              <input id="card-delivery-4"
                type="text"
                required
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                placeholder="City"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="card-delivery-5" className={styles.inputLabel}>
                State (2 letters) *
              </label>
              <input id="card-delivery-5"
                type="text"
                required
                maxLength={2}
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                placeholder="CO"
                className={styles.formInput}
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="card-delivery-6" className={styles.inputLabel}>
                ZIP Code *
              </label>
              <input id="card-delivery-6"
                type="text"
                required
                maxLength={10}
                value={address.postalCode}
                onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                placeholder="80202"
                className={styles.formInput}
              />
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="card-delivery-7" className={styles.inputLabel}>
                Phone (for delivery updates) *
              </label>
              <input id="card-delivery-7"
                type="tel"
                required
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                placeholder="(555) 000-0000"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="card-delivery-8" className={styles.inputLabel}>
                Tracking Email *
              </label>
              <input id="card-delivery-8"
                type="email"
                required
                value={address.email}
                onChange={(e) => setAddress({ ...address, email: e.target.value })}
                placeholder="contractor@business.com"
                className={styles.formInput}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.modalFooter} style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className={styles.modalSecondaryBtn}
            >
              ← Back to Proof
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={styles.modalPrimaryBtn}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Preparing Checkout...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Continue to shipping and payment</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
