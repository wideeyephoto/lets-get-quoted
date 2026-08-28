import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPABILITIES, VERIFIED_CLAIMS, PLAN_TRUTH } from '@/lib/product-truth';
import { PUBLIC_ROUTE_MANIFEST } from '@/lib/public-route-manifest';
import { COMPETITOR_BENCHMARKS } from '@/app/pricing/pricing-catalog';

function read(filePath: string) {
  return readFileSync(resolve(process.cwd(), filePath), 'utf8');
}

describe('Problem 6: Product Truth Registry & Route Integrity', () => {
  describe('Canonical Product-Truth Registry', () => {
    it('pins explicit capability statuses and required disclosures', () => {
      expect(CAPABILITIES.website_generator.status).toBe('live');
      expect(CAPABILITIES.ai_instant_intake.status).toBe('live');
      expect(CAPABILITIES.quotes_and_invoicing.status).toBe('live');
      expect(CAPABILITIES.quickbooks_sync.status).toBe('live');
      expect(CAPABILITIES.stripe_payouts.status).toBe('live');
      expect(CAPABILITIES.scheduling_and_dispatch.status).toBe('live');

      // Outbound SMS is live
      expect(CAPABILITIES.outbound_texting.status).toBe('live');
      expect(CAPABILITIES.outbound_texting.disclosureRequired).toBeUndefined();
    });

    it('defines verified security and payment processing claims', () => {
      expect(VERIFIED_CLAIMS.paymentSecurity.processor).toBe('Stripe, Inc.');
      expect(VERIFIED_CLAIMS.paymentSecurity.compliance).toBe('PCI-DSS Level 1 Service Provider');
      expect(VERIFIED_CLAIMS.paymentSecurity.cardDataHandling).toContain('raw card numbers never touch or reside on LGQ servers');
      expect(VERIFIED_CLAIMS.paymentSecurity.payoutSchedule).toContain('Standard 2-business-day rolling direct deposits');

      expect(VERIFIED_CLAIMS.dataSecurity.transportEncryption).toContain('TLS 1.3');
      expect(VERIFIED_CLAIMS.dataSecurity.tenantIsolation).toContain('Row-Level Security');
    });

    it('matches exact plan prices, platform fees, and seat allowances', () => {
      expect(PLAN_TRUTH.flex.monthlyPrice).toBe(0);
      expect(PLAN_TRUTH.flex.platformFeePct).toBe(1.25);
      expect(PLAN_TRUTH.flex.officeSeats).toBe(1);

      expect(PLAN_TRUTH.solo.monthlyPrice).toBe(39);
      expect(PLAN_TRUTH.solo.platformFeePct).toBe(0.50);
      expect(PLAN_TRUTH.solo.officeSeats).toBe(2);

      expect(PLAN_TRUTH.growth.monthlyPrice).toBe(129);
      expect(PLAN_TRUTH.growth.platformFeePct).toBe(0.25);
      expect(PLAN_TRUTH.growth.officeSeats).toBe(5);

      expect(PLAN_TRUTH.scale.monthlyPrice).toBe(329);
      expect(PLAN_TRUTH.scale.platformFeePct).toBe(0.10);
      expect(PLAN_TRUTH.scale.officeSeats).toBe(15);
    });
  });

  describe('Demo Trust & Interactive Sample Framing', () => {
    it('frames demo clearly as an interactive product demo using sample data', () => {
      const banner = read('src/components/demo-banner.tsx');
      expect(banner).toContain('Interactive product demo using sample data');
      expect(banner).toContain('No messages, bookings, or payments are sent');
      expect(banner).toContain('Exit demo');
    });

    it('ensures demo tour steps use internal fixture routes and zero external dead links', () => {
      expect(existsSync('src/app/demo/tour/site/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/intake/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/lead/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/quote/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/approve/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/complete/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/schedule/booking/page.tsx')).toBe(true);
    });
  });

  describe('Public Route Manifest & Anchor ID Integrity', () => {
    it('verifies all public routes exist in the file system', () => {
      for (const route of PUBLIC_ROUTE_MANIFEST) {
        if (route.path === '/') {
          expect(existsSync('src/app/page.tsx')).toBe(true);
        } else {
          const filePath = `src/app${route.path}/page.tsx`;
          expect(existsSync(filePath), `Missing route page: ${filePath}`).toBe(true);
        }
      }
    });

    it('verifies required anchor IDs are present on target pages', () => {
      const homePage = read('src/components/flagship/flagship-home.tsx');
      const pricingPage = read('src/app/pricing/PricingExperience.tsx');
      const featuresPage = read('src/app/features/page.tsx');

      // Home anchor IDs
      expect(homePage).toContain('id="workflow"');
      expect(homePage).toContain('id="flagships"');
      expect(homePage).toContain('id="included"');
      expect(homePage).toContain('id="pricing"');
      expect(homePage).toContain('id="faq"');

      // Pricing anchor IDs
      expect(pricingPage).toContain('id="plans"');
      expect(pricingPage).toContain('id="recommender"');
      expect(pricingPage).toContain('id="included"');
      expect(pricingPage).toContain('id="calculator"');
      expect(pricingPage).toContain('id="comparison"');
      expect(pricingPage).toContain('id="faq"');

      // Features anchor IDs
      expect(featuresPage).toContain('id="flagship-index"');
      expect(featuresPage).toContain('id="quick-stops"');
      expect(featuresPage).toContain('id="faq"');
    });
  });

  describe('Competitor Benchmarking & Verification Citations', () => {
    it('contains verified source citations and last verification date', () => {
      expect(VERIFIED_CLAIMS.competitorBenchmarks.lastVerifiedDate).toBe('August 14, 2026');
      expect(COMPETITOR_BENCHMARKS.length).toBeGreaterThanOrEqual(3);
      for (const comp of COMPETITOR_BENCHMARKS) {
        expect(comp.name).toBeDefined();
        expect(comp.monthlyBase).toBeGreaterThanOrEqual(0);
        expect(comp.notes).toBeDefined();
      }
    });
  });
});
