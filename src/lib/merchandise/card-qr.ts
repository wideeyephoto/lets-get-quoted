/**
 * Real URL-Encoding QR Generator & Preflight Verifier
 *
 * Implements Section 8 of business-card-instant-order-implementation-plan-2026-09-05.md
 * Strictly uses the standard 'qrcode' engine with a full 4-module quiet zone (DENSO standard)
 * and verifies readability with 'jsqr'.
 */

import QRCode from 'qrcode';
import jsQR from 'jsqr';

export interface QrRenderOptions {
  sizePx?: number;
  margin?: number; // Minimum 4 modules per DENSO standard
  darkColor?: string;
  lightColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generates an SVG QR code string with standard 4-module quiet zone.
 */
export async function generateCardQrSvg(
  url: string,
  options: QrRenderOptions = {}
): Promise<string> {
  const margin = options.margin ?? 4;
  const sizePx = options.sizePx ?? 300;
  const darkColor = options.darkColor ?? '#000000';
  const lightColor = options.lightColor ?? '#ffffff';
  const errorCorrectionLevel = options.errorCorrectionLevel ?? 'M';

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('QR URL must be a non-empty string');
  }

  return QRCode.toString(url.trim(), {
    type: 'svg',
    width: sizePx,
    margin,
    color: {
      dark: darkColor,
      light: lightColor,
    },
    errorCorrectionLevel,
  });
}

/**
 * Generates a PNG Data URL of the QR code with 4-module quiet zone.
 */
export async function generateCardQrDataUrl(
  url: string,
  options: QrRenderOptions = {}
): Promise<string> {
  const margin = options.margin ?? 4;
  const sizePx = options.sizePx ?? 400;
  const darkColor = options.darkColor ?? '#000000';
  const lightColor = options.lightColor ?? '#ffffff';
  const errorCorrectionLevel = options.errorCorrectionLevel ?? 'M';

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('QR URL must be a non-empty string');
  }

  return QRCode.toDataURL(url.trim(), {
    width: sizePx,
    margin,
    color: {
      dark: darkColor,
      light: lightColor,
    },
    errorCorrectionLevel,
  });
}

/**
 * Generates raw RGBA image buffer for testing and preflight verification.
 */
export async function generateCardQrRawBuffer(
  url: string,
  sizePx: number = 200,
  margin: number = 4
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  // Use QRCode.create to build matrix
  const qr = QRCode.create(url.trim(), {
    errorCorrectionLevel: 'M',
  });

  const moduleCount = qr.modules.size;
  const scale = Math.floor(sizePx / moduleCount);
  const actualSize = moduleCount * scale;

  const buffer = new Uint8ClampedArray(actualSize * actualSize * 4);

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      const isDark = qr.modules.get(r, c);
      const colorVal = isDark ? 0 : 255;

      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = c * scale + x;
          const py = r * scale + y;
          const idx = (py * actualSize + px) * 4;
          buffer[idx] = colorVal; // R
          buffer[idx + 1] = colorVal; // G
          buffer[idx + 2] = colorVal; // B
          buffer[idx + 3] = 255; // A
        }
      }
    }
  }

  return {
    data: buffer,
    width: actualSize,
    height: actualSize,
  };
}

/**
 * Independent decode verification using jsQR to confirm the QR code
 * can be reliably scanned by cameras.
 */
export function verifyQrDecode(
  rgbaBuffer: Uint8ClampedArray,
  width: number,
  height: number
): { ok: boolean; decodedUrl?: string; error?: string } {
  try {
    const code = jsQR(rgbaBuffer, width, height, {
      inversionAttempts: 'dontInvert',
    });

    if (!code || !code.data) {
      return { ok: false, error: 'QR symbol could not be decoded by optical detector' };
    }

    return { ok: true, decodedUrl: code.data };
  } catch (err: any) {
    return { ok: false, error: `Decoding exception: ${err.message}` };
  }
}
