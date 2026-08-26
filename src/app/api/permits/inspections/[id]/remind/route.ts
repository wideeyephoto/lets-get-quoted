import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { sendHomeownerInspectionPrepReminder } from '@/lib/permit-intel/inspection-calendar-sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/permits/inspections/:id/remind
 * Dispatches an automated 24-hour homeowner inspection prep reminder SMS.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (membership.role !== 'owner' && !held.has('jobs.write')) {
    return NextResponse.json({ error: 'Permission jobs.write required.' }, { status: 403 });
  }

  let body: {
    authorityName?: string;
    inspectionType?: string;
    scheduledDate?: string;
    timeWindow?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    // Body optional if details are in permit case
  }

  // Fetch permit case details
  const { data: permitCase } = await supabase
    .from('permit_cases')
    .select('*')
    .eq('id', params.id)
    .eq('account_id', membership.accountId)
    .maybeSingle();

  if (!permitCase) {
    return NextResponse.json({ error: 'Permit case not found.' }, { status: 404 });
  }

  const authorityName = body.authorityName || permitCase.authority_name || 'Municipal Building Department';
  const inspectionType = body.inspectionType || permitCase.inspection_type || 'Building Inspection';
  const scheduledDate = body.scheduledDate || permitCase.scheduled_inspection_date || new Date().toISOString().slice(0, 10);
  const timeWindow = body.timeWindow;

  try {
    const result = await sendHomeownerInspectionPrepReminder(
      supabase,
      membership.accountId,
      permitCase.job_id,
      {
        authorityName,
        inspectionType,
        scheduledDate,
        timeWindow,
      },
    );

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      phone: result.phone,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send inspection reminder.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
