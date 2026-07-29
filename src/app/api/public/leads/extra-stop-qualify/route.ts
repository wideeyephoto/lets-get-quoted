import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { extraStopSettingsFromAccount, EXTRA_STOP_SETTINGS_COLUMNS } from '@/lib/extra-stop';
import { qualifyExtraStop, qualifyOptionsFromSettings } from '@/lib/extra-stop-qualify';

export const runtime = 'nodejs';

// Cheap in-memory deterrent against scripted abuse of a public, AI-backed
// endpoint (mirrors classify-estimate). Resets on cold start — not a real
// distributed limiter.
const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  history.push(now);
  requestLog.set(ip, history);
  return history.length > RATE_LIMIT_MAX;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Real-time Extra Stop qualification for the /book flow. Stateless — it returns
// a verdict for display; the request row is only created when the customer
// actually submits (see the Extra Stop request action). Never throws to the
// client: any failure degrades to "not eligible" so booking still proceeds.
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = str(body?.siteId, 80);
  const issue = str(body?.issue, 500);
  const startedWhen = str(body?.startedWhen, 120);
  const worsening = str(body?.worsening, 60);
  const propertyType = str(body?.propertyType, 60);
  const availability = str(body?.availability, 300);
  const photoCount = Number.isFinite(Number(body?.photoCount)) ? Math.max(0, Math.round(Number(body.photoCount))) : 0;

  if (!siteId || !issue) {
    return NextResponse.json({ error: 'Describe the issue first.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: site } = await admin
    .from('sites')
    .select('id, account_id, company_name, service_area, published')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  const { data: accountRow } = await admin
    .from('accounts')
    .select(EXTRA_STOP_SETTINGS_COLUMNS)
    .eq('id', site.account_id)
    .maybeSingle();
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);

  if (!settings.enabled) {
    return NextResponse.json({ enabled: false, eligible: false });
  }

  // Required-photos gate — enforced before spending an AI call.
  if (settings.requiredPhotos > 0 && photoCount < settings.requiredPhotos) {
    return NextResponse.json({
      enabled: true,
      eligible: false,
      needsPhotos: true,
      requiredPhotos: settings.requiredPhotos,
      reason: `Please attach at least ${settings.requiredPhotos} photo${settings.requiredPhotos === 1 ? '' : 's'} of the issue.`,
    });
  }

  const qualification = await qualifyExtraStop(
    {
      issue,
      startedWhen,
      worsening,
      propertyType,
      availability,
      businessName: (site.company_name as string) || '',
      serviceArea: (site.service_area as string) || '',
    },
    qualifyOptionsFromSettings(settings),
  );

  return NextResponse.json({ enabled: true, ...qualification });
}
