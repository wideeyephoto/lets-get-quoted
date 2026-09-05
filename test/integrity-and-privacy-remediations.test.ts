import { describe, it, expect } from 'vitest';
import { generateQRCodeMatrix, renderQRCodeSvg } from '../src/lib/qrcode';
import {
  generateAdjusterLetterDraft,
  detectScopeDiscrepancies,
  buildSupplementAnalysis,
} from '../src/lib/insurance-claims';
import {
  SAMPLE_ROOM_SCANS,
  parseCustomScanJson,
  formatSpatialTakeoffReport,
  calculateRoomSummary,
} from '../src/lib/property-intel/room-spatial-intel';

describe('Integrity & Privacy Remediations', () => {
  describe('Client-Side QR Code Generator (Zero-Leak)', () => {
    it('generates a valid QR matrix for payment URLs without external network calls', () => {
      const url = 'https://app.letsgetquoted.com/pay/550e8400-e29b-41d4-a716-446655440000';
      const matrix = generateQRCodeMatrix(url);
      expect(matrix.size).toBeGreaterThanOrEqual(21);
      expect(matrix.modules.length).toBe(matrix.size);
      expect(matrix.modules[0].length).toBe(matrix.size);

      // Verify finder patterns exist at top-left
      expect(matrix.modules[0][0]).toBe(true);
      expect(matrix.modules[0][6]).toBe(true);
      expect(matrix.modules[6][0]).toBe(true);
    });

    it('renders clean SVG markup with correct viewbox and dimensions', () => {
      const url = 'https://letsgetquoted.com/pay/test';
      const svg = renderQRCodeSvg(url, 180);
      expect(svg).toContain('<svg');
      expect(svg).toContain('width="180"');
      expect(svg).toContain('height="180"');
      expect(svg).toContain('viewBox="0 0');
      expect(svg).toContain('<path d="');
      expect(svg).not.toContain('api.qrserver.com');
    });
  });

  describe('Insurance Supplement Studio Honesty & Disclaimers', () => {
    it('does not invent omitted items or supplements when scope is empty', () => {
      const discrepancies = detectScopeDiscrepancies('', 'roofers');
      expect(discrepancies).toEqual([]);

      const analysis = buildSupplementAnalysis('', 'roofers');
      expect(analysis.discrepancies).toEqual([]);
      expect(analysis.totalEstimatedSupplement).toBe(0);
      expect(analysis.justificationDraft).toContain('No scope text provided');
    });

    it('generates demand letters with scope review language and statutory disclaimers', () => {
      const letter = generateAdjusterLetterDraft({
        tradeSlug: 'roofing',
        claimNumber: 'CLM-9821',
        policyholderName: 'Jane Doe',
        propertyAddress: '742 Evergreen Terrace',
        adjusterName: 'Mark Smith',
        carrierName: 'Allstate',
        discrepancies: [
          {
            id: 'd1',
            item: 'Starter Shingle Strip',
            category: 'code_compliance',
            estimatedCost: 450,
            codeCitation: 'IRC R905.2.8.5',
            reason: 'Manufacturer requires dedicated starter course for wind warranty.',
            selected: true,
          },
        ],
        initialRcv: 8500,
      });

      expect(letter).toContain('Jane Doe');
      expect(letter).toContain('742 Evergreen Terrace');
      expect(letter).toContain('CLM-9821');
      expect(letter).toContain('Allstate');
      // Must use scope review language rather than claiming unverified physical inspection
      expect(letter).toContain('We have completed a preliminary contractor desk review');
      // Must contain statutory disclaimer
      expect(letter).toContain('Notice & Contractor Scope Disclaimer');
      expect(letter).toContain('does not constitute legal advice, insurance adjusting');
    });
  });

  describe('LiDAR & 3D Spatial Intelligence Honesty & Precision Boundaries', () => {
    it('marks all built-in preset scans with isSample = true and clear demo descriptions', () => {
      for (const scan of SAMPLE_ROOM_SCANS) {
        expect(scan.isSample).toBe(true);
        expect(scan.scannedAt).toBe('Sample Reference Model');
        expect(scan.device).toContain('Sample Demo CAD Model');
      }
    });

    it('marks uploaded normalized JSON scans with isSample = false', () => {
      const rawJson = JSON.stringify({
        title: 'Job Site Living Room Scan',
        floorShape: 'rectangle',
        walls: [
          { lengthInches: 180, heightInches: 108 },
          { lengthInches: 144, heightInches: 108 },
          { lengthInches: 180, heightInches: 108 },
          { lengthInches: 144, heightInches: 108 },
        ],
        device: 'iPhone 15 Pro LiDAR · Apple RoomPlan',
      });

      const parsed = parseCustomScanJson(rawJson);
      expect(parsed.isSample).toBe(false);
      expect(parsed.scannedAt).toBe('Capture time not provided');
      expect(parsed.device).toBe('iPhone 15 Pro LiDAR · Apple RoomPlan');
    });

    it('includes clear demo disclaimer in takeoff reports generated from sample models', () => {
      const sampleScan = SAMPLE_ROOM_SCANS[0];
      const summary = calculateRoomSummary(sampleScan);
      const report = formatSpatialTakeoffReport(sampleScan, summary);

      expect(report).toContain('[SAMPLE DEMO]');
      expect(report).toContain('Generated from a sample CAD template for interactive demonstration');
      expect(report).toContain('All dimensions must be physically verified on site');
    });
  });
});
