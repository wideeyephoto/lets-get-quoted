import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  TOUR_STEPS,
  DEMO_SHOWCASE_WORKFLOW,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_CUSTOMER,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import {
  DEFAULT_DEMO_TOUR_STATE,
  loadDemoTourState,
  saveDemoTourState,
  resetDemoTourState,
} from '@/lib/demo-tour-state';

const TOUR_BAR = readFileSync('src/components/demo/DemoTourBar.tsx', 'utf8');
const DEMO_BANNER = readFileSync('src/components/demo-banner.tsx', 'utf8');
const DEMO_SIDEBAR = readFileSync('src/components/demo-sidebar.tsx', 'utf8');
const DEMO_HOME = readFileSync('src/app/demo/page.tsx', 'utf8');
const QUICK_STOPS = readFileSync('src/app/demo/quick-stops/page.tsx', 'utf8');
const INTAKE_SCREEN = readFileSync('src/app/demo/tour/intake/IntakeScreen.tsx', 'utf8');
const QUOTE_SCREEN = readFileSync('src/app/demo/tour/quote/QuoteScreen.tsx', 'utf8');
const APPROVE_SCREEN = readFileSync('src/app/demo/tour/approve/ApproveScreen.tsx', 'utf8');
const COMPLETE_SCREEN = readFileSync('src/app/demo/tour/complete/CompleteScreen.tsx', 'utf8');

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

  describe('Shared Tour State & Session Persistence', () => {
    it('initializes with unsigned and unperformed action defaults', () => {
      expect(DEFAULT_DEMO_TOUR_STATE.upgradeSelected).toBe(true);
      expect(DEFAULT_DEMO_TOUR_STATE.quoteSent).toBe(false);
      expect(DEFAULT_DEMO_TOUR_STATE.signature).toBe('');
      expect(DEFAULT_DEMO_TOUR_STATE.signed).toBe(false);
      expect(DEFAULT_DEMO_TOUR_STATE.depositSimulated).toBe(false);
      expect(DEFAULT_DEMO_TOUR_STATE.paymentMethod).toBeNull();
    });

    it('loads, saves and resets state safely without throwing in node environment', () => {
      const initial = loadDemoTourState();
      expect(initial.signed).toBe(false);

      saveDemoTourState({
        upgradeSelected: false,
        quoteSent: true,
        signature: 'Taylor Brooks',
        signed: true,
        depositSimulated: true,
        paymentMethod: 'apple_pay',
      });

      const reset = resetDemoTourState();
      expect(reset.quoteSent).toBe(false);
    });
  });

  describe('Simulation Disclosures & Non-Deceptive Copy', () => {
    it('displays persistent simulation disclosure across all tour steps in top bar', () => {
      expect(TOUR_BAR).toContain('Sample workflow');
      expect(TOUR_BAR).toContain('No texts, signatures, bookings, or payments are real');
    });

    it('labels quote dispatch action as simulation', () => {
      expect(QUOTE_SCREEN).toContain('Simulate sending quote');
      expect(QUOTE_SCREEN).toContain('Demo complete — no real SMS text was sent');
    });

    it('starts approval unsigned and labels signature and deposit as simulations', () => {
      expect(APPROVE_SCREEN).toContain('Apply demo signature');
      expect(APPROVE_SCREEN).toContain('Simulate Apple Pay deposit');
      expect(APPROVE_SCREEN).toContain('Or simulate credit card deposit');
      expect(APPROVE_SCREEN).toContain('Simulated Deposit Recorded');
    });

    it('renders Apple Pay using SVG instead of unicode glyph box', () => {
      expect(APPROVE_SCREEN).toContain('<svg');
      expect(APPROVE_SCREEN).toContain('Simulate Apple Pay deposit');
      expect(APPROVE_SCREEN).not.toContain('Pay');
    });

    it('renders honest completion summary conditioned on actual simulated interactions', () => {
      expect(COMPLETE_SCREEN).toContain('allActionsSimulated');
      expect(COMPLETE_SCREEN).toContain('anyActionSimulated');
      expect(COMPLETE_SCREEN).toContain("You previewed the full contractor workflow for");
      expect(COMPLETE_SCREEN).toContain("Taylor&apos;s quote was signed and the simulated $500 deposit was recorded");
      expect(COMPLETE_SCREEN).not.toContain('in your bank');
    });
  });

  describe('Active & Staged AI Intake on Step 2', () => {
    it('features staged AI qualification steps with skip and replay controls', () => {
      expect(INTAKE_SCREEN).toContain('ANALYSIS_STEPS');
      expect(INTAKE_SCREEN).toContain('1. Request Received');
      expect(INTAKE_SCREEN).toContain('2. Extracting Scope');
      expect(INTAKE_SCREEN).toContain('3. Checking Service & Route');
      expect(INTAKE_SCREEN).toContain('4. Estimating Range');
      expect(INTAKE_SCREEN).toContain('Show result immediately');
      expect(INTAKE_SCREEN).toContain('prefers-reduced-motion');
    });
  });

  describe('Accessibility & Touch Target Standards', () => {
    it('provides descriptive accessible aria-labels on navigation and step dots', () => {
      expect(TOUR_BAR).toContain('aria-label={`Step ${s.step}: ${s.shortTitle}`}');
      expect(TOUR_BAR).toContain('aria-label="Previous tour step"');
      expect(TOUR_BAR).toContain('aria-label="Next tour step"');
    });

    it('provides accessible names on upgrade checkboxes and signature inputs', () => {
      expect(QUOTE_SCREEN).toContain('aria-label={`Add optional');
      expect(APPROVE_SCREEN).toContain('aria-label={`Add optional');
      expect(APPROVE_SCREEN).toContain('id="signatureInput"');
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
  });

  describe('Elimination of Dead / External Demo URLs', () => {
    it('replaces dead external booking URL with working internal demo route in Quick Stops', () => {
      expect(QUICK_STOPS).toContain('bookingUrl="/demo/schedule/booking"');
      expect(QUICK_STOPS).not.toContain('bookingUrl={null}');
      expect(QUICK_STOPS).toContain('href="/demo/schedule/booking"');
    });
  });
});
