import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  MESSAGING_SETUP_FEE_CENTS,
  MESSAGING_SETUP_FEE_USD,
  createMessagingSetupCheckoutSession,
  verifyMessagingSetupCheckoutSession,
} from '../src/lib/billing/messaging-setup-checkout';
import { sendFounderMessagingApplicationAlert } from '../src/lib/founder-alerts';
import {
  sendMessagingApplicationSubmittedEmail,
  sendMessagingApplicationStatusEmail,
} from '../src/lib/email';

const wizardCode = readFileSync('src/app/dashboard/messages/dedicated-number/DedicatedNumberWizard.tsx', 'utf8');
const ownerPage = readFileSync('src/app/dashboard/messages/dedicated-number/page.tsx', 'utf8');
const ownerAction = readFileSync('src/app/dashboard/messages/dedicated-number/actions.ts', 'utf8');
const adminAction = readFileSync('src/app/admin/messaging/registrations/actions.ts', 'utf8');

describe('2-way dedicated number $49.99 setup fee & notifications', () => {
  describe('pricing & setup fee constant', () => {
    it('defines the one-time setup fee as exactly $49.99 (4999 cents)', () => {
      expect(MESSAGING_SETUP_FEE_CENTS).toBe(4999);
      expect(MESSAGING_SETUP_FEE_USD).toBe('$49.99');
    });
  });

  describe('wizard UI & form copy', () => {
    it('displays the $49.99 setup fee summary card in Step 3', () => {
      expect(wizardCode).toContain('Setup fee summary');
      expect(wizardCode).toContain('$49.99 One-Time');
      expect(wizardCode).toContain('TCR Standard Brand Registration &amp; Carrier Vetting');
      expect(wizardCode).toContain('Dedicated Local Business Phone Number Provisioning');
      expect(wizardCode).toContain('2-Way Customer Messaging &amp; AI Voice Receptionist Setup');
      expect(wizardCode).toContain('Pay $49.99 &amp; Submit Application →');
    });

    it('updates dedicated number page description and banners to reflect $49.99 setup fee', () => {
      expect(ownerPage).toContain('A one-time $49.99 setup fee covers carrier brand registration');
      expect(ownerPage).toContain('Your $49.99 one-time registration and setup fee has been confirmed');
    });
  });

  describe('owner submission action notifications', () => {
    it('calls both founder alert and contractor confirmation email upon application submission', () => {
      expect(ownerAction).toContain('sendFounderMessagingApplicationAlert({');
      expect(ownerAction).toContain('sendMessagingApplicationSubmittedEmail({');
      expect(ownerAction).toContain('MESSAGING_SETUP_FEE_USD');
    });
  });

  describe('admin registration review & activation notifications', () => {
    it('dispatches status email to contractor when admin takes action or activates number', () => {
      expect(adminAction).toContain('sendMessagingApplicationStatusEmail({');
      expect(adminAction).toContain("status: decision as 'action_required' | 'rejected' | 'approved'");
      expect(adminAction).toContain("status: 'active'");
    });
  });

  describe('founder messaging application alert helper', () => {
    it('safely handles missing RESEND_API_KEY without throwing', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        await expect(
          sendFounderMessagingApplicationAlert({
            applicationId: '11111111-1111-4111-8111-111111111111',
            accountId: '22222222-2222-4222-8222-222222222222',
            businessName: 'Acme Heating & Cooling',
            businessType: 'llc',
            contactName: 'Jane Smith',
            contactEmail: 'jane@acmeheating.com',
            contactPhone: '(248) 555-0140',
            desiredAreaCode: '248',
          }),
        ).resolves.toBeUndefined();
      } finally {
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });
  });

  describe('contractor messaging email helpers', () => {
    it('safely handles submission confirmation without throwing when RESEND_API_KEY is missing', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        await expect(
          sendMessagingApplicationSubmittedEmail({
            accountId: '22222222-2222-4222-8222-222222222222',
            recipientEmail: 'contractor@example.com',
            businessName: 'Acme Electric',
            desiredAreaCode: '313',
          }),
        ).resolves.toBeUndefined();
      } finally {
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });

    it('safely handles status update without throwing when RESEND_API_KEY is missing', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        await expect(
          sendMessagingApplicationStatusEmail({
            accountId: '22222222-2222-4222-8222-222222222222',
            recipientEmail: 'contractor@example.com',
            businessName: 'Acme Electric',
            status: 'active',
            purchasedNumber: '+12485550199',
          }),
        ).resolves.toBeUndefined();
      } finally {
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });
  });
});
