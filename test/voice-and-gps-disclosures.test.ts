import { describe, it, expect } from 'vitest';
import {
  AI_VOICE_DISCLOSURE,
  RECORDING_DISCLOSURE,
  greetingWithAiDisclosure,
} from '@/lib/voice/provider';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import fs from 'node:fs';
import path from 'node:path';

describe('Voice & GPS Compliance Disclosures', () => {
  describe('Telephony & AI Voice Recording Disclosures', () => {
    it('always includes AI assistant disclosure in spoken greetings', () => {
      const greeting = greetingWithAiDisclosure('Thanks for calling Apex Roofing.');
      expect(greeting).toContain(AI_VOICE_DISCLOSURE);
      expect(greeting).toContain('Apex Roofing');
    });

    it('automatically includes call recording disclosure when recording is enabled', () => {
      const greeting = greetingWithAiDisclosure('Thanks for calling Apex Roofing.', {
        recordingEnabled: true,
      });
      expect(greeting).toContain(AI_VOICE_DISCLOSURE);
      expect(greeting).toContain(RECORDING_DISCLOSURE);
      expect(greeting).toContain('Apex Roofing');
    });

    it('is idempotent and does not duplicate disclosures if already present', () => {
      const preDisclosed = `${AI_VOICE_DISCLOSURE} Thanks for calling Apex Roofing. ${RECORDING_DISCLOSURE}`;
      const result = greetingWithAiDisclosure(preDisclosed, { recordingEnabled: true });

      const aiOccurrences = (result.match(new RegExp(AI_VOICE_DISCLOSURE, 'g')) || []).length;
      const recordingOccurrences = (result.match(new RegExp(RECORDING_DISCLOSURE, 'g')) || []).length;

      expect(aiOccurrences).toBe(1);
      expect(recordingOccurrences).toBe(1);
    });

    it('renders SignalWire SWML with spoken disclosures when recording calls', () => {
      const plan = {
        kind: 'ai_agent' as const,
        receiptUrl: 'https://app.letsgetquoted.com/api/voice/receipt',
        receiptAuthorization: { scheme: 'basic' as const, username: 'test_user', password: 'test_password' },
        greeting: 'Hello from Royal Oak Heating & Cooling.',
        capMinutes: 10,
        transferTo: null,
        recordCall: true,
        recordingStatusUrl: 'https://app.letsgetquoted.com/api/voice/recording-status',
      };

      const answer = signalwireVoiceProvider.renderAnswer(plan);
      expect(answer.contentType).toBe('application/json');

      const swml = JSON.parse(answer.body);
      const mainSections = swml.sections.main;

      // Assert record_call and say elements exist in SWML
      const recordAction = mainSections.find((s: Record<string, unknown>) => 'record_call' in s);
      const playAction = mainSections.find((s: Record<string, unknown>) => 'play' in s);

      expect(recordAction).toBeDefined();
      expect(playAction).toBeDefined();
      expect(playAction.play.url).toContain(AI_VOICE_DISCLOSURE);
      expect(playAction.play.url).toContain(RECORDING_DISCLOSURE);
    });
  });

  describe('Terms of Service Regulatory Clauses', () => {
    it('terms of service explicitly discloses call recording and two-party consent laws', () => {
      const termsPath = path.resolve(process.cwd(), 'src/app/terms/page.tsx');
      const content = fs.readFileSync(termsPath, 'utf8');

      expect(content).toContain('AI Caller Disclosure');
      expect(content).toContain('two-party or one-party consent');
      expect(content).toContain('recorded and transcribed');
    });

    it('terms of service explicitly discloses workforce GPS location tracking and employee consent obligations', () => {
      const termsPath = path.resolve(process.cwd(), 'src/app/terms/page.tsx');
      const content = fs.readFileSync(termsPath, 'utf8');

      expect(content).toContain('Crew GPS');
      expect(content).toContain('GPS location');
      expect(content).toContain('mandated notices and obtaining necessary consents from your employees');
    });
  });
});
