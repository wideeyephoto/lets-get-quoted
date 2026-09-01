import { describe, expect, it } from 'vitest';
import {
  computeGbpGrowthScore,
  extractPlaceId,
  generateDirectGoogleReviewLink,
  generateGbpPost,
  generateReviewReply,
  getGoogleBusinessProfileUrls,
} from '@/lib/google-business-growth';

describe('google-business-growth utilities', () => {
  describe('extractPlaceId', () => {
    it('accepts raw ChIJ place IDs directly', () => {
      expect(extractPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(extractPlaceId('  ChIJ2eUgeAK6j4ARbn5u_wAGqWA  ')).toBe('ChIJ2eUgeAK6j4ARbn5u_wAGqWA');
    });

    it('extracts placeid from query parameters in Google URLs', () => {
      expect(
        extractPlaceId('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4')
      ).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');

      expect(
        extractPlaceId('https://maps.google.com/?place_id=ChIJ2eUgeAK6j4ARbn5u_wAGqWA&authuser=0')
      ).toBe('ChIJ2eUgeAK6j4ARbn5u_wAGqWA');
    });

    it('extracts place ID from /place/ URL path segments', () => {
      expect(
        extractPlaceId('https://www.google.com/maps/place/ChIJs_3k0nZu5kcR2k8ZqO2B3f8')
      ).toBe('ChIJs_3k0nZu5kcR2k8ZqO2B3f8');
    });

    it('returns null on invalid inputs or non-place links', () => {
      expect(extractPlaceId('')).toBeNull();
      expect(extractPlaceId('    ')).toBeNull();
      expect(extractPlaceId('https://example.com')).toBeNull();
    });
  });

  describe('generateDirectGoogleReviewLink', () => {
    it('builds canonical write-review deep link when Place ID is given', () => {
      const link = generateDirectGoogleReviewLink('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(link).toBe('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('falls back to listing URL when Place ID is missing', () => {
      const link = generateDirectGoogleReviewLink(null, 'https://maps.google.com/?cid=123');
      expect(link).toBe('https://maps.google.com/?cid=123');
    });

    it('returns null when neither is provided', () => {
      expect(generateDirectGoogleReviewLink(null, null)).toBeNull();
    });
  });

  describe('getGoogleBusinessProfileUrls', () => {
    it('returns correct Google Manager and search URLs', () => {
      const urls = getGoogleBusinessProfileUrls('Apex Roofing Co', 'ChIJ123', 'Austin TX');
      expect(urls.managerUrl).toBe('https://business.google.com/');
      expect(urls.googleSearchManageUrl).toContain('Apex%20Roofing%20Co%20Austin%20TX');
      expect(urls.directReviewUrl).toBe('https://search.google.com/local/writereview?placeid=ChIJ123');
    });
  });

  describe('generateGbpPost', () => {
    it('generates project showcase post with hashtags and CTA', () => {
      const post = generateGbpPost({
        category: 'project_showcase',
        businessName: 'Summit Plumbing',
        trade: 'Plumbing',
        city: 'Denver',
        phone: '(303) 555-0199',
        websiteUrl: 'https://summitplumbing.com',
        projectDetail: 'Complete tankless water heater installation and copper repipe.',
      });

      expect(post.category).toBe('project_showcase');
      expect(post.headline).toContain('Denver');
      expect(post.body).toContain('Summit Plumbing');
      expect(post.body).toContain('Complete tankless water heater');
      expect(post.suggestedHashtags).toContain('#Plumbing');
      expect(post.suggestedHashtags).toContain('#Denver');
      expect(post.ctaType).toBe('BOOK');
      expect(post.fullPostText).toContain('(303) 555-0199');
    });

    it('generates seasonal offer post', () => {
      const post = generateGbpPost({
        category: 'seasonal_offer',
        businessName: 'TrueCoat Painting',
        trade: 'Painting',
        city: 'Seattle',
        offerDetail: '15% off exterior paint jobs booked before spring.',
      });

      expect(post.category).toBe('seasonal_offer');
      expect(post.headline).toContain('15% off exterior paint jobs');
      expect(post.ctaType).toBe('GET_OFFER');
      expect(post.suggestedHashtags).toContain('#SpecialOffer');
    });

    it('generates maintenance tip post', () => {
      const post = generateGbpPost({
        category: 'maintenance_tip',
        businessName: 'Comfort Air HVAC',
        trade: 'HVAC',
        city: 'Phoenix',
        tipTopic: 'Check air filters monthly during peak summer to avoid compressor burnout.',
      });

      expect(post.category).toBe('maintenance_tip');
      expect(post.body).toContain('Check air filters monthly');
      expect(post.ctaType).toBe('LEARN_MORE');
    });

    it('generates review celebration post', () => {
      const post = generateGbpPost({
        category: 'review_celebration',
        businessName: 'Elite Roofing',
        trade: 'Roofing',
        city: 'Dallas',
        reviewerName: 'Marcus Miller',
        reviewQuote: 'Replaced our roof in one day after hail damage. Seamless process!',
      });

      expect(post.category).toBe('review_celebration');
      expect(post.body).toContain('Marcus Miller');
      expect(post.body).toContain('Replaced our roof in one day');
      expect(post.suggestedHashtags).toContain('#HappyCustomer');
    });
  });

  describe('generateReviewReply', () => {
    it('generates SEO-boosted 5-star review reply with city and service keywords', () => {
      const reply = generateReviewReply({
        rating: 5,
        reviewerName: 'Emily Clark',
        businessName: 'Prime Electrical',
        serviceCompleted: 'EV charger installation',
        city: 'Orlando',
        tone: 'seo_boost',
      });

      expect(reply).toContain('Emily');
      expect(reply).toContain('Prime Electrical');
      expect(reply).toContain('EV charger installation');
      expect(reply).toContain('Orlando');
      expect(reply).toContain('5-star review');
    });

    it('generates professional 4-star review reply', () => {
      const reply = generateReviewReply({
        rating: 4,
        reviewerName: 'David Lee',
        businessName: 'Prime Electrical',
        serviceCompleted: 'panel upgrade',
      });

      expect(reply).toContain('David');
      expect(reply).toContain('panel upgrade');
      expect(reply).toContain('5-star experience');
    });

    it('generates FTC/Google compliant de-escalation reply for critical reviews (1-3 star)', () => {
      const reply = generateReviewReply({
        rating: 2,
        reviewerName: 'Sarah Jenkins',
        businessName: 'Prime Electrical',
        ownerContactPhone: '(407) 555-0123',
        ownerContactEmail: 'owner@primeelec.com',
      });

      expect(reply).toContain('Sarah');
      expect(reply).toContain('Prime Electrical');
      expect(reply).toContain('fell short of expectations');
      expect(reply).toContain('phone at (407) 555-0123 or email at owner@primeelec.com');
      // Must not be defensive or argumentative
      expect(reply).not.toContain('liar');
      expect(reply).not.toContain('false');
    });
  });

  describe('computeGbpGrowthScore', () => {
    it('evaluates an unlinked profile as starter level', () => {
      const scorecard = computeGbpGrowthScore({
        placeId: null,
        googleRating: 0,
        googleReviewCount: 0,
      });

      expect(scorecard.score).toBeLessThan(40);
      expect(scorecard.level).toBe('beginner');
      const placeItem = scorecard.checklist.find((i) => i.id === 'place_linked');
      expect(placeItem?.status).toBe('missing');
    });

    it('evaluates fully optimized profile as elite', () => {
      const scorecard = computeGbpGrowthScore({
        placeId: 'ChIJ1234567890',
        googleRating: 4.9,
        googleReviewCount: 38,
        autoReviewRequestsEnabled: true,
      });

      expect(scorecard.score).toBeGreaterThanOrEqual(85);
      expect(scorecard.level).toBe('elite');
      expect(scorecard.checklist.every((i) => i.status === 'complete')).toBe(true);
    });

    it('detects intermediate profile states', () => {
      const scorecard = computeGbpGrowthScore({
        placeId: 'ChIJ1234567890',
        googleRating: 4.5,
        googleReviewCount: 8,
        autoReviewRequestsEnabled: false,
      });

      expect(scorecard.score).toBeGreaterThanOrEqual(40);
      const autoItem = scorecard.checklist.find((i) => i.id === 'auto_requests');
      expect(autoItem?.status).toBe('warning');
      const reviewVolItem = scorecard.checklist.find((i) => i.id === 'review_volume');
      expect(reviewVolItem?.status).toBe('warning');
    });
  });
});
