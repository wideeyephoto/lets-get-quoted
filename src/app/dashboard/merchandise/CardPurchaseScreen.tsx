'use client';

import React, { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  ShieldCheck,
  Truck,
  ArrowRight,
  Edit3,
  Clock,
  Layers,
  ExternalLink,
} from 'lucide-react';
import type { MerchandiseStudioInitialData, ShippingAddress } from '@/lib/merchandise/types';
import {
  type SupportedCardQuantity,
  CARD_RETAIL_SUBTOTAL_CENTS,
  centsToDollars,
} from '@/lib/merchandise/card-catalog-types';
import { type CardDesignDocument } from '@/lib/merchandise/card-renderer';
import type { CardQuoteRecord } from '@/lib/merchandise/card-operations';
import { generateCardQrSvg } from '@/lib/merchandise/card-qr';
import CardPreview from './CardPreview';
import CardQuantityPicker from './CardQuantityPicker';
import CardDetailsEditor from './CardDetailsEditor';
import CardProofReview from './CardProofReview';
import CardDeliveryModal from './CardDeliveryModal';
import styles from './card-purchase.module.css';
import {
  saveCardProofAction,
  createCardQuoteAction,
  createCardCheckoutSessionAction,
} from './actions';

// Lazy load the full 3D design studio for advanced editing or apparel/notepads
const MerchandiseDesignStudio = dynamic(() => import('./MerchandiseDesignStudio'), {
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--muted)' }}>
      <div style={{ width: '2rem', height: '2rem', borderRadius: '999px', border: '2px solid var(--line)', borderTopColor: 'var(--accent)', marginRight: '0.75rem', animation: 'spin 1s linear infinite' }} />
      Loading Advanced Merchandise Studio...
    </div>
  ),
});

interface CardPurchaseScreenProps {
  initialData: MerchandiseStudioInitialData;
}

export default function CardPurchaseScreen({ initialData }: CardPurchaseScreenProps) {
  const [showAdvancedStudio, setShowAdvancedStudio] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState<SupportedCardQuantity>(100);
  const [isEditing, setIsEditing] = useState(false);
  const [isReviewingProof, setIsReviewingProof] = useState(false);
  const [isDeliveryStep, setIsDeliveryStep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qrReadyFor, setQrReadyFor] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderSuccessNumber, setOrderSuccessNumber] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const preparedCheckout = useRef<{ key: string; proofId: string; approvalHash: string; quote: CardQuoteRecord } | null>(null);

  // Initialize shipping address from past orders if available
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>(() => {
    const past = initialData.recentOrders?.[0]?.shippingAddress;
    return {
      fullName: past?.fullName || initialData.companyName || '',
      companyName: past?.companyName || initialData.companyName || '',
      streetAddress: past?.streetAddress || '',
      apartmentSuite: past?.apartmentSuite || '',
      city: past?.city || '',
      state: past?.state || '',
      postalCode: past?.postalCode || '',
      country: 'US',
      phone: past?.phone || initialData.phone || '',
      email: past?.email || '',
    };
  });

  // Check URL query parameters for return from Stripe checkout
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('order_success') === 'true') {
        setOrderSuccessNumber(params.get('session_id') || '');
      }
    }
  }, []);

  // Initialize design document from profile data
  const [cardDoc, setCardDoc] = useState<CardDesignDocument>(() => {
    const rawWebsite = initialData.website?.replace(/^https?:\/\//i, '').replace(/\/$/, '') || '';
    const destination = rawWebsite ? `https://${rawWebsite}` : '';

    return {
      version: 1,
      templateId: 'clean',
      content: {
        businessName: initialData.companyName || '',
        trade: initialData.trade || 'General Contractor',
        tagline: initialData.tagline || '',
        phone: initialData.phone || '',
        website: rawWebsite,
        email: '',
        license: initialData.license || '',
      },
      colors: {
        accentColor: initialData.accentColor || '#0284c7',
        secondaryColor: initialData.secondaryColor || '#0f172a',
      },
      qr: {
        destinationUrl: destination,
        actionText: 'Scan to request a quote',
      },
    };
  });

  // Generate live scannable SVG QR code whenever destinationUrl changes
  React.useEffect(() => {
    let isCurrent = true;
    if (cardDoc.qr.destinationUrl) {
      generateCardQrSvg(cardDoc.qr.destinationUrl, {
        sizePx: 300,
        margin: 4,
        darkColor: '#000000',
        lightColor: '#ffffff',
      })
        .then((qrSvg) => {
          if (isCurrent) {
            setQrReadyFor(cardDoc.qr.destinationUrl);
            setCardDoc((prev) => {
              if (prev.qr.qrSvg === qrSvg) return prev;
              return {
                ...prev,
                qr: {
                  ...prev.qr,
                  qrSvg,
                },
              };
            });
          }
        })
        .catch((err) => {
          console.error('Failed to generate QR SVG:', err);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [cardDoc.qr.destinationUrl]);

  if (showAdvancedStudio) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
            Advanced Design Studio (Apparel, Signs, and 3D Mockups)
          </span>
          <button
            type="button"
            onClick={() => setShowAdvancedStudio(false)}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              borderRadius: '8px',
              background: 'var(--bg-3)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            ← Back to Instant Business Cards
          </button>
        </div>
        <MerchandiseDesignStudio initialData={initialData} />
      </div>
    );
  }

  const subtotalDollars = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[selectedQuantity]);
  const totalDollars = subtotalDollars;

  const handleCheckout = () => {
    // Open proof review modal first to sign off before initiating checkout
    setIsReviewingProof(true);
  };

  const handleProofApproved = () => {
    setIsReviewingProof(false);
    setIsDeliveryStep(true);
  };

  const handleProceedToPayment = async (confirmedAddress: ShippingAddress) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    setShippingAddress(confirmedAddress);

    try {
      const key = JSON.stringify([cardDoc, selectedQuantity, confirmedAddress]);
      let prepared = preparedCheckout.current;
      if (!prepared || prepared.key !== key || Date.parse(prepared.quote.expiresAt) <= Date.now()) {
        const proofRes = await saveCardProofAction({ document: cardDoc });
        if (!proofRes.ok || !proofRes.proofId || !proofRes.approvalHash) throw new Error(proofRes.error || 'Could not save your approved proof.');
        const quoteRes = await createCardQuoteAction({ proofId: proofRes.proofId, cardCount: selectedQuantity, shippingAddress: confirmedAddress });
        if (!quoteRes.ok || !quoteRes.quote) throw new Error(quoteRes.error || 'Could not quote this delivery address.');
        prepared = { key, proofId: proofRes.proofId, approvalHash: proofRes.approvalHash, quote: quoteRes.quote };
        preparedCheckout.current = prepared;
      }

      const checkoutRes = await createCardCheckoutSessionAction({
        quote: prepared.quote,
        proofId: prepared.proofId,
        approvalHash: prepared.approvalHash,
        shippingAddress: confirmedAddress,
        companyName: cardDoc.content.businessName,
      });

      if (!checkoutRes.ok || !checkoutRes.checkoutUrl) {
        throw new Error(checkoutRes.error || 'Failed to initialize secure Stripe checkout.');
      }

      window.location.href = checkoutRes.checkoutUrl;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      {/* Order Success Confirmation Banner */}
      {orderSuccessNumber && (
        <div className={styles.successBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div className={styles.successIcon}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className={styles.successTitle}>
                Checkout received
              </h3>
              <p className={styles.successDesc}>
                Your order status below updates after payment verification and printer acceptance. Refresh to see the latest status.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOrderSuccessNumber(null)}
            className={styles.dismissBtn}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className={styles.headerContainer}>
        <div>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>
              Instant Ordering
            </span>
            <span className={styles.badgeDot}>•</span>
            <span className={styles.badgeMeta}>Fulfilled by Printful</span>
          </div>
          <h1 className={styles.pageTitle}>
            Your business cards are ready.
          </h1>
          <p className={styles.pageSubtitle}>
            Review your company details and QR booking link on both sides, then choose your quantity and delivery address.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => setShowAdvancedStudio(true)}
            className={styles.secondaryStudioBtn}
          >
            <Layers size={14} />
            <span>Advanced Studio</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className={styles.mainGrid}>
        {/* Left Column: Live Card Previews */}
        <div className={styles.previewWrapper}>
          <CardPreview
            document={cardDoc}
            onEditRequested={() => setIsEditing(true)}
          />
        </div>

        {/* Right Column: Order Panel */}
        <div className={styles.orderPanel}>
          <div className={styles.productSectionHeader}>
            <span>Selected Product</span>
            <h2>Set of Commercial Business Cards</h2>
            <p>Double-sided full color with scuff-resistant Mohawk uncoated paper.</p>
          </div>

          {/* Quantity Selector */}
          <CardQuantityPicker
            selectedQuantity={selectedQuantity}
            onChange={setSelectedQuantity}
          />

          {/* Order Summary & Pricing Breakdown */}
          <div className={styles.summaryContainer}>
            <div className={styles.summaryRow}>
              <span>{selectedQuantity} Business Cards</span>
              <strong>${subtotalDollars.toFixed(2)}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Shipping (US)</span>
              <span>Quoted for your address at checkout</span>
            </div>
            <div className={styles.summaryRow} style={{ fontSize: '0.75rem' }}>
              <span>Estimated Sales Tax</span>
              <span style={{ color: 'var(--muted-2)' }}>Calculated at payment</span>
            </div>

            <div className={styles.summaryTotalRow}>
              <span>Card subtotal</span>
              <span className={styles.summaryTotalAmount}>${totalDollars.toFixed(2)}</span>
            </div>
          </div>

          {/* Primary & Secondary Actions */}
          <div className={styles.actionStack}>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={qrReadyFor !== cardDoc.qr.destinationUrl}
              className={styles.primaryOrderBtn}
            >
              <span>Review My Cards &amp; Order</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={styles.secondaryEditBtn}
            >
              <Edit3 size={14} />
              <span>Edit Details, Colors, or Layout</span>
            </button>
          </div>

          {/* Fulfillment Assurance */}
          <div className={styles.guaranteeBox}>
            <div className={styles.guaranteeItem}>
              <Truck size={15} className={styles.guaranteeIcon} />
              <span>Delivery options and pricing are confirmed at checkout</span>
            </div>
            <div className={styles.guaranteeItem}>
              <ShieldCheck size={15} className={styles.guaranteeIcon} />
              <span>Review and approve both sides before ordering</span>
            </div>
          </div>
        </div>
      </div>

      {/* Order History Section (if recent orders exist) */}
      {initialData.recentOrders && initialData.recentOrders.length > 0 && (
        <div className={styles.pastOrdersSection}>
          <div className={styles.pastOrdersHeader}>
            <Clock size={16} style={{ color: 'var(--muted)' }} />
            <span>Recent Orders &amp; Print Runs</span>
          </div>

          <div className={styles.pastOrdersGrid}>
            {initialData.recentOrders.slice(0, 4).map((order) => (
              <div
                key={order.id}
                className={styles.orderHistoryCard}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={styles.orderNumText}>{order.orderNumber}</span>
                    <span className={styles.statusPill}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {order.items?.length || 1} items • Total: ${order.totalAmount.toFixed(2)}
                  </span>
                </div>

                {order.trackingNumber ? (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${order.trackingCarrier || ""} tracking ${order.trackingNumber}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.trackLink}
                  >
                    <span>Track</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted-2)' }}>{order.status === 'delivered' ? 'Delivered' : order.status === 'shipped' ? 'Tracking pending' : 'Awaiting fulfillment'}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Details Editor Modal */}
      {isEditing && (
        <CardDetailsEditor
          document={cardDoc}
          onSave={(updated) => {
            setCardDoc(updated);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}

      {/* Proof Review Modal */}
      {isReviewingProof && (
        <CardProofReview
          document={cardDoc}
          quantity={selectedQuantity}
          onApproved={handleProofApproved}
          onEditRequested={() => {
            setIsReviewingProof(false);
            setIsEditing(true);
          }}
          onCancel={() => setIsReviewingProof(false)}
        />
      )}

      {/* Delivery Address & Final Stripe Checkout Modal */}
      {isDeliveryStep && (
        <CardDeliveryModal
          quantity={selectedQuantity}
          initialAddress={shippingAddress}
          companyName={cardDoc.content.businessName}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          onConfirm={handleProceedToPayment}
          onBack={() => {
            setIsDeliveryStep(false);
            setIsReviewingProof(true);
          }}
          onClose={() => setIsDeliveryStep(false)}
        />
      )}

      {/* Sticky Bottom Action on Mobile */}
      <div className={styles.mobileStickyBar}>
        <div className={styles.mobileTotalGroup}>
          <span className={styles.mobileTotalCount}>{selectedQuantity} Cards</span>
          <span className={styles.mobileTotalAmount}>${totalDollars.toFixed(2)}</span>
        </div>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={qrReadyFor !== cardDoc.qr.destinationUrl}
          className={styles.mobileOrderBtn}
        >
          <span>Review Cards</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
