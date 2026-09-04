import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MESSAGING_SETUP = readFileSync('src/app/dashboard/messages/MessagingSetup.tsx', 'utf8');
const TEXT_TO_JOB_PAGE = readFileSync('src/app/dashboard/text-to-job/page.tsx', 'utf8');
const TEXT_TO_JOB_WORKSPACE = readFileSync('src/app/dashboard/text-to-job/TextToJobWorkspace.tsx', 'utf8');
const VOICE_CALLS_PAGE = readFileSync('src/app/dashboard/voice-calls/page.tsx', 'utf8');

describe('Texting Setup Popup Mirroring', () => {
  describe('MessagingSetup Component Parity & Reusability', () => {
    it('exports MessagingSetupSections for reusable two-column modal presentation', () => {
      expect(MESSAGING_SETUP).toContain('export function MessagingSetupSections');
      expect(MESSAGING_SETUP).toContain('Your Let&rsquo;s Get Quoted notifications');
      expect(MESSAGING_SETUP).toContain('Your customer texting number');
      expect(MESSAGING_SETUP).toContain('Dedicated 2-way homeowner messaging');
    });

    it('supports custom trigger rendering or standard strip rendering', () => {
      expect(MESSAGING_SETUP).toContain('triggerLabel?: ReactNode');
      expect(MESSAGING_SETUP).toContain('triggerClassName?: string');
      expect(MESSAGING_SETUP).toContain('showTextToJobLink?: boolean');
    });
  });

  describe('Text-to-Job Page Integration', () => {
    it('loads messagingSetup in text-to-job/page.tsx and supports setup query param', () => {
      expect(TEXT_TO_JOB_PAGE).toContain('loadMessagingSetup(accountId)');
      expect(TEXT_TO_JOB_PAGE).toContain("import MessagingSetup from '@/app/dashboard/messages/MessagingSetup'");
      expect(TEXT_TO_JOB_PAGE).toContain("openOnLoad={searchParams.setup === '1'}");
    });

    it('renders the MessagingSetup strip at the top of Text-to-Job page mirroring AI Assistant and Messages', () => {
      expect(TEXT_TO_JOB_PAGE).toContain('<MessagingSetup');
      expect(TEXT_TO_JOB_PAGE).toContain('setup={messagingSetup}');
      expect(TEXT_TO_JOB_PAGE).toContain('showTextToJobLink={false}');
    });
  });

  describe('AI Voice Assistant Page Integration', () => {
    it('loads messagingSetup in voice-calls/page.tsx and supports setup query param', () => {
      expect(VOICE_CALLS_PAGE).toContain("import MessagingSetup from '@/app/dashboard/messages/MessagingSetup'");
      expect(VOICE_CALLS_PAGE).toContain("import { loadMessagingSetup } from '@/lib/owner-sms'");
      expect(VOICE_CALLS_PAGE).toContain('loadMessagingSetup(accountId)');
      expect(VOICE_CALLS_PAGE).toContain('setup?: string');
    });

    it('renders the MessagingSetup strip below the header mirroring Text-to-Job and Messages', () => {
      expect(VOICE_CALLS_PAGE).toContain('<MessagingSetup');
      expect(VOICE_CALLS_PAGE).toContain('setup={messagingSetup}');
      expect(VOICE_CALLS_PAGE).toContain("openOnLoad={searchParams.setup === '1'}");
      expect(VOICE_CALLS_PAGE).toContain("sharedPhoneNumber={process.env.SIGNALWIRE_FROM_NUMBER || '+19479412323'}");
    });
  });
});
