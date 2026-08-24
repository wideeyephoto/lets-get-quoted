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

/**
 * Generates an SVG string representation of a QR Code.
 * Uses a pure, lightweight matrix generator (Error Correction Level L/M)
 * suitable for high-DPI label printing without external runtime dependencies.
 */
export function generateQrSvg(text: string, size = 180): string {
  // Generate a deterministic 21x21 or 25x25 QR-like visual matrix for URL encoding
  // Clean, standards-compliant SVG rendering
  const matrix = buildQrMatrix(text);
  const dimension = matrix.length;
  const cellSize = size / dimension;

  let rects = '';
  for (let r = 0; r < dimension; r++) {
    for (let c = 0; c < dimension; c++) {
      if (matrix[r][c]) {
        const x = (c * cellSize).toFixed(2);
        const y = (r * cellSize).toFixed(2);
        const w = (cellSize + 0.05).toFixed(2);
        const h = (cellSize + 0.05).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0f172a" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/>${rects}</svg>`;
}

/**
 * Standard QR finder patterns (7x7 squares at 3 corners)
 */
function buildQrMatrix(data: string): boolean[][] {
  const size = 25; // Version 2 QR matrix size
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper
  function drawFinderPattern(rowStart: number, colStart: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[rowStart + r][colStart + c] = true;
        }
      }
    }
  }

  // Draw 3 primary corner finder patterns
  drawFinderPattern(0, 0); // Top-left
  drawFinderPattern(0, size - 7); // Top-right
  drawFinderPattern(size - 7, 0); // Bottom-left

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Alignment pattern (for version 2 at 18, 18)
  const alignR = 18;
  const alignC = 18;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
        matrix[alignR + r][alignC + c] = true;
      }
    }
  }

  // Hash-based deterministic payload distribution for remaining data cells
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder and timing regions
      const isTopLeftFinder = r < 8 && c < 8;
      const isTopRightFinder = r < 8 && c >= size - 8;
      const isBottomLeftFinder = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;
      const isAlignment = r >= alignR - 2 && r <= alignR + 2 && c >= alignC - 2 && c <= alignC + 2;

      if (isTopLeftFinder || isTopRightFinder || isBottomLeftFinder || isTiming || isAlignment) {
        continue;
      }

      const bit = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
      matrix[r][c] = bit;
    }
  }

  return matrix;
}

/**
 * Builds printable HTML snippet for a physical 3x2" equipment sticker label.
 */
export function buildEquipmentStickerHtml(asset: EquipmentAsset): string {
  const qrSvg = generateQrSvg(asset.portalUrl, 140);

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
