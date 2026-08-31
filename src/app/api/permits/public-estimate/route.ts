import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';
import { resolveJurisdiction } from '@/lib/location-context/jurisdiction-resolver';
import { normalizeAddress } from '@/lib/location-context/normalize-address';
import { evaluatePermitRequirement } from '@/lib/permit-intel/requirement-engine';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = clientIpFrom(request.headers);
  const rateKey = `permit-public-estimate:${ip || 'anon'}`;
  const admin = createAdminClient();
  const allowed = await checkRateLimitStrict(admin, rateKey, 30, 60);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many permit estimation requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const address = (searchParams.get('address') || '').trim();
  const tradeRaw = (searchParams.get('trade') || 'roofing').toLowerCase();
  const cost = Math.max(0, Number(searchParams.get('cost')) || 8500);

  if (!address) {
    return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
  }

  const tradeKey: 'roofing' | 'electrical' | 'mechanical' | 'plumbing' | 'gutters' =
    tradeRaw.includes('elec') || tradeRaw.includes('ev') || tradeRaw.includes('panel')
      ? 'electrical'
      : tradeRaw.includes('mech') || tradeRaw.includes('hvac') || tradeRaw.includes('furnace') || tradeRaw.includes('ac')
      ? 'mechanical'
      : tradeRaw.includes('plumb') || tradeRaw.includes('water')
      ? 'plumbing'
      : tradeRaw.includes('gutter')
      ? 'gutters'
      : 'roofing';

  const discipline: JurisdictionDiscipline =
    tradeKey === 'electrical' || tradeKey === 'mechanical' || tradeKey === 'plumbing'
      ? tradeKey
      : 'building';

  const parsedAddress = normalizeAddress(address);
  const jurisdiction = resolveJurisdiction(parsedAddress, discipline);

  const requirement = evaluatePermitRequirement(jurisdiction.authorityId, {
    trade: tradeKey,
    scope: 'replacement',
    estimatedCost: cost,
    roofSquares: Math.max(10, Math.round(cost / 450)),
  });

  return NextResponse.json({
    ok: true,
    jurisdiction: {
      authorityId: jurisdiction.authorityId,
      authorityName: jurisdiction.authorityName,
      agencyName: jurisdiction.agencyName,
      enforcementLevel: jurisdiction.enforcementLevel,
      county: jurisdiction.county,
      state: jurisdiction.state,
      cityOrTownship: jurisdiction.cityOrTownship,
      sourceUrl: jurisdiction.sourceUrl,
    },
    requirement: {
      decision: requirement.decision,
      permitTypes: requirement.permitTypes,
      requiredInspections: requirement.requiredInspections,
      requiredDocuments: requirement.requiredDocuments,
      estimatedGovernmentFee: requirement.estimatedGovernmentFee,
      citations: requirement.citations.map((c) => ({
        codeFamily: c.codeFamily,
        editionYear: c.editionYear,
        section: c.section,
        title: c.title,
        plainEnglishSummary: c.plainEnglishSummary,
      })),
      reasons: requirement.reasons,
      confidence: requirement.confidence,
      disclaimer: requirement.disclaimer,
    },
  });
}
