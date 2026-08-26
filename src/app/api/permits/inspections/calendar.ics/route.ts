import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { generateInspectionIcsFeed, type InspectionCalendarEvent } from '@/lib/permit-intel/inspection-calendar-sync';

export const dynamic = 'force-dynamic';

/**
 * GET /api/permits/inspections/calendar.ics
 * Returns an RFC 5545 iCalendar feed of active municipal permit inspections for the contractor workspace.
 */
export async function GET(_request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse('Sign in required.', { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return new NextResponse('No active workspace.', { status: 403 });
  }

  try {
    // Fetch upcoming scheduled permit inspections
    const { data: cases } = await supabase
      .from('permit_cases')
      .select('id, permit_number, authority_name, scheduled_inspection_date, inspection_type, inspection_status, job_id, notes')
      .eq('account_id', membership.accountId)
      .not('scheduled_inspection_date', 'is', null);

    const events: InspectionCalendarEvent[] = [];

    if (cases && cases.length > 0) {
      for (const c of cases) {
        events.push({
          id: c.id,
          permitNumber: c.permit_number || 'Pending',
          inspectionType: c.inspection_type || 'Building Inspection',
          authorityName: c.authority_name || 'Municipal Building Department',
          scheduledDate: c.scheduled_inspection_date,
          jobAddress: 'Job Site Address',
          contractorName: 'Let\'s Get Quoted Contractor',
          notes: c.notes,
          status: c.inspection_status === 'passed' ? 'passed' : c.inspection_status === 'failed' ? 'failed' : 'scheduled',
        });
      }
    }

    const icsContent = generateInspectionIcsFeed('Municipal Permit Inspections - Let\'s Get Quoted', events);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="permit-inspections.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate calendar feed.';
    return new NextResponse(message, { status: 500 });
  }
}
