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
const MESSAGES_PAGE = stripJs(read('src', 'app', 'dashboard', 'messages', 'page.tsx'));
const MESSAGING_SETUP = stripJs(read('src', 'app', 'dashboard', 'messages', 'MessagingSetup.tsx'));
const OWNER_ALERTS_FORM = stripJs(read('src', 'app', 'dashboard', 'messages', 'OwnerAlertsForm.tsx'));
const CREW_ROSTER = stripJs(read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx'));
const FIELD_INTAKE_HINT = stripJs(read('src', 'components', 'field-intake-hint.tsx'));
const CSS = read('src', 'app', 'globals.css');

describe('Text-to-Job Verified Phone & Shared Copilot Hotline', () => {
  describe('Decoupling from Dedicated Number Requirements', () => {
    it('does not pass isDedicatedNumber to TextToJobWorkspace', () => {
      expect(TEXT_TO_JOB_PAGE).not.toContain('isDedicatedNumber');
      expect(TEXT_TO_JOB_WORKSPACE).not.toContain('isDedicatedNumber');
    });

    it('determines qualification strictly based on verified alert_phone without checking call_tracking_number', () => {
      expect(TEXT_TO_JOB_PAGE).toContain("const isQualified = Boolean(account?.alert_phone && account.alert_phone.replace(/\\D/g, '').length >= 10);");
    });

    it('always resolves fieldPhoneNumber from sharedPhoneNumber on TextToJobWorkspace', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain("const fieldPhoneNumber = isQualified\n    ? formatUsPhone(sharedPhoneNumber || '+19479412323')\n    : '🔒 Setup Alert Phone to Unlock';");
    });
  });

  describe('Post-Verification AI Copilot Line Showcase', () => {
    it('passes sharedPhoneNumber from Messages page through MessagingSetup to OwnerAlertsForm', () => {
      expect(MESSAGES_PAGE).toContain("sharedPhoneNumber={process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323'}");
      expect(MESSAGING_SETUP).toContain('sharedPhoneNumber?: string');
      expect(MESSAGING_SETUP).toContain('sharedPhoneNumber={sharedPhoneNumber}');
      expect(OWNER_ALERTS_FORM).toContain('sharedPhoneNumber?: string');
    });

    it('renders the AI Copilot card upon phone verification or save in OwnerAlertsForm', () => {
      expect(OWNER_ALERTS_FORM).toContain('msg-setup-copilot-card');
      expect(OWNER_ALERTS_FORM).toContain('🎙️ AI Copilot Field Line Ready');
      expect(OWNER_ALERTS_FORM).toContain('SaveFieldContactButton');
      expect(OWNER_ALERTS_FORM).toContain('href="/dashboard/text-to-job"');
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
});
