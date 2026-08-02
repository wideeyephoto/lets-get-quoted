import { describe, it, expect } from 'vitest';
import {
  screenHardExclusions,
  QUICK_STOP_EXCLUSIONS,
  QUICK_STOP_SCOPE_QUESTIONS,
  quickStopFollowUps,
  unansweredScopeQuestions,
} from '@/lib/quick-stop-qualify';

describe('screenHardExclusions — unsafe conditions divert to safety', () => {
  const unsafeCases: [string, string][] = [
    ['I smell gas in the kitchen', 'gas_leak'],
    ['there is a gas leak near the meter', 'gas_leak'],
    ['the carbon monoxide alarm is going off', 'carbon_monoxide'],
    ['smoke coming from the wall outlet', 'fire_smoke'],
    ['the stove caught fire earlier', 'fire_smoke'],
    ['outlet is sparking and arcing', 'electrical_hazard'],
    ['I keep getting shocked by the panel', 'electrical_hazard'],
    ['the roof is sagging and might collapse', 'structural_failure'],
    ['basement is flooding right now', 'uncontrolled_flooding'],
    ['raw sewage backup in the bathroom', 'sewage'],
    ['there is black mold behind the drywall', 'mold_asbestos'],
    ['worried about asbestos in the old tiles', 'mold_asbestos'],
    ['a chemical spill in the garage', 'hazmat'],
  ];

  for (const [text, key] of unsafeCases) {
    it(`flags "${text}" as unsafe (${key}) with safety copy`, () => {
      const r = screenHardExclusions(text);
      expect(r.unsafe).toBe(true);
      expect(r.safety).toBeTruthy();
      expect(r.matched.some((m) => m.key === key)).toBe(true);
    });
  }
});

describe('screenHardExclusions — out-of-scope (not unsafe) still excluded', () => {
  const scopeCases: [string, string][] = [
    ['this will need a permit and inspection', 'permit_required'],
    ['need to excavate and dig a trench for the line', 'excavation'],
    ['time to replace the whole roof', 'large_replacement'],
    ['probably needs a crew of three guys', 'multi_worker'],
    ['this is a multi-day project', 'multi_day'],
    ['we will have to special-order the part', 'special_order'],
  ];

  for (const [text, key] of scopeCases) {
    it(`excludes "${text}" (${key}) without safety copy`, () => {
      const r = screenHardExclusions(text);
      expect(r.matched.some((m) => m.key === key)).toBe(true);
      expect(r.unsafe).toBe(false);
      expect(r.safety).toBeNull();
    });
  }
});

describe('screenHardExclusions — clean simple jobs pass through', () => {
  const clean = [
    'my kitchen faucet is dripping',
    'running toilet needs a new flapper',
    'replace a broken light switch cover',
    'garbage disposal is jammed',
    'install a smoke detector', // "smoke detector" must NOT trip fire_smoke
    'hang a ceiling fan',
  ];

  for (const text of clean) {
    it(`passes "${text}"`, () => {
      const r = screenHardExclusions(text);
      expect(r.matched).toHaveLength(0);
      expect(r.unsafe).toBe(false);
    });
  }
});

describe('rule integrity', () => {
  it('every rule has at least one pattern and a stable key', () => {
    const keys = new Set<string>();
    for (const rule of QUICK_STOP_EXCLUSIONS) {
      expect(rule.patterns.length).toBeGreaterThan(0);
      expect(keys.has(rule.key)).toBe(false);
      keys.add(rule.key);
      if (rule.unsafe) expect(rule.safety).toBeTruthy();
    }
  });
});

describe('going back for the answer that would have qualified them', () => {
  // The scoping questions are optional, so a blank one reaches the model as
  // "(unknown)" and a request can be turned away for an ambiguity that was
  // really three empty boxes. These decide when it's worth asking again.
  const aiNo = { eligible: false, unsafe: false, decidedBy: 'ai' as const };
  const allBlank = { startedWhen: '', worsening: '', propertyType: '' };

  it('asks for every question still unanswered', () => {
    expect(quickStopFollowUps(aiNo, allBlank).map((q) => q.key)).toEqual([
      'startedWhen',
      'worsening',
      'propertyType',
    ]);
  });

  it('only asks for what is actually missing', () => {
    const partial = { startedWhen: 'This morning', worsening: '', propertyType: 'house' };
    expect(quickStopFollowUps(aiNo, partial).map((q) => q.key)).toEqual(['worsening']);
  });

  it('treats whitespace and null as unanswered', () => {
    expect(unansweredScopeQuestions({ startedWhen: '   ', worsening: null, propertyType: undefined })).toHaveLength(3);
  });

  it('asks nothing once every box is filled', () => {
    const full = { startedWhen: 'Tuesday', worsening: 'no', propertyType: 'condo' };
    expect(quickStopFollowUps(aiNo, full)).toHaveLength(0);
  });

  it('never re-asks after an unsafe verdict', () => {
    // A gas leak stays a gas leak. Inviting another go at the form would sit
    // directly under emergency instructions and undermine them.
    expect(quickStopFollowUps({ ...aiNo, unsafe: true }, allBlank)).toHaveLength(0);
  });

  it('never re-asks after the deterministic screener said no', () => {
    // It matches patterns in the combined text, and more text can only ADD
    // matches — never clear one. Offering a retry would offer something that
    // cannot work.
    expect(quickStopFollowUps({ ...aiNo, decidedBy: 'screener' }, allBlank)).toHaveLength(0);
  });

  it('never re-asks when the AI was unavailable', () => {
    // Nothing the customer types reaches a model that isn't there.
    expect(quickStopFollowUps({ ...aiNo, decidedBy: 'unavailable' }, allBlank)).toHaveLength(0);
  });

  it('asks nothing of a request that already qualified', () => {
    expect(quickStopFollowUps({ ...aiNo, eligible: true }, allBlank)).toHaveLength(0);
  });

  it('only names questions the AI actually receives', () => {
    // availability feeds the deterministic screener but is NOT in the model's
    // prompt, so pointing at it would point at a box that changes nothing.
    const keys = QUICK_STOP_SCOPE_QUESTIONS.map((q) => q.key);
    expect(keys).not.toContain('availability');
    expect(keys).not.toContain('issue');
    for (const question of QUICK_STOP_SCOPE_QUESTIONS) expect(question.label).toBeTruthy();
  });
});
