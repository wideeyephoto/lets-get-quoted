'use client';

import { useState, useMemo, useTransition, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  ShoppingCart,
  History,
} from 'lucide-react';
import {
  MERCHANDISE_PRODUCTS,
  getProductById,
} from '@/lib/merchandise/catalog';
import type {
  MerchandiseProduct,
  MockupViewAngle,
  MerchandiseOrderItem,
  ShippingAddress,
  MerchandiseStudioInitialData,
  MerchandiseOrder,
  BusinessCardTemplateId,
  CardFinishId,
} from '@/lib/merchandise/types';
import {
  getCardTemplateById,
  getCardFinishById,
} from '@/lib/merchandise/card-templates';
import {
  getNotepadTemplateById,
  TradePreset,
} from '@/lib/merchandise/product-templates';
import {
  createMerchandiseCheckoutAction,
  reorderMerchandiseAction,
  getMerchandiseStudioDataAction,
} from './actions';
import { generateLogoSvg } from '@/lib/logo-creator';
import MarketingNav from '../marketing/MarketingNav';
import Product3DMockupStage from './Product3DMockupStage';
import StudioConfigurator from './StudioConfigurator';
import CheckoutModal from './CheckoutModal';
import OrdersDrawer from './OrdersDrawer';

const ProductTechnicalSpecsSheet = dynamic(() => import('./ProductTechnicalSpecsSheet'), {
  ssr: false,
});

interface Props {
  initialData: MerchandiseStudioInitialData;
}

export default function MerchandiseDesignStudio({ initialData }: Props) {
  // Active product
  const [selectedProductId, setSelectedProductId] = useState<string>('biz_cards');
  const currentProduct = useMemo(
    () => getProductById(selectedProductId) || MERCHANDISE_PRODUCTS[0],
    [selectedProductId]
  );

  // Customization state
  const [selectedColorId, setSelectedColorId] = useState<string>(() => currentProduct.availableColors[0].id);
  const [selectedCardTemplate, setSelectedCardTemplate] = useState<BusinessCardTemplateId>('executive');
  const [selectedCardFinish, setSelectedCardFinish] = useState<CardFinishId>('velvet_matte');
  const [selectedNotepadTemplate, setSelectedNotepadTemplate] = useState<string>('work_order');
  const [selectedTierQty, setSelectedTierQty] = useState<number>(() => currentProduct.pricingTiers[0].quantity);
  const [viewAngle, setViewAngle] = useState<MockupViewAngle>('front');
  const [includeQrCode, setIncludeQrCode] = useState<boolean>(true);

  // Brand data state (pre-filled from initialData)
  const [businessName, setBusinessName] = useState(initialData.companyName);
  const [tagline, setTagline] = useState(initialData.tagline);
  const [phone, setPhone] = useState(initialData.phone);
  const [website, setWebsite] = useState(initialData.website);
  const [license, setLicense] = useState(initialData.license);
  const [accentColor, setAccentColor] = useState(initialData.accentColor);
  const [secondaryColor, setSecondaryColor] = useState(initialData.secondaryColor);

  // Apply Trade Preset Pack
  function handleApplyTradePreset(preset: TradePreset) {
    setAccentColor(preset.accentColor);
    setSecondaryColor(preset.secondaryColor);
    setTagline(preset.tagline);
    setSelectedCardTemplate(preset.cardTemplate);
    setSelectedCardFinish(preset.cardFinish);
    setSelectedNotepadTemplate(preset.notepadTemplate);
    if (cartToastTimeoutRef.current) clearTimeout(cartToastTimeoutRef.current);
    setCartToast(`Applied ${preset.badge} ${preset.name} Pro Trade Style Pack!`);
    cartToastTimeoutRef.current = setTimeout(() => {
      setCartToast(null);
      cartToastTimeoutRef.current = null;
    }, 3200);
  }

  // Draft autosave & restore (debounced 500ms)
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
        if (typeof parsed.selectedCardTemplate === 'string') {
          setSelectedCardTemplate(parsed.selectedCardTemplate as BusinessCardTemplateId);
        }
        if (typeof parsed.selectedCardFinish === 'string') {
          setSelectedCardFinish(parsed.selectedCardFinish as CardFinishId);
        }
        if (typeof parsed.selectedNotepadTemplate === 'string') {
          setSelectedNotepadTemplate(parsed.selectedNotepadTemplate);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timeoutId = setTimeout(() => {
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
            selectedCardTemplate,
            selectedCardFinish,
            selectedNotepadTemplate,
          })
        );
      } catch {
        // Ignore quota exceeded
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    draftStorageKey,
    businessName,
    tagline,
    phone,
    website,
    license,
    accentColor,
    secondaryColor,
    selectedCardTemplate,
    selectedCardFinish,
    selectedNotepadTemplate,
  ]);

  function handleResetToDefaults() {
    setBusinessName(initialData.companyName);
    setTagline(initialData.tagline);
    setPhone(initialData.phone);
    setWebsite(initialData.website);
    setLicense(initialData.license);
    setAccentColor(initialData.accentColor);
    setSecondaryColor(initialData.secondaryColor);
    setSelectedCardTemplate('executive');
    setSelectedCardFinish('velvet_matte');
    setSelectedNotepadTemplate('work_order');
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}
    }
  }

  // Logo source: 'site' | 'ai' | 'vector' | 'upload'
  const [logoSource, setLogoSource] = useState<'site' | 'ai' | 'vector' | 'upload'>(
    initialData.aiLogos.length > 0 ? 'ai' : initialData.currentLogoUrl ? 'site' : 'vector'
  );
  const [selectedAiLogoId, setSelectedAiLogoId] = useState<string | null>(
    initialData.aiLogos[0]?.id || null
  );
  const [customUploadUrl, setCustomUploadUrl] = useState<string | null>(null);

  function handleLogoFileUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      setCheckoutError('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setCustomUploadUrl(result);
        setLogoSource('upload');
      }
    };
    reader.readAsDataURL(file);
  }

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
    fullName: initialData.companyName ? `${initialData.companyName} Operations` : '',
    companyName: initialData.companyName || '',
    streetAddress: '',
    apartmentSuite: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
    phone: initialData.phone || '',
    email: '',
    deliveryNotes: '',
  });
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'rush'>('standard');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckingOut, startCheckoutTransition] = useTransition();
  const [isReordering, startReorderTransition] = useTransition();

  // Switch products
  function handleSelectProduct(prod: MerchandiseProduct) {
    setSelectedProductId(prod.id);
    setSelectedColorId(prod.availableColors[0]?.id || 'default');
    setSelectedTierQty(prod.pricingTiers[0]?.quantity || prod.minQuantity);
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

  // Memoized vector mark SVG string
  const vectorLogoSvg = useMemo(() => {
    return generateLogoSvg({
      businessName,
      trade: initialData.trade,
      tagline,
      establishedYear: '2026',
      accentColor,
      secondaryColor,
      style: 'modern_shield',
      colorMode: activeColor.darkText ? 'dark' : 'color',
    });
  }, [
    businessName,
    initialData.trade,
    tagline,
    accentColor,
    secondaryColor,
    activeColor.darkText,
  ]);

  // Active Logo Source for Canvas Casting (URL or SVG data URI)
  const activeLogoSrc = useMemo(() => {
    if (logoSource === 'upload' && customUploadUrl) {
      return customUploadUrl;
    }
    if (logoSource === 'ai' && activeAiLogo) {
      return activeAiLogo.url;
    }
    if (logoSource === 'site' && initialData.currentLogoUrl) {
      return initialData.currentLogoUrl;
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(vectorLogoSvg)}`;
  }, [
    logoSource,
    customUploadUrl,
    activeAiLogo,
    initialData.currentLogoUrl,
    vectorLogoSvg,
  ]);

  const [cart, setCart] = useState<MerchandiseOrderItem[]>([]);
  const [cartToast, setCartToast] = useState<string | null>(null);

  // Cart LocalStorage Persistence
  const cartStorageKey = initialData.accountId
    ? `merchandise_cart_${initialData.accountId}`
    : 'merchandise_cart_default';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedCart = localStorage.getItem(cartStorageKey);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
        }
      }
    } catch {}
  }, [cartStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (cart.length > 0) {
        localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      } else {
        localStorage.removeItem(cartStorageKey);
      }
    } catch {}
  }, [cart, cartStorageKey]);

  // Return from Stripe Checkout handling & fresh order history sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('order_success') === 'true') {
      setCart([]);
      try {
        localStorage.removeItem(cartStorageKey);
      } catch {}
      setCartToast('Order placed. Direct manufacturing print run queued.');
      getMerchandiseStudioDataAction().then((res) => {
        if (res.ok && res.data?.recentOrders) {
          setOrders(res.data.recentOrders);
        }
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('order_cancelled') === 'true') {
      setCheckoutError('Payment was cancelled. Your customized items remain saved in your cart.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [cartStorageKey]);

  // Build current customized item
  function getCurrentOrderItem(): MerchandiseOrderItem {
    const chosenLogoUrl =
      logoSource === 'upload' && customUploadUrl
        ? customUploadUrl
        : logoSource === 'ai' && activeAiLogo
        ? activeAiLogo.url
        : logoSource === 'site' && initialData.currentLogoUrl
        ? initialData.currentLogoUrl
        : activeLogoSrc;

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
        tagline,
        phone,
        website,
        license,
        accentColor,
        secondaryColor,
        cardTemplateId: currentProduct.id === 'biz_cards' ? selectedCardTemplate : undefined,
        cardFinish: currentProduct.id === 'biz_cards' ? selectedCardFinish : undefined,
        finish: currentProduct.id === 'biz_cards' ? selectedCardFinish : undefined,
        includeQrCode,
        decorationMethod: currentProduct.decorationMethod,
        placement:
          currentProduct.id === 'biz_cards'
            ? 'Front & Back Velvet Offset Imprint with Dynamic QR'
            : 'Personalized Header & 2-Part NCR Carbonless Grid',
        logoUrl: chosenLogoUrl,
        customArtworkUrl: logoSource === 'upload' && customUploadUrl ? customUploadUrl : undefined,
      },
    };
  }

  function handleAddToCart() {
    const newItem = getCurrentOrderItem();
    setCart((prev) => [...prev, newItem]);
    if (cartToastTimeoutRef.current) clearTimeout(cartToastTimeoutRef.current);
    setCartToast(`Added ${newItem.quantity}× ${newItem.productName} to your order!`);
    cartToastTimeoutRef.current = setTimeout(() => {
      setCartToast(null);
      cartToastTimeoutRef.current = null;
    }, 3200);
  }

  function handleRemoveFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateCartItemQuantity(index: number, delta: number) {
    setCart((prev) => {
      const copy = [...prev];
      const item = copy[index];
      if (!item) return prev;
      const targetProd = getProductById(item.productId);
      if (!targetProd) return prev;

      const currentTierIndex = targetProd.pricingTiers.findIndex((t) => t.quantity === item.quantity);
      let newTierIndex = currentTierIndex !== -1 ? currentTierIndex + delta : 0;
      if (newTierIndex < 0) newTierIndex = 0;
      if (newTierIndex >= targetProd.pricingTiers.length) {
        newTierIndex = targetProd.pricingTiers.length - 1;
      }

      const newTier = targetProd.pricingTiers[newTierIndex];
      copy[index] = {
        ...item,
        quantity: newTier.quantity,
        unitPrice: newTier.unitPrice,
        totalPrice: newTier.totalPrice,
      };
      return copy;
    });
  }

  // Active items in checkout
  const checkoutItems = useMemo(() => {
    if (cart.length > 0) return cart;
    return [getCurrentOrderItem()];
  }, [cart, currentProduct, activeColor, activeTier, businessName, tagline, phone, website, license, accentColor, secondaryColor, selectedCardTemplate, selectedCardFinish, selectedNotepadTemplate, includeQrCode, logoSource, activeLogoSrc, customUploadUrl, activeAiLogo, initialData.currentLogoUrl]);

  function handleOpenCheckout() {
    setCheckoutError(null);
    setProofApproved(false);
    setCheckoutOpen(true);
  }

  function handleExecuteCheckout() {
    if (!shippingAddress.fullName || !shippingAddress.streetAddress || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode) {
      setCheckoutError('Please provide a complete shipping address (Recipient Name, Street, City, State, ZIP).');
      return;
    }
    if (!shippingAddress.email || !shippingAddress.email.includes('@')) {
      setCheckoutError('Please provide a valid email address to receive proof confirmation and tracking notifications.');
      return;
    }
    if (!proofApproved) {
      setCheckoutError('You must review and approve the digital production proof before proceeding.');
      return;
    }

    startCheckoutTransition(async () => {
      try {
        const res = await createMerchandiseCheckoutAction({
          items: checkoutItems,
          shippingAddress,
          shippingMethod,
          proofApproved: true,
        });

        if (!res.ok) {
          setCheckoutError(res.error || 'Failed to initialize checkout session. Please try again.');
          return;
        }

        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
        } else {
          setCheckoutError('Checkout session URL was not returned by the payment gateway.');
        }
      } catch (err: any) {
        console.error('Checkout error:', err);
        setCheckoutError(err?.message || 'An unexpected error occurred during checkout setup.');
      }
    });
  }

  function handleReorder(orderId: string) {
    startReorderTransition(async () => {
      try {
        const res = await reorderMerchandiseAction(orderId);
        if (!res.ok) {
          alert(res.error || 'Could not place repeat order.');
          return;
        }
        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
        }
      } catch (err: any) {
        alert(err?.message || 'Reorder failed.');
      }
    });
  }

  // Generate proof sheet PNG
  async function handleDownloadProofSheet() {
    setIsGeneratingProof(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1300;
      canvas.height = 860;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark proof canvas background
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, 1300, 860);

      // Top header banner
      ctx.fillStyle = '#131924';
      ctx.fillRect(0, 0, 1300, 95);
      ctx.fillStyle = '#ff7a21';
      ctx.fillRect(0, 92, 1300, 3);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('OFFICIAL DIGITAL PRODUCTION PROOF', 40, 48);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      const proofId = Math.random().toString(36).substring(2, 9).toUpperCase();
      ctx.fillText(
        `LETSGETQUOTED COMMERCIAL PRINT RUN • PROOF #${proofId} • GENERATED ${new Date().toLocaleDateString()}`,
        40,
        75
      );

      // Left column: Specifications
      ctx.fillStyle = '#131924';
      ctx.fillRect(40, 130, 500, 680);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(40, 130, 500, 680);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('COMMERCIAL PRODUCTION SPECIFICATIONS', 60, 160);

      let specY = 195;
      const addSpecRow = (lbl: string, val: string, color = '#ffffff') => {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(lbl.toUpperCase(), 60, specY);
        ctx.fillStyle = color;
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(val, 210, specY);
        specY += 24;
      };

      addSpecRow('Company Name:', businessName || 'N/A');
      if (tagline) addSpecRow('Tagline:', tagline);
      addSpecRow('Phone Number:', phone || 'N/A');
      if (website) addSpecRow('Website:', website);
      if (license) addSpecRow('License Line:', license);
      addSpecRow('Accent Hex:', accentColor, accentColor);
      addSpecRow('Secondary Hex:', secondaryColor, secondaryColor);
      specY += 12;

      addSpecRow('Product Line:', currentProduct.name);
      addSpecRow('Colorway:', `${activeColor.name} (${activeColor.hex})`);
      addSpecRow('Run Quantity:', `${activeTier.quantity.toLocaleString()} units ($${activeTier.unitPrice.toFixed(2)}/ea)`);
      addSpecRow('Decoration Method:', currentProduct.decorationLabel);

      if (currentProduct.id === 'biz_cards') {
        const tmpl = getCardTemplateById(selectedCardTemplate);
        addSpecRow('Card Template:', tmpl.name, '#38bdf8');
        const finishDef = getCardFinishById(selectedCardFinish);
        addSpecRow('Tactile Finish:', finishDef.name, '#f59e0b');
        addSpecRow('Paper Stock:', '16pt Heavy Silk Cover + Aqueous Barrier');
      } else if (currentProduct.id === 'notepads') {
        const tmpl = getNotepadTemplateById(selectedNotepadTemplate);
        addSpecRow('NCR Form Template:', tmpl.name, '#38bdf8');
        addSpecRow('Stock Format:', '2-Part Carbonless NCR (White / Canary Yellow)');
      }

      addSpecRow('Dynamic QR Booking:', includeQrCode ? 'Enabled' : 'Disabled');
      addSpecRow('Est. Manufacturing:', currentProduct.turnaroundEstimate);

      // Section: Simulated Optical Barcode
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(60, 680, 460, 60);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`LGQ-${proofId}-AUTO-DISPATCH-VERIFIED`, 140, 715);

      // Right Preview Zone: Embedded 3D Canvas Render
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(560, 130, 700, 680);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeRect(560, 130, 700, 680);

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
          ctx.drawImage(renderImg, 580, 145, 660, 650);
          renderedSuccessfully = true;
        } catch (err) {
          console.warn('Could not embed live canvas render into proof sheet:', err);
        }
      }

      if (!renderedSuccessfully) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DIGITAL PRINT SPECIFICATION ARCHIVE', 910, 450);
        ctx.font = '16px sans-serif';
        ctx.fillText(`${currentProduct.name} • ${activeColor.name}`, 910, 485);
        ctx.textAlign = 'left';
      }

      // Confidential footer strip
      ctx.fillStyle = '#06090f';
      ctx.fillRect(0, 825, 1300, 35);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(
        'CONFIDENTIAL COMMERCIAL PRODUCTION PROOF • ALL SPECS STRICTLY CONFIRMED FOR PRINT RUN • LETSGETQUOTED MERCHANDISE STUDIO',
        40,
        846
      );

      try {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${(businessName || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-proof-${currentProduct.id}.png`;
        a.click();
      } catch (exportErr) {
        console.error('Failed to export canvas image:', exportErr);
        setCheckoutError('Could not export canvas image directly due to browser security restrictions on cross-origin assets.');
      }
    } catch (err) {
      console.error('Proof generation error:', err);
      setCheckoutError('An error occurred while generating the digital proof sheet.');
    } finally {
      setIsGeneratingProof(false);
    }
  }

  // Render logo inside mockup with strict height and width bounds
  function renderMockupBranding(mode: 'color' | 'dark' | 'white' = 'color', scale = 1) {
    const isNotepad = selectedProductId === 'notepads';
    const baseH = isNotepad ? 40 : 32;
    const baseW = isNotepad ? 180 : 130;
    const maxH = Math.max(20, Math.round(baseH * scale));
    const maxW = Math.max(75, Math.round(baseW * scale));

    if (logoSource === 'upload' && customUploadUrl) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: `${maxH}px`, maxWidth: `${maxW}px` }}>
          <img
            src={customUploadUrl}
            alt={`${businessName} custom logo`}
            style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
          />
        </div>
      );
    }

    if (logoSource === 'ai' && activeAiLogo) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: `${maxH}px`, maxWidth: `${maxW}px` }}>
          <Image
            src={activeAiLogo.url}
            alt={`${businessName} logo`}
            width={320}
            height={200}
            style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
          />
        </div>
      );
    }

    if (logoSource === 'site' && initialData.currentLogoUrl) {
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: `${maxH}px`, maxWidth: `${maxW}px` }}>
          <Image
            src={initialData.currentLogoUrl}
            alt={`${businessName} logo`}
            width={320}
            height={200}
            style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
          />
        </div>
      );
    }

    return (
      <div
        className="mockup-svg-logo-wrapper"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: `${maxH}px`,
          maxWidth: `${maxW}px`,
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: vectorLogoSvg }}
      />
    );
  }

  return (
    <main className="wide-shell workspace-shell" style={{ paddingBottom: '3.5rem' }}>
      <style>{`
        @media (max-width: 1180px) {
          .merchandise-workspace-split {
            flex-direction: column-reverse !important;
          }
          .merchandise-controls-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            border-left: none !important;
            border-top: 1px solid var(--line) !important;
          }
        }
        .focus-ring:focus-visible {
          outline: 2px solid var(--accent) !important;
          outline-offset: 2px !important;
        }
        .mockup-svg-logo-wrapper svg {
          height: 100% !important;
          width: auto !important;
          max-height: 100% !important;
          max-width: 100% !important;
          display: block;
        }
      `}</style>

      <MarketingNav basePath="/dashboard" />

      {/* Header Hero Banner */}
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
                <ShoppingCart size={15} />
                <span>Cart</span>
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
              <History size={15} />
              <span>Orders</span>
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
                boxShadow: '0 4px 14px rgba(255, 122, 33, 0.35)',
              }}
            >
              <span>Review Proof &amp; Checkout</span>
              <span>&rarr;</span>
            </button>
          </div>
        </div>

        {cartToast && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#86efac',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{cartToast}</span>
            <button
              type="button"
              onClick={() => setCartToast(null)}
              style={{ background: 'transparent', border: 'none', color: '#86efac', cursor: 'pointer', fontWeight: 900 }}
            >
              ✕
            </button>
          </div>
        )}
      </section>

      {/* Main Studio Frame: 2-Column Split Workspace */}
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
        <div className="merchandise-workspace-split" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Photorealistic Live Preview Canvas */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '1.75rem',
              background: 'radial-gradient(ellipse 90% 70% at 50% 30%, #151c2a 0%, #0d121c 65%, #070a10 100%)',
              backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            <Product3DMockupStage
              product={currentProduct}
              activeColor={activeColor}
              activeTier={activeTier}
              viewAngle={viewAngle}
              setViewAngle={setViewAngle}
              includeQrCode={includeQrCode}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              renderBranding={renderMockupBranding}
              logoSrc={activeLogoSrc}
              cardTemplateId={selectedCardTemplate}
              onSelectCardTemplate={setSelectedCardTemplate}
              cardFinish={selectedCardFinish}
              onSelectCardFinish={setSelectedCardFinish}
              notepadTemplateId={selectedNotepadTemplate}
              onSelectNotepadTemplate={setSelectedNotepadTemplate}
              onExportReady={(fn) => {
                canvasProofExportRef.current = fn;
              }}
            />

            {/* Compact Craftsmanship & Paper Specs Card */}
            <ProductTechnicalSpecsSheet
              product={currentProduct}
              businessName={businessName}
              activeColorName={activeColor.name}
              onDownloadProof={handleDownloadProofSheet}
            />
          </div>

          {/* Right: Fast 4-Step Configurator Panel */}
          <StudioConfigurator
            currentProduct={currentProduct}
            displayedProducts={MERCHANDISE_PRODUCTS}
            onSelectProduct={handleSelectProduct}
            selectedCardTemplate={selectedCardTemplate}
            onSelectCardTemplate={setSelectedCardTemplate}
            selectedCardFinish={selectedCardFinish}
            onSelectCardFinish={setSelectedCardFinish}
            selectedNotepadTemplate={selectedNotepadTemplate}
            onSelectNotepadTemplate={setSelectedNotepadTemplate}
            selectedColorId={selectedColorId}
            onSelectColorId={setSelectedColorId}
            activeColor={activeColor}
            selectedTierQty={selectedTierQty}
            onSelectTierQty={setSelectedTierQty}
            activeTier={activeTier}
            businessName={businessName}
            setBusinessName={setBusinessName}
            tagline={tagline}
            setTagline={setTagline}
            phone={phone}
            setPhone={setPhone}
            website={website}
            setWebsite={setWebsite}
            license={license}
            setLicense={setLicense}
            accentColor={accentColor}
            setAccentColor={setAccentColor}
            secondaryColor={secondaryColor}
            setSecondaryColor={setSecondaryColor}
            onApplyTradePreset={handleApplyTradePreset}
            onResetToDefaults={handleResetToDefaults}
            logoSource={logoSource}
            setLogoSource={setLogoSource}
            customUploadUrl={customUploadUrl}
            onLogoFileUpload={handleLogoFileUpload}
            onRemoveCustomLogo={() => {
              setCustomUploadUrl(null);
              setLogoSource('vector');
            }}
            aiLogos={initialData.aiLogos}
            selectedAiLogoId={selectedAiLogoId}
            onSelectAiLogoId={setSelectedAiLogoId}
            siteLogoUrl={initialData.currentLogoUrl}
            onOpenCheckout={handleOpenCheckout}
            onAddToCart={handleAddToCart}
            onDownloadProof={handleDownloadProofSheet}
            isGeneratingProof={isGeneratingProof}
          />
        </div>
      </div>

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        checkoutItems={checkoutItems}
        businessName={businessName}
        tagline={tagline}
        phone={phone}
        website={website}
        license={license}
        accentColor={accentColor}
        secondaryColor={secondaryColor}
        shippingAddress={shippingAddress}
        setShippingAddress={setShippingAddress}
        shippingMethod={shippingMethod}
        setShippingMethod={setShippingMethod}
        proofApproved={proofApproved}
        setProofApproved={setProofApproved}
        checkoutError={checkoutError}
        isCheckingOut={isCheckingOut}
        onExecuteCheckout={handleExecuteCheckout}
        onUpdateCartItemQuantity={handleUpdateCartItemQuantity}
        onRemoveFromCart={handleRemoveFromCart}
        cart={cart}
      />

      {/* Orders Drawer */}
      <OrdersDrawer
        isOpen={ordersDrawerOpen}
        onClose={() => setOrdersDrawerOpen(false)}
        orders={orders}
        onReorder={handleReorder}
        isReordering={isReordering}
      />

      {/* Order Success Confirmation Modal */}
      {orderSuccessModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order Placed"
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
              Your order <strong>{orderSuccessModal.orderNumber}</strong> has been routed to commercial manufacturing. Digital proof approved.
              {orderSuccessModal.trackingNumber ? (
                <> Carrier tracking: <strong>{orderSuccessModal.trackingNumber}</strong>.</>
              ) : (
                <> Carrier tracking will be emailed to <strong>{orderSuccessModal.shippingAddress?.email || 'your email'}</strong> once dispatched.</>
              )}
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
    </main>
  );
}
