import { describe, it, expect } from 'vitest';
import {
  classifyWorkScope,
  evaluatePermitRequirement,
} from '../src/lib/permit-intel/requirement-engine';
import { getApplicableCodes, getLocalAmendments } from '../src/lib/permit-intel/code-catalog';

describe('Permit Intelligence - Requirement Engine & Code Catalog', () => {
  it('determines that residential roof replacement in Royal Oak requires a permit', () => {
    const work = classifyWorkScope('Tear off existing shingles and install GAF Timberline HDZ 24 squares');
    expect(work.trade).toBe('roofing');
    expect(work.scope).toBe('replacement');
    expect(work.roofSquares).toBe(24);

    const result = evaluatePermitRequirement('mi-royal-oak', work);
    expect(result.decision).toBe('required');
    expect(result.confidence).toBe('verified');
    expect(result.permitTypes).toContain('Residential Building Permit (Roofing)');
    expect(result.requiredDocuments.length).toBeGreaterThan(0);
    expect(result.requiredInspections.length).toBeGreaterThan(0);
    expect(result.estimatedGovernmentFee).not.toBeNull();
    expect(result.estimatedGovernmentFee?.estimatedTotal).toBeGreaterThan(100);
  });

  it('determines that minor spot repairs (< 1 square) do not require a permit', () => {
    const work = classifyWorkScope('Minor roof repair replacing 5 damaged shingle tabs after wind storm');
    expect(work.trade).toBe('roofing');
    expect(work.scope).toBe('repair');

    const result = evaluatePermitRequirement('mi-royal-oak', { ...work, roofSquares: 0.5 });
    expect(result.decision).toBe('not_required');
    expect(result.confidence).toBe('verified');
    expect(result.reasons[0]).toContain('exempt');
  });

  it('determines that gutter replacement does not require a building permit', () => {
    const work = classifyWorkScope('Replace seamless aluminum 5-inch gutters and downspouts');
    expect(work.trade).toBe('gutters');

    const result = evaluatePermitRequirement('mi-royal-oak', work);
    expect(result.decision).toBe('not_required');
  });

  it('CRITICAL SAFETY: defaults to verify (never not_required) for unverified rules/jurisdictions', () => {
    const work = classifyWorkScope('Custom architectural modification of non-standard commercial roof');
    const result = evaluatePermitRequirement('unknown-unverified-city', work);

    expect(result.decision).toBe('verify');
    expect(result.confidence).toBe('low');
    expect(result.decision).not.toBe('not_required');
  });

  it('retrieves copyright-safe 2015 MRC code citations and Royal Oak local ordinances', () => {
    const codes = getApplicableCodes('mi-royal-oak');
    expect(codes.length).toBeGreaterThan(0);
    expect(codes[0].codeFamily).toContain('Michigan Residential Code');
    expect(codes[0].editionYear).toBe('2015');

    const references = codes[0].references;
    expect(references.some((r) => r.section === 'R908.3')).toBe(true);
    expect(references.some((r) => r.section === 'R905.1.2')).toBe(true);

    const amendments = getLocalAmendments('mi-royal-oak');
    expect(amendments.length).toBeGreaterThan(0);
    expect(amendments[0].title).toContain('Contractor Registration');
  });
});
