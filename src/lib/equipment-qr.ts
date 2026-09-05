import QRCode from 'qrcode';

/**
 * Equipment & QR Code Asset Tracking.
 *
 * Provides physical equipment tagging and QR label generation for installed units
 * (e.g. Furnaces, Heat Pumps, Water Heaters, Electrical Panels, Water Filtration).
 *
 * When technicians affix a physical QR sticker to a unit, scanning with any phone
 * camera opens the unit's exact maintenance records, filter specs, and warranty cover.
 */

export type EquipmentAsset = {
  id: string;
  jobId: string;
  warrantyId?: string | null;
  name: string;
  brand: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  installedOn: string;
  filterSpecs?: string | null;
  location?: string | null;
  businessName: string;
  servicePhone: string;
  portalUrl: string;
};

export type QrSvgOptions = {
  title?: string;
  margin?: number;
  ecLevel?: 'L' | 'M' | 'Q' | 'H';
};

/**
 * Safely escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates an SVG string representation of a true, standards-compliant QR Code.
 * Uses ISO/IEC 18004 QR encoding with standard error correction (Level M default)
 * and an integrated white quiet zone (>=4 modules) for instant camera scannability.
 */
export function generateQrSvg(
  text: string,
  size = 180,
  options: QrSvgOptions = {}
): string {
  const margin = Math.max(0, options.margin ?? 4);
  const qr = QRCode.create(text, {
    errorCorrectionLevel: options.ecLevel ?? 'M',
  });

  const dimension = qr.modules.size;
  const totalDimension = dimension + margin * 2;
  const cellSize = size / totalDimension;

  let rects = '';
  for (let r = 0; r < dimension; r++) {
    for (let c = 0; c < dimension; c++) {
      if (qr.modules.get(r, c)) {
        const x = ((c + margin) * cellSize).toFixed(2);
        const y = ((r + margin) * cellSize).toFixed(2);
        const w = (cellSize + 0.05).toFixed(2);
        const h = (cellSize + 0.05).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0f172a" />`;
      }
    }
  }

  const titleText = options.title ? escapeHtml(options.title) : 'Scan QR Code';
  const titleTag = `<title>${titleText}</title>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">${titleTag}<rect width="${size}" height="${size}" fill="#ffffff"/>${rects}</svg>`;
}

/**
 * Builds printable HTML snippet for a physical 3x2" equipment sticker label.
 */
export function buildEquipmentStickerHtml(asset: EquipmentAsset): string {
  const qrSvg = generateQrSvg(asset.portalUrl, 140, { title: `${asset.name} QR Code` });

  return `
<div class="equipment-sticker" style="width: 320px; padding: 14px; border: 2px solid #0f172a; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; color: #0f172a; box-sizing: border-box;">
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
    <div>
      <h3 style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800;">${escapeHtml(asset.businessName)}</h3>
      <p style="margin: 2px 0 0; font-size: 12px; color: #475569; font-weight: 600;">Service &amp; Warranty Care</p>
    </div>
    <div style="font-size: 12px; font-weight: 700; color: #0f172a; text-align: right;">
      ${escapeHtml(asset.servicePhone)}
    </div>
  </div>

  <div style="display: flex; gap: 12px; align-items: center;">
    <div style="flex-shrink: 0; border: 1px solid #e2e8f0; padding: 4px; border-radius: 4px; background: #fff;">
      ${qrSvg}
      <p style="margin: 4px 0 0; font-size: 9px; text-align: center; color: #64748b; font-weight: 600;">SCAN FOR SERVICE</p>
    </div>

    <div style="flex: 1; font-size: 11px; line-height: 1.35;">
      <p style="margin: 0 0 4px; font-weight: 700; font-size: 12px;">${escapeHtml(asset.name)}</p>
      ${asset.brand ? `<p style="margin: 0 0 2px;"><strong>Brand:</strong> ${escapeHtml(asset.brand)}</p>` : ''}
      ${asset.modelNumber ? `<p style="margin: 0 0 2px;"><strong>Model:</strong> ${escapeHtml(asset.modelNumber)}</p>` : ''}
      ${asset.serialNumber ? `<p style="margin: 0 0 2px;"><strong>Serial:</strong> ${escapeHtml(asset.serialNumber)}</p>` : ''}
      ${asset.filterSpecs ? `<p style="margin: 0 0 2px; color: #0369a1;"><strong>Filter:</strong> ${escapeHtml(asset.filterSpecs)}</p>` : ''}
      <p style="margin: 0; color: #64748b; font-size: 10px;">Installed ${escapeHtml(asset.installedOn)}</p>
    </div>
  </div>
</div>
`.trim();
}
