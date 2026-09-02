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
const TOUR_FRAME = readFileSync('src/components/demo/DemoTourFrame.tsx', 'utf8');
const SITE_PAGE = readFileSync('src/app/demo/tour/site/page.tsx', 'utf8');
const QUICK_STOPS = readFileSync('src/app/demo/quick-stops/page.tsx', 'utf8');
const INTAKE_SCREEN = readFileSync('src/app/demo/tour/intake/IntakeScreen.tsx', 'utf8');
const QUOTE_SCREEN = readFileSync('src/app/demo/tour/quote/QuoteScreen.tsx', 'utf8');
const APPROVE_SCREEN = readFileSync('src/app/demo/tour/approve/ApproveScreen.tsx', 'utf8');
const COMPLETE_SCREEN = readFileSync('src/app/demo/tour/complete/CompleteScreen.tsx', 'utf8');
const ANALYTICS = readFileSync('src/lib/demo-analytics.ts', 'utf8');

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
      expect(TOUR_STEPS.map((s) => s.phase)).toEqual([
        'Attract',
        'Qualify',
        'Prioritize',
        'Quote',
        'Close',
        'Result',
      ]);
      expect(TOUR_STEPS.every((step) => step.outcomeHeadline && step.nextPreview && step.flow.length > 0)).toBe(true);
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
      expect(DEMO_SHOWCASE_WORKFLOW.company.name).toBe('Broke Pipes Plumbing');
      expect(DEMO_TOUR_CONTRACTOR.name).toBe('Broke Pipes Plumbing');
      expect(DEMO_TOUR_CUSTOMER.name).toBe('Alex Morgan');
      expect(DEMO_TOUR_CUSTOMER.city).toBe('Royal Oak');
      expect(DEMO_TOUR_JOB.baseTotal).toBe(1450);
      expect(DEMO_TOUR_JOB.upgradeTotal).toBe(320);
      expect(DEMO_TOUR_JOB.totalWithUpgrade).toBe(1770);
      expect(DEMO_TOUR_JOB.requiredDeposit).toBe(725);
    });
  });

  describe('Shared Tour State & Session Persistence', () => {
    it('initializes with unsigned and unperformed action defaults', () => {
      expect(DEFAULT_DEMO_TOUR_STATE.intakeAnalyzed).toBe(false);
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
        intakeAnalyzed: true,
        upgradeSelected: false,
        quoteSent: true,
        signature: 'Taylor Brooks',
        signed: true,
        depositSimulated: true,
        paymentMethod: 'apple_pay',
      });

      const reset = resetDemoTourState();
      expect(reset.quoteSent).toBe(false);
      expect(reset.intakeAnalyzed).toBe(false);
    });
  });

  describe('Simulation Disclosures & Non-Deceptive Copy', () => {
    it('displays persistent desktop and mobile simulation disclosures across all tour steps in top bar', () => {
      expect(TOUR_BAR).toContain('Interactive sample');
      expect(TOUR_BAR).toContain('No real texts, signatures, bookings, or payments');
    });

    it('labels illustrative social proof on step 1 site', () => {
      expect(SITE_PAGE).toContain('Illustrative demo reviews');
    });

    it('labels quote dispatch action and preview as simulation', () => {
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
      expect(COMPLETE_SCREEN).toContain("Taylor&apos;s quote was signed and the simulated ${DEMO_TOUR_JOB.requiredDeposit.toLocaleString()} deposit was recorded");
      expect(COMPLETE_SCREEN).not.toContain('in your bank');
    });
  });

  describe('At-a-Glance Outcome Framing', () => {
    it('keeps the result, next step, perspective, and job continuity visible on every step', () => {
      expect(TOUR_FRAME).toContain('currentStep.outcomeHeadline');
      expect(TOUR_FRAME).toContain('currentStep.nextPreview');
      expect(TOUR_FRAME).toContain('currentStep.perspectiveShift');
      expect(TOUR_FRAME).toContain('currentStep.flow.map');
      expect(TOUR_FRAME).toContain('Live job activity');
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

  describe('Accessibility, Touch Targets & Action Hierarchy', () => {
    it('provides descriptive accessible aria-labels and smart Skip vs Continue states', () => {
      expect(TOUR_BAR).toContain('aria-label={`Step ${step.step}: ${step.phase} — ${step.shortTitle}`}');
      expect(TOUR_BAR).toContain('aria-label="Previous tour step"');
      expect(TOUR_BAR).toContain('currentStep.nextActionLabel');
      expect(TOUR_BAR).toContain('Preview next:');
    });

    it('provides accessible names on upgrade checkboxes and signature inputs', () => {
      expect(QUOTE_SCREEN).toContain('aria-label={`Add optional');
      expect(APPROVE_SCREEN).toContain('aria-label={`Add optional');
      expect(APPROVE_SCREEN).toContain('id="signatureInput"');
    });
  });

  describe('Funnel Analytics & Telemetry', () => {
    it('tracks full funnel events with device attribution', () => {
      expect(ANALYTICS).toContain('action_simulated');
      expect(ANALYTICS).toContain('step_skipped');
      expect(ANALYTICS).toContain('cta_clicked');
      expect(ANALYTICS).toContain('device_type');
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
