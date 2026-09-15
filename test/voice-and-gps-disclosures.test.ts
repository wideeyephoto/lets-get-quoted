import { describe, it, expect } from 'vitest';
import {
  AI_VOICE_DISCLOSURE,
  CUSTOMER_AI_VOICE_DISCLOSURE,
  RECORDING_DISCLOSURE,
  customerGreetingWithAiDisclosure,
  greetingWithAiDisclosure,
} from '@/lib/voice/provider';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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

    it.each([
      'You are speaking with an AI assistant.',
      "Hi, I'm your AI assistant.",
    ])('normalizes the legacy disclosure "%s" without duplicating the opening', (legacyDisclosure) => {
      const greeting = greetingWithAiDisclosure(`${legacyDisclosure} Thanks for calling Apex.`);
      expect(greeting).toBe(`${AI_VOICE_DISCLOSURE} Thanks for calling Apex.`);
      expect(greetingWithAiDisclosure(greeting)).toBe(greeting);
    });

    it('uses a natural homeowner disclosure and removes a duplicated opening question', () => {
      const greeting = customerGreetingWithAiDisclosure(
        'Thanks for calling Apex Roofing. How can I help you today?',
        { recordingEnabled: true },
      );
      expect(greeting).toBe(
        `Thanks for calling Apex Roofing. ${CUSTOMER_AI_VOICE_DISCLOSURE} ${RECORDING_DISCLOSURE}`,
      );
      expect(greeting).not.toContain(AI_VOICE_DISCLOSURE);
      expect(greeting).not.toMatch(/how can I help/i);
      expect(customerGreetingWithAiDisclosure(greeting, { recordingEnabled: true })).toBe(greeting);
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

      // Both disclosures must be played before recording starts.
      const recordAction = mainSections.find((s: Record<string, unknown>) => 'record_call' in s);
      const playAction = mainSections.find((s: Record<string, unknown>) => 'play' in s);

      expect(recordAction).toBeDefined();
      expect(playAction).toBeDefined();
      expect(playAction.play.urls).toEqual([
        `say: Hello from Royal Oak Heating & Cooling. ${CUSTOMER_AI_VOICE_DISCLOSURE} ${RECORDING_DISCLOSURE}`,
      ]);
      expect(JSON.stringify(playAction)).not.toContain('ai-disclosure-eyre-v2.wav');
      expect(mainSections.indexOf(playAction)).toBeLessThan(mainSections.indexOf(recordAction));
      // Pin the approved spoken disclosure itself, not only its URL. Changing
      // this clip requires checking its wording and listening to it again.
      const disclosure = fs.readFileSync(path.resolve(process.cwd(), 'public/audio/ai-disclosure-eyre-v2.wav'));
      expect(createHash('sha256').update(disclosure).digest('hex'))
        .toBe('72df7bb29d028d0b9a644a82760174b80c3231ac692d290bee970aba08dfa8e3');
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
