import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateContractorAdLeadAlert } from '@/lib/ad-speed-to-lead';

describe('Live-Only Failure Regression Gates', () => {
  describe('Gate 1: Crew Seat Schema & RPC Parity (Live Failure 1)', () => {
    const schemaPath = join(process.cwd(), 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n');

    it('ensures schema.sql contains no reference to the non-existent relation account_seat_entitlements', () => {
      // The canary previously failed with "relation public.account_seat_entitlements does not exist"
      expect(schema).not.toContain('account_seat_entitlements');
    });

    it('ensures migrations contain no reference to account_seat_entitlements', () => {
      const migrationsDir = join(process.cwd(), 'migrations');
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      for (const file of files) {
        const content = readFileSync(join(migrationsDir, file), 'utf8');
        expect(content, `Migration ${file} must not reference account_seat_entitlements`).not.toContain(
          'account_seat_entitlements',
        );
      }
    });

    it('verifies canonical RPCs enforce seat capacity and office permissions', () => {
      expect(schema).toContain('create or replace function public.create_crew_member_with_seat_entitlement');
      expect(schema).toContain('create or replace function public.reactivate_crew_member_with_seat_entitlement');
      expect(schema).toContain('create or replace function public.workspace_purchased_capacity_units');
      expect(schema).toContain("from public.workspace_purchased_capacity c");
    });

    it('verifies public.sms_consent_evidence relation exists in schema.sql', () => {
      expect(schema).toContain('create table if not exists public.sms_consent_evidence');
    });
  });

  describe('Gate 2: Truthful Contractor Alerts for Unavailable Dedicated Senders (Live Failure 2)', () => {
    it('emits deferred notice and never claims Auto-SMS sent when speedToLeadStatus is deferred', () => {
      const alert = generateContractorAdLeadAlert({
        businessName: 'Summit Roofing',
        leadName: 'John Homeowner',
        phone: '+12485550199',
        projectType: 'Gutter Guard',
        city: 'Troy, MI',
        speedToLeadStatus: 'deferred',
      });

      expect(alert).toContain('Auto-SMS deferred (no dedicated sender).');
      expect(alert).not.toContain('Auto-SMS sent to homeowner.');
      expect(alert).toContain('Phone: +12485550199');
    });

    it('emits queued notice when speedToLeadStatus is queued', () => {
      const alert = generateContractorAdLeadAlert({
        businessName: 'Summit Roofing',
        leadName: 'Jane Smith',
        phone: '+12485550188',
        projectType: 'Roof Repair',
        city: 'Birmingham, MI',
        speedToLeadStatus: 'queued',
      });

      expect(alert).toContain('Auto-SMS queued for delivery.');
      expect(alert).not.toContain('Auto-SMS sent to homeowner.');
    });

    it('emits quiet hours notice with formatted time', () => {
      const alert = generateContractorAdLeadAlert({
        businessName: 'Summit Roofing',
        leadName: 'Jane Smith',
        phone: '+12485550188',
        projectType: 'Roof Repair',
        city: 'Birmingham, MI',
        speedToLeadStatus: 'queued_quiet_hours',
        sendAtFormatted: '8:00 AM (America/Detroit)',
      });

      expect(alert).toContain('Auto-SMS queued for 8:00 AM (America/Detroit) (quiet hours).');
      expect(alert).not.toContain('Auto-SMS sent to homeowner.');
    });

    it('emits skipped notice when speedToLeadStatus is failed', () => {
      const alert = generateContractorAdLeadAlert({
        businessName: 'Summit Roofing',
        leadName: 'Jane Smith',
        phone: '+12485550188',
        projectType: 'Roof Repair',
        city: 'Birmingham, MI',
        speedToLeadStatus: 'failed',
      });

      expect(alert).toContain('Auto-SMS delivery skipped.');
      expect(alert).not.toContain('Auto-SMS sent to homeowner.');
    });
  });

  describe('Gate 3: Enqueue vs Delivery Lifecycle & Stable Idempotency', () => {
    const textActionsSrc = readFileSync(
      join(process.cwd(), 'src/app/dashboard/leads/text-actions.ts'),
      'utf8',
    );

    it('does not mark lead as contacted or sent on enqueue', () => {
      // Must not eagerly set status: 'contacted' upon enqueueing
      expect(textActionsSrc).not.toContain("status: 'contacted'");
      expect(textActionsSrc).not.toContain('status: nextStatus');
      expect(textActionsSrc).toContain("'Client Dashboard Link Queued'");
      expect(textActionsSrc).toContain("'Private Text Queued'");
      expect(textActionsSrc).toContain('queued for delivery');
    });

    it('uses stable time-windowed and intent keys rather than Date.now() for idempotency', () => {
      expect(textActionsSrc).not.toContain('Date.now()}');
      expect(textActionsSrc).toContain('bucket15m');
      expect(textActionsSrc).toContain('userIntentKey');
    });
  });

  describe('Gate 4: Dashboard Link Destination & Phone Prefilter Parity', () => {
    const modalSrc = readFileSync(
      join(process.cwd(), 'src/components/leads/TextCustomerModal.tsx'),
      'utf8',
    );
    const portalActionsSrc = readFileSync(
      join(process.cwd(), 'src/app/portal/global-actions.ts'),
      'utf8',
    );

    it('previews /portal for unconverted leads and /client/jobs/ for converted leads', () => {
      expect(modalSrc).toContain('isConverted ? (');
      expect(modalSrc).toContain('https://letsgetquoted.com/client/jobs/');
      expect(modalSrc).toContain('https://letsgetquoted.com/portal');
    });

    it('supports formatted phone numbers via 10-digit normalized fallback in portal lookup', () => {
      expect(portalActionsSrc).toContain("replace(/\\D/g, '').slice(-10)");
    });
  });

  describe('Gate 5: Unlaunched Crew Mutations & Field Intake Affordances', () => {
    const hintSrc = readFileSync(
      join(process.cwd(), 'src/components/field-intake-hint.tsx'),
      'utf8',
    );
    const workerSrc = readFileSync(
      join(process.cwd(), 'src/lib/sms-owner-field-worker.ts'),
      'utf8',
    );

    it('informs user that crew field mutations and job creation are unlaunched', () => {
      expect(hintSrc).toContain('Crew field mutations are currently unlaunched');
      expect(hintSrc).toContain('True job creation and address mutations are managed in the dashboard');
      expect(hintSrc).toContain('AI Intake');
    });

    it('ensures sms-owner-field-worker fails closed for crew field commands', () => {
      expect(workerSrc).toContain('crew_field_intake_not_supported');
      expect(workerSrc).toContain('Crew field commands are temporarily unavailable by text');
    });
  });
});
