import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFieldNoteToItems } from '@/app/dashboard/text-to-job/TextToJobWorkspace';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const TEXT_TO_JOB_WORKSPACE = read('src', 'app', 'dashboard', 'text-to-job', 'TextToJobWorkspace.tsx');
const CSS = read('src', 'app', 'dashboard', 'text-to-job', 'text-to-job.module.css');

describe('Text-to-Job Field Note Composer & Dynamic Entity Extraction', () => {
  describe('On-Page Interactive Elements', () => {
    it('renders the on-page composer card with an actual text input field', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('id="field-note-composer"');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('id="field-note-input"');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('aria-label="Field message text input"');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('composerTextarea');
    });

    it('provides an integrated Voice-to-Text microphone dictation button', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('startVoiceDictation');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('composerVoiceBtn');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Voice to Text');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('composerWaveform');
    });

    it('supports keypad/keyboard input with Enter and Ctrl+Enter parse shortcuts', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain("e.key === 'Enter'");
      expect(TEXT_TO_JOB_WORKSPACE).toContain('e.ctrlKey || e.metaKey');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('composerKeyHint');
    });

    it('includes 1-tap contractor preset chips for realistic testing', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Change Order (+$450)');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('New Lead (Sarah Jenkins)');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Remodel Punch List');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('Roofing Rot Repair ($550)');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('HVAC Repair ($285)');
    });

    it('provides the primary Turn into Parsed Data action button', () => {
      expect(TEXT_TO_JOB_WORKSPACE).toContain('⚡ Turn into Parsed Data');
      expect(TEXT_TO_JOB_WORKSPACE).toContain('composerSubmitBtn');
    });

    it('defines composer styling and multi-theme rules in text-to-job.module.css', () => {
      expect(CSS).toContain('.composerCard {');
      expect(CSS).toContain('.composerTextarea {');
      expect(CSS).toContain('.composerVoiceBtn {');
      expect(CSS).toContain('.composerSubmitBtn {');
      expect(CSS).toContain('.composerPresetChip {');

      // Theme rules for light (workbench), sunlight (bright light), parchment, dim, and onyx
      expect(CSS).toContain(":root[data-theme='light'] .composerCard");
      expect(CSS).toContain(":root[data-theme='sunlight'] .composerCard");
      expect(CSS).toContain(":root[data-theme='parchment'] .composerCard");
      expect(CSS).toContain(":root[data-theme='clarity'] .composerCard");
      expect(CSS).toContain(":root[data-theme='dim'] .composerCard");
      expect(CSS).toContain(":root[data-theme='onyx'] .composerCard");

      // Form inputs properly styled for sunlight/light
      expect(CSS).toContain(":root[data-theme='sunlight'] .composerTextarea");
      expect(CSS).toContain(":root[data-theme='sunlight'] .searchInput");
      expect(CSS).toContain(":root[data-theme='sunlight'] .simInput");
      expect(CSS).toContain(":root[data-theme='sunlight'] .cardCustomizerInput");
    });
  });

  describe('Dynamic Entity Extraction (parseFieldNoteToItems)', () => {
    it('parses a change order with dollar amount, trade scope, and job match', () => {
      const result = parseFieldNoteToItems(
        'Add $450 to Miller job at 124 Main for extra romex, schedule inspection Thursday 9am',
        'Sparky'
      );

      expect(result.matchedRef).toContain('Miller');
      expect(result.isLead).toBe(false);

      const quoteItem = result.items.find((i) => i.pillar === 'jobs' && i.targetTable === 'quote_line_items');
      expect(quoteItem).toBeDefined();
      expect(quoteItem?.title).toContain('+$450.00');
      expect(quoteItem?.detail).toContain('Romex');

      const schedItem = result.items.find((i) => i.pillar === 'schedule');
      expect(schedItem).toBeDefined();
      expect(schedItem?.title).toContain('Thursday');
    });

    it('parses an emergency lead with phone number and service', () => {
      const result = parseFieldNoteToItems(
        'New lead: Sarah Jenkins 248-555-0991 emergency main drain backup needs estimate Friday 9am.',
        'Sparky'
      );

      expect(result.isLead).toBe(true);
      expect(result.matchedRef).toContain('Sarah Jenkins');

      const leadItem = result.items.find((i) => i.pillar === 'leads');
      expect(leadItem).toBeDefined();
      expect(leadItem?.title).toContain('Sarah Jenkins');
      expect(leadItem?.detail).toContain('(248) 555-0991');
      expect(leadItem?.detail).toContain('Drain');
    });

    it('parses numbered punch list items into discrete crew tasks', () => {
      const result = parseFieldNoteToItems(
        'Johnson punch list: 1) caulked exterior trim 2) painted hallway baseboards 3) fix loose door latch.',
        'Sparky'
      );

      expect(result.matchedRef).toContain('Johnson');
      const taskItems = result.items.filter((i) => i.pillar === 'crew');
      expect(taskItems.length).toBeGreaterThanOrEqual(3);
      expect(taskItems[0].title).toContain('Punch List #1');
      expect(taskItems[1].title).toContain('Punch List #2');
      expect(taskItems[2].title).toContain('Punch List #3');
    });

    it('handles generic field notes with fallback activity feed and crew tasks', () => {
      const result = parseFieldNoteToItems(
        'Finished up on site today, locked up back gate and left key in lockbox.',
        'Sparky'
      );

      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.some((i) => i.targetTable === 'job_activity_feed')).toBe(true);
    });
  });
});
