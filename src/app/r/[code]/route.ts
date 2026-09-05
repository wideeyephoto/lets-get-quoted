import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ code: string }> }
) {
  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();
  const allowed = await checkRateLimit(admin, `redirect:ip:${ip}`, 120, 60);
  if (!allowed) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  const params = await paramsPromise;
  const rawCode = params?.code ? decodeURIComponent(params.code).toLowerCase().trim() : '';

  if (!rawCode) {
    return NextResponse.redirect(new URL('/', request.url), 307);
  }
  const { data: link, error } = await admin
    .from('marketing_tracking_links')
    .select('id, full_url, destination_url, scan_count')
    .eq('short_code', rawCode)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !link) {
    return NextResponse.redirect(new URL('/', request.url), 307);
  }

  const newScanCount = (link.scan_count || 0) + 1;
  const nowIso = new Date().toISOString();

  admin
    .from('marketing_tracking_links')
    .update({
      scan_count: newScanCount,
      last_scanned_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', link.id)
    .then(
      () => {},
      (err) => console.error(`Failed to record tracking scan for ${rawCode}:`, err)
    );

  const destination = link.full_url || link.destination_url || '/';
  return NextResponse.redirect(destination, 307);
}