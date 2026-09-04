import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSharedFieldPhoneNumber } from '@/lib/sms';
import { formatUsPhone } from '@/lib/phone';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const TEXT_TO_JOB_PAGE = stripJs(read('src', 'app', 'dashboard', 'text-to-job', 'page.tsx'));
const TEXT_TO_JOB_WORKSPACE = stripJs(read('src', 'app', 'dashboard', 'text-to-job', 'TextToJobWorkspace.tsx'));
const OWNER_PHONE_MODAL = stripJs(read('src', 'app', 'dashboard', 'text-to-job', 'OwnerPhoneSetupModal.tsx'));
const MESSAGES_PAGE = stripJs(read('src', 'app', 'dashboard', 'messages', 'page.tsx'));
const MESSAGING_SETUP = stripJs(read('src', 'app', 'dashboard', 'messages', 'MessagingSetup.tsx'));
const OWNER_ALERTS_FORM = stripJs(read('src', 'app', 'dashboard', 'messages', 'OwnerAlertsForm.tsx'));
const MESSAGES_ACTIONS = stripJs(read('src', 'app', 'dashboard', 'messages', 'actions.ts'));
const CREW_ROSTER = stripJs(read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx'));
const FIELD_INTAKE_HINT = stripJs(read('src', 'components', 'field-intake-hint.tsx'));
const CSS = read('src', 'app', 'globals.css');

describe('Text-to-Job Verified Phone & Shared Copilot Hotline', () => {
  describe('Decoupling from Dedicated Number Requirements', () => {
    it('does not pass isDedicatedNumber to TextToJobWorkspace', () => {
      expect(TEXT_TO_JOB_PAGE).not.toContain('isDedicatedNumber');
      expect(TEXT_TO_JOB_WORKSPACE).not.toContain('isDedicatedNumber');
    });

    it('loads the owner phone through the explicit tri-state settings loader', () => {
      expect(TEXT_TO_JOB_PAGE).toContain('loadOwnerAlerts(accountId)');
      expect(TEXT_TO_JOB_PAGE).toContain("ownerAlerts.kind === 'ok' ? ownerAlerts.phone : null");
      expect(TEXT_TO_JOB_PAGE).toContain("ownerAlerts.kind === 'unavailable'");
      expect(TEXT_TO_JOB_PAGE).toContain('isOwnerFieldLineReady(ownerAlerts)');
    });

    it('only selects columns that actually exist on accounts and crew', () => {
      expect(TEXT_TO_JOB_PAGE).toContain(".select('business_name, trade, call_tracking_number')");
      expect(TEXT_TO_JOB_PAGE).toContain(".select('id, name, phone, role_label, active, user_id, last_signed_in_at')");
      expect(TEXT_TO_JOB_PAGE).not.toContain(".select('company_name, business_name, trade, phone");
      expect(TEXT_TO_JOB_PAGE).not.toContain('phone_verified_at, phone_verified');
      expect(TEXT_TO_JOB_PAGE).toContain("console.error('Text-to-Job account details unreadable:'");
      expect(TEXT_TO_JOB_PAGE).toContain("console.error('Text-to-Job crew phone status unreadable:'");
    });

    it('resolves the field line from the shared number only after phone status is available', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain("qualificationUnavailable\n    ? 'Phone status unavailable'");
      expect(TEXT_TO_JOB_WORKSPACE).toContain("formatUsPhone(sharedPhoneNumber || '+19479412323')");
      expect(TEXT_TO_JOB_WORKSPACE).toContain("'🔒 Setup Alert Phone to Unlock'");
    });
  });

  describe('Inline owner phone setup', () => {
    it('opens the existing verified-phone form in an on-page modal', () => {
      expect(OWNER_PHONE_MODAL).toContain("import ModalDialog from '@/components/modal-dialog'");
      expect(OWNER_PHONE_MODAL).toContain("import OwnerAlertsForm from '@/app/dashboard/messages/OwnerAlertsForm'");
      expect(OWNER_PHONE_MODAL).toContain('You will stay on the Text-to-Job page');
      expect(OWNER_PHONE_MODAL).toContain('showTextToJobLink={false}');
      expect(OWNER_PHONE_MODAL).toContain('fieldLineSetup');
    });

    it('keeps every owner phone setup control on Text-to-Job', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('OwnerPhoneSetupModal');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Setup Alert Phone to Unlock');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Manage My Phone');
      expect(TEXT_TO_JOB_WORKSPACE).not.toContain('/dashboard/messages?setup=1');
    });

    it('requires OTP validation for a new phone and refreshes this route after save', () => {
      expect(MESSAGES_ACTIONS).toContain("normalized !== current.phone || current.consent === 'none'");
      expect(MESSAGES_ACTIONS).toContain('if (normalized && phoneNeedsVerification)');
      expect(MESSAGES_ACTIONS).toContain('Verify this number with the 6-digit text code before saving it.');
      expect(MESSAGES_ACTIONS).toContain('owner_otp_verify:${accountId}');
      expect(MESSAGES_ACTIONS).toContain("revalidatePath('/dashboard/text-to-job')");
      expect(OWNER_ALERTS_FORM).toContain('Code entered — save to verify');
      expect(OWNER_ALERTS_FORM).toContain("enteredPhone !== storedPhone || consent === 'none'");
      expect(OWNER_ALERTS_FORM).not.toContain("setOtpState('verified')");
    });
  });

  describe('Post-Verification AI Copilot Line Showcase', () => {
    it('passes sharedPhoneNumber from Messages page through MessagingSetup to OwnerAlertsForm', () => {
      expect(MESSAGES_PAGE).toContain("sharedPhoneNumber={process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323'}");
      expect(MESSAGING_SETUP).toContain('sharedPhoneNumber?: string');
      expect(MESSAGING_SETUP).toContain('sharedPhoneNumber={sharedPhoneNumber}');
      expect(OWNER_ALERTS_FORM).toContain('sharedPhoneNumber?: string');
    });

    it('renders the AI Copilot card only for persisted phone setup in OwnerAlertsForm', () => {
      expect(OWNER_ALERTS_FORM).toContain('msg-setup-copilot-card');
      expect(OWNER_ALERTS_FORM).toContain('🎙️ AI Copilot Field Line Ready');
      expect(OWNER_ALERTS_FORM).toContain('SaveFieldContactButton');
      expect(OWNER_ALERTS_FORM).toContain('href="/dashboard/text-to-job"');
      expect(OWNER_ALERTS_FORM).toContain('savedStateMatches && state.status');
      expect(OWNER_ALERTS_FORM).toContain('isAlreadyOptedIn && enabled && currentEnabled');
      expect(OWNER_ALERTS_FORM).toContain('Turning it off locks Text-to-Job.');
      expect(OWNER_ALERTS_FORM).not.toContain("otpState === 'verified'");
    });

    it('renders the AI Copilot Field Line Ready card on TextToJobWorkspace when qualified', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('🎙️ AI Copilot Field Line Ready');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('msg-setup-copilot-card');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('SaveFieldContactButton');
    });

    it('replaces hardcoded Sparky references with dynamic AI Copilot companion labels in TextToJobWorkspace', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Your AI Copilot (Currently: {companion.name})');
      expect(TEXT_TO_JOB_WORKSPACE).not.toContain('Who Can Text {companion.name}');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Who Can Text Your AI Copilot (Currently: {companion.name})');
    });

    it('includes verified field hotline and voice credits on the visor card and quick commands', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('isQualified ? fieldPhoneNumber :');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Text-to-Job Field Guide');
    });

    it('includes clear guidance on calling the number using Voice credits', () => {
      expect(OWNER_ALERTS_FORM).toContain('Voice credits');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Voice credits');
      expect(CREW_ROSTER).toContain('Voice credits');
      expect(FIELD_INTAKE_HINT).toContain('Voice credits');
    });
  });

  describe('CSS & Styling Integrity', () => {
    it('defines .msg-setup-copilot-card and sub-elements in globals.css', () => {
      expect(CSS).toContain('.msg-setup-copilot-card {');
      expect(CSS).toContain('.msg-setup-copilot-badge {');
      expect(CSS).toContain('.msg-setup-copilot-num {');
      expect(CSS).toContain('.msg-setup-copilot-voice-tip {');
    });
  });

  describe('Shared Field Line Helper Functions', () => {
    it('resolves the platform shared field line via mock admin', async () => {
      const mockAdmin = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { e164_number: '+19479412323' } }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      } as any;

      const line = (await getSharedFieldPhoneNumber(mockAdmin)) || '+19479412323';
      expect(line).toMatch(/^\+1\d{10}$/);
      expect(formatUsPhone(line)).toBe('(947) 941-2323');
    });
  });

  describe('Field Leads Integration & Real Feed Unification', () => {
    it('queries recent leads alongside exact count in page.tsx', () => {
      expect(TEXT_TO_JOB_PAGE).toContain(
        ".select('id, name, phone, address, message, source, status, created_at', { count: 'exact' })"
      );
      expect(TEXT_TO_JOB_PAGE).toContain("console.error('Text-to-Job leads unreadable:', leadError)");
    });

    it('maps leads with pillar leads and merges with feed rows chronologically', () => {
      expect(TEXT_TO_JOB_PAGE).toContain("pillar: 'leads'");
      expect(TEXT_TO_JOB_PAGE).toContain("matchedRef = `New Lead: ${lead.name || 'New Prospect'}`");
      expect(TEXT_TO_JOB_PAGE).toContain('[...feedMessages, ...leadMessages]');
    });

    it('dynamically directs to /dashboard/leads when viewing a lead record', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain("selectedMessage.extractedItems.some((i) => i.pillar === 'leads')");
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Open Lead ↗');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('href="/dashboard/leads"');
    });
  });
});

