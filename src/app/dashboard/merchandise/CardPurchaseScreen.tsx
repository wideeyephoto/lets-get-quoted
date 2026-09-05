'use client';

import React, { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import {
  ShieldCheck,
  Truck,
  Sparkles,
  ArrowRight,
  Edit3,
  Clock,
  Package,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { MerchandiseStudioInitialData, MerchandiseOrder, ShippingAddress } from '@/lib/merchandise/types';
import {
  type SupportedCardQuantity,
  CARD_RETAIL_SUBTOTAL_CENTS,
  centsToDollars,
} from '@/lib/merchandise/card-catalog-types';
import { renderCardArtwork, type CardDesignDocument } from '@/lib/merchandise/card-renderer';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderSuccessNumber, setOrderSuccessNumber] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      email: past?.email || 'info@contractorpro.com',
    };
  });

  // Check URL query parameters for return from Stripe checkout
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('order_success') === 'true') {
        setOrderSuccessNumber(params.get('order_number') || 'LGQ-ORDER');
      }
    }
  }, []);

  // Initialize design document from profile data
  const [cardDoc, setCardDoc] = useState<CardDesignDocument>(() => {
    const rawWebsite = initialData.website?.replace(/^https?:\/\//i, '').replace(/\/$/, '') || '';
    const destination = rawWebsite ? `https://${rawWebsite}` : 'https://letsgetquoted.com';

    return {
      version: 1,
      templateId: 'clean',
      content: {
        businessName: initialData.companyName || 'Apex Pro Contracting',
        trade: initialData.trade || 'General Contractor',
        tagline: initialData.tagline || 'Licensed & Insured Quality Craftsmanship',
        phone: initialData.phone || '(555) 000-QUOTE',
        website: rawWebsite || 'www.letsgetquoted.com',
        email: 'info@' + (rawWebsite || 'contractorpro.com'),
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
  const shippingDollars = 12.0; // Standard tracked ground
  const totalDollars = subtotalDollars + shippingDollars;

  const handleCheckout = () => {
    // Open proof review modal first to sign off before initiating checkout
    setIsReviewingProof(true);
  };

  const handleProofApproved = () => {
    setIsReviewingProof(false);
    setIsDeliveryStep(true);
  };

  const handleProceedToPayment = async (confirmedAddress: ShippingAddress) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setShippingAddress(confirmedAddress);

    try {
      const { frontSvg, backSvg } = renderCardArtwork(cardDoc);

      const proofRes = await saveCardProofAction({
        frontSvg,
        backSvg,
        designRevision: cardDoc.version || 1,
      });

      if (!proofRes.ok || !proofRes.proofId || !proofRes.approvalHash) {
        throw new Error(proofRes.error || 'Failed to record approved production proof.');
      }

      const quoteRes = await createCardQuoteAction({
        proofId: proofRes.proofId,
        cardCount: selectedQuantity,
        shippingAddress: confirmedAddress,
      });

      if (!quoteRes.ok || !quoteRes.quote) {
        throw new Error(quoteRes.error || 'Failed to generate authoritative quote.');
      }

      const checkoutRes = await createCardCheckoutSessionAction({
        quote: quoteRes.quote,
        proofId: proofRes.proofId,
        approvalHash: proofRes.approvalHash,
        shippingAddress: confirmedAddress,
        companyName: cardDoc.content.businessName,
      });

      if (!checkoutRes.ok || !checkoutRes.checkoutUrl) {
        throw new Error(checkoutRes.error || 'Failed to initialize secure Stripe checkout.');
      }

      window.location.href = checkoutRes.checkoutUrl;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
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
                Order Confirmed (#{orderSuccessNumber})
              </h3>
              <p className={styles.successDesc}>
                Your business cards have been approved and submitted to Printful for commercial manufacturing on Mohawk 300 DPI uncoated paper. Carrier tracking will be emailed to your address once dispatched.
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
            Made with your verified company name, contact info, and dynamic QR booking link. Check both sides, choose your quantity, and order in 2 minutes.
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
              <span>Tracked Ground Shipping (US)</span>
              <strong>${shippingDollars.toFixed(2)}</strong>
            </div>
            <div className={styles.summaryRow} style={{ fontSize: '0.75rem' }}>
              <span>Estimated Sales Tax</span>
              <span style={{ color: 'var(--muted-2)' }}>Calculated at payment</span>
            </div>

            <div className={styles.summaryTotalRow}>
              <span>Estimated Total</span>
              <span className={styles.summaryTotalAmount}>${totalDollars.toFixed(2)}</span>
            </div>
          </div>

          {/* Primary & Secondary Actions */}
          <div className={styles.actionStack}>
            <button
              type="button"
              onClick={handleCheckout}
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
              <span>Ships within 2–3 business days via UPS Ground</span>
            </div>
            <div className={styles.guaranteeItem}>
              <ShieldCheck size={15} className={styles.guaranteeIcon} />
              <span>100% Print-Accuracy Guarantee with live package tracking</span>
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
                    href={`https://www.ups.com/track?tracknum=${order.trackingNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.trackLink}
                  >
                    <span>Track</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted-2)' }}>Processing</span>
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
          className={styles.mobileOrderBtn}
        >
          <span>Review Cards</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

