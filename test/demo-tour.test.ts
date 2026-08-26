import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  TOUR_STEPS,
  DEMO_SHOWCASE_WORKFLOW,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';

const TOUR_BAR = readFileSync('src/components/demo/DemoTourBar.tsx', 'utf8');
const DEMO_BANNER = readFileSync('src/components/demo-banner.tsx', 'utf8');
const DEMO_SIDEBAR = readFileSync('src/components/demo-sidebar.tsx', 'utf8');
const DEMO_HOME = readFileSync('src/app/demo/page.tsx', 'utf8');
const QUICK_STOPS = readFileSync('src/app/demo/quick-stops/page.tsx', 'utf8');

describe('5-Minute Evaluation Demo Journey', () => {
  describe('Canonical Tour Fixture Data', () => {
    it('defines 6 sequential steps covering the full lifecycle', () => {
      expect(TOUR_STEPS).toHaveLength(6);
      expect(TOUR_STEPS.map((s) => s.slug)).toEqual([
        'site',
        'intake',
        'lead',
        'quote',
        'approve',
        'complete',
      ]);
    });

    it('has both Homeowner and Contractor perspectives represented', () => {
      const perspectives = TOUR_STEPS.map((s) => s.perspective);
      expect(perspectives).toContain('homeowner');
      expect(perspectives).toContain('contractor');
      expect(perspectives).toContain('summary');

      // Step 1 & 2 are Homeowner
      expect(TOUR_STEPS[0].perspective).toBe('homeowner');
      expect(TOUR_STEPS[1].perspective).toBe('homeowner');
      // Step 3 & 4 are Contractor
      expect(TOUR_STEPS[2].perspective).toBe('contractor');
      expect(TOUR_STEPS[3].perspective).toBe('contractor');
      // Step 5 is Homeowner
      expect(TOUR_STEPS[4].perspective).toBe('homeowner');
      // Step 6 is Summary
      expect(TOUR_STEPS[5].perspective).toBe('summary');
    });

    it('maintains consistent customer, contractor and financial data across the canonical story', () => {
      expect(DEMO_SHOWCASE_WORKFLOW.company.name).toBe('Evergreen Lawn & Landscape');
      expect(DEMO_TOUR_CONTRACTOR.name).toBe('Evergreen Lawn & Landscape');
      expect(DEMO_TOUR_CUSTOMER.name).toBe('Taylor Brooks');
      expect(DEMO_TOUR_CUSTOMER.city).toBe('Royal Oak');
      expect(DEMO_TOUR_JOB.baseTotal).toBe(4650);
      expect(DEMO_TOUR_JOB.upgradeTotal).toBe(350);
      expect(DEMO_TOUR_JOB.totalWithUpgrade).toBe(5000);
      expect(DEMO_TOUR_JOB.requiredDeposit).toBe(500);
    });
  });

  describe('Tour Route Files on Disk', () => {
    it('provides page components for all 6 steps and index redirect', () => {
      expect(existsSync('src/app/demo/tour/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/site/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/intake/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/lead/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/quote/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/approve/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/tour/complete/page.tsx')).toBe(true);
    });

    it('verifies step pages reference the canonical tour fixture', () => {
      const sitePage = readFileSync('src/app/demo/tour/site/page.tsx', 'utf8');
      const intakeScreen = readFileSync('src/app/demo/tour/intake/IntakeScreen.tsx', 'utf8');
      const leadPage = readFileSync('src/app/demo/tour/lead/page.tsx', 'utf8');
      const quoteScreen = readFileSync('src/app/demo/tour/quote/QuoteScreen.tsx', 'utf8');
      const approveScreen = readFileSync('src/app/demo/tour/approve/ApproveScreen.tsx', 'utf8');
      const completeScreen = readFileSync('src/app/demo/tour/complete/CompleteScreen.tsx', 'utf8');

      expect(sitePage).toContain('DEMO_TOUR_CONTRACTOR');
      expect(intakeScreen).toContain('DEMO_TOUR_CUSTOMER');
      expect(leadPage).toContain('DEMO_TOUR_JOB');
      expect(quoteScreen).toContain('DEMO_TOUR_JOB');
      expect(approveScreen).toContain('DEMO_TOUR_JOB');
      expect(completeScreen).toContain('DEMO_TOUR_JOB');
    });
  });

  describe('Tour Navigation Bar and Chrome Controls', () => {
    it('contains back, next, and exit navigation links', () => {
      expect(TOUR_BAR).toContain('currentStep.prevHref');
      expect(TOUR_BAR).toContain('currentStep.nextHref');
      expect(TOUR_BAR).toContain('Explore freely');
      expect(TOUR_BAR).toContain('currentStep.perspectiveLabel');
    });

    it('wires telemetry tracking to step views and exits', () => {
      expect(TOUR_BAR).toContain("trackDemoEvent('step_viewed'");
      expect(TOUR_BAR).toContain("trackDemoEvent('explore_freely'");
    });

    it('promotes the 5-minute tour from the demo banner and sidebar', () => {
      expect(DEMO_BANNER).toContain('Start 5-min tour');
      expect(DEMO_SIDEBAR).toContain('Start 5-Min Tour');
      expect(DEMO_HOME).toContain('DemoTourPromptCard');
    });
  });

  describe('Elimination of Dead / External Demo URLs', () => {
    it('replaces dead external booking URL with working internal demo route in Quick Stops', () => {
      expect(QUICK_STOPS).toContain('bookingUrl="/demo/schedule/booking"');
      expect(QUICK_STOPS).not.toContain('bookingUrl={null}');
      expect(QUICK_STOPS).toContain('href="/demo/schedule/booking"');
    });
  });
});
