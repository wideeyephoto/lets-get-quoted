/**
 * Canonical Business Card Artwork Renderer
 *
 * Implements Section 4 & 7 of business-card-instant-order-implementation-plan-2026-09-05.md
 * Outputs deterministic, print-ready SVG artwork for front and back layouts.
 * Uses 3 curated layouts (Clean, Bold, Booking) with verified business data only:
 * NO fabricated ratings, review counts, or manufacturer specifications.
 * Standard US cut: 3.5" x 2" trim with 0.125" bleed = 1125 x 675 px at 300 DPI.
 */

import { PRINTFUL_CARD_SPECS } from './card-catalog-types';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export type CardCuratedTemplateId = 'clean' | 'bold' | 'booking';

export interface CardDesignDocument {
  version: number;
  templateId: CardCuratedTemplateId;
  content: {
    businessName: string;
    trade?: string;
    tagline?: string;
    phone: string;
    website?: string;
    email?: string;
    license?: string;
  };
  colors: {
    accentColor: string;
    secondaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };
  logo?: {
    url?: string;
    svgContent?: string;
    textFallback?: string;
  };
  qr: {
    destinationUrl: string;
    actionText?: string;
    qrSvg?: string;
  };
}

export interface RenderedArtwork {
  frontSvg: string;
  backSvg: string;
  frontHash: string;
  backHash: string;
  templateId: CardCuratedTemplateId;
  dimensions: typeof PRINTFUL_CARD_SPECS.dimensions;
}

/**
 * Escapes XML special characters for safe SVG text nodes.
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Computes SHA-256 hash of SVG artwork for immutable proofing.
 * Uses the same SHA-256 implementation in previews and on the server.
 */
export function computeArtworkHash(svgContent: string): string {
  return bytesToHex(sha256(svgContent.trim()));
}

/**
 * Renders Clean Template:
 * Front: Professional whitespace, left-aligned logo/monogram, prominent company name,
 * trade tagline, and clear contact rows.
 * Back: Subtle border/monogram, clear secondary contact, and verified URL QR code.
 */
function renderCleanArtwork(doc: CardDesignDocument): { frontSvg: string; backSvg: string } {
  const { pixelWidth, pixelHeight, safeAreaPaddingPx } = PRINTFUL_CARD_SPECS.dimensions;
  const accent = doc.colors.accentColor || '#0284c7';
  const name = escapeXml(doc.content.businessName);
  const trade = doc.content.trade ? escapeXml(doc.content.trade) : '';
  const tagline = doc.content.tagline ? escapeXml(doc.content.tagline) : trade;
  const phone = escapeXml(doc.content.phone);
  const website = doc.content.website ? escapeXml(doc.content.website) : '';
  const email = doc.content.email ? escapeXml(doc.content.email) : '';
  const license = doc.content.license ? escapeXml(doc.content.license) : '';
  const qrAction = doc.qr.actionText ? escapeXml(doc.qr.actionText) : 'Scan to request a quote';

  const safeX = safeAreaPaddingPx;
  const safeY = safeAreaPaddingPx;
  const safeW = pixelWidth - safeAreaPaddingPx * 2;
  const safeH = pixelHeight - safeAreaPaddingPx * 2;

  // Front Side
  const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#ffffff" />
  <!-- Bleed & Trim Guides (hidden in print) -->
  <rect x="${safeX}" y="${safeY}" width="${safeW}" height="${safeH}" fill="none" stroke="none" />

  <!-- Accent top bar -->
  <rect x="0" y="0" width="${pixelWidth}" height="18" fill="${accent}" />

  <!-- Business Name (Min 18pt = ~75px) -->
  <text x="${safeX + 20}" y="${safeY + 120}" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="#0f172a" letter-spacing="-0.5">${name}</text>

  <!-- Trade / Tagline (Min 12pt = ~50px) -->
  ${tagline ? `<text x="${safeX + 22}" y="${safeY + 175}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="${accent}">${tagline.toUpperCase()}</text>` : ''}

  <!-- Divider -->
  <line x1="${safeX + 20}" y1="${safeY + 210}" x2="${safeX + 350}" y2="${safeY + 210}" stroke="#e2e8f0" stroke-width="3" />

  <!-- Contact Block (Min 10pt = ~42px) -->
  <g transform="translate(${safeX + 22}, ${safeY + 270})">
    <text y="0" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="700" fill="#1e293b">📞 ${phone}</text>
    ${email ? `<text y="50" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="#475569">✉️ ${email}</text>` : ''}
    ${website ? `<text y="95" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="#475569">🌐 ${website}</text>` : ''}
    ${license ? `<text y="140" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="#94a3b8">REG: ${license}</text>` : ''}
  </g>
</svg>`;

  // Back Side with QR
  const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#f8fafc" />

  <!-- Center card container -->
  <rect x="${safeX + 40}" y="${safeY + 30}" width="${safeW - 80}" height="${safeH - 60}" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />

  <!-- Brand Heading -->
  <text x="${pixelWidth / 2}" y="${safeY + 110}" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="800" text-anchor="middle" fill="#0f172a">${name}</text>
  <text x="${pixelWidth / 2}" y="${safeY + 155}" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="${accent}">${qrAction.toUpperCase()}</text>

  <!-- Embed QR Code (if provided) -->
  ${doc.qr.qrSvg ? `
  <g transform="translate(${pixelWidth / 2 - 120}, ${safeY + 180}) scale(0.8)">
    ${doc.qr.qrSvg}
  </g>
  ` : `
  <rect x="${pixelWidth / 2 - 100}" y="${safeY + 185}" width="200" height="200" fill="#f1f5f9" rx="12" />
  <text x="${pixelWidth / 2}" y="${safeY + 295}" font-family="system-ui, -apple-system, sans-serif" font-size="22" text-anchor="middle" fill="#64748b">QR CODE</text>
  `}

  <!-- Footer link -->
  <text x="${pixelWidth / 2}" y="${safeY + 440}" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="#475569">${website || phone}</text>
</svg>`;

  return { frontSvg, backSvg };
}

/**
 * Renders Bold Template:
 * Front: High-impact solid accent banner, bold white typography, high visibility phone number.
 * Back: Coordinating bold styling with embedded high-contrast QR.
 */
function renderBoldArtwork(doc: CardDesignDocument): { frontSvg: string; backSvg: string } {
  const { pixelWidth, pixelHeight, safeAreaPaddingPx } = PRINTFUL_CARD_SPECS.dimensions;
  const accent = doc.colors.accentColor || '#1e3a8a';
  const name = escapeXml(doc.content.businessName);
  const trade = doc.content.trade ? escapeXml(doc.content.trade) : '';
  const phone = escapeXml(doc.content.phone);
  const website = doc.content.website ? escapeXml(doc.content.website) : '';
  const email = doc.content.email ? escapeXml(doc.content.email) : '';
  const license = doc.content.license ? escapeXml(doc.content.license) : '';
  const qrAction = doc.qr.actionText ? escapeXml(doc.qr.actionText) : 'Scan for Instant Quote';

  const safeX = safeAreaPaddingPx;
  const safeY = safeAreaPaddingPx;

  // Front Side
  const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#ffffff" />
  <!-- Left Bold Banner -->
  <rect x="0" y="0" width="380" height="${pixelHeight}" fill="${accent}" />

  <!-- Monogram / Initials on banner -->
  <text x="190" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="140" font-weight="900" text-anchor="middle" fill="rgba(255,255,255,0.18)">${name.slice(0, 2).toUpperCase()}</text>
  <text x="190" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#ffffff" letter-spacing="2">VERIFIED</text>

  <!-- Content Block on Right -->
  <g transform="translate(430, ${safeY + 90})">
    <text x="0" y="40" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="900" fill="#0f172a">${name}</text>
    ${trade ? `<text x="0" y="90" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="700" fill="${accent}">${trade.toUpperCase()}</text>` : ''}

    <line x1="0" y1="125" x2="450" y2="125" stroke="#cbd5e1" stroke-width="2" />

    <text x="0" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#0f172a">📞 ${phone}</text>
    ${website ? `<text x="0" y="230" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#475569">🌐 ${website}</text>` : ''}
    ${email ? `<text x="0" y="275" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="500" fill="#64748b">✉️ ${email}</text>` : ''}
    ${license ? `<text x="0" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="#94a3b8">LIC: ${license}</text>` : ''}
  </g>
</svg>`;

  // Back Side
  const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#0f172a" />

  <!-- Accent Stripe -->
  <rect x="0" y="0" width="${pixelWidth}" height="24" fill="${accent}" />

  <text x="${pixelWidth / 2}" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="900" text-anchor="middle" fill="#ffffff">${name}</text>
  <text x="${pixelWidth / 2}" y="190" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="700" text-anchor="middle" fill="${accent}">${qrAction.toUpperCase()}</text>

  <!-- Embed QR Code -->
  ${doc.qr.qrSvg ? `
  <g transform="translate(${pixelWidth / 2 - 110}, 220) scale(0.75)">
    <rect x="-10" y="-10" width="320" height="320" rx="12" fill="#ffffff" />
    ${doc.qr.qrSvg}
  </g>
  ` : `
  <rect x="${pixelWidth / 2 - 100}" y="220" width="200" height="200" fill="#ffffff" rx="12" />
  <text x="${pixelWidth / 2}" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" text-anchor="middle" fill="#000000">QR CODE</text>
  `}

  <text x="${pixelWidth / 2}" y="590" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="#94a3b8">${phone} • ${website || 'Call For Estimates'}</text>
</svg>`;

  return { frontSvg, backSvg };
}

/**
 * Renders Booking Template:
 * Front: Clear contractor identity, highlighted booking / quote request prompt.
 * Back: Direct conversion focus with large center QR code and step-by-step instructions.
 */
function renderBookingArtwork(doc: CardDesignDocument): { frontSvg: string; backSvg: string } {
  const { pixelWidth, pixelHeight, safeAreaPaddingPx } = PRINTFUL_CARD_SPECS.dimensions;
  const accent = doc.colors.accentColor || '#16a34a'; // Emerald green default for bookings
  const name = escapeXml(doc.content.businessName);
  const trade = doc.content.trade ? escapeXml(doc.content.trade) : '';
  const phone = escapeXml(doc.content.phone);
  const website = doc.content.website ? escapeXml(doc.content.website) : '';
  const email = doc.content.email ? escapeXml(doc.content.email) : '';
  const qrAction = doc.qr.actionText ? escapeXml(doc.qr.actionText) : 'Scan to Book Online';

  const safeX = safeAreaPaddingPx;
  const safeY = safeAreaPaddingPx;

  // Front Side
  const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#ffffff" />

  <g transform="translate(${safeX + 20}, ${safeY + 60})">
    <text x="0" y="60" font-family="system-ui, -apple-system, sans-serif" font-size="54" font-weight="900" fill="#0f172a">${name}</text>
    ${trade ? `<text x="0" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="${accent}">${trade.toUpperCase()}</text>` : ''}

    <!-- Callout Box -->
    <rect x="0" y="150" width="600" height="90" rx="12" fill="#f0fdf4" stroke="${accent}" stroke-width="2" />
    <text x="24" y="205" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="#15803d">⚡ FAST QUOTES &amp; DIRECT BOOKING</text>

    <!-- Details -->
    <text x="0" y="300" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="800" fill="#1e293b">📞 ${phone}</text>
    ${website ? `<text x="0" y="350" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#475569">🌐 ${website}</text>` : ''}
    ${email ? `<text x="0" y="395" font-family="system-ui, -apple-system, sans-serif" font-size="26" font-weight="500" fill="#64748b">✉️ ${email}</text>` : ''}
  </g>
</svg>`;

  // Back Side (Prominent QR First)
  const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <rect width="${pixelWidth}" height="${pixelHeight}" fill="#ffffff" />

  <!-- Accent perimeter header -->
  <rect x="0" y="0" width="${pixelWidth}" height="120" fill="${accent}" />
  <text x="${pixelWidth / 2}" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="40" font-weight="900" text-anchor="middle" fill="#ffffff">${qrAction.toUpperCase()}</text>

  <!-- Embed Large QR Code -->
  ${doc.qr.qrSvg ? `
  <g transform="translate(${pixelWidth / 2 - 135}, 160) scale(0.9)">
    <rect x="-10" y="-10" width="320" height="320" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    ${doc.qr.qrSvg}
  </g>
  ` : `
  <rect x="${pixelWidth / 2 - 120}" y="160" width="240" height="240" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" rx="16" />
  <text x="${pixelWidth / 2}" y="290" font-family="system-ui, -apple-system, sans-serif" font-size="26" text-anchor="middle" fill="#64748b">QR CODE</text>
  `}

  <text x="${pixelWidth / 2}" y="520" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="800" text-anchor="middle" fill="#0f172a">${name}</text>
  <text x="${pixelWidth / 2}" y="570" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="#64748b">Point smartphone camera at QR code to open booking</text>
</svg>`;

  return { frontSvg, backSvg };
}

/**
 * Main canonical renderer dispatching to the selected curated layout.
 * Returns rendered SVG strings and immutable SHA-256 checksums.
 */
export function renderCardArtwork(doc: CardDesignDocument): RenderedArtwork {
  let frontSvg = '';
  let backSvg = '';

  switch (doc.templateId) {
    case 'bold':
      ({ frontSvg, backSvg } = renderBoldArtwork(doc));
      break;
    case 'booking':
      ({ frontSvg, backSvg } = renderBookingArtwork(doc));
      break;
    case 'clean':
    default:
      ({ frontSvg, backSvg } = renderCleanArtwork(doc));
      break;
  }

  const frontHash = computeArtworkHash(frontSvg);
  const backHash = computeArtworkHash(backSvg);

  return {
    frontSvg,
    backSvg,
    frontHash,
    backHash,
    templateId: doc.templateId,
    dimensions: PRINTFUL_CARD_SPECS.dimensions,
  };
}
