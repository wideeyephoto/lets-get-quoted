'use client';

import { useState, useMemo, useTransition, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  MERCHANDISE_PRODUCTS,
  MERCHANDISE_CATEGORIES,
  getProductById,
} from '@/lib/merchandise/catalog';
import { calculateSalesTax, getSalesTaxRate } from '@/lib/merchandise/pricing';
import type {
  MerchandiseProduct,
  MerchandiseCategoryId,
  MockupViewAngle,
  MerchandiseOrderItem,
  ShippingAddress,
  MerchandiseStudioInitialData,
  MerchandiseOrder,
} from '@/lib/merchandise/types';
import {
  createMerchandiseCheckoutAction,
  reorderMerchandiseAction,
  getMerchandiseStudioDataAction,
} from './actions';
import { generateLogoSvg } from '@/lib/logo-creator';
import MarketingNav from '../marketing/MarketingNav';
import Product3DMockupStage from './Product3DMockupStage';
import ProductTechnicalSpecsSheet from './ProductTechnicalSpecsSheet';

interface Props {
  initialData: MerchandiseStudioInitialData;
}

export default function MerchandiseDesignStudio({ initialData }: Props) {
  // Active product & category
  const [selectedCategory, setSelectedCategory] = useState<MerchandiseCategoryId | 'all'>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('biz_cards');
  const currentProduct = useMemo(
    () => getProductById(selectedProductId) || MERCHANDISE_PRODUCTS[0],
    [selectedProductId]
  );

  // Customization state
  const [selectedColorId, setSelectedColorId] = useState<string>(() => currentProduct.availableColors[0].id);
  const [selectedTierQty, setSelectedTierQty] = useState<number>(() => currentProduct.pricingTiers[0].quantity);
  const [selectedFinish, setSelectedFinish] = useState<string>(() => currentProduct.options?.finishes?.[0] || '');
  const [selectedModel, setSelectedModel] = useState<string>(
    () => currentProduct.options?.deviceModels?.[0] || 'iPhone 16 Pro Max'
  );
  const [viewAngle, setViewAngle] = useState<MockupViewAngle>('front');
  const [backdropTheme, setBackdropTheme] = useState<'clean' | 'dark' | 'jobsite'>('clean');
  const [includeQrCode, setIncludeQrCode] = useState<boolean>(true);

  // Apparel sizing state
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({
    M: 2,
    L: 4,
    XL: 4,
    '2XL': 2,
  });

  // Brand data state (pre-filled from initialData)
  const [businessName, setBusinessName] = useState(initialData.companyName);
  const [tagline, setTagline] = useState(initialData.tagline);
  const [phone, setPhone] = useState(initialData.phone);
  const [website, setWebsite] = useState(initialData.website);
  const [license, setLicense] = useState(initialData.license);
  const [accentColor, setAccentColor] = useState(initialData.accentColor);
  const [secondaryColor, setSecondaryColor] = useState(initialData.secondaryColor);

  // Draft autosave & restore
  const draftStorageKey = initialData.accountId
    ? `merchandise_draft_${initialData.accountId}`
    : 'merchandise_draft_default';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.businessName === 'string') setBusinessName(parsed.businessName);
        if (typeof parsed.tagline === 'string') setTagline(parsed.tagline);
        if (typeof parsed.phone === 'string') setPhone(parsed.phone);
        if (typeof parsed.website === 'string') setWebsite(parsed.website);
        if (typeof parsed.license === 'string') setLicense(parsed.license);
        if (typeof parsed.accentColor === 'string') setAccentColor(parsed.accentColor);
        if (typeof parsed.secondaryColor === 'string') setSecondaryColor(parsed.secondaryColor);
      }
    } catch {
      // Ignore storage errors
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          businessName,
          tagline,
          phone,
          website,
          license,
          accentColor,
          secondaryColor,
        })
      );
    } catch {
      // Ignore quota exceeded
    }
  }, [draftStorageKey, businessName, tagline, phone, website, license, accentColor, secondaryColor]);

  function handleResetToDefaults() {
    setBusinessName(initialData.companyName);
    setTagline(initialData.tagline);
    setPhone(initialData.phone);
    setWebsite(initialData.website);
    setLicense(initialData.license);
    setAccentColor(initialData.accentColor);
    setSecondaryColor(initialData.secondaryColor);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}
    }
  }

  // Logo source: 'site' | 'ai' | 'vector'
  const [logoSource, setLogoSource] = useState<'site' | 'ai' | 'vector'>(
    initialData.aiLogos.length > 0 ? 'ai' : initialData.currentLogoUrl ? 'site' : 'vector'
  );
  const [selectedAiLogoId, setSelectedAiLogoId] = useState<string | null>(
    initialData.aiLogos[0]?.id || null
  );

  // Modals & Drawers
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersDrawerOpen, setOrdersDrawerOpen] = useState(false);
  const [orders, setOrders] = useState<MerchandiseOrder[]>(initialData.recentOrders);
  const [orderSuccessModal, setOrderSuccessModal] = useState<MerchandiseOrder | null>(null);
  const [proofApproved, setProofApproved] = useState(false);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const canvasProofExportRef = useRef<(() => Promise<string>) | null>(null);
  const cartToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modal Escape key handling & body scroll locking
  useEffect(() => {
    const isAnyModalOpen = checkoutOpen || ordersDrawerOpen || !!orderSuccessModal;
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (checkoutOpen) setCheckoutOpen(false);
          if (ordersDrawerOpen) setOrdersDrawerOpen(false);
          if (orderSuccessModal) setOrderSuccessModal(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [checkoutOpen, ordersDrawerOpen, orderSuccessModal]);

  // Cleanup cart toast timer on unmount
  useEffect(() => {
    return () => {
      if (cartToastTimeoutRef.current) {
        clearTimeout(cartToastTimeoutRef.current);
      }
    };
  }, []);

  // Shipping form state
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: initialData.companyName ? `${initialData.companyName} Operations` : 'Shop Delivery',
    companyName: initialData.companyName,
    streetAddress: '104 Industrial Parkway, Suite B',
    apartmentSuite: '',
    city: 'Denver',
    state: 'CO',
    postalCode: '80202',
    country: 'United States',
    phone: initialData.phone,
    email: 'billing@contractor.com',
    deliveryNotes: 'Leave by shop bay door or reception desk',
  });
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'rush'>('standard');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, startCheckoutTransition] = useTransition();
  const [isReordering, startReorderTransition] = useTransition();

  // Filtered product catalog
  const displayedProducts = useMemo(() => {
    if (selectedCategory === 'all') return MERCHANDISE_PRODUCTS;
    return MERCHANDISE_PRODUCTS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  // When switching products, reset color & tier to defaults of that product
  function handleSelectProduct(prod: MerchandiseProduct) {
    setSelectedProductId(prod.id);
    setSelectedColorId(prod.availableColors[0]?.id || 'default');
    setSelectedTierQty(prod.pricingTiers[0]?.quantity || prod.minQuantity);
    setSelectedFinish(prod.options?.finishes?.[0] || '');
    if (!prod.supportedViews.includes(viewAngle)) {
      setViewAngle(prod.supportedViews[0] || 'front');
    }
  }

  // Active color object
  const activeColor =
    currentProduct.availableColors.find((c) => c.id === selectedColorId) ||
    currentProduct.availableColors[0];

  // Active pricing tier
  const activeTier =
    currentProduct.pricingTiers.find((t) => t.quantity === selectedTierQty) ||
    currentProduct.pricingTiers[0];

  // Active AI logo
  const activeAiLogo = initialData.aiLogos.find((l) => l.id === selectedAiLogoId) || initialData.aiLogos[0];

  // Active Logo Source for Canvas Casting (URL or SVG data URI)
  const activeLogoSrc = useMemo(() => {
    if (logoSource === 'ai' && activeAiLogo) {
      return activeAiLogo.url;
    }
    if (logoSource === 'site' && initialData.currentLogoUrl) {
      return initialData.currentLogoUrl;
    }

    // Default Vector SVG
    const svgCode = generateLogoSvg({
      businessName,
      trade: initialData.trade,
      tagline,
      establishedYear: '2026',
      accentColor,
      secondaryColor,
      style: 'modern_shield',
      colorMode: activeColor.darkText ? 'dark' : 'color',
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgCode)}`;
  }, [
    logoSource,
    activeAiLogo,
    initialData.currentLogoUrl,
    initialData.trade,
    businessName,
    tagline,
    accentColor,
    secondaryColor,
    activeColor.darkText,
  ]);

  const [cart, setCart] = useState<MerchandiseOrderItem[]>([]);
  const [cartToast, setCartToast] = useState<string | null>(null);

  // Return from Stripe Checkout handling & fresh order history sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('order_success') === 'true') {
      setCart([]);
      setCartToast('🎉 Order placed successfully! Direct print run queued.');
      // Refresh order list directly from server
      getMerchandiseStudioDataAction().then((res) => {
        if (res.ok && res.data?.recentOrders) {
          setOrders(res.data.recentOrders);
        }
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('order_cancelled') === 'true') {
      setCheckoutError('Payment was cancelled. Your items remain saved in your cart.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Build current customized item
  function getCurrentOrderItem(): MerchandiseOrderItem {
    return {
      productId: currentProduct.id,
      productName: currentProduct.name,
      colorName: activeColor.name,
      colorHex: activeColor.hex,
      quantity: activeTier.quantity,
      unitPrice: activeTier.unitPrice,
      totalPrice: activeTier.totalPrice,
      customizationDetails: {
        businessName,
        phone,
        website,
        license,
        logoUrl:
          logoSource === 'ai' && activeAiLogo
            ? activeAiLogo.url
            : logoSource === 'site'
            ? initialData.currentLogoUrl || undefined
            : undefined,
        decorationMethod: currentProduct.decorationMethod,
        placement:
          currentProduct.id === 'biz_cards'
            ? 'Front & Back Velvet Offset Imprint with Dynamic QR'
            : 'Personalized Header & 2-Part NCR Carbonless Grid',
        sizeBreakdown: currentProduct.options?.sizes ? sizeQuantities : undefined,
        finish: selectedFinish || undefined,
        deviceModel: currentProduct.id === 'phone_cases' ? selectedModel : undefined,
      },
    };
  }

  // Active items in checkout (cart if populated, else current item)
  const checkoutItems = useMemo(() => {
    return cart.length > 0 ? cart : [getCurrentOrderItem()];
  }, [cart, currentProduct, activeColor, activeTier, businessName, phone, website, license, logoSource, activeAiLogo, initialData, selectedFinish, selectedModel, sizeQuantities]);

  const itemSubtotal = Math.round(checkoutItems.reduce((acc, it) => acc + it.totalPrice, 0) * 100) / 100;
  const estimatedShipping = shippingMethod === 'rush' ? 24.0 : itemSubtotal >= 150 ? 0.0 : 12.0;
  const estimatedTax = calculateSalesTax(itemSubtotal, shippingAddress.state);
  const grandTotal = Math.round((itemSubtotal + estimatedShipping + estimatedTax) * 100) / 100;

  // Free shipping threshold calculations ($150+)
  const freeShippingThreshold = 150;
  const amountToFreeShipping = Math.max(0, Math.round((freeShippingThreshold - itemSubtotal) * 100) / 100);
  const freeShippingPercent = Math.min(100, Math.round((itemSubtotal / freeShippingThreshold) * 100));

  function handleAddToCart() {
    const item = getCurrentOrderItem();

    setCart((prev) => {
      // Check if identical item already exists (same product, color, finish, model, sizes, name)
      const matchIndex = prev.findIndex(
        (p) =>
          p.productId === item.productId &&
          p.colorHex === item.colorHex &&
          p.customizationDetails.finish === item.customizationDetails.finish &&
          p.customizationDetails.deviceModel === item.customizationDetails.deviceModel &&
          p.customizationDetails.businessName === item.customizationDetails.businessName &&
          JSON.stringify(p.customizationDetails.sizeBreakdown) ===
            JSON.stringify(item.customizationDetails.sizeBreakdown)
      );

      if (matchIndex > -1) {
        const next = [...prev];
        const existing = next[matchIndex];
        const newQty = existing.quantity + item.quantity;
        const productDef = getProductById(item.productId);
        // Find best pricing tier for aggregated quantity
        const tier =
          productDef?.pricingTiers
            .slice()
            .reverse()
            .find((t) => newQty >= t.quantity) || productDef?.pricingTiers[0];
        const unitPrice = tier ? tier.unitPrice : existing.unitPrice;
        next[matchIndex] = {
          ...existing,
          quantity: newQty,
          unitPrice,
          totalPrice: Math.round(newQty * unitPrice * 100) / 100,
        };
        return next;
      }

      return [...prev, item];
    });

    if (cartToastTimeoutRef.current) {
      clearTimeout(cartToastTimeoutRef.current);
    }
    setCartToast(`Added ${item.quantity} × ${item.productName} to your order!`);
    cartToastTimeoutRef.current = setTimeout(() => {
      setCartToast(null);
      cartToastTimeoutRef.current = null;
    }, 4500);
  }

  function handleRemoveFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateCartItemQuantity(index: number, delta: number) {
    setCart((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const productDef = getProductById(item.productId);
      const tiers = productDef?.pricingTiers || [];
      const currentTierIndex = tiers.findIndex((t) => t.quantity === item.quantity);

      let newQty = item.quantity;
      let newUnitPrice = item.unitPrice;

      if (currentTierIndex > -1) {
        const targetTierIndex = currentTierIndex + delta;
        if (targetTierIndex < 0) {
          // Remove if reducing below smallest tier
          return prev.filter((_, i) => i !== index);
        }
        if (targetTierIndex < tiers.length) {
          newQty = tiers[targetTierIndex].quantity;
          newUnitPrice = tiers[targetTierIndex].unitPrice;
        } else {
          newQty += delta * 100;
        }
      } else {
        newQty = Math.max(0, item.quantity + delta);
        if (newQty === 0) {
          return prev.filter((_, i) => i !== index);
        }
      }

      const next = [...prev];
      next[index] = {
        ...item,
        quantity: newQty,
        unitPrice: newUnitPrice,
        totalPrice: Math.round(newQty * newUnitPrice * 100) / 100,
      };
      return next;
    });
  }

  function handleOpenCheckout() {
    setCheckoutError(null);
    if (currentProduct.options?.sizes && cart.length === 0) {
      const allocated = Object.values(sizeQuantities).reduce((a, b) => a + b, 0);
      if (allocated !== activeTier.quantity) {
        setCheckoutError(
          `Please allocate all ${activeTier.quantity} items across sizes before checking out (currently ${allocated} allocated).`
        );
        return; // Halt modal opening on validation failure
      }
    }
    setCheckoutOpen(true);
  }

  // Trigger Instant Checkout via Stripe
  function handleExecuteCheckout() {
    if (!proofApproved) {
      setCheckoutError('Please check the digital proof approval box before completing your order.');
      return;
    }

    if (currentProduct.options?.sizes && cart.length === 0) {
      const allocated = Object.values(sizeQuantities).reduce((a, b) => a + b, 0);
      if (allocated !== activeTier.quantity) {
        setCheckoutError(`Please allocate all ${activeTier.quantity} items across sizes before checking out (currently ${allocated} allocated).`);
        return;
      }
    }

    setCheckoutError(null);
    startCheckoutTransition(async () => {
      const itemsToOrder = cart.length > 0 ? cart : [getCurrentOrderItem()];
      const res = await createMerchandiseCheckoutAction({
        items: itemsToOrder,
        shippingAddress,
        shippingMethod,
        proofApproved: true,
      });

      if (!res.ok) {
        setCheckoutError(res.error || 'Checkout could not be completed.');
        return;
      }

      if (res.checkoutUrl) {
        setCart([]);
        window.location.href = res.checkoutUrl;
        return;
      }

      if (res.order) {
        setCart([]);
        setOrders((prev) => [res.order!, ...prev]);
        setOrderSuccessModal(res.order);
        setCheckoutOpen(false);
      }
    });
  }

  // 1-Click Reorder
  function handleReorder(orderId: string) {
    startReorderTransition(async () => {
      const res = await reorderMerchandiseAction(orderId);
      if (res.ok && res.order) {
        setOrders((prev) => [res.order!, ...prev]);
        setOrderSuccessModal(res.order);
      } else {
        alert(res.error || 'Could not place re-order.');
      }
    });
  }

  // Download digital proof
  async function handleDownloadProofSheet() {
    setIsGeneratingProof(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1200, 800);

      // Title banner
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 0, 1200, 90);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(`OFFICIAL PRODUCTION PROOF • ${currentProduct.name.toUpperCase()}`, 40, 56);

      // Details panel
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(40, 130, 480, 620);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(`CLIENT / BUSINESS NAME:`, 60, 180);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(businessName, 60, 210);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(`CONTACT & LICENSE:`, 60, 270);
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px sans-serif';
      ctx.fillText(`${phone} • ${license}`, 60, 298);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText(`SPECIFICATION:`, 60, 360);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`Color: ${activeColor.name}`, 60, 390);
      ctx.fillText(`Quantity: ${activeTier.quantity} units`, 60, 420);
      ctx.fillText(`Method: ${currentProduct.decorationLabel}`, 60, 450);
      ctx.fillText(`Turnaround: ${currentProduct.turnaroundEstimate}`, 60, 480);

      // Right Canvas preview zone: Real Embedded 3D Canvas Render
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(560, 130, 600, 620);

      let renderedSuccessfully = false;
      if (canvasProofExportRef.current) {
        try {
          const renderDataUrl = await canvasProofExportRef.current();
          const renderImg = new window.Image();
          renderImg.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            renderImg.onload = () => resolve();
            renderImg.onerror = reject;
            renderImg.src = renderDataUrl;
          });
          // Center the 1040x1040 square canvas render inside the 600x620 preview box
          ctx.drawImage(renderImg, 570, 140, 580, 580);
          renderedSuccessfully = true;
        } catch (err) {
          console.warn('Could not embed live canvas render into proof sheet:', err);
        }
      }

      if (!renderedSuccessfully) {
        ctx.fillStyle = 'var(--muted)';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DIGITAL PRINT SPECIFICATION ARCHIVE', 860, 440);
      }

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-proof-${currentProduct.id}.png`;
      a.click();
    } finally {
      setIsGeneratingProof(false);
    }
  }

  // Render logo inside mockup
  function renderMockupBranding(mode: 'color' | 'dark' | 'white' = 'color', scale = 1) {
    if (logoSource === 'ai' && activeAiLogo) {
      return (
        <div style={{ transform: `scale(${scale})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Image
            src={activeAiLogo.url}
            alt={`${businessName} logo`}
            width={320}
            height={200}
            style={{ objectFit: 'contain', maxWidth: '100%', height: 'auto', maxHeight: '110px' }}
          />
        </div>
      );
    }

    if (logoSource === 'site' && initialData.currentLogoUrl) {
      return (
        <div style={{ transform: `scale(${scale})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Image
            src={initialData.currentLogoUrl}
            alt={`${businessName} logo`}
            width={320}
            height={200}
            style={{ objectFit: 'contain', maxWidth: '100%', height: 'auto', maxHeight: '110px' }}
          />
        </div>
      );
    }

    // Default Vector Svg
    const svgCode = generateLogoSvg({
      businessName,
      trade: initialData.trade,
      tagline,
      establishedYear: '2026',
      accentColor,
      secondaryColor,
      style: 'modern_shield',
      colorMode: mode === 'white' ? 'white_decal' : mode === 'dark' ? 'dark' : 'color',
    });

    return (
      <div
        style={{ transform: `scale(${scale})`, width: '100%', maxWidth: '340px' }}
        dangerouslySetInnerHTML={{ __html: svgCode }}
      />
    );
  }

  return (
    <main className="wide-shell workspace-shell" style={{ paddingBottom: '3.5rem' }}>
      <style>{`
        @media (max-width: 1100px) {
          .merchandise-workspace-split {
            flex-direction: column-reverse !important;
          }
          .merchandise-controls-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            border-right: none !important;
            border-top: 1px solid var(--line) !important;
          }
        }
        .focus-ring:focus-visible {
          outline: 2px solid var(--accent) !important;
          outline-offset: 2px !important;
        }
      `}</style>
      <MarketingNav basePath="/dashboard" />

      {/* 1. Header Hero Banner matching marketing theme */}
      <section className="workspace-hero panel marketing-hero" style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0, flex: '1 1 360px', minWidth: '280px' }}>
            <p className="eyebrow" style={{ color: 'var(--gold-ink)', letterSpacing: '0.12em', margin: 0, textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800 }}>
              Marketing &amp; Brand Studio
            </p>
            <h1 className="workspace-title" style={{ fontSize: '1.8rem', marginBottom: '0.35rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Business Cards &amp; Field Forms Studio
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.92rem', color: 'var(--muted)' }}>
              Commercial-grade 16pt velvet business cards and 2-part carbonless NCR job order pads for {businessName}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: 'rgba(var(--tint), 0.04)',
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                border: '1px solid rgba(var(--tint), 0.08)',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text)',
              }}
              className="hidden md:flex"
            >
              <span style={{ color: 'var(--good)' }}>⚡ 2–3 Day Dispatch</span>
              <span style={{ opacity: 0.3 }}>&bull;</span>
              <span style={{ color: 'var(--gold-ink)' }}>📝 2-Part Carbonless NCR &amp; 16pt Velvet</span>
              <span style={{ opacity: 0.3 }}>&bull;</span>
              <span style={{ color: '#60a5fa' }}>📦 Free Shipping $150+</span>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleOpenCheckout}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 0.95rem',
                  borderRadius: '8px',
                  border: '1.5px solid var(--accent)',
                  background: 'rgba(255, 122, 33, 0.15)',
                  color: 'var(--text)',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🛒 Cart</span>
                <span
                  style={{
                    background: 'var(--accent)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontWeight: 800,
                  }}
                >
                  {cart.length}
                </span>
                <span>(${cart.reduce((s, it) => s + it.totalPrice, 0).toFixed(2)})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setOrdersDrawerOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 0.95rem',
                borderRadius: '8px',
                border: '1px solid rgba(var(--tint), 0.14)',
                background: 'rgba(var(--tint), 0.05)',
                color: 'var(--text)',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📋 Orders</span>
              {orders.length > 0 && (
                <span
                  style={{
                    background: 'var(--accent)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontWeight: 800,
                  }}
                >
                  {orders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenCheckout}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.62rem 1.25rem',
                borderRadius: '9px',
                border: 'none',
                background: 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(255,122,33,0.35)',
              }}
            >
              <span>⚡ Review Order ({activeTier.quantity})</span>
              <span>&bull;</span>
              <span>${activeTier.totalPrice.toFixed(2)}</span>
            </button>
          </div>
        </div>

        {cartToast && (
          <div
            style={{
              position: 'absolute',
              bottom: '-1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--good, #16a34a)',
              color: '#ffffff',
              padding: '0.45rem 1.2rem',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>{cartToast}</span>
            <button
              type="button"
              onClick={handleOpenCheckout}
              style={{
                background: '#ffffff',
                color: '#16a34a',
                border: 'none',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '0.74rem',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Checkout Now
            </button>
          </div>
        )}
      </section>

      {/* Main Studio Frame */}
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid var(--line)',
          background: 'rgba(var(--panel-rgb), 0.92)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '780px',
        }}
      >

      {/* 2. Category Selector Pills (Shown when multiple categories exist) */}
      {MERCHANDISE_CATEGORIES.length > 1 && (
        <div
          style={{
            background: 'rgba(var(--tint), 0.025)',
            borderBottom: '1px solid var(--line)',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: '8px',
              border: selectedCategory === 'all' ? '1.5px solid var(--nav-grow)' : '1px solid rgba(var(--tint), 0.1)',
              background: selectedCategory === 'all' ? 'linear-gradient(180deg, rgba(182, 146, 246, 0.22), rgba(139, 92, 246, 0.12))' : 'rgba(var(--tint), 0.04)',
              color: selectedCategory === 'all' ? '#ffffff' : 'var(--muted)',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: selectedCategory === 'all' ? '0 2px 10px rgba(182, 146, 246, 0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            All Products ({MERCHANDISE_PRODUCTS.length})
          </button>
          {MERCHANDISE_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid var(--nav-grow)' : '1px solid rgba(var(--tint), 0.1)',
                  background: isSelected ? 'linear-gradient(180deg, rgba(182, 146, 246, 0.22), rgba(139, 92, 246, 0.12))' : 'rgba(var(--tint), 0.04)',
                  color: isSelected ? '#ffffff' : 'var(--muted)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  whiteSpace: 'nowrap',
                  boxShadow: isSelected ? '0 2px 10px rgba(182, 146, 246, 0.25)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Main Split-Pane Workspace */}
      <div className="merchandise-workspace-split" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Controls Sidebar */}
        <div
          className="merchandise-controls-sidebar"
          style={{
            width: '400px',
            minWidth: '350px',
            maxWidth: '430px',
            borderRight: '1px solid var(--line)',
            background: 'rgba(var(--panel-rgb), 0.98)',
            overflowY: 'auto',
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.35rem',
          }}
        >
          {/* Product Picker Grid */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 800,
                color: 'var(--gold-ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.5rem',
              }}
            >
              1. Select Stationery &amp; Form Item
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
              {displayedProducts.map((prod) => {
                const active = prod.id === selectedProductId;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 0.85rem',
                      borderRadius: '10px',
                      border: active ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.08)',
                      background: active ? 'linear-gradient(145deg, rgba(255, 122, 33, 0.2), rgba(255, 122, 33, 0.05))' : 'rgba(var(--tint), 0.035)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: active ? '0 4px 14px rgba(255, 122, 33, 0.25)' : 'none',
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          fontSize: '0.84rem',
                          color: active ? '#ffffff' : 'var(--text)',
                          fontWeight: 800,
                          lineHeight: 1.25,
                          display: 'block',
                        }}
                      >
                        {prod.id === 'biz_cards' ? '📇 Business Cards' : '📝 Job Order Notepads'}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: active ? '#38bdf8' : 'var(--muted)', display: 'block', marginTop: '3px', fontWeight: 600 }}>
                        {prod.id === 'biz_cards' ? '16pt Velvet & Spot-UV' : '2-Part NCR Carbonless'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 800, display: 'block', marginTop: '6px' }}>
                      From ${prod.basePrice < 1 ? prod.basePrice.toFixed(2) : Math.round(prod.basePrice)}/ea
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Brand Logo Source Picker */}
          <div
            style={{
              padding: '0.9rem',
              borderRadius: '12px',
              background: 'rgba(var(--tint), 0.025)',
              border: '1px solid rgba(var(--tint), 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--gold-ink)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  margin: 0,
                }}
              >
                2. Brand Mark / Artwork Source
              </label>
              <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700 }}>
                {logoSource === 'ai' ? '✦ AI Generated' : logoSource === 'site' ? 'Website Logo' : 'Vector Crest'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.65rem' }}>
              {initialData.aiLogos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLogoSource('ai')}
                  aria-pressed={logoSource === 'ai'}
                  aria-label="Use AI concept brand mark"
                  className="focus-ring"
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '7px',
                    border: logoSource === 'ai' ? '1.5px solid #a855f7' : '1px solid rgba(var(--tint), 0.1)',
                    background: logoSource === 'ai' ? 'rgba(124, 58, 237, 0.22)' : 'rgba(var(--tint), 0.04)',
                    color: logoSource === 'ai' ? '#f3e8ff' : 'var(--muted)',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✦ AI Logos ({initialData.aiLogos.length})
                </button>
              )}
              {initialData.currentLogoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoSource('site')}
                  aria-pressed={logoSource === 'site'}
                  aria-label="Use website uploaded logo"
                  className="focus-ring"
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '7px',
                    border: logoSource === 'site' ? '1.5px solid #3b82f6' : '1px solid rgba(var(--tint), 0.1)',
                    background: logoSource === 'site' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(var(--tint), 0.04)',
                    color: logoSource === 'site' ? '#bfdbfe' : 'var(--muted)',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Site Logo
                </button>
              )}
              <button
                type="button"
                onClick={() => setLogoSource('vector')}
                aria-pressed={logoSource === 'vector'}
                aria-label="Use generated vector mark"
                className="focus-ring"
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: '7px',
                  border: logoSource === 'vector' ? '1.5px solid var(--accent)' : '1px solid rgba(var(--tint), 0.14)',
                  background: logoSource === 'vector' ? 'rgba(255, 122, 33, 0.18)' : 'rgba(var(--tint), 0.04)',
                  color: logoSource === 'vector' ? '#ffffff' : 'var(--muted)',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Vector Mark
              </button>
            </div>

            {/* AI Logos Selector Carousel */}
            {logoSource === 'ai' && initialData.aiLogos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '4px' }}>
                {initialData.aiLogos.map((lg, idx) => (
                  <button
                    key={lg.id}
                    type="button"
                    onClick={() => setSelectedAiLogoId(lg.id)}
                    style={{
                      position: 'relative',
                      width: '64px',
                      height: '52px',
                      borderRadius: '8px',
                      border: selectedAiLogoId === lg.id ? '2px solid #a855f7' : '1px solid rgba(var(--tint), 0.12)',
                      background: '#101520',
                      cursor: 'pointer',
                      padding: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <Image src={lg.url} alt={`AI concept ${idx + 1}`} fill sizes="64px" style={{ objectFit: 'contain', padding: '2px' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Business Details Customizer */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--gold-ink)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  margin: 0,
                }}
              >
                3. Imprint Text &amp; Identity
              </label>
              <button
                type="button"
                onClick={handleResetToDefaults}
                className="focus-ring"
                title="Reset to brand profile defaults"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                ↺ Reset to Defaults
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Overflow Guard Alert */}
              {(businessName.length > 30 || tagline.length > 40) && (
                <div
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: '7px',
                    background: 'rgba(234, 179, 8, 0.14)',
                    border: '1px solid rgba(234, 179, 8, 0.35)',
                    color: '#fef08a',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <span>⚠️</span>
                  <span>
                    Print overflow guard: {businessName.length > 30 ? 'Company name' : 'Tagline'} is long and will auto-shrink or wrap on compact print items.
                  </span>
                </div>
              )}

              {/* Company Name */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700 }}>Company Name:</span>
                  <span style={{ fontSize: '0.65rem', color: businessName.length > 30 ? 'var(--warn, #eab308)' : 'var(--muted)', fontWeight: 700 }}>
                    {businessName.length}/40
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={40}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '7px',
                    border: '1px solid rgba(var(--tint), 0.15)',
                    background: 'rgba(var(--tint), 0.055)',
                    color: 'var(--text)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Tagline */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700 }}>Tagline / Specialty:</span>
                  <span style={{ fontSize: '0.65rem', color: tagline.length > 40 ? 'var(--warn, #eab308)' : 'var(--muted)', fontWeight: 700 }}>
                    {tagline.length}/50
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={50}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '7px',
                    border: '1px solid rgba(var(--tint), 0.15)',
                    background: 'rgba(var(--tint), 0.055)',
                    color: 'var(--text)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Phone & Website */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700 }}>Phone #:</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>{phone.length}/20</span>
                  </div>
                  <input
                    type="text"
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '7px',
                      border: '1px solid rgba(var(--tint), 0.15)',
                      background: 'rgba(var(--tint), 0.055)',
                      color: 'var(--text)',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700 }}>Website URL:</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>{website.length}/60</span>
                  </div>
                  <input
                    type="text"
                    maxLength={60}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="yourcompany.com"
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '7px',
                      border: '1px solid rgba(var(--tint), 0.15)',
                      background: 'rgba(var(--tint), 0.055)',
                      color: 'var(--text)',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* License Line */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700 }}>License Line:</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>{license.length}/30</span>
                </div>
                <input
                  type="text"
                  maxLength={30}
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '7px',
                    border: '1px solid rgba(var(--tint), 0.15)',
                    background: 'rgba(var(--tint), 0.055)',
                    color: 'var(--text)',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Brand Accent & Secondary Color Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.15rem' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                    Accent Color:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="color"
                      value={accentColor.startsWith('#') ? accentColor : '#2563eb'}
                      onChange={(e) => setAccentColor(e.target.value)}
                      aria-label="Accent brand color picker"
                      className="focus-ring"
                      style={{
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        border: '1px solid rgba(var(--tint), 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                    <input
                      type="text"
                      maxLength={10}
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      aria-label="Accent brand color hex code"
                      style={{
                        flex: 1,
                        padding: '0.42rem 0.5rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(var(--tint), 0.14)',
                        background: 'rgba(var(--tint), 0.055)',
                        color: 'var(--text)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                    Secondary Color:
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="color"
                      value={secondaryColor.startsWith('#') ? secondaryColor : '#f59e0b'}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      aria-label="Secondary brand color picker"
                      className="focus-ring"
                      style={{
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        border: '1px solid rgba(var(--tint), 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                    <input
                      type="text"
                      maxLength={10}
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      aria-label="Secondary brand color hex code"
                      style={{
                        flex: 1,
                        padding: '0.42rem 0.5rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(var(--tint), 0.14)',
                        background: 'rgba(var(--tint), 0.055)',
                        color: 'var(--text)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Contractor Booking QR Code Switch */}
              {(currentProduct.id === 'biz_cards' || currentProduct.id === 'yard_signs' || currentProduct.id === 'notepads') && (
                <div
                  style={{
                    marginTop: '0.35rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.76rem', color: '#93c5fd' }}>
                      Dynamic Booking QR Code
                    </strong>
                    <span style={{ fontSize: '0.68rem', color: '#60a5fa' }}>
                      Sends homeowners straight to your booking page
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeQrCode}
                    onChange={(e) => setIncludeQrCode(e.target.checked)}
                    aria-label="Toggle dynamic booking QR code"
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Color & Finish Selection */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.72rem',
                fontWeight: 800,
                color: 'var(--gold-ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '0.5rem',
              }}
            >
              4. Item Base Color: <span style={{ color: 'var(--accent)' }}>{activeColor.name}</span>
            </label>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
              {currentProduct.availableColors.map((clr) => {
                const isSelected = clr.id === selectedColorId;
                return (
                  <button
                    key={clr.id}
                    type="button"
                    onClick={() => setSelectedColorId(clr.id)}
                    aria-label={clr.name}
                    aria-pressed={isSelected}
                    title={clr.name}
                    className="focus-ring"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: clr.hex,
                      border: isSelected ? '3px solid var(--accent)' : '2px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: isSelected ? '0 0 0 2px rgba(255, 122, 33, 0.4)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: clr.darkText ? '#0f172a' : '#ffffff',
                      fontSize: '0.9rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Device Model (Phone Cases only) */}
          {currentProduct.options?.deviceModels && (
            <div>
              <label
                htmlFor="smartphoneModel"
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--gold-ink)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.4rem',
                }}
              >
                Smartphone Model
              </label>
              <select
                id="smartphoneModel"
                aria-label="Smartphone Model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '7px',
                  border: '1px solid rgba(var(--tint), 0.14)',
                  background: 'rgba(var(--tint), 0.06)',
                  color: 'var(--text)',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                }}
              >
                {currentProduct.options.deviceModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Apparel Sizing Distribution (Polos & T-Shirts) */}
          {currentProduct.options?.sizes && (
            <div
              style={{
                padding: '0.8rem',
                borderRadius: '10px',
                background: 'rgba(var(--tint), 0.025)',
                border: '1px solid rgba(var(--tint), 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text)' }}>Size Quantities</label>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color:
                      Object.values(sizeQuantities).reduce((a, b) => a + b, 0) === activeTier.quantity
                        ? 'var(--good, #16a34a)'
                        : 'var(--warn, #eab308)',
                    fontWeight: 700,
                  }}
                >
                  Total: {Object.values(sizeQuantities).reduce((a, b) => a + b, 0)} / {activeTier.quantity} allocated
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(currentProduct.options?.sizes?.length || 4, 7)}, 1fr)`, gap: '0.35rem' }}>
                {(currentProduct.options?.sizes || ['S', 'M', 'L', 'XL', '2XL']).map((sz) => (
                  <div key={sz} style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--muted)', display: 'block' }}>{sz}</span>
                    <input
                      type="number"
                      min={0}
                      value={sizeQuantities[sz] ?? 0}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setSizeQuantities((prev) => ({ ...prev, [sz]: val }));
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'center',
                        padding: '0.3rem',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: 'rgba(var(--tint), 0.08)',
                        color: 'var(--text)',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volume Tiers & Quantity Selector */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--gold-ink)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  margin: 0,
                }}
              >
                5. Quantity &amp; Volume Pricing
              </label>
              <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 800 }}>
                {activeTier.savingsPercent ? `Save ${activeTier.savingsPercent}%` : 'Direct Wholesale'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {currentProduct.pricingTiers.map((tier) => {
                const isSelected = tier.quantity === selectedTierQty;
                return (
                  <button
                    key={tier.quantity}
                    type="button"
                    onClick={() => setSelectedTierQty(tier.quantity)}
                    aria-pressed={isSelected}
                    aria-label={`${tier.quantity.toLocaleString()} units for $${tier.totalPrice.toFixed(2)}`}
                    className="focus-ring"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.08)',
                      background: isSelected ? 'linear-gradient(145deg, rgba(255, 122, 33, 0.18), rgba(255, 122, 33, 0.04))' : 'rgba(var(--tint), 0.035)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.84rem', color: isSelected ? '#ffffff' : 'var(--text)' }}>
                        {tier.quantity.toLocaleString()} units
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: '0.45rem' }}>
                        (${tier.unitPrice.toFixed(2)}/unit)
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '0.88rem', color: isSelected ? '#ffffff' : 'var(--text)' }}>
                        ${tier.totalPrice.toFixed(2)}
                      </strong>
                      {tier.isPopular && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            color: '#2563eb',
                            textTransform: 'uppercase',
                          }}
                        >
                          Most Popular
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free Shipping Progress Indicator */}
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              background: amountToFreeShipping === 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              border: amountToFreeShipping === 0 ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(59, 130, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', fontWeight: 800 }}>
              <span style={{ color: amountToFreeShipping === 0 ? '#86efac' : '#93c5fd' }}>
                {amountToFreeShipping === 0
                  ? '🎉 FREE Standard Shipping Unlocked!'
                  : `📦 Add $${amountToFreeShipping.toFixed(2)} more for FREE shipping`}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>${itemSubtotal.toFixed(2)} / $150</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${freeShippingPercent}%`,
                  height: '100%',
                  background: amountToFreeShipping === 0 ? '#22c55e' : 'var(--accent)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button
              type="button"
              onClick={handleOpenCheckout}
              className="focus-ring"
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.94rem',
                cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(255,122,33,0.38)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <span>⚡ Review Proof &amp; Checkout</span>
              <span>&bull;</span>
              <span>${activeTier.totalPrice.toFixed(2)}</span>
            </button>

            <button
              type="button"
              onClick={handleAddToCart}
              className="focus-ring"
              style={{
                width: '100%',
                padding: '0.68rem 1rem',
                borderRadius: '8px',
                border: '1.5px solid var(--accent)',
                background: 'rgba(255, 122, 33, 0.12)',
                color: 'var(--text)',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <span>🛒 Add to Order &amp; Keep Designing</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadProofSheet}
              disabled={isGeneratingProof}
              className="focus-ring"
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(var(--tint), 0.14)',
                background: 'rgba(var(--tint), 0.05)',
                color: 'var(--text)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: isGeneratingProof ? 'wait' : 'pointer',
                opacity: isGeneratingProof ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{isGeneratingProof ? '⏳ Generating Official Proof...' : '🖼️ Download High-Res Proof (PNG)'}</span>
            </button>
          </div>
        </div>

        {/* Right Interactive Mockup Canvas */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '1.75rem',
            background:
              backdropTheme === 'dark'
                ? 'radial-gradient(ellipse 90% 70% at 50% 30%, #101520 0%, #080b11 65%, #040508 100%)'
                : backdropTheme === 'jobsite'
                ? 'radial-gradient(ellipse 90% 70% at 50% 30%, #1f1b17 0%, #120f0d 65%, #070504 100%)'
                : 'radial-gradient(ellipse 90% 70% at 50% 30%, #151c2a 0%, #0d121c 65%, #070a10 100%)',
            backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {/* 3D Photorealistic Interactive Mockup Stage */}
          <Product3DMockupStage
            product={currentProduct}
            activeColor={activeColor}
            activeTier={activeTier}
            viewAngle={viewAngle}
            setViewAngle={setViewAngle}
            backdropTheme={backdropTheme}
            setBackdropTheme={setBackdropTheme}
            includeQrCode={includeQrCode}
            selectedFinish={selectedFinish}
            selectedModel={selectedModel}
            businessName={businessName}
            tagline={tagline}
            phone={phone}
            website={website}
            license={license}
            accentColor={accentColor}
            secondaryColor={secondaryColor}
            renderBranding={renderMockupBranding}
            logoSrc={activeLogoSrc}
            onExportReady={(fn) => {
              canvasProofExportRef.current = fn;
            }}
          />

          {/* Master Craftsmanship & Deep Technical Specifications */}
          <ProductTechnicalSpecsSheet
            product={currentProduct}
            businessName={businessName}
            activeColorName={activeColor.name}
            onDownloadProof={handleDownloadProofSheet}
          />
        </div>
      </div>

      {/* 4. Instant Purchasing Checkout Modal */}
      {checkoutOpen && (
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
          onClick={() => setCheckoutOpen(false)}
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
                onClick={() => setCheckoutOpen(false)}
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

              {/* Free Shipping Progress Banner in Checkout */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: amountToFreeShipping === 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                  border: amountToFreeShipping === 0 ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 800 }}>
                  <span style={{ color: amountToFreeShipping === 0 ? '#86efac' : '#93c5fd' }}>
                    {amountToFreeShipping === 0
                      ? '🎉 Free Standard Shipping Unlocked ($12.00 savings)'
                      : `📦 Add $${amountToFreeShipping.toFixed(2)} more for FREE shipping`}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>
                    ${itemSubtotal.toFixed(2)} / $150
                  </span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${freeShippingPercent}%`,
                      height: '100%',
                      background: amountToFreeShipping === 0 ? '#22c55e' : 'var(--accent)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

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
                    Order Items ({checkoutItems.reduce((acc, it) => acc + it.quantity, 0)} units total)
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
                          {item.customizationDetails?.deviceModel ? ` • Model: ${item.customizationDetails.deviceModel}` : ''}
                          {item.customizationDetails?.sizeBreakdown ? ` • Sizes: ${Object.entries(item.customizationDetails.sizeBreakdown).map(([s, q]) => `${s}:${q}`).join(', ')}` : ''}
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
                              onClick={() => handleUpdateCartItemQuantity(idx, -1)}
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
                              onClick={() => handleUpdateCartItemQuantity(idx, 1)}
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
                              onClick={() => handleRemoveFromCart(idx)}
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
                    <input
                      type="text"
                      placeholder="Recipient Full Name"
                      value={shippingAddress.fullName}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="Company Name (Optional)"
                      value={shippingAddress.companyName || ''}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, companyName: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Street Address (e.g. 100 Main St)"
                    value={shippingAddress.streetAddress}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, streetAddress: e.target.value })}
                    style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="City"
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="State (e.g. CO)"
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="ZIP Code"
                      value={shippingAddress.postalCode}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="tel"
                      placeholder="Delivery Phone #"
                      value={shippingAddress.phone}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                    <input
                      type="email"
                      placeholder="Receipt Email"
                      value={shippingAddress.email}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                      style={{ padding: '0.55rem', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text)', fontSize: '0.84rem', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Speed Radio */}
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
                      border: shippingMethod === 'standard' ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.12)',
                      background: shippingMethod === 'standard' ? 'rgba(255, 122, 33, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      color: 'var(--text)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ fontSize: '0.82rem', display: 'block' }}>Standard Tracked Ground</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {itemSubtotal >= 150 ? 'FREE (Orders $150+)' : '$12.00 • 3–5 days'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShippingMethod('rush')}
                    style={{
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: shippingMethod === 'rush' ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.12)',
                      background: shippingMethod === 'rush' ? 'rgba(255, 122, 33, 0.15)' : 'rgba(255, 255, 255, 0.04)',
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
                  background: proofApproved ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                  border: proofApproved ? '1.5px solid #22c55e' : '1.5px solid rgba(255, 255, 255, 0.14)',
                  transition: 'all 0.2s ease',
                }}
              >
                <label
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
                    type="checkbox"
                    checked={proofApproved}
                    onChange={(e) => setProofApproved(e.target.checked)}
                    style={{ width: '18px', height: '18px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span>
                    I have verified and approve the brand logo, business name ({businessName}), phone number ({phone}), and layout on this proof. I understand custom merchandise goes directly to manufacturing and cannot be returned for typographical errors.
                  </span>
                </label>
              </div>

              {/* Cost Breakdown */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.75rem', fontSize: '0.84rem', color: 'var(--muted)' }}>
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
                  <span>
                    Estimated Sales Tax
                    {shippingAddress.state.trim()
                      ? ` (${(getSalesTaxRate(shippingAddress.state) * 100).toFixed(1)}% • ${shippingAddress.state.trim().toUpperCase()}):`
                      : ':'}
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>${estimatedTax.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>
                  <span>Total Amount:</span>
                  <span style={{ color: 'var(--accent)' }}>${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                background: '#131924',
                display: 'flex',
                gap: '0.6rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '7px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.06)',
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
                onClick={handleExecuteCheckout}
                disabled={isCheckingOut || !proofApproved}
                style={{
                  padding: '0.6rem 1.35rem',
                  borderRadius: '7px',
                  border: 'none',
                  background: !proofApproved ? 'rgba(255,255,255,0.1)' : 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.88rem',
                  cursor: isCheckingOut ? 'wait' : !proofApproved ? 'not-allowed' : 'pointer',
                  boxShadow: !proofApproved ? 'none' : '0 4px 16px rgba(255,122,33,0.35)',
                }}
              >
                {isCheckingOut ? 'Processing...' : `Pay $${grandTotal.toFixed(2)} & Order`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Orders History Drawer with 1-Click Reorder */}
      {ordersDrawerOpen && (
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
          onClick={() => setOrdersDrawerOpen(false)}
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
                onClick={() => setOrdersDrawerOpen(false)}
                className="focus-ring"
                aria-label="Close order history"
                style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
                <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>📦</p>
                <strong style={{ display: 'block', color: 'var(--text)' }}>No merchandise orders yet</strong>
                <span style={{ fontSize: '0.8rem' }}>Customize an item above and place your first instant order!</span>
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
                        Tracking: <strong style={{ color: 'var(--gold-ink)' }}>{ord.trackingNumber}</strong>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.88rem', color: '#ffffff' }}>${ord.totalAmount.toFixed(2)}</strong>
                        <button
                          type="button"
                          onClick={() => handleReorder(ord.id)}
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
      )}

      {/* 6. Order Success Confirmation Modal */}
      {orderSuccessModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order Placed Successfully"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setOrderSuccessModal(null)}
        >
          <div
            style={{
              background: '#0e1219',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: 'var(--text)',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '2rem',
              textAlign: 'center',
              boxShadow: '0 25px 70px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 900, color: '#ffffff' }}>
              Order Confirmed &amp; Dispatched!
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Your order <strong>{orderSuccessModal.orderNumber}</strong> has been routed to Printful high-precision manufacturing. Digital proof approved. Carrier tracking: <strong>{orderSuccessModal.trackingNumber}</strong>.
            </p>

            <button
              type="button"
              onClick={() => setOrderSuccessModal(null)}
              className="focus-ring"
              style={{
                padding: '0.7rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              Back to Studio
            </button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
