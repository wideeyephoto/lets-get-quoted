import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { generateQrSvg, escapeHtml } from '@/lib/equipment-qr';
import {
  buildCampaignUrl,
  buildCampaignQrSvg,
  isValidHttpUrl,
  slugifyCampaign,
  aggregateCampaignAttribution,
  type TargetCampaignInfo,
} from '@/lib/campaign-roi';
import type { MarketingAttributionLead } from '@/lib/campaign-roi';

describe('Marketing Tracking Links & QR Engine', () => {
  describe('QR Generation & Scanner Standards (ISO/IEC 18004)', () => {
    it('generates a scannable SVG with minimum 4-module quiet zone and title', () => {
      const url = 'https://letsgetquoted.com/r/yrd26';
      const svg = generateQrSvg(url, 200, { title: 'Spring Signs QR' });

      expect(svg).toContain('<svg');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 200 200"');
      expect(svg).toContain('<title>Spring Signs QR</title>');
      expect(svg).toContain('<rect width="200" height="200" fill="#ffffff"/>');
      expect(svg).toContain('shape-rendering="crispEdges"');
    });

    it('decodes back to the exact URL input using jsQR', () => {
      const targetUrls = [
        'https://letsgetquoted.com/r/yrd26',
        'https://evergreenroofing.com/estimate?utm_source=yard_sign&utm_medium=print_qr&utm_campaign=spring_yard_signs_2026',
        'https://app.letsgetquoted.com/portal/view/tok_999#equipment-777',
      ];

      for (const targetUrl of targetUrls) {
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
      }
    });

    it('buildCampaignQrSvg passes through title and renders valid SVG', () => {
      const svg = buildCampaignQrSvg('https://example.com/r/trk01', 180, 'Fleet Decal');
      expect(svg).toContain('<title>Fleet Decal</title>');
      expect(svg).toContain('viewBox="0 0 180 180"');
    });
  });

  describe('Campaign URL Validation & Slug Normalization', () => {
    it('validates legitimate HTTP and HTTPS URLs', () => {
      expect(isValidHttpUrl('https://example.com/estimate')).toBe(true);
      expect(isValidHttpUrl('http://subdomain.example.co.uk/quote?offer=spring')).toBe(true);
      expect(isValidHttpUrl('example.com/estimate')).toBe(true);
    });

    it('rejects malformed and dangerous protocol URLs', () => {
      expect(isValidHttpUrl('')).toBe(false);
      expect(isValidHttpUrl('   ')).toBe(false);
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidHttpUrl('not a url at all')).toBe(false);
    });

    it('normalizes human campaign names into clean slugs', () => {
      expect(slugifyCampaign('Spring Yard Signs 2026')).toBe('spring_yard_signs_2026');
      expect(slugifyCampaign('  TRUCK-WRAP / North Zone!  ')).toBe('truck-wrap_north_zone');
      expect(slugifyCampaign('Fall Promo & Discount')).toBe('fall_promo_discount');
      expect(slugifyCampaign('already_clean_slug')).toBe('already_clean_slug');
    });

    it('buildCampaignUrl builds correctly encoded URL with normalized slug', () => {
      const url = buildCampaignUrl({
        baseUrl: 'https://apexroofing.com/estimate',
        source: 'yard_sign',
        medium: 'print_qr',
        campaign: 'Spring Yard Signs 2026',
        content: 'lawn_18x24',
      });

      expect(url).toContain('https://apexroofing.com/estimate?');
      expect(url).toContain('utm_source=yard_sign');
      expect(url).toContain('utm_medium=print_qr');
      expect(url).toContain('utm_campaign=spring_yard_signs_2026');
      expect(url).toContain('utm_content=lawn_18x24');
    });

    it('buildCampaignUrl returns empty string for invalid input without leaking raw garbage', () => {
      expect(buildCampaignUrl({ baseUrl: 'javascript:alert(1)' })).toBe('');
      expect(buildCampaignUrl({ baseUrl: '' })).toBe('');
    });
  });

  describe('Stored XSS Protection in Print Sign Templates', () => {
    it('escapes dangerous HTML characters in business name, URL, and text', () => {
      const unsafe = '<script>alert("XSS")</script>&"\'<>';
      const safe = escapeHtml(unsafe);

      expect(safe).not.toContain('<script>');
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('&amp;');
      expect(safe).toContain('&quot;');
      expect(safe).toContain('&#039;');
      expect(safe).toContain('&gt;');
    });
  });

  describe('Closed-Loop Attribution Aggregation', () => {
    const campaigns: TargetCampaignInfo[] = [
      {
        id: 'camp-1',
        name: 'Spring Yard Signs 2026',
        campaign: 'spring_yard_signs_2026',
        shortCode: 'yrd26',
        scanCount: 42,
        adSpend: 200,
      },
      {
        id: 'camp-2',
        name: 'Truck Fleet Wrap',
        campaign: 'truck_wrap_fleet',
        shortCode: 'trk99',
        scanCount: 15,
        adSpend: 500,
      },
    ];

    const leads: MarketingAttributionLead[] = [
      {
        id: 'lead-1',
        status: 'won',
        converted_job: 'job-1',
        created_at: '2026-08-20T10:00:00Z',
        triage: {
          attribution: {
            source: 'yard_sign',
            medium: 'print_qr',
            campaign: 'Spring Yard Signs 2026',
          },
        },
      },
      {
        id: 'lead-2',
        status: 'contacted',
        created_at: '2026-08-21T10:00:00Z',
        triage: {
          attribution: {
            campaign: 'spring_yard_signs_2026',
          },
        },
      },
      {
        id: 'lead-3',
        status: 'won',
        converted_job: 'job-2',
        created_at: '2026-08-22T10:00:00Z',
        triage: {
          attribution: {
            landingPage: 'https://letsgetquoted.com/r/trk99',
          },
        },
      },
    ];

    const jobLookup = {
      'job-1': { total: 4200, isWon: true },
      'job-2': { total: 8500, isWon: true },
    };

    it('accurately calculates visits, leads, won jobs, revenue, and ROAS per campaign', () => {
      const stats = aggregateCampaignAttribution(campaigns, leads, jobLookup);

      expect(stats['camp-1'].visits).toBe(42);
      expect(stats['camp-1'].leads).toBe(2);
      expect(stats['camp-1'].wonJobs).toBe(1);
      expect(stats['camp-1'].revenue).toBe(4200);
      expect(stats['camp-1'].adSpend).toBe(200);
      expect(stats['camp-1'].roas).toBe(21.0); // 4200 / 200 = 21.0x

      expect(stats['camp-2'].visits).toBe(15);
      expect(stats['camp-2'].leads).toBe(1);
      expect(stats['camp-2'].wonJobs).toBe(1);
      expect(stats['camp-2'].revenue).toBe(8500);
      expect(stats['camp-2'].adSpend).toBe(500);
      expect(stats['camp-2'].roas).toBe(17.0); // 8500 / 500 = 17.0x
    });
  });
});
