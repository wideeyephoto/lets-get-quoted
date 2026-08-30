import { NextRequest, NextResponse } from 'next/server';
import { getPermitIntelligence } from '@/lib/permit-intel/permit-service';
import { getPropertyPermitHistory } from '@/lib/permit-intel/permit-history-service';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  if (!(await checkRateLimit(admin, `permitprev:ip:${ip}`, 30, 60))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const discipline = (searchParams.get('discipline') || 'building') as JurisdictionDiscipline;

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  try {
    const dto = await getPermitIntelligence({ address, discipline });
    const history = await getPropertyPermitHistory(address);
    return NextResponse.json({ ok: true, data: dto, history });
  } catch (error) {
    console.warn('Failed to resolve permit preview:', error);
    return NextResponse.json({ error: 'Failed to resolve permit intelligence' }, { status: 500 });
  }
}
