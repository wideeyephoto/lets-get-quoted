import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { resolvePortalAccess } from '@/lib/client-portal';
import { loadPortal } from '@/lib/client-portal-data';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ token: string; planId: string }> }
) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, params.token);
  if (!access) return new NextResponse('Not found', { status: 404 });

  const portal = await loadPortal(admin, access.accountId, access.clientId);
  const plan = portal.plans.find(p => p.id === params.planId);
  if (!plan || !plan.nextRunDate) return new NextResponse('Not found', { status: 404 });

  const date = plan.nextRunDate.replace(/-/g, '');
  
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//LetsGetQuoted//NONSGML v1.0//EN
BEGIN:VEVENT
UID:${plan.id}@letsgetquoted.com
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART;VALUE=DATE:${date}
SUMMARY:Upcoming Service - ${portal.businessName}
DESCRIPTION:Upcoming ${plan.title || 'service'} from ${portal.businessName}
END:VEVENT
END:VCALENDAR`;

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="appointment.ics"`,
    },
  });
}
