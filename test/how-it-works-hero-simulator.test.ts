import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TRADE_PRESETS, type TradeId } from '../src/app/how-it-works/hero-job-simulator';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('HeroJobSimulator Component & Workflow Presets', () => {
  const PAGE = read('src/app/how-it-works/page.tsx');
  const SIMULATOR = read('src/app/how-it-works/hero-job-simulator.tsx');

  it('is properly imported and rendered on /how-it-works page', () => {
    expect(PAGE).toContain("import HeroJobSimulator from './hero-job-simulator'");
    expect(PAGE).toContain('<HeroJobSimulator />');
  });

  it('defines presets for 5 major contractor trades', () => {
    const trades: TradeId[] = ['electrical', 'plumbing', 'hvac', 'roofing', 'remodeling'];
    for (const trade of trades) {
      expect(TRADE_PRESETS[trade]).toBeDefined();
      expect(TRADE_PRESETS[trade].stages).toHaveLength(5);
      expect(TRADE_PRESETS[trade].sampleId).toMatch(/SAMPLE #\d+/);
    }
  });

  it('has 5 connected lifecycle stages per trade (Request, Quote, Scheduled, Work, Paid)', () => {
    for (const preset of Object.values(TRADE_PRESETS)) {
      const labels = preset.stages.map((s) => s.label);
      expect(labels).toEqual(['Request', 'Quote', 'Scheduled', 'Work', 'Paid']);

      for (const stage of preset.stages) {
        expect(stage.facts).toHaveLength(3);
        expect(stage.copilotText.length).toBeGreaterThan(10);
        expect(stage.smsPreview.body.length).toBeGreaterThan(15);
        expect(stage.amountMain).toBeTruthy();
        expect(stage.actionHref).toBeTruthy();
      }
    }
  });

  it('supports interactive keyboard navigation and auto-cycle toggle', () => {
    expect(SIMULATOR).toContain('handleStageKeyDown');
    expect(SIMULATOR).toContain('togglePlay');
    expect(SIMULATOR).toContain("role=\"tablist\"");
    expect(SIMULATOR).toContain("role=\"tab\"");
  });
});
