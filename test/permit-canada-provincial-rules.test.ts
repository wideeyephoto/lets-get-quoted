import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '../src/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '../src/lib/permit-intel/requirement-engine';

describe('Canadian Provincial Trade & Code Rules', () => {
  it('evaluates Ontario Electrical Safety Authority (ESA) and OBC roofing rules', () => {
    const onJurisdiction = resolveJurisdiction({
      raw: '100 University Ave, Toronto, ON M5J 2H7',
      city: 'Toronto',
      state: 'ON',
      formattedAddress: '100 University Ave, Toronto, ON M5J 2H7',
      isValid: true,
    });

    expect(onJurisdiction.authorityId).toBe('can-on-toronto');

    const elecResult = evaluatePermitRequirement(onJurisdiction.authorityId, {
      trade: 'electrical',
      scope: 'replacement',
      freeTextDescription: '200A service panel replacement and level 2 EV charger',
    });

    expect(elecResult.decision).toBe('required');
    expect(elecResult.permitTypes[0]).toContain('Electrical Safety Permit');
    expect(elecResult.citations[0].codeFamily).toBe('OESC');
    expect(elecResult.disclaimer).toContain('Skilled Trades Ontario');

    const roofResult = evaluatePermitRequirement(onJurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 16000,
    });

    expect(roofResult.decision).toBe('required');
    expect(roofResult.citations.some((c) => c.section.includes('9.26.5.1'))).toBe(true);
  });

  it('evaluates British Columbia Technical Safety BC & BCBC Zero Carbon Step Code', () => {
    const bcJurisdiction = resolveJurisdiction({
      raw: '500 Burrard St, Vancouver, BC V6C 3L6',
      city: 'Vancouver',
      state: 'BC',
      formattedAddress: '500 Burrard St, Vancouver, BC V6C 3L6',
      isValid: true,
    });

    expect(bcJurisdiction.authorityId).toBe('can-bc-vancouver');

    const hvacResult = evaluatePermitRequirement(bcJurisdiction.authorityId, {
      trade: 'mechanical',
      scope: 'replacement',
      freeTextDescription: 'Install heat pump and dual fuel system',
    });

    expect(hvacResult.decision).toBe('required');
    expect(hvacResult.citations[0].codeFamily).toBe('BCBC-M');
    expect(hvacResult.disclaimer).toContain('BC Housing');
  });

  it('evaluates Quebec CCQ and RBQ contractor qualification standards', () => {
    const qcJurisdiction = resolveJurisdiction({
      raw: '1000 Rue de la Gauchetiere O, Montreal, QC H3B 4W5',
      city: 'Montreal',
      state: 'QC',
      formattedAddress: '1000 Rue de la Gauchetiere O, Montreal, QC H3B 4W5',
      isValid: true,
    });

    expect(qcJurisdiction.authorityId).toBe('can-qc-montreal');

    const plumbResult = evaluatePermitRequirement(qcJurisdiction.authorityId, {
      trade: 'plumbing',
      scope: 'replacement',
      freeTextDescription: 'Remplacement chauffe-eau et tuyauterie',
    });

    expect(plumbResult.decision).toBe('required');
    expect(plumbResult.citations[0].codeFamily).toBe('CCQ-P');
    expect(plumbResult.disclaimer).toContain('RBQ');
  });

  it('exempts non-structural gutter work across Canada', () => {
    const abJurisdiction = resolveJurisdiction({
      raw: '800 5th Ave SW, Calgary, AB T2P 3T6',
      city: 'Calgary',
      state: 'AB',
      formattedAddress: '800 5th Ave SW, Calgary, AB T2P 3T6',
      isValid: true,
    });

    const gutterResult = evaluatePermitRequirement(abJurisdiction.authorityId, {
      trade: 'gutters',
      scope: 'replacement',
    });

    expect(gutterResult.decision).toBe('not_required');
    expect(gutterResult.confidence).toBe('high');
  });
});
