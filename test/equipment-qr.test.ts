import { describe, it, expect } from 'vitest';
import {
  generateQrSvg,
  buildEquipmentStickerHtml,
  type EquipmentAsset,
} from '../src/lib/equipment-qr';

describe('Equipment QR & Asset Tagging', () => {
  it('generates a valid standalone SVG QR code', () => {
    const svg = generateQrSvg('https://letsgetquoted.com/portal/view/tok_123#equipment-456', 150);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 150 150"');
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('</svg>');
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
});
