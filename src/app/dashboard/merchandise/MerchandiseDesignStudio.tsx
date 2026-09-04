'use client';

import { useState, useMemo, useTransition } from 'react';
import Image from 'next/image';
import {
  MERCHANDISE_PRODUCTS,
  MERCHANDISE_CATEGORIES,
  getProductById,
} from '@/lib/merchandise/catalog';
import type {
  MerchandiseProduct,
  MerchandiseCategoryId,
  MockupViewAngle,
  MerchandiseOrderItem,
  ShippingAddress,
  MerchandiseStudioInitialData,
  MerchandiseOrder,
} from '@/lib/merchandise/types';
import { createMerchandiseCheckoutAction, reorderMerchandiseAction } from './actions';
import { generateLogoSvg } from '@/lib/logo-creator';

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

  // Calculate pricing
  const itemSubtotal = activeTier.totalPrice;
  const estimatedShipping = shippingMethod === 'rush' ? 24.0 : itemSubtotal >= 150 ? 0.0 : 12.0;
  const estimatedTax = Math.round(itemSubtotal * 0.065 * 100) / 100;
  const grandTotal = Math.round((itemSubtotal + estimatedShipping + estimatedTax) * 100) / 100;

  // Build current item object
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
          currentProduct.id === 'polos'
            ? 'Left Chest High-Density Embroidery'
            : currentProduct.id === 't_shirts'
            ? 'Left Chest Logo + Full Back Tradesman Layout'
            : currentProduct.id === 'hats'
            ? 'Front Crown Laser-Etched Patch'
            : 'Front & Back Commercial Print',
        sizeBreakdown: currentProduct.options?.sizes ? sizeQuantities : undefined,
        finish: selectedFinish || undefined,
        deviceModel: currentProduct.id === 'phone_cases' ? selectedModel : undefined,
      },
    };
  }

  // Trigger Instant Checkout
  function handleExecuteCheckout(isInstantTestOrder = false) {
    if (!proofApproved) {
      setCheckoutError('Please check the digital proof approval box before completing your order.');
      return;
    }

    setCheckoutError(null);
    startCheckoutTransition(async () => {
      const item = getCurrentOrderItem();
      const res = await createMerchandiseCheckoutAction({
        items: [item],
        shippingAddress,
        shippingMethod,
        proofApproved: true,
        isInstantTestOrder,
      });

      if (!res.ok) {
        setCheckoutError(res.error || 'Checkout could not be completed.');
        return;
      }

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }

      if (res.order) {
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
  function handleDownloadProofSheet() {
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

    // Right Canvas preview zone
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(560, 130, 600, 620);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DIGITAL PRINT SPECIFICATION ARCHIVE', 860, 440);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-proof-${currentProduct.id}.png`;
    a.click();
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '88vh',
        background: '#f8fafc',
        fontFamily: 'inherit',
        color: '#0f172a',
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '1rem 1.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.4rem',
              boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
            }}
          >
            👕
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Merchandise &amp; Swag Design Studio
              </h1>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: '#ecfdf5',
                  color: '#047857',
                  border: '1px solid #a7f3d0',
                }}
              >
                PRO GRADE PRINT
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Premium blanks (Richardson 112, Port Authority, 16pt Velvet) with instant volume checkout.
            </p>
          </div>
        </div>

        {/* Right Header Trust Badges & Orders Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              display: 'none',
              alignItems: 'center',
              gap: '0.85rem',
              background: '#f1f5f9',
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: '#334155',
            }}
            className="hidden md:flex"
          >
            <span>⚡ 3–5 Day Dispatch</span>
            <span>&bull;</span>
            <span>🧵 Free Digitizing 6+ Units</span>
            <span>&bull;</span>
            <span>📦 Free Shipping $150+</span>
          </div>

          <button
            type="button"
            onClick={() => setOrdersDrawerOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <span>📋 Orders</span>
            {orders.length > 0 && (
              <span
                style={{
                  background: '#2563eb',
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
            onClick={() => setCheckoutOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.15rem',
              borderRadius: '9px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(37,99,235,0.28)',
            }}
          >
            <span>⚡ Instant Checkout ({activeTier.quantity})</span>
            <span>&bull;</span>
            <span>${activeTier.totalPrice.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* 2. Category Selector Pills */}
      <div
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0.6rem 1.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '7px',
            border: selectedCategory === 'all' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            background: selectedCategory === 'all' ? '#eff6ff' : '#ffffff',
            color: selectedCategory === 'all' ? '#1d4ed8' : '#64748b',
            fontWeight: 800,
            fontSize: '0.8rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          All Merch ({MERCHANDISE_PRODUCTS.length})
        </button>
        {MERCHANDISE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '7px',
                border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                background: isSelected ? '#eff6ff' : '#ffffff',
                color: isSelected ? '#1d4ed8' : '#64748b',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Main Split-Pane Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Controls Sidebar */}
        <div
          style={{
            width: '380px',
            minWidth: '340px',
            borderRight: '1px solid #e2e8f0',
            background: '#ffffff',
            overflowY: 'auto',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Product Picker Grid */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.5rem',
              }}
            >
              1. Select Merchandise Item
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              {displayedProducts.map((prod) => {
                const active = prod.id === selectedProductId;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    style={{
                      textAlign: 'left',
                      padding: '0.65rem 0.75rem',
                      borderRadius: '9px',
                      border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: active ? '#f0f7ff' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: active ? '0 4px 10px rgba(37,99,235,0.12)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong
                        style={{
                          fontSize: '0.8rem',
                          color: active ? '#1d4ed8' : '#0f172a',
                          fontWeight: 800,
                          lineHeight: 1.25,
                        }}
                      >
                        {prod.name.split(' ')[0]} {prod.name.split(' ')[1]}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
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
              background: 'linear-gradient(145deg, #f8fafc, #f1f5f9)',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#334155',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
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
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '7px',
                    border: logoSource === 'ai' ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                    background: logoSource === 'ai' ? '#faf5ff' : '#ffffff',
                    color: logoSource === 'ai' ? '#6d28d9' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ✦ AI Logos ({initialData.aiLogos.length})
                </button>
              )}
              {initialData.currentLogoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoSource('site')}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '7px',
                    border: logoSource === 'site' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: logoSource === 'site' ? '#eff6ff' : '#ffffff',
                    color: logoSource === 'site' ? '#1d4ed8' : '#475569',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Site Logo
                </button>
              )}
              <button
                type="button"
                onClick={() => setLogoSource('vector')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: '7px',
                  border: logoSource === 'vector' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: logoSource === 'vector' ? '#eff6ff' : '#ffffff',
                  color: logoSource === 'vector' ? '#1d4ed8' : '#475569',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
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
                      border: selectedAiLogoId === lg.id ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                      background: '#ffffff',
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
            <label
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.5rem',
              }}
            >
              3. Imprint Text &amp; Identity
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Company Name:</span>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '7px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Tagline / Specialty:</span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '7px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>Phone #:</span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '7px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700 }}>License Line:</span>
                  <input
                    type="text"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '7px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                    }}
                  />
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
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.76rem', color: '#1e40af' }}>
                      Dynamic Booking QR Code
                    </strong>
                    <span style={{ fontSize: '0.68rem', color: '#3b82f6' }}>
                      Sends homeowners straight to your booking page
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={includeQrCode}
                    onChange={(e) => setIncludeQrCode(e.target.checked)}
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
                fontSize: '0.74rem',
                fontWeight: 800,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '0.5rem',
              }}
            >
              4. Item Base Color: <span style={{ color: '#2563eb' }}>{activeColor.name}</span>
            </label>
            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
              {currentProduct.availableColors.map((clr) => {
                const isSelected = clr.id === selectedColorId;
                return (
                  <button
                    key={clr.id}
                    type="button"
                    onClick={() => setSelectedColorId(clr.id)}
                    title={clr.name}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: clr.hex,
                      border: isSelected ? '3px solid #2563eb' : '2px solid #cbd5e1',
                      boxShadow: isSelected ? '0 0 0 2px rgba(37,99,235,0.4)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: clr.darkText ? '#0f172a' : '#ffffff',
                      fontSize: '0.9rem',
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
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
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
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155' }}>Size Quantities</label>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Total: {Object.values(sizeQuantities).reduce((a, b) => a + b, 0)} / {activeTier.quantity} allocated
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                {['M', 'L', 'XL', '2XL'].map((sz) => (
                  <div key={sz} style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block' }}>{sz}</span>
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
                        border: '1px solid #cbd5e1',
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
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
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
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.84rem', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
                        {tier.quantity.toLocaleString()} units
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '0.45rem' }}>
                        (${tier.unitPrice.toFixed(2)}/unit)
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '0.88rem', color: isSelected ? '#1d4ed8' : '#0f172a' }}>
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.94rem',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(37,99,235,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              <span>⚡ Instant Purchasing</span>
              <span>&bull;</span>
              <span>${activeTier.totalPrice.toFixed(2)}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadProofSheet}
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <span>🖼️ Download High-Res Proof (PNG)</span>
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
                ? '#0f172a'
                : backdropTheme === 'jobsite'
                ? '#e2e8f0'
                : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          {/* Canvas Controls Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            {/* View Angle Switcher */}
            <div style={{ display: 'flex', gap: '0.4rem', background: '#ffffff', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {currentProduct.supportedViews.map((vw) => (
                <button
                  key={vw}
                  type="button"
                  onClick={() => setViewAngle(vw)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: viewAngle === vw ? '#2563eb' : 'transparent',
                    color: viewAngle === vw ? '#ffffff' : '#64748b',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {vw === 'front' ? 'Front View' : vw === 'back' ? 'Back View' : 'Perspective Angle'}
                </button>
              ))}
            </div>

            {/* Backdrop Theme Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Lighting Environment:</span>
              <button
                type="button"
                onClick={() => setBackdropTheme('clean')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: backdropTheme === 'clean' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Studio Clean
              </button>
              <button
                type="button"
                onClick={() => setBackdropTheme('dark')}
                style={{
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: backdropTheme === 'dark' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Dark Carbon
              </button>
            </div>
          </div>

          {/* Interactive Mockup Stage */}
          <div
            style={{
              flex: 1,
              minHeight: '480px',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              boxShadow: '0 12px 35px rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* 1. BUSINESS CARDS MOCKUP */}
            {currentProduct.id === 'biz_cards' && (
              <div
                style={{
                  display: 'flex',
                  gap: '2rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                  perspective: '1000px',
                }}
              >
                {/* Front Card */}
                <div
                  style={{
                    width: '380px',
                    height: '220px',
                    borderRadius: '12px',
                    background: activeColor.hex,
                    color: activeColor.darkText ? '#0f172a' : '#ffffff',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: accentColor }} />
                  <div>{renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.85)}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem', display: 'block' }}>{businessName}</strong>
                      <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{tagline}</span>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.05em' }}>{license}</span>
                  </div>
                </div>

                {/* Back Card (Contact info + dynamic QR code) */}
                <div
                  style={{
                    width: '380px',
                    height: '220px',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#0f172a',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.2), 0 0 0 1px #e2e8f0',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxSizing: 'border-box',
                    transform: viewAngle === 'angle' ? 'rotateY(-12deg) rotateX(4deg)' : 'none',
                    transition: 'transform 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1rem', color: '#1e3a8a' }}>{businessName}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>⭐ 5.0 RATED</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: '#334155' }}>
                      <div>📞 {phone}</div>
                      <div>🌐 {website}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>Fast Quotes • Licensed &amp; Insured</div>
                    </div>

                    {/* QR Code Graphic */}
                    {includeQrCode && (
                      <div
                        style={{
                          width: '68px',
                          height: '68px',
                          background: '#0f172a',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          textAlign: 'center',
                          padding: '4px',
                        }}
                      >
                        <span>📱 SCAN TO</span>
                        <span>BOOK JOB</span>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                    Residential &amp; Commercial Work • Free Estimate
                  </div>
                </div>
              </div>
            )}

            {/* 2. EMBROIDERED POLO MOCKUP */}
            {currentProduct.id === 'polos' && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  height: '420px',
                  borderRadius: '16px',
                  background: activeColor.hex,
                  boxShadow: 'inset 0 0 70px rgba(0,0,0,0.4), 0 20px 40px rgba(0,0,0,0.25)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '2rem',
                  boxSizing: 'border-box',
                  border: '3px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Polo Ribbed Collar */}
                <div
                  style={{
                    width: '190px',
                    height: '55px',
                    background: 'rgba(0,0,0,0.15)',
                    borderBottom: '3px solid rgba(0,0,0,0.3)',
                    borderRadius: '0 0 35px 35px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }} />
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }} />
                </div>

                {/* Left Chest Embroidered Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '110px',
                    left: '80px',
                    padding: '0.75rem 1.15rem',
                    borderRadius: '10px',
                    background: 'rgba(0,0,0,0.18)',
                    border: `2px dashed ${activeColor.darkText ? '#0f172a' : '#ffffff'}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    maxWidth: '180px',
                  }}
                >
                  {renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.65)}
                </div>

                {/* Right Sleeve Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '130px',
                    right: '30px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: activeColor.darkText ? '#334155' : '#e2e8f0',
                    letterSpacing: '0.08em',
                  }}
                >
                  🇺🇸 PRO FLEET
                </div>

                <div
                  style={{
                    marginTop: 'auto',
                    textAlign: 'center',
                    color: activeColor.darkText ? '#475569' : '#94a3b8',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                  }}
                >
                  PORT AUTHORITY SILK TOUCH • 10,000+ STITCH EMBROIDERY
                </div>
              </div>
            )}

            {/* 3. T-SHIRT MOCKUP (Front or Back) */}
            {currentProduct.id === 't_shirts' && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  height: '420px',
                  borderRadius: '16px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  boxShadow: 'inset 0 0 60px rgba(0,0,0,0.45), 0 20px 40px rgba(0,0,0,0.25)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '2rem',
                  boxSizing: 'border-box',
                }}
              >
                {/* Crewneck Collar */}
                <div
                  style={{
                    width: '140px',
                    height: '24px',
                    borderBottom: `4px solid ${activeColor.darkText ? '#334155' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '0 0 50% 50%',
                  }}
                />

                {viewAngle === 'back' ? (
                  /* Full Back Tradesman Layout */
                  <div
                    style={{
                      marginTop: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '0.75rem',
                      width: '90%',
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                      {businessName.toUpperCase()}
                    </h2>
                    <div style={{ maxWidth: '280px' }}>
                      {renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.85)}
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.05em' }}>{tagline}</span>
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.45rem 1.25rem',
                        borderRadius: '6px',
                        background: accentColor,
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '1.15rem',
                      }}
                    >
                      📞 {phone}
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, opacity: 0.8 }}>
                      LICENSED &amp; FULLY INSURED • {license}
                    </span>
                  </div>
                ) : (
                  /* Front View (Left Chest Logo) */
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        top: '40px',
                        left: '40px',
                        maxWidth: '160px',
                      }}
                    >
                      {renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.75)}
                      <strong style={{ display: 'block', marginTop: '6px', fontSize: '0.8rem' }}>{businessName}</strong>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        width: '100%',
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        opacity: 0.7,
                        fontWeight: 700,
                      }}
                    >
                      HEAVYWEIGHT 6.5 OZ RING-SPUN • TOGGLE BACK VIEW TO SEE BILLBOARD
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. RICHARDSON TRUCKER HAT MOCKUP */}
            {currentProduct.id === 'hats' && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '460px',
                  height: '380px',
                  borderRadius: '24px',
                  background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  boxSizing: 'border-box',
                }}
              >
                {/* Curved Cap Visor */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '30px',
                    width: '320px',
                    height: '65px',
                    borderRadius: '0 0 160px 160px',
                    background: activeColor.hex,
                    borderTop: '3px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.5)',
                  }}
                />

                {/* Structured Crown Front */}
                <div
                  style={{
                    width: '260px',
                    height: '180px',
                    borderRadius: '120px 120px 0 0',
                    background: activeColor.hex,
                    border: '1px solid rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {/* Leather Patch */}
                  <div
                    style={{
                      width: '140px',
                      height: '90px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #854d0e, #713f12)',
                      border: '2px dashed #ca8a04',
                      boxShadow: '0 6px 15px rgba(0,0,0,0.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fef08a',
                      padding: '8px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.72rem', fontWeight: 900 }}>{businessName.toUpperCase()}</span>
                    <span style={{ fontSize: '0.58rem', marginTop: '2px' }}>EST. 2026</span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#fde047' }}>PRO CONTRACTOR</span>
                  </div>
                </div>

                <span style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 800, zIndex: 3 }}>
                  AUTHENTIC RICHARDSON 112 SNAPBACK
                </span>
              </div>
            )}

            {/* 5. NOTEPAD & ORDER FORM MOCKUP */}
            {currentProduct.id === 'notepads' && (
              <div
                style={{
                  width: '360px',
                  height: '460px',
                  background: '#ffffff',
                  borderRadius: '10px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1.5rem',
                  boxSizing: 'border-box',
                  position: 'relative',
                }}
              >
                {/* Pad Binding Tape */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '24px',
                    background: '#1e3a8a',
                    borderRadius: '8px 8px 0 0',
                    color: '#ffffff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    textAlign: 'center',
                    lineHeight: '24px',
                  }}
                >
                  SERIALIZED 2-PART NCR CARBONLESS WORK ORDER
                </div>

                {/* Form Header */}
                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ maxWidth: '180px' }}>{renderMockupBranding('color', 0.65)}</div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>JOB ESTIMATE</strong>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#dc2626', fontWeight: 800 }}>#EST-89421</span>
                  </div>
                </div>

                {/* Customer fields */}
                <div style={{ marginTop: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem', fontSize: '0.72rem' }}>
                  <div><strong>Customer:</strong> ____________________________ <strong>Date:</strong> _________</div>
                  <div style={{ marginTop: '4px' }}><strong>Jobsite:</strong> _____________________________ <strong>Phone:</strong> _________</div>
                </div>

                {/* Line Item Grid */}
                <div style={{ marginTop: '0.75rem', flex: 1, border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '4px 8px', fontSize: '0.68rem', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                    <span>DESCRIPTION OF WORK &amp; MATERIALS</span>
                    <span>AMOUNT</span>
                  </div>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} style={{ borderTop: '1px dashed #e2e8f0', height: '24px' }} />
                  ))}
                </div>

                {/* Signature box */}
                <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569' }}>
                  <span>Customer Authorized Signature: __________________</span>
                  <span style={{ fontWeight: 800, color: '#16a34a' }}>TOTAL: $_______</span>
                </div>
              </div>
            )}

            {/* 6. EXECUTIVE METAL PEN MOCKUP */}
            {currentProduct.id === 'pens' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1.5rem',
                }}
              >
                <div
                  style={{
                    width: '580px',
                    height: '38px',
                    borderRadius: '19px',
                    background: activeColor.hex,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 1.5rem',
                    boxSizing: 'border-box',
                    border: '1px solid rgba(255,255,255,0.2)',
                    position: 'relative',
                  }}
                >
                  {/* Stylus Tip */}
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#475569' }} />

                  {/* Laser Engraved Imprint */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#e2e8f0' }}>
                    <strong style={{ fontSize: '0.85rem', letterSpacing: '0.08em' }}>{businessName.toUpperCase()}</strong>
                    <span style={{ fontSize: '0.72rem' }}>📞 {phone}</span>
                    <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{website}</span>
                  </div>

                  {/* Chrome Clip */}
                  <div
                    style={{
                      width: '45px',
                      height: '6px',
                      borderRadius: '3px',
                      background: 'linear-gradient(90deg, #94a3b8, #f8fafc, #64748b)',
                    }}
                  />
                </div>
                <span style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>
                  SOLID AIRCRAFT ALUMINUM • LASER-ENGRAVED SILVER FINISH
                </span>
              </div>
            )}

            {/* 7. PHONE CASE MOCKUP */}
            {currentProduct.id === 'phone_cases' && (
              <div
                style={{
                  width: '240px',
                  height: '460px',
                  borderRadius: '38px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.3), 0 0 0 4px #334155',
                  padding: '1.5rem',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
              >
                {/* Camera array cutout */}
                <div
                  style={{
                    alignSelf: 'flex-start',
                    width: '74px',
                    height: '74px',
                    borderRadius: '20px',
                    background: '#090d16',
                    border: '2px solid #334155',
                    display: 'flex',
                    flexWrap: 'wrap',
                    padding: '8px',
                    gap: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1e293b' }} />
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1e293b' }} />
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#1e293b' }} />
                </div>

                {/* Center Branding */}
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ maxWidth: '180px' }}>{renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.8)}</div>
                  <strong style={{ display: 'block', fontSize: '0.9rem', marginTop: '0.5rem' }}>{businessName}</strong>
                  <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{tagline}</span>
                </div>

                {/* Case Base Specs */}
                <div style={{ fontSize: '0.62rem', letterSpacing: '0.08em', opacity: 0.7, textAlign: 'center' }}>
                  MILITARY DROP TESTED 12FT • {selectedModel.toUpperCase()}
                </div>
              </div>
            )}

            {/* 8. YARD SIGNS MOCKUP */}
            {currentProduct.id === 'yard_signs' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* 18"x24" Yard Sign Panel */}
                <div
                  style={{
                    width: '460px',
                    height: '320px',
                    borderRadius: '8px',
                    background: activeColor.hex,
                    color: activeColor.darkText ? '#0f172a' : '#ffffff',
                    border: '3px solid #cbd5e1',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                    padding: '1.75rem',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ maxWidth: '280px' }}>{renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.85)}</div>
                  <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900 }}>{businessName.toUpperCase()}</h2>
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{tagline}</p>
                  <div
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      padding: '0.5rem 1.5rem',
                      borderRadius: '6px',
                      fontSize: '1.35rem',
                      fontWeight: 900,
                    }}
                  >
                    📞 {phone}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>PROUDLY SERVING YOUR NEIGHBORHOOD</span>
                </div>

                {/* H-Stake graphic */}
                <div style={{ display: 'flex', gap: '80px', marginTop: '-4px' }}>
                  <div style={{ width: '6px', height: '110px', background: '#94a3b8' }} />
                  <div style={{ width: '6px', height: '110px', background: '#94a3b8' }} />
                </div>
              </div>
            )}

            {/* 9. STAINLESS STEEL TUMBLER MOCKUP */}
            {currentProduct.id === 'tumblers' && (
              <div
                style={{
                  width: '180px',
                  height: '380px',
                  borderRadius: '16px 16px 35px 35px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.25), inset 0 0 30px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '1.5rem 1rem',
                  boxSizing: 'border-box',
                  border: '2px solid rgba(255,255,255,0.15)',
                  position: 'relative',
                }}
              >
                {/* Clear Acrylic Lid */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-16px',
                    width: '160px',
                    height: '24px',
                    borderRadius: '8px 8px 0 0',
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid #cbd5e1',
                  }}
                />

                <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                  <div style={{ maxWidth: '140px' }}>{renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.65)}</div>
                  <strong style={{ display: 'block', fontSize: '0.82rem', marginTop: '0.5rem' }}>{businessName}</strong>
                </div>

                <div style={{ marginTop: 'auto', fontSize: '0.68rem', opacity: 0.8, letterSpacing: '0.08em' }}>
                  20 OZ VACUUM INSULATED
                </div>
              </div>
            )}

            {/* 10. VEHICLE DECALS MOCKUP */}
            {currentProduct.id === 'decals' && (
              <div
                style={{
                  width: '480px',
                  height: '240px',
                  borderRadius: '16px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  border: '3px solid #cbd5e1',
                  boxShadow: '0 25px 45px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '1.5rem',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>COMMERCIAL FLEET MAGNET (PAIR)</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>12&quot; × 24&quot; 30-MIL</span>
                </div>
                <div style={{ maxWidth: '280px', margin: '0 auto' }}>
                  {renderMockupBranding(activeColor.darkText ? 'color' : 'white', 0.85)}
                </div>
                <div>
                  <strong style={{ fontSize: '1.25rem' }}>{businessName}</strong>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: '2px' }}>📞 {phone} • {website}</div>
                </div>
              </div>
            )}
          </div>

          {/* Product Specifications & Details Drawer */}
          <div
            style={{
              marginTop: '1.25rem',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.8rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                Production Specs:
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                <div><strong>Dimensions:</strong> {currentProduct.specs.dimensions}</div>
                <div><strong>Material:</strong> {currentProduct.specs.material}</div>
                <div><strong>Finish:</strong> {currentProduct.specs.finish}</div>
              </div>
            </div>

            <div>
              <strong style={{ fontSize: '0.8rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                Imprint &amp; Quality:
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                <div><strong>Print Method:</strong> {currentProduct.decorationLabel}</div>
                <div><strong>Print Live Area:</strong> {currentProduct.specs.printArea}</div>
                <div><strong>Turnaround:</strong> {currentProduct.turnaroundEstimate}</div>
              </div>
            </div>

            <div>
              <strong style={{ fontSize: '0.8rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                Trade Contractor Guarantee:
              </strong>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', lineHeight: 1.45 }}>
                Free digital proofing on every order. If your print does not match your approved proof, we reprint or refund immediately.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Instant Purchasing Checkout Modal with Mandatory Proof Sign-Off */}
      {checkoutOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
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
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>
                  Instant Purchasing Checkout
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Direct print run for {businessName}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                style={{
                  background: '#e2e8f0',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
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
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                  }}
                >
                  {checkoutError}
                </div>
              )}

              {/* Order Summary Pill */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.95rem', color: '#1e40af', display: 'block' }}>
                    {currentProduct.name} ({activeTier.quantity} units)
                  </strong>
                  <span style={{ fontSize: '0.76rem', color: '#3b82f6' }}>
                    Color: {activeColor.name} &bull; Method: {currentProduct.decorationLabel}
                  </span>
                </div>
                <strong style={{ fontSize: '1.25rem', color: '#1d4ed8' }}>${itemSubtotal.toFixed(2)}</strong>
              </div>

              {/* Shipping Address Inputs */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Shipping &amp; Delivery Address
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Recipient Full Name"
                      value={shippingAddress.fullName}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, fullName: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Company Name (Optional)"
                      value={shippingAddress.companyName || ''}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, companyName: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Street Address (e.g. 100 Main St)"
                    value={shippingAddress.streetAddress}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, streetAddress: e.target.value })}
                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="City"
                      value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                    <input
                      type="text"
                      placeholder="State (e.g. CO)"
                      value={shippingAddress.state}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                    <input
                      type="text"
                      placeholder="ZIP Code"
                      value={shippingAddress.postalCode}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="tel"
                      placeholder="Delivery Phone #"
                      value={shippingAddress.phone}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                    <input
                      type="email"
                      placeholder="Receipt Email"
                      value={shippingAddress.email}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, email: e.target.value })}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Shipping Speed Radio */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                  Delivery Speed
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShippingMethod('standard')}
                    style={{
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: shippingMethod === 'standard' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: shippingMethod === 'standard' ? '#eff6ff' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ fontSize: '0.82rem', display: 'block' }}>Standard Tracked Ground</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {itemSubtotal >= 150 ? 'FREE (Orders $150+)' : '$12.00 • 3–5 days'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShippingMethod('rush')}
                    style={{
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: shippingMethod === 'rush' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: shippingMethod === 'rush' ? '#eff6ff' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ fontSize: '0.82rem', display: 'block' }}>Rush Priority Air Freight</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>$24.00 • 2-day priority</span>
                  </button>
                </div>
              </div>

              {/* MANDATORY DIGITAL PROOF SIGN-OFF GATE */}
              <div
                style={{
                  padding: '0.9rem',
                  borderRadius: '10px',
                  background: proofApproved ? '#f0fdf4' : '#f8fafc',
                  border: proofApproved ? '1.5px solid #22c55e' : '1.5px solid #cbd5e1',
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
                    color: '#0f172a',
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
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', fontSize: '0.82rem', color: '#475569' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Merchandise Subtotal:</span>
                  <span>${itemSubtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Shipping:</span>
                  <span>{estimatedShipping === 0 ? 'FREE' : `$${estimatedShipping.toFixed(2)}`}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Estimated Sales Tax (6.5%):</span>
                  <span>${estimatedTax.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px', fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>
                  <span>Total Amount:</span>
                  <span>${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
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
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleExecuteCheckout(true)}
                disabled={isCheckingOut || !proofApproved}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '7px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: !proofApproved ? '#94a3b8' : '#334155',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: isCheckingOut ? 'wait' : !proofApproved ? 'not-allowed' : 'pointer',
                }}
                title={!proofApproved ? 'Please check the proof sign-off box above' : undefined}
              >
                Instant Test Order
              </button>

              <button
                type="button"
                onClick={() => handleExecuteCheckout(false)}
                disabled={isCheckingOut || !proofApproved}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '7px',
                  border: 'none',
                  background: !proofApproved ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.86rem',
                  cursor: isCheckingOut ? 'wait' : !proofApproved ? 'not-allowed' : 'pointer',
                  boxShadow: !proofApproved ? 'none' : '0 4px 12px rgba(37,99,235,0.25)',
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
              background: '#ffffff',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              padding: '1.5rem',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                Merchandise Order History
              </h3>
              <button
                type="button"
                onClick={() => setOrdersDrawerOpen(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>📦</p>
                <strong style={{ display: 'block', color: '#0f172a' }}>No merchandise orders yet</strong>
                <span style={{ fontSize: '0.8rem' }}>Customize an item above and place your first instant order!</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '1rem',
                      background: '#ffffff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{ord.orderNumber}</strong>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: ord.status === 'delivered' ? '#dcfce7' : '#eff6ff',
                          color: ord.status === 'delivered' ? '#15803d' : '#1d4ed8',
                        }}
                      >
                        {ord.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.5rem' }}>
                      {ord.items.map((it, idx) => (
                        <div key={idx}>
                          &bull; {it.productName} ({it.quantity}x) &ndash; {it.colorName}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem', fontSize: '0.74rem' }}>
                      <span style={{ color: '#64748b' }}>
                        Tracking: <strong style={{ color: '#0f172a' }}>{ord.trackingNumber}</strong>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>${ord.totalAmount.toFixed(2)}</strong>
                        <button
                          type="button"
                          onClick={() => handleReorder(ord.id)}
                          disabled={isReordering}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '5px',
                            border: '1px solid #2563eb',
                            background: '#eff6ff',
                            color: '#1d4ed8',
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
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '2rem',
              textAlign: 'center',
              boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              Order Confirmed &amp; Dispatched!
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Your order <strong>{orderSuccessModal.orderNumber}</strong> has been routed to Printful high-precision manufacturing. Digital proof approved. Carrier tracking: <strong>{orderSuccessModal.trackingNumber}</strong>.
            </p>

            <button
              type="button"
              onClick={() => setOrderSuccessModal(null)}
              style={{
                padding: '0.7rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
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
  );
}
