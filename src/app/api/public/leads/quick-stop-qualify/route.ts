import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { quickStopSettingsFromAccount, QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';
import { qualifyQuickStop, qualifyOptionsFromSettings, quickStopFollowUps } from '@/lib/quick-stop-qualify';
import { makeQuickStopVerdictToken } from '@/lib/quick-stop-verdict';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Real-time Quick Stop qualification for the /book flow. Stateless — it returns
// a verdict for display; the request row is only created when the customer
// actually submits (see the Quick Stop request action). Never throws to the
// client: any failure degrades to "not eligible" so booking still proceeds.
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  // Durable cross-instance limit on a paid-OpenAI endpoint (15/min per IP).
  if (!(await checkRateLimit(admin, `esqualify:ip:${ip}`, 15, 60))) {
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
    .select(QUICK_STOP_SETTINGS_COLUMNS)
    .eq('id', site.account_id)
    .maybeSingle();
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);

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

  const qualification = await qualifyQuickStop(
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

  // A "no" that came from the AI on a half-filled form isn't final — name the
  // boxes that were left blank so the flow can go back for them instead of
  // dead-ending someone who was one answer short.
  const followUps = quickStopFollowUps(qualification, { startedWhen, worsening, propertyType });

  // The answer, signed, so pressing "Send the request" honors what this screen
  // just said instead of rolling the AI again and possibly contradicting it.
  // Null for anything the screener decided — that layer is deterministic and
  // costs nothing to repeat. See lib/quick-stop-verdict.
  const verdictToken = makeQuickStopVerdictToken(
    site.account_id as string,
    { issue, startedWhen, worsening, propertyType },
    qualification,
  );

  return NextResponse.json({ enabled: true, ...qualification, followUps, verdictToken });
}
