import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (source: string) => source
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const HERO = stripComments(read('src', 'lib', 'templates', 'HeroQuickForm.tsx'));
const CLASSIFIER = stripComments(read('src', 'app', 'api', 'public', 'leads', 'classify-estimate', 'route.ts'));
const LEAD_ROUTE = stripComments(read('src', 'app', 'api', 'public', 'leads', 'route.ts'));

describe('Smart Intake homeowner flow', () => {
  it('asks no more than three AI questions without changing the shared endpoint default', () => {
    expect(HERO).toContain('const MAX_INTAKE_QUESTIONS = 3');
    expect(HERO.match(/maxQuestions: MAX_INTAKE_QUESTIONS/g)).toHaveLength(3);
    expect(CLASSIFIER).toContain(': MAX_QUESTIONS;');
    expect(CLASSIFIER).toContain('turn < maxQuestions');
    expect(CLASSIFIER).toContain('const questionsRemaining = maxQuestions - turn');
  });

  it('collects location on the description screen before classification', () => {
    const describe = HERO.indexOf("{step === 'describe' && (");
    const qa = HERO.indexOf("{step === 'qa' && (", describe + 1);
    const location = HERO.indexOf('label="Town or city where the work is"');
    expect(describe).toBeGreaterThanOrEqual(0);
    expect(location).toBeGreaterThan(describe);
    expect(location).toBeLessThan(qa);
    expect(HERO).toContain('location: location.trim()');
  });

  it('does not invent a timeline answer when the question is disabled', () => {
    expect(HERO).toContain("useState<'asap' | 'month' | 'researching' | null>(null)");
    expect(HERO).toContain('(!askTimeline || timeline)');
    expect(HERO).toContain("if (askTimeline && timeline) data.set('timeline', timeline)");
    expect(HERO).not.toMatch(/(?<!if \(askTimeline && timeline\) )data\.set\('timeline'/);
  });

  it('keeps service-area qualification server authoritative', () => {
    expect(HERO).not.toContain("data.set('inArea'");
    expect(LEAD_ROUTE).toContain('if (fromWizard && filters.serviceAreaGate)');
    expect(LEAD_ROUTE).toContain('serviceAreaVerdict(location, servedCities)');
    expect(LEAD_ROUTE).not.toContain("text(data, 'inArea'");
  });

  it('makes conservative response claims and refocuses each new question', () => {
    expect(HERO).not.toMatch(/within the next few hours|within about an hour|within a few hours|exact pricing|exact quote/i);
    expect(HERO).toContain("we\\u2019ll follow up as soon as possible");
    expect(HERO).toContain("avgReplyMs ? `typically within ${formatReplyTime(avgReplyMs)}`");
    expect(HERO).toContain("const focusScreenKey = `${step}:${step === 'qa' ? chatTurn : 0}`");
    expect(HERO).toContain('}, [focusScreenKey])');
    expect(HERO).toContain('disabled={isSubmitting || isClassifying}>← Edit project details</button>');
  });
});
