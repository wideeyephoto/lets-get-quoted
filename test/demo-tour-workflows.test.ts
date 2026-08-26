import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TOUR_STEPS,
  DEMO_SHOWCASE_WORKFLOW,
  DEMO_TOUR_CONTRACTOR,
  DEMO_TOUR_JOB,
} from '@/lib/demo-tour-data';
import {
  DEFAULT_DEMO_TOUR_STATE,
  loadDemoTourState,
  saveDemoTourState,
  resetDemoTourState,
  type DemoTourState,
} from '@/lib/demo-tour-state';
import { buildStartUrl } from '@/lib/signup-intent';

const INTAKE_SCREEN = readFileSync('src/app/demo/tour/intake/IntakeScreen.tsx', 'utf8');
const LEAD_PAGE = readFileSync('src/app/demo/tour/lead/page.tsx', 'utf8');
const QUOTE_SCREEN = readFileSync('src/app/demo/tour/quote/QuoteScreen.tsx', 'utf8');
const APPROVE_SCREEN = readFileSync('src/app/demo/tour/approve/ApproveScreen.tsx', 'utf8');
const COMPLETE_SCREEN = readFileSync('src/app/demo/tour/complete/CompleteScreen.tsx', 'utf8');
const TOUR_BAR = readFileSync('src/components/demo/DemoTourBar.tsx', 'utf8');
const ANALYTICS = readFileSync('src/lib/demo-analytics.ts', 'utf8');

describe('Demo Tour High-Impact Workflows & Quality Hardening', () => {
  describe('1. Require Signing Before Payment (Workflow Fidelity)', () => {
    it('guards payment actions behind signature validation in ApproveScreen', () => {
      expect(APPROVE_SCREEN).toContain('const canPay = state.signed && Boolean(state.signature.trim());');
      expect(APPROVE_SCREEN).toContain('disabled={!canPay || isProcessing}');
      expect(APPROVE_SCREEN).toContain('aria-disabled={!canPay || isProcessing}');
      expect(APPROVE_SCREEN).toContain('🔒 Please apply signature above to unlock deposit payment.');
      expect(APPROVE_SCREEN).toContain('✓ Signature confirmed &mdash; deposit payment unlocked.');
    });
  });

  describe('2. Business Value Communication Across All Steps', () => {
    it('displays LGQ Automated Result explanations connecting actions to business benefits', () => {
      // Step 2: Intake
      expect(INTAKE_SCREEN).toContain('LGQ Automated Result');
      expect(INTAKE_SCREEN).toContain('Lead qualified 24/7 automatically in under 60 seconds');

      // Step 3: Lead
      expect(LEAD_PAGE).toContain('LGQ Automated Result');
      expect(LEAD_PAGE).toContain('Scored 94/100 HOT &amp; mapped 2.1 mi');

      // Step 4: Quote
      expect(QUOTE_SCREEN).toContain('LGQ Automated Result');
      expect(QUOTE_SCREEN).toContain('Quote generated in 1 tap from pre-set pricing rules');

      // Step 5: Approve
      expect(APPROVE_SCREEN).toContain('LGQ Automated Result');
      expect(APPROVE_SCREEN).toContain('Deposit captured directly into Stripe with 0 phone tag');
    });
  });

  describe('3. Final Outcome KPI Summary & Branch Calculation', () => {
    it('calculates the $5,000 branch with lighting and $4,650 branch without lighting', () => {
      const stateWithUpgrade: DemoTourState = {
        ...DEFAULT_DEMO_TOUR_STATE,
        upgradeSelected: true,
      };
      const totalWith = DEMO_TOUR_JOB.baseTotal + (stateWithUpgrade.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);
      expect(totalWith).toBe(5000);

      const stateWithoutUpgrade: DemoTourState = {
        ...DEFAULT_DEMO_TOUR_STATE,
        upgradeSelected: false,
      };
      const totalWithout = DEMO_TOUR_JOB.baseTotal + (stateWithoutUpgrade.upgradeSelected ? DEMO_TOUR_JOB.upgradeTotal : 0);
      expect(totalWithout).toBe(4650);
    });

    it('renders the compact Outcome KPI Summary card with illustrative demo metrics', () => {
      expect(COMPLETE_SCREEN).toContain('LGQ Workflow Outcome Summary');
      expect(COMPLETE_SCREEN).toContain('Illustrative Demo Metrics');
      expect(COMPLETE_SCREEN).toContain('&lt; 1 min');
      expect(COMPLETE_SCREEN).toContain('94/100 HOT');
      expect(COMPLETE_SCREEN).toContain('$500.00');
      expect(COMPLETE_SCREEN).toContain('Thursday Crew');
    });

    it('handles signed, unsigned, paid, and skipped summary variations honestly', () => {
      expect(COMPLETE_SCREEN).toContain('allActionsSimulated');
      expect(COMPLETE_SCREEN).toContain('anyActionSimulated');
      expect(COMPLETE_SCREEN).toContain('Taylor&apos;s quote was signed and the simulated $500 deposit was recorded');
      expect(COMPLETE_SCREEN).toContain('You previewed the full contractor workflow for');
    });
  });

  describe('4. Single Obvious Primary Navigation on Mobile', () => {
    it('demotes/hides header forward button on mobile when sticky dock is active', () => {
      expect(TOUR_BAR).toContain('hideOnMobileDock');
      expect(QUOTE_SCREEN).toContain('mobileStickyActionDock');
    });
  });

  describe('5. Trade-Specific CTA & Acquisition Intent Attribution', () => {
    it('customizes the primary CTA to the demonstrated trade', () => {
      expect(DEMO_TOUR_CONTRACTOR.tradeKey).toBe('landscaping');
      expect(DEMO_TOUR_CONTRACTOR.tradeCta).toBe('Build my landscaping site →');
      expect(COMPLETE_SCREEN).toContain('tradeCtaLabel');
      expect(COMPLETE_SCREEN).toContain('Build my landscaping site →');
    });

    it('offers a quieter secondary walkthrough booking CTA', () => {
      expect(COMPLETE_SCREEN).toContain('Book a 15-minute walkthrough');
      expect(COMPLETE_SCREEN).toContain('href="/demo/schedule/booking"');
    });

    it('preserves trade and acquisition source when generating signup intent URL', () => {
      const url = buildStartUrl({
        goal: 'build_site',
        trade: 'landscaping',
        source: 'demo_tour',
      });
      expect(url).toContain('goal=build_site');
      expect(url).toContain('trade=landscaping');
      expect(url).toContain('source=demo_tour');
    });
  });

  describe('6. Cross-Device Phone Handoff (QR Code)', () => {
    it('provides an optional QR code handoff on Step 4 and hydrator on Step 5', () => {
      expect(QUOTE_SCREEN).toContain('Test on your phone');
      expect(QUOTE_SCREEN).toContain('generateQrSvg');
      expect(QUOTE_SCREEN).toContain('cross_device_handoff_opened');
      expect(APPROVE_SCREEN).toContain("params.get('upgrade')");
    });
  });

  describe('7. Funnel Telemetry Instrumentation', () => {
    it('tracks full funnel events across all user interactions', () => {
      expect(ANALYTICS).toContain('tour_started');
      expect(ANALYTICS).toContain('step_viewed');
      expect(ANALYTICS).toContain('step_interacted');
      expect(ANALYTICS).toContain('step_skipped');
      expect(ANALYTICS).toContain('quote_option_changed');
      expect(ANALYTICS).toContain('signature_applied');
      expect(ANALYTICS).toContain('deposit_simulated');
      expect(ANALYTICS).toContain('cross_device_handoff_opened');
      expect(ANALYTICS).toContain('tour_completed');
      expect(ANALYTICS).toContain('signup_clicked');
    });
  });
});
