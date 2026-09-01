import { describe, expect, it } from 'vitest';
import { toClientWarranties, type Warranty } from '@/lib/warranties';
import { googleReviewUrl, reviewRoutes } from '@/lib/review-routing';

const sampleWarranty = (over: Partial<Warranty> = {}): Warranty => ({
  id: 'war_101',
  jobId: 'job_202',
  clientId: 'cli_303',
  title: '10-Year Workmanship Warranty',
  covers: 'Roof shingles, underlayment and flashing',
  excludes: 'Storm damage, falling branches',
  startsOn: '2026-01-01',
  endsOn: '2036-01-01',
  documentPaths: ['acc_1/spec-sheet.pdf', 'acc_1/certificate.pdf'],
  maintenanceNotes: 'Annual gutter cleaning and inspection',
  serviceIntervalMonths: 12,
  nextServiceDue: '2027-01-01',
  lastServiceOn: null,
  serviceRemindedAt: null,
  ...over,
});

describe('client dashboard enhancements', () => {
  describe('warranty document downloads', () => {
    it('attaches signed document URLs to client warranties when available', () => {
      const docUrlsMap = {
        war_101: [
          { name: 'Warranty Document.pdf', url: 'https://storage.example.com/signed/spec-sheet.pdf' },
          { name: 'Warranty Certificate.pdf', url: 'https://storage.example.com/signed/certificate.pdf' },
        ],
      };

      const [clientWarranty] = toClientWarranties([sampleWarranty()], '2026-08-31', docUrlsMap);
      expect(clientWarranty.documentCount).toBe(2);
      expect(clientWarranty.documentUrls).toHaveLength(2);
      expect(clientWarranty.documentUrls?.[0].url).toBe('https://storage.example.com/signed/spec-sheet.pdf');
    });

    it('gracefully handles missing or empty document URLs', () => {
      const [clientWarranty] = toClientWarranties([sampleWarranty()], '2026-08-31', {});
      expect(clientWarranty.documentUrls).toEqual([]);
      expect(clientWarranty.documentCount).toBe(2);
    });
  });

  describe('google review deep link and FTC anti-gating compliance', () => {
    it('constructs canonical Google writereview URL when placeId is available', () => {
      const url = googleReviewUrl({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        listingUrl: 'https://maps.google.com/?cid=123',
      });
      expect(url).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('falls back to listingUrl when placeId is absent', () => {
      const url = googleReviewUrl({
        placeId: null,
        listingUrl: 'https://maps.google.com/?cid=123456789',
      });
      expect(url).toBe('https://maps.google.com/?cid=123456789');
    });

    it('returns null when neither placeId nor listingUrl is configured', () => {
      const url = googleReviewUrl({ placeId: null, listingUrl: null });
      expect(url).toBeNull();
    });

    it('maintains non-gated review routes with privateFeedback always true', () => {
      const routes = reviewRoutes({ googleUrl: 'https://search.google.com/local/writereview?placeid=ChIJ123' });
      expect(routes.googleUrl).toBe('https://search.google.com/local/writereview?placeid=ChIJ123');
      expect(routes.privateFeedback).toBe(true);
    });
  });
});
