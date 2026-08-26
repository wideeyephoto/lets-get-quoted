import { describe, it, expect } from 'vitest';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';
import type { LeadTriage } from '@/lib/leads';

describe('Public Lead Intake Permit Triage Tagging', () => {
  it('correctly builds permit triage metadata for a Michigan lead address', () => {
    const location = '211 S Williams St, Royal Oak, MI';
    const jurisdiction = resolveJurisdiction({
      raw: location,
      city: location,
      state: 'MI',
      formattedAddress: location,
      isValid: true,
    });

    const req = evaluatePermitRequirement(jurisdiction.authorityId, {
      trade: 'roofing',
      scope: 'replacement',
      estimatedCost: 11000,
    });

    const triage: LeadTriage = {
      score: 'hot',
      flags: ['high_value'],
      location,
      estimate: { min: 8000, max: 11000 },
      permit: {
        required: req.decision === 'required',
        authorityName: jurisdiction.authorityName,
        estimatedFee: req.estimatedGovernmentFee?.estimatedTotal ?? null,
      },
    };

    expect(triage.permit).toBeDefined();
    expect(triage.permit?.required).toBe(true);
    expect(triage.permit?.authorityName).toBe('City of Royal Oak');
    expect(triage.permit?.estimatedFee).toBeGreaterThan(0);
  });
});
