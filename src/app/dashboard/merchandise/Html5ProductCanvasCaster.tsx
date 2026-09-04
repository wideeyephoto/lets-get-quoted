'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getProductStudioPhoto } from '@/lib/merchandise/mockup-assets';

export interface Html5ProductCanvasCasterProps {
  productId: string;
  viewAngle: 'front' | 'back' | 'detail' | 'angle';
  colorHex: string;
  colorId: string;
  darkText?: boolean;
  businessName: string;
  tagline?: string;
  phone?: string;
  website?: string;
  license?: string;
  accentColor?: string;
  secondaryColor?: string;
  logoSrc: string; // URL or SVG data URI
  onExportReady?: (exportFn: () => Promise<string>) => void;
  glareX?: number;
  glareY?: number;
  isInteractive?: boolean;
}

interface PrintAreaSpec {
  cx: number; // Center X in 1040x1040 buffer
  cy: number; // Center Y in 1040x1040 buffer
  maxW: number;
  maxH: number;
  allowedBounds: { minX: number; maxX: number; minY: number; maxY: number };
  defaultMaterial: 'screenprint' | 'embroidery' | 'leather_patch' | 'laser_engrave' | 'uv_print';
  curvedCylinder?: boolean;
}

/**
 * Returns calibrated imprint coordinates and bounding constraints for each product & view.
 */
function getPrintAreaSpec(productId: string, viewAngle: string): PrintAreaSpec {
  if (productId === 'polos') {
    if (viewAngle === 'back') {
      return {
        cx: 520,
        cy: 340,
        maxW: 460,
        maxH: 420,
        allowedBounds: { minX: 300, maxX: 740, minY: 200, maxY: 620 },
        defaultMaterial: 'embroidery',
      };
    }
    // Polo front: Left chest pocket position
    return {
      cx: 370,
      cy: 390,
      maxW: 210,
      maxH: 210,
      allowedBounds: { minX: 270, maxX: 470, minY: 280, maxY: 500 },
      defaultMaterial: 'embroidery',
    };
  }

  if (productId === 'hats') {
    return {
      cx: 520,
      cy: 410,
      maxW: 280,
      maxH: 180,
      allowedBounds: { minX: 380, maxX: 660, minY: 320, maxY: 500 },
      defaultMaterial: 'leather_patch',
    };
  }

  if (productId === 'tumblers') {
    return {
      cx: 520,
      cy: 480,
      maxW: 240,
      maxH: 260,
      allowedBounds: { minX: 400, maxX: 640, minY: 320, maxY: 640 },
      defaultMaterial: 'laser_engrave',
      curvedCylinder: true,
    };
  }

  if (productId === 'phone_cases') {
    return {
      cx: 520,
      cy: 530,
      maxW: 280,
      maxH: 340,
      allowedBounds: { minX: 380, maxX: 660, minY: 360, maxY: 720 },
      defaultMaterial: 'uv_print',
    };
  }

  // Default: T-Shirt
  if (viewAngle === 'back') {
    return {
      cx: 520,
      cy: 360,
      maxW: 520,
      maxH: 520,
      allowedBounds: { minX: 260, maxX: 780, minY: 200, maxY: 660 },
      defaultMaterial: 'screenprint',
    };
  }

  // T-Shirt front center chest
  return {
    cx: 520,
    cy: 430,
    maxW: 360,
    maxH: 340,
    allowedBounds: { minX: 340, maxX: 700, minY: 280, maxY: 600 },
    defaultMaterial: 'screenprint',
  };
}

export default function Html5ProductCanvasCaster({
  productId,
  viewAngle,
  colorHex,
  colorId,
  darkText = false,
  businessName,
  tagline = '',
  phone = '',
  website = '',
  license = '',
  accentColor = '#f59e0b',
  secondaryColor = '#38bdf8',
  logoSrc,
  onExportReady,
  glareX = 50,
  glareY = 50,
  isInteractive = true,
}: Html5ProductCanvasCasterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Dragging & scaling state
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [scale, setScale] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showBoundary, setShowBoundary] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Cached blank image and logo image elements
  const blankImgRef = useRef<HTMLImageElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const spec = getPrintAreaSpec(productId, viewAngle);
  const { photoUrl } = getProductStudioPhoto(productId, colorId, viewAngle);

  // Resolve proxy URL for blank photo to guarantee CORS clean canvas
  const proxiedPhotoUrl = photoUrl
    ? `/api/merchandise/proxy-image?url=${encodeURIComponent(photoUrl)}`
    : '';

  // 1. Load Blank Photographic Image
  useEffect(() => {
    if (!proxiedPhotoUrl) return;

    setImageLoaded(false);
    setRenderError(null);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = proxiedPhotoUrl;

    img.onload = () => {
      blankImgRef.current = img;
      setImageLoaded(true);
    };

    img.onerror = () => {
      // If proxy fails, attempt direct load as fallback
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.src = photoUrl;
      fallbackImg.onload = () => {
        blankImgRef.current = fallbackImg;
        setImageLoaded(true);
      };
      fallbackImg.onerror = () => {
        setRenderError('Could not load studio blank photograph.');
      };
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [proxiedPhotoUrl, photoUrl]);

  // 2. Load Logo Image (SVG data URI or external URL)
  useEffect(() => {
    if (!logoSrc) return;

    const img = new Image();
    // Use proxy for remote URLs, data URIs load directly
    if (logoSrc.startsWith('http')) {
      img.crossOrigin = 'anonymous';
      img.src = `/api/merchandise/proxy-image?url=${encodeURIComponent(logoSrc)}`;
    } else {
      img.src = logoSrc;
    }

    img.onload = () => {
      logoImgRef.current = img;
      drawCanvas();
    };

    img.onerror = () => {
      console.warn('Logo image failed to load for canvas casting');
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [logoSrc]);

  // 3. Core Canvas Casting & Physics Compositor
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const W = canvas.width; // 1040
    const H = canvas.height; // 1040

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // -------------------------------------------------------------
    // PASS 1: Base Blank Photographic Garment / Item
    // -------------------------------------------------------------
    if (blankImgRef.current && blankImgRef.current.complete && blankImgRef.current.naturalWidth > 0) {
      // Draw studio photographic blank centered and contained
      const bImg = blankImgRef.current;
      const aspect = bImg.naturalWidth / bImg.naturalHeight;
      let drawW = W;
      let drawH = H;
      let dx = 0;
      let dy = 0;

      if (aspect > 1) {
        drawH = W / aspect;
        dy = (H - drawH) / 2;
      } else {
        drawW = H * aspect;
        dx = (W - drawW) / 2;
      }

      ctx.save();
      // Drop shadow for floating garment depth
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 20;
      ctx.drawImage(bImg, dx, dy, drawW, drawH);
      ctx.restore();
    } else {
      // Fallback solid garment silhouette if photo is loading
      ctx.save();
      ctx.fillStyle = colorHex || '#1e293b';
      ctx.beginPath();
      ctx.roundRect(120, 120, W - 240, H - 240, 40);
      ctx.fill();
      ctx.restore();
    }

    // Dynamic Studio Lighting Glare on Garment Surface
    ctx.save();
    const glareRad = ctx.createRadialGradient(
      (glareX / 100) * W,
      (glareY / 100) * H,
      20,
      (glareX / 100) * W,
      (glareY / 100) * H,
      480
    );
    glareRad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    glareRad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    glareRad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glareRad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // -------------------------------------------------------------
    // PASS 2: Printable Boundary Box (Shown on Hover / Drag)
    // -------------------------------------------------------------
    if (showBoundary) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      const bw = spec.allowedBounds.maxX - spec.allowedBounds.minX;
      const bh = spec.allowedBounds.maxY - spec.allowedBounds.minY;
      ctx.strokeRect(spec.allowedBounds.minX, spec.allowedBounds.minY, bw, bh);

      // Corner crosshairs
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('PRINTABLE IMPRINT ZONE', spec.allowedBounds.minX + 8, spec.allowedBounds.minY - 8);
      ctx.restore();
    }

    // -------------------------------------------------------------
    // PASS 3: Imprint Projection & Physical Casting
    // -------------------------------------------------------------
    const targetX = spec.cx + offset.x;
    const targetY = spec.cy + offset.y;

    // A. RICHARDSON 112 HAT: Laser-Debossed Leather Patch
    if (productId === 'hats') {
      drawLeatherPatchImprint(ctx, targetX, targetY, scale);
    }
    // B. TUMBLER: Cylindrical Warped Rotary Laser Etch
    else if (productId === 'tumblers') {
      drawCylindricalLaserEtch(ctx, targetX, targetY, scale);
    }
    // C. PHONE CASE: High-Gloss Sub-Surface UV Imprint
    else if (productId === 'phone_cases') {
      drawPhoneCaseUVPrint(ctx, targetX, targetY, scale);
    }
    // D. BACK OF SHIRT OR POLO: Full Tradesman Billboard Layout
    else if (viewAngle === 'back') {
      drawTradesmanBillboardBack(ctx, targetX, targetY, scale);
    }
    // E. FRONT OF POLO: 3D High-Density Madeira Thread Embroidery
    else if (productId === 'polos') {
      drawEmbroideredChestLogo(ctx, targetX, targetY, scale);
    }
    // F. FRONT OF T-SHIRT: Screen Print with Wrinkle & Luminance Shading
    else {
      drawScreenPrintChestLogo(ctx, targetX, targetY, scale);
    }
  }, [
    productId,
    viewAngle,
    colorHex,
    darkText,
    businessName,
    tagline,
    phone,
    license,
    accentColor,
    secondaryColor,
    offset,
    scale,
    showBoundary,
    glareX,
    glareY,
    spec,
  ]);

  // ---------------------------------------------------------------
  // Sub-Renderer 1: Screen Print DTG Plastisol with Wrinkle Modulation
  // ---------------------------------------------------------------
  function drawScreenPrintChestLogo(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    if (!logoImgRef.current || !logoImgRef.current.complete) return;
    const lImg = logoImgRef.current;

    const baseW = spec.maxW * scaleMult;
    const aspect = lImg.naturalWidth / lImg.naturalHeight;
    const logoW = baseW;
    const logoH = baseW / aspect;
    const lx = cx - logoW / 2;
    const ly = cy - logoH / 2;

    ctx.save();

    // 1. If light fabric, multiply blend mode blends pigment into the cotton fibers naturally
    if (darkText) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.94;
    } else {
      // For dark shirts: Direct-to-Film plastisol underbase ink
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
    }

    // Draw core logo mark
    ctx.drawImage(lImg, lx, ly, logoW, logoH);

    // 2. Micro Fabric Weave Texture Pass over the Ink
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.12;
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 6;
    patternCanvas.height = 6;
    const pctx = patternCanvas.getContext('2d');
    if (pctx) {
      pctx.strokeStyle = darkText ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
      pctx.lineWidth = 1;
      pctx.beginPath();
      pctx.moveTo(0, 3);
      pctx.lineTo(6, 3);
      pctx.moveTo(3, 0);
      pctx.lineTo(3, 6);
      pctx.stroke();
      const pattern = ctx.createPattern(patternCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(lx, ly, logoW, logoH);
      }
    }

    // 3. Subtle Collar Heat-Transfer Brand Stamp
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = darkText ? 0.45 : 0.6;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = darkText ? '#334155' : '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(businessName.slice(0, 20).toUpperCase(), 520, 240);
    ctx.font = '10px sans-serif';
    ctx.fillText('100% COMBED RING-SPUN COTTON • L', 520, 256);
    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Sub-Renderer 2: 3D High-Density Machine Embroidery for Polos
  // ---------------------------------------------------------------
  function drawEmbroideredChestLogo(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    if (!logoImgRef.current || !logoImgRef.current.complete) return;
    const lImg = logoImgRef.current;

    const baseW = spec.maxW * scaleMult;
    const aspect = lImg.naturalWidth / lImg.naturalHeight;
    const logoW = baseW;
    const logoH = baseW / aspect;
    const lx = cx - logoW / 2;
    const ly = cy - logoH / 2;

    ctx.save();

    // Pass 1: Recessed Under-Stitch Shadow (3D depth)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(lImg, lx, ly, logoW, logoH);
    ctx.restore();

    // Pass 2: Madeira Rayon Thread Highlight (Top light catch)
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = -1.5;
    ctx.drawImage(lImg, lx, ly, logoW, logoH);
    ctx.restore();

    // Pass 3: Satin Stitch Directional Thread Sheen Overlay
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.22;
    const stitchCanvas = document.createElement('canvas');
    stitchCanvas.width = 4;
    stitchCanvas.height = 4;
    const sctx = stitchCanvas.getContext('2d');
    if (sctx) {
      sctx.strokeStyle = '#ffffff';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(0, 4);
      sctx.lineTo(4, 0);
      sctx.stroke();
      const stitchPattern = ctx.createPattern(stitchCanvas, 'repeat');
      if (stitchPattern) {
        ctx.fillStyle = stitchPattern;
        ctx.fillRect(lx, ly, logoW, logoH);
      }
    }
    ctx.restore();

    // Embroidered Business Name underneath Left Chest Crest
    ctx.save();
    ctx.font = '900 12px sans-serif';
    ctx.fillStyle = darkText ? '#0f172a' : '#f8fafc';
    ctx.textAlign = 'center';
    ctx.shadowColor = darkText ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText(businessName.slice(0, 18).toUpperCase(), cx, ly + logoH + 16);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Sub-Renderer 3: Laser-Debossed Saddle Leather Patch for Hats
  // ---------------------------------------------------------------
  function drawLeatherPatchImprint(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    const patchW = 280 * scaleMult;
    const patchH = 175 * scaleMult;
    const px = cx - patchW / 2;
    const py = cy - patchH / 2;
    const radius = 22 * scaleMult;

    ctx.save();

    // 1. Leather Patch Drop Shadow onto Hat Fabric
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;

    // 2. Rich Full-Grain Saddle Leather Gradient
    const leatherGrad = ctx.createLinearGradient(px, py, px + patchW, py + patchH);
    leatherGrad.addColorStop(0, '#9e5a2c');
    leatherGrad.addColorStop(0.5, '#7b3e18');
    leatherGrad.addColorStop(1, '#53250b');
    ctx.fillStyle = leatherGrad;

    ctx.beginPath();
    ctx.roundRect(px, py, patchW, patchH, radius);
    ctx.fill();

    // Reset shadow for internal details
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 3. Perimeter Saddle Stitch Channel & Nylon Thread Dashes
    const stitchMargin = 10 * scaleMult;
    ctx.save();
    ctx.strokeStyle = '#fef08a'; // Contrasting heavy gold/cream stitching
    ctx.lineWidth = 2.5 * scaleMult;
    ctx.setLineDash([8 * scaleMult, 6 * scaleMult]);
    ctx.beginPath();
    ctx.roundRect(
      px + stitchMargin,
      py + stitchMargin,
      patchW - stitchMargin * 2,
      patchH - stitchMargin * 2,
      radius - 4
    );
    ctx.stroke();
    ctx.restore();

    // 4. Corner Brass Screws / Rivets
    const rivetDist = 16 * scaleMult;
    const rivetRadius = 4.5 * scaleMult;
    const rivetCoords = [
      { rx: px + rivetDist, ry: py + rivetDist },
      { rx: px + patchW - rivetDist, ry: py + rivetDist },
      { rx: px + rivetDist, ry: py + patchH - rivetDist },
      { rx: px + patchW - rivetDist, ry: py + patchH - rivetDist },
    ];

    rivetCoords.forEach(({ rx, ry }) => {
      const rivetGrad = ctx.createRadialGradient(rx - 1, ry - 1, 1, rx, ry, rivetRadius);
      rivetGrad.addColorStop(0, '#fef08a');
      rivetGrad.addColorStop(0.7, '#ca8a04');
      rivetGrad.addColorStop(1, '#422006');
      ctx.fillStyle = rivetGrad;
      ctx.beginPath();
      ctx.arc(rx, ry, rivetRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. Laser-Charred Logo Mark Debossing inside Patch
    if (logoImgRef.current && logoImgRef.current.complete) {
      const lImg = logoImgRef.current;
      const logoMaxW = patchW * 0.58;
      const aspect = lImg.naturalWidth / lImg.naturalHeight;
      const logoW = logoMaxW;
      const logoH = logoMaxW / aspect;
      const lx = cx - logoW / 2;
      const ly = cy - logoH / 2 - 12 * scaleMult;

      ctx.save();
      // Laser burn charred edge shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.drawImage(lImg, lx, ly, logoW, logoH);
      ctx.restore();
    }

    // 6. Laser-Etched Text Mark
    ctx.save();
    ctx.fillStyle = '#fef08a';
    ctx.font = `900 ${Math.round(15 * scaleMult)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    ctx.fillText(businessName.toUpperCase().slice(0, 16), cx, py + patchH - 28 * scaleMult);

    ctx.fillStyle = '#fde047';
    ctx.font = `800 ${Math.round(10 * scaleMult)}px sans-serif`;
    ctx.fillText('EST. 2026 • PRO FLEET', cx, py + patchH - 12 * scaleMult);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Sub-Renderer 4: Cylindrical Warped Rotary Laser Etch on Tumbler
  // ---------------------------------------------------------------
  function drawCylindricalLaserEtch(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    if (!logoImgRef.current || !logoImgRef.current.complete) return;
    const lImg = logoImgRef.current;

    const baseW = spec.maxW * scaleMult;
    const aspect = lImg.naturalWidth / lImg.naturalHeight;
    const logoW = baseW;
    const logoH = baseW / aspect;
    const lx = cx - logoW / 2;
    const ly = cy - logoH / 2 - 20 * scaleMult;

    ctx.save();

    // Rotary Laser Etch: Silver Core with Cylindrical Strip Projection
    // Slices into vertical strips and compresses x-dimension towards tumbler curve
    const numSlices = 20;
    const sliceSrcW = lImg.naturalWidth / numSlices;
    const sliceDstW = logoW / numSlices;

    for (let i = 0; i < numSlices; i++) {
      // Norm -1 to +1 across cylinder width
      const normX = (i / (numSlices - 1)) * 2 - 1;
      // Curvature angle
      const angle = (normX * Math.PI) / 3.4;
      const cosComp = Math.cos(angle); // Compresses edges

      const sx = i * sliceSrcW;
      const dx = cx + (normX * (logoW / 2)) * cosComp;
      const dw = sliceDstW * cosComp;

      ctx.save();
      // Brushed silver rotary laser sheen
      ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
      ctx.shadowBlur = 3;
      ctx.drawImage(lImg, sx, 0, sliceSrcW, lImg.naturalHeight, dx, ly, dw, logoH);
      ctx.restore();
    }

    // Laser Etched Business Name
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(18 * scaleMult)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(businessName.toUpperCase(), cx, ly + logoH + 28 * scaleMult);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `800 ${Math.round(11 * scaleMult)}px sans-serif`;
    ctx.fillText('ROTARY LASER ETCHED STAINLESS', cx, ly + logoH + 46 * scaleMult);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Sub-Renderer 4b: High-Gloss Sub-Surface UV Imprint for Phone Case
  // ---------------------------------------------------------------
  function drawPhoneCaseUVPrint(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    if (!logoImgRef.current || !logoImgRef.current.complete) return;
    const lImg = logoImgRef.current;

    const baseW = spec.maxW * scaleMult;
    const aspect = lImg.naturalWidth / lImg.naturalHeight;
    const logoW = baseW;
    const logoH = baseW / aspect;
    const lx = cx - logoW / 2;
    const ly = cy - logoH / 2 - 25 * scaleMult;

    ctx.save();
    // High-Definition UV Gloss Layer with Drop Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(lImg, lx, ly, logoW, logoH);

    // Business Name
    ctx.save();
    ctx.fillStyle = darkText ? '#0f172a' : '#ffffff';
    ctx.font = `900 ${Math.round(20 * scaleMult)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(businessName.toUpperCase(), cx, ly + logoH + 28 * scaleMult);

    if (tagline) {
      ctx.fillStyle = accentColor;
      ctx.font = `800 ${Math.round(12 * scaleMult)}px sans-serif`;
      ctx.fillText(tagline.toUpperCase(), cx, ly + logoH + 46 * scaleMult);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = `800 ${Math.round(10 * scaleMult)}px sans-serif`;
    ctx.fillText('MIL-STD-810G IMPACT RATED', cx, ly + logoH + 64 * scaleMult);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------
  // Sub-Renderer 5: Full Tradesman Billboard Back Layout
  // ---------------------------------------------------------------
  function drawTradesmanBillboardBack(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    scaleMult: number
  ) {
    ctx.save();

    const textColor = darkText ? '#0f172a' : '#ffffff';
    const subTextColor = darkText ? '#334155' : '#cbd5e1';

    // 1. Top Billboard Logo Crest
    if (logoImgRef.current && logoImgRef.current.complete) {
      const lImg = logoImgRef.current;
      const logoW = 240 * scaleMult;
      const aspect = lImg.naturalWidth / lImg.naturalHeight;
      const logoH = logoW / aspect;
      const lx = cx - logoW / 2;
      const ly = cy - 140 * scaleMult;

      ctx.save();
      if (darkText) {
        ctx.globalCompositeOperation = 'multiply';
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }
      ctx.drawImage(lImg, lx, ly, logoW, logoH);
      ctx.restore();
    }

    // 2. Bold Business Headline
    ctx.save();
    ctx.fillStyle = textColor;
    ctx.font = `900 ${Math.round(36 * scaleMult)}px sans-serif`;
    ctx.textAlign = 'center';
    if (!darkText) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
    }
    ctx.fillText(businessName.toUpperCase(), cx, cy + 40 * scaleMult);

    // 3. Trade Specialty Subtitle
    if (tagline) {
      ctx.fillStyle = accentColor;
      ctx.font = `800 ${Math.round(18 * scaleMult)}px sans-serif`;
      ctx.fillText(tagline.toUpperCase(), cx, cy + 70 * scaleMult);
    }

    // 4. Large Legible Phone Pill Badge (Visible 30ft away on jobsite)
    if (phone) {
      const phoneStr = `📞 ${phone}`;
      ctx.font = `900 ${Math.round(24 * scaleMult)}px sans-serif`;
      const textMetrics = ctx.measureText(phoneStr);
      const pillW = textMetrics.width + 48 * scaleMult;
      const pillH = 46 * scaleMult;
      const px = cx - pillW / 2;
      const py = cy + 95 * scaleMult;

      ctx.fillStyle = darkText ? '#0f172a' : 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(px, py, pillW, pillH, 8 * scaleMult);
      ctx.fill();

      if (!darkText) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(phoneStr, cx, py + 32 * scaleMult);
    }

    // 5. License & Insured Credentials
    if (license) {
      ctx.fillStyle = subTextColor;
      ctx.font = `900 ${Math.round(13 * scaleMult)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${license} • LICENSED & INSURED`, cx, cy + 175 * scaleMult);
    }

    ctx.restore();
    ctx.restore();
  }

  // Initial draw & Redraw on changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // 4. Expose 300 DPI High-Res Proof Exporter to Parent
  useEffect(() => {
    if (!onExportReady) return;

    const exportProof = async (): Promise<string> => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not mounted');

      // Export high-fidelity PNG data URL directly from 1040x1040 canvas buffer
      return canvas.toDataURL('image/png', 1.0);
    };

    onExportReady(exportProof);
  }, [onExportReady]);

  // 5. Mouse & Touch Dragging Handlers
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isInteractive) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    setShowBoundary(true);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDragging || !isInteractive) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Constrain within allowed physical bounds
    const maxDeltaX = 80;
    const maxDeltaY = 60;
    setOffset({
      x: Math.max(-maxDeltaX, Math.min(maxDeltaX, newX)),
      y: Math.max(-maxDeltaY, Math.min(maxDeltaY, newY)),
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleResetPosition() {
    setOffset({ x: 0, y: 0 });
    setScale(1.0);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        width: '100%',
        maxWidth: '560px',
        margin: '0 auto',
      }}
    >
      {/* Interactive 1040x1040 HTML5 Canvas buffer displayed at 520x520 */}
      <div
        style={{
          position: 'relative',
          width: '520px',
          height: '520px',
          maxWidth: '100%',
          aspectRatio: '1 / 1',
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'transparent',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
        }}
        onMouseEnter={() => setShowBoundary(true)}
        onMouseLeave={() => {
          setShowBoundary(false);
          setIsDragging(false);
        }}
      >
        <canvas
          ref={canvasRef}
          width={1040}
          height={1040}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: isInteractive ? (isDragging ? 'grabbing' : 'grab') : 'default',
            touchAction: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {/* Live Dragging Indicator Badge */}
        {isDragging && (
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: '999px',
              pointerEvents: 'none',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            Position: ({offset.x > 0 ? `+${offset.x}` : offset.x}px,{' '}
            {offset.y > 0 ? `+${offset.y}` : offset.y}px)
          </div>
        )}
      </div>

      {/* Interactive Toolbelt: Live Scale & Center Controls */}
      {isInteractive && (
        <div
          style={{
            marginTop: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            width: '100%',
            maxWidth: '520px',
            background: 'rgba(11, 15, 23, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '0.5rem 0.85rem',
            backdropFilter: 'blur(10px)',
            fontSize: '0.74rem',
            color: 'var(--muted)',
          }}
        >
          {/* Scale Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#ffffff' }}>Scale:</span>
            <input
              type="range"
              min="0.65"
              max="1.35"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ minWidth: '36px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
              {Math.round(scale * 100)}%
            </span>
          </div>

          {/* Center Reset Button */}
          <button
            type="button"
            onClick={handleResetPosition}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '3px 10px',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Center Position
          </button>
        </div>
      )}
    </div>
  );
}
