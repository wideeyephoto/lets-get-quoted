import { describe, it, expect } from 'vitest';
import {
  billableLines,
  companionSuggestions,
  deterministicFindings,
  estimatedCost,
  guardSummary,
  mergeFindings,
  quoteTotal,
  type GuardInput,
  type GuardLine,
  type QuoteFinding,
} from '@/lib/quote-guard';
import { buildOmissionInput, toOmissionFindings } from '@/lib/quote-guard-ai';

function line(overrides: Partial<GuardLine> = {}): GuardLine {
  return { id: 'l1', label: 'Roof replacement', amount: 12000, kind: 'base', selected: true, unitCost: 7000, unit: 'job', ...overrides };
}

function input(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    lines: [line()],
    scope: 'Replace the roof on a 1,800 sq ft ranch. Shingles are curling and there is a leak over the garage.',
    estimatedHours: null,
    loadedHourlyRate: 40,
    minMarginPct: 25,
    history: [],
    ...overrides,
  };
}

describe('billableLines and quoteTotal', () => {
  it('counts the base and selected add-ons, and no subscriptions', () => {
    const lines = [
      line({ id: 'base', amount: 100 }),
      line({ id: 'chosen', kind: 'addon', selected: true, amount: 50 }),
      line({ id: 'declined', kind: 'addon', selected: false, amount: 500 }),
      line({ id: 'plan', kind: 'subscription', selected: true, amount: 99 }),
    ];
    expect(billableLines(lines).map((l) => l.id)).toEqual(['base', 'chosen']);
    expect(quoteTotal(lines)).toBe(150);
  });
});

describe('estimatedCost', () => {
  it('counts only lines that have a cost, and says how many did not', () => {
    // An uncosted line contributing $0 would make the margin look excellent
    // precisely because the price book isn't finished.
    const result = estimatedCost(input({ lines: [line({ unitCost: 7000 }), line({ id: 'l2', unitCost: null })] }));
    expect(result.cost).toBe(7000);
    expect(result.costedLines).toBe(1);
    expect(result.uncostedLines).toBe(1);
  });

  it('adds estimated labour when there are hours and a rate', () => {
    expect(estimatedCost(input({ estimatedHours: 10, loadedHourlyRate: 40 })).cost).toBe(7400);
  });

  it('adds no labour when there is no rate on file', () => {
    expect(estimatedCost(input({ estimatedHours: 10, loadedHourlyRate: 0 })).cost).toBe(7000);
  });
});

describe('deterministicFindings', () => {
  it('says nothing about a healthy quote', () => {
    expect(deterministicFindings(input())).toEqual([]);
  });

  it('flags an empty quote and stops there', () => {
    const findings = deterministicFindings(input({ lines: [] }));
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe('empty');
    expect(findings[0].severity).toBe('high');
  });

  it('flags a $0 line', () => {
    const findings = deterministicFindings(input({ lines: [line(), line({ id: 'l2', label: 'Haul away', amount: 0, unitCost: 0 })] }));
    const zero = findings.find((f) => f.id === 'zero-lines');
    expect(zero?.severity).toBe('high');
    expect(zero?.detail).toContain('Haul away');
  });

  it('flags a margin under the floor, from arithmetic only', () => {
    const findings = deterministicFindings(input({ lines: [line({ amount: 8000, unitCost: 7000 })] }));
    const margin = findings.find((f) => f.id === 'margin');
    expect(margin?.source).toBe('math');
    expect(margin?.detail).toContain('$8,000');
  });

  it('words an outright loss differently and raises it', () => {
    const findings = deterministicFindings(input({ lines: [line({ amount: 5000, unitCost: 7000 })] }));
    const margin = findings.find((f) => f.id === 'margin');
    expect(margin?.severity).toBe('high');
    expect(margin?.title).toContain('loses money');
  });

  it('stays quiet about margin when no floor is set', () => {
    const findings = deterministicFindings(input({ minMarginPct: 0, lines: [line({ amount: 7100, unitCost: 7000 })] }));
    expect(findings.find((f) => f.id === 'margin')).toBeUndefined();
  });

  it('says when the margin figure is built on nothing', () => {
    const findings = deterministicFindings(input({ lines: [line({ unitCost: null })] }));
    const uncosted = findings.find((f) => f.id === 'uncosted');
    expect(uncosted?.detail).toContain('guesswork');
  });

  it('compares quoted hours against the estimate', () => {
    const findings = deterministicFindings(
      input({ estimatedHours: 40, loadedHourlyRate: 40, lines: [line({ unit: 'hour', amount: 800, unitCost: 0 })] }),
    );
    const hours = findings.find((f) => f.id === 'hours');
    expect(hours?.title).toContain('fewer hours');
    expect(hours?.detail).toContain('20.0');
  });

  it('says nothing about hours when there are no hourly lines to compare', () => {
    const findings = deterministicFindings(input({ estimatedHours: 40, lines: [line({ unit: 'job' })] }));
    expect(findings.find((f) => f.id === 'hours')).toBeUndefined();
  });

  it('notes an empty scope rather than silently checking nothing', () => {
    expect(deterministicFindings(input({ scope: '   ' })).find((f) => f.id === 'no-scope')).toBeDefined();
  });
});

describe('companionSuggestions', () => {
  const history = (count: number, withDisposal: number) =>
    Array.from({ length: count }, (_, i) => ({
      labels: i < withDisposal ? ['Roof replacement', 'Disposal & haul away'] : ['Roof replacement'],
    }));

  it('flags a service that usually travels with this one', () => {
    const [suggestion] = companionSuggestions(['Roof replacement'], history(10, 8));
    expect(suggestion.label).toBe('Disposal & haul away');
    expect(suggestion.withCount).toBe(8);
    expect(suggestion.rate).toBe(0.8);
  });

  it('stays quiet on a thin history', () => {
    // Three past jobs and "you always include disposal" means "you did it
    // twice", which is not a pattern.
    expect(companionSuggestions(['Roof replacement'], history(3, 3))).toEqual([]);
  });

  it('stays quiet when it is not actually a habit', () => {
    expect(companionSuggestions(['Roof replacement'], history(10, 3))).toEqual([]);
  });

  it('only counts jobs that share something with this quote', () => {
    const unrelated = Array.from({ length: 20 }, () => ({ labels: ['Gutter cleaning', 'Disposal & haul away'] }));
    expect(companionSuggestions(['Roof replacement'], unrelated)).toEqual([]);
  });

  it('does not suggest something already on the quote', () => {
    const suggestions = companionSuggestions(['Roof replacement', 'Disposal & haul away'], history(10, 10));
    expect(suggestions).toEqual([]);
  });

  it('counts a job once even if it lists the label twice', () => {
    const doubled = Array.from({ length: 6 }, () => ({ labels: ['Roof replacement', 'Permit', 'permit'] }));
    const [suggestion] = companionSuggestions(['Roof replacement'], doubled);
    expect(suggestion.withCount).toBe(6);
    expect(suggestion.rate).toBe(1);
  });

  it('says nothing about an empty quote', () => {
    expect(companionSuggestions([], history(10, 10))).toEqual([]);
  });
});

describe('buildOmissionInput', () => {
  const context = { trade: 'Roofing', scope: 'Tear off and replace.', labels: ['Shingles'], estimatedHours: null };

  it('says "JSON" in the input, not only in the instructions', () => {
    // The Responses API 400s on text.format json_object without it, that 400 is
    // caught, and the omission check then returns nothing on EVERY quote while
    // the panel still looks like it ran. Caught by a live run, pinned here.
    expect(buildOmissionInput(context)).toMatch(/json/i);
  });

  it('sends the scope and the labels, and no amounts', () => {
    const built = buildOmissionInput(context);
    expect(built).toContain('Tear off and replace.');
    expect(built).toContain('- Shingles');
    expect(built).not.toMatch(/\$\d/);
  });
});

describe('toOmissionFindings', () => {
  it('keeps a well-formed omission', () => {
    const [finding] = toOmissionFindings({
      omissions: [{ id: 'disposal', title: 'No disposal line', why: 'They mention tearing off old shingles.', confidence: 'high' }],
    });
    expect(finding.source).toBe('ai');
    expect(finding.title).toBe('No disposal line');
  });

  it('never lets a model finding outrank arithmetic', () => {
    // Even at the model's highest confidence, a suspicion sits below a number
    // that is definitely wrong.
    const [finding] = toOmissionFindings({ omissions: [{ title: 'A', why: 'B', confidence: 'high' }] });
    expect(finding.severity).toBe('medium');
  });

  it('discards anything that names a price', () => {
    // The instruction not to produce money is a request; this is the rule.
    expect(toOmissionFindings({ omissions: [{ title: 'Add disposal for $450', why: 'Tear-off debris.' }] })).toEqual([]);
    expect(toOmissionFindings({ omissions: [{ title: 'Add disposal', why: 'Usually around 300 dollars.' }] })).toEqual([]);
  });

  it('drops half-formed entries rather than rendering blanks', () => {
    expect(toOmissionFindings({ omissions: [{ title: 'A' }, { why: 'B' }, {}] })).toEqual([]);
  });

  it('returns an empty list for junk rather than throwing', () => {
    expect(toOmissionFindings(null)).toEqual([]);
    expect(toOmissionFindings({ omissions: 'lots' })).toEqual([]);
  });

  it('caps how many it will show', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, why: `W${i}` }));
    expect(toOmissionFindings({ omissions: many })).toHaveLength(5);
  });
});

describe('mergeFindings', () => {
  const math = (id: string, severity: QuoteFinding['severity']): QuoteFinding => ({ id, severity, title: id, detail: '', source: 'math' });
  const ai = (id: string, severity: QuoteFinding['severity']): QuoteFinding => ({ id, severity, title: id, detail: '', source: 'ai' });

  it('puts the worst first and arithmetic ahead of suspicion at equal severity', () => {
    const merged = mergeFindings([math('m1', 'medium'), math('m2', 'high')], [ai('a1', 'medium')]);
    expect(merged.map((f) => f.id)).toEqual(['m2', 'm1', 'a1']);
  });

  it('does not let the model repeat something already established', () => {
    const merged = mergeFindings([math('margin', 'high')], [{ ...ai('margin', 'low') }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('math');
  });
});

describe('guardSummary', () => {
  it('does not congratulate a clean quote', () => {
    const summary = guardSummary([]);
    expect(summary.tone).toBe('clear');
    expect(summary.message).toContain('not the same as correct');
  });

  it('counts what needs fixing', () => {
    const findings: QuoteFinding[] = [
      { id: 'a', severity: 'high', title: '', detail: '', source: 'math' },
      { id: 'b', severity: 'low', title: '', detail: '', source: 'ai' },
    ];
    expect(guardSummary(findings)).toEqual({ tone: 'stop', message: '1 thing worth fixing before this goes out.' });
  });
});
