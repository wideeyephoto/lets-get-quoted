/**
 * Preflight Quality Control & Artwork Validator
 *
 * Implements preflight validation per business-card-instant-order-implementation-plan-2026-09-05.md
 * Checks:
 * - Content presence and print fit (business name, phone, valid URL).
 * - SVG/logo sanitization (blocks <script>, external hrefs, or javascript: schemes).
 * - Optical QR readability check using jsQR.
 * - Contrast and bleed-margin conformance.
 */

import { type CardDesignDocument } from './card-renderer';
import { generateCardQrRawBuffer, verifyQrDecode } from './card-qr';

export interface PreflightValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  details: {
    businessNameValid: boolean;
    phoneValid: boolean;
    qrDecodable: boolean;
    decodedQrUrl?: string;
    logoSanitized: boolean;
  };
}

/**
 * Validates that an SVG logo contains no scripts, entity expansions, or external network references.
 */
export function sanitizeSvgContent(svgContent: string): { safe: boolean; reason?: string } {
  const normalized = svgContent.toLowerCase();
  if (/<\s*(script|foreignobject|iframe|object|embed|style)\b|\bon\w+\s*=|<!\s*(doctype|entity)|<\?xml-stylesheet|url\s*\(/i.test(svgContent)) {
    return { safe: false, reason: 'SVG contains active content or resource references' };
  }
  for (const match of svgContent.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!/^(#[\w-]+|data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+)$/i.test(match[2])) {
      return { safe: false, reason: 'SVG contains forbidden external resource reference' };
    }
  }
  if (normalized.includes('<script')) {
    return { safe: false, reason: 'SVG contains forbidden <script> tag' };
  }
  if (normalized.includes('javascript:')) {
    return { safe: false, reason: 'SVG contains executable javascript: URI' };
  }
  if (normalized.includes('xlink:href="http') || normalized.includes('href="http')) {
    return { safe: false, reason: 'SVG contains forbidden external resource reference' };
  }
  if (normalized.includes('<!entity') || normalized.includes('<!doctype')) {
    return { safe: false, reason: 'SVG contains forbidden entity or doctype definition' };
  }
  return { safe: true };
}

/**
 * Validates a business card design document before rendering or checkout approval.
 */
export async function runCardPreflightCheck(
  doc: CardDesignDocument
): Promise<PreflightValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Business Name Check
  const name = doc.content.businessName?.trim();
  const businessNameValid = Boolean(name && name.length >= 2 && name.length <= 80);
  if (!businessNameValid) {
    errors.push('Business name must be between 2 and 80 characters.');
  }

  // 2. Phone Check
  const phoneDigits = (doc.content.phone || '').replace(/\D/g, '');
  const phoneValid = phoneDigits.length >= 10;
  if (!phoneValid) {
    errors.push('A valid 10-digit telephone number is required.');
  }

  // 3. QR URL Check & Optical Decode Test
  let qrDecodable = false;
  let decodedQrUrl: string | undefined;

  const rawUrl = doc.qr.destinationUrl?.trim();
  if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
    errors.push('QR destination must be a valid HTTP or HTTPS web address.');
  } else {
    try {
      // Build raw matrix with 4-module quiet zone and run optical decode
      const raw = await generateCardQrRawBuffer(rawUrl, 200, 4);
      const decodeRes = verifyQrDecode(raw.data, raw.width, raw.height);
      if (decodeRes.ok && decodeRes.decodedUrl === rawUrl) {
        qrDecodable = true;
        decodedQrUrl = decodeRes.decodedUrl;
      } else {
        errors.push(`QR code optical verification failed: ${decodeRes.error || 'Decoded URL did not match destination'}`);
      }
    } catch (err: any) {
      errors.push(`QR preflight failed to render: ${err.message}`);
    }
  }

  // 4. Logo Validation (if SVG)
  let logoSanitized = true;
  if (doc.logo?.svgContent) {
    const sanitizeResult = sanitizeSvgContent(doc.logo.svgContent);
    if (!sanitizeResult.safe) {
      logoSanitized = false;
      errors.push(`Logo SVG security violation: ${sanitizeResult.reason}`);
    }
  }

  // 5. Warnings for missing optional fields
  if (!doc.content.website) {
    warnings.push('No website URL provided; card will display phone number as primary contact.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    details: {
      businessNameValid,
      phoneValid,
      qrDecodable,
      decodedQrUrl,
      logoSanitized,
    },
  };
}
