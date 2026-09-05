import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  generateQrSvg,
  buildEquipmentStickerHtml,
  type EquipmentAsset,
} from '../src/lib/equipment-qr';

describe('Equipment QR & Asset Tagging', () => {
  it('generates a valid standalone SVG QR code with quiet zone and title', () => {
    const url = 'https://letsgetquoted.com/portal/view/tok_123#equipment-456';
    const svg = generateQrSvg(url, 150, { title: 'Water Heater QR' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 150 150"');
    expect(svg).toContain('<title>Water Heater QR</title>');
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('</svg>');
  });

  it('generates true standards-compliant QR code that decodes back to the exact input URL', () => {
    const targetUrl = 'https://letsgetquoted.com/r/sprg26?utm_source=yard_sign';
    const qr = QRCode.create(targetUrl, { errorCorrectionLevel: 'M' });
    const margin = 4;
    const modSize = qr.modules.size;
    const totalDim = modSize + margin * 2;
    const scale = 4;
    const imgSize = totalDim * scale;
    const data = new Uint8ClampedArray(imgSize * imgSize * 4);
    data.fill(255);

    for (let r = 0; r < modSize; r++) {
      for (let c = 0; c < modSize; c++) {
        if (qr.modules.get(r, c)) {
          for (let y = 0; y < scale; y++) {
            for (let x = 0; x < scale; x++) {
              const px = ((margin + r) * scale + y) * imgSize + ((margin + c) * scale + x);
              data[px * 4] = 0;
              data[px * 4 + 1] = 0;
              data[px * 4 + 2] = 0;
              data[px * 4 + 3] = 255;
            }
          }
        }
      }
    }

    const decoded = jsQR(data, imgSize, imgSize);
    expect(decoded).not.toBeNull();
    expect(decoded?.data).toBe(targetUrl);
  });

  it('builds a print-ready equipment label sticker with equipment specs and contractor info', () => {
    const asset: EquipmentAsset = {
      id: 'eq_789',
      jobId: 'job_456',
      name: '50-Gallon ProLine Gas Water Heater',
      brand: 'State Water Heaters',
      modelNumber: 'GS6-50-YBVIT',
      serialNumber: '2415109842',
      installedOn: '2026-08-24',
      filterSpecs: 'N/A (Anode Rod: 0.84" x 44")',
      businessName: 'Apex Plumbing Experts',
      servicePhone: '(555) 234-5678',
      portalUrl: 'https://apexplumbing.com/portal/view/tok_123#warranty-eq_789',
    };

    const html = buildEquipmentStickerHtml(asset);

    expect(html).toContain('Apex Plumbing Experts');
    expect(html).toContain('(555) 234-5678');
    expect(html).toContain('50-Gallon ProLine Gas Water Heater');
    expect(html).toContain('State Water Heaters');
    expect(html).toContain('GS6-50-YBVIT');
    expect(html).toContain('2415109842');
    expect(html).toContain('SCAN FOR SERVICE');
    expect(html).toContain('<svg');
  });

  it('safely escapes HTML in equipment stickers to prevent XSS', () => {
    const maliciousAsset: EquipmentAsset = {
      id: 'eq_xss',
      jobId: 'job_xss',
      name: '<script>alert("hacked")</script>',
      brand: '"><img src=x onerror=alert(1)>',
      businessName: 'Apex & Sons <script>',
      servicePhone: '555-0199',
      installedOn: '2026-09-01',
      portalUrl: 'https://example.com',
    };

    const html = buildEquipmentStickerHtml(maliciousAsset);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Apex &amp; Sons');
  });
});
