import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { compileInspectionPhotoAffidavit, type InspectionPhotoMilestone } from '@/lib/permit-intel/field-photo-affidavit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/permits/inspections/:id/affidavit
 * Compiles a geotagged, timestamp-verified remote municipal photo inspection affidavit.
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
    tradeMilestone: InspectionPhotoMilestone;
    jobAddress?: string;
    jobCoordinates: { latitude: number; longitude: number };
    photos: Array<{
      photoId: string;
      photoUrl: string;
      milestone: InspectionPhotoMilestone;
      caption: string;
      takenAt: string;
      coordinates: { latitude: number; longitude: number };
    }>;
    signatoryName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.jobCoordinates || !body.photos || body.photos.length === 0) {
    return NextResponse.json({ error: 'jobCoordinates and at least 1 photo are required.' }, { status: 400 });
  }

  // Fetch permit case
  const { data: permitCase } = await supabase
    .from('permit_cases')
    .select('*')
    .eq('id', params.id)
    .eq('account_id', membership.accountId)
    .maybeSingle();

  const permitNumber = permitCase?.permit_number || `PERMIT-${params.id.slice(0, 8)}`;
  const authorityName = permitCase?.authority_name || 'Municipal Building Department';
  const jobAddress = body.jobAddress || 'Job Site Location';

  const affidavit = compileInspectionPhotoAffidavit({
    permitNumber,
    authorityName,
    jobAddress,
    jobCoordinates: body.jobCoordinates,
    contractor: {
      companyName: 'Let\'s Get Quoted Contractor',
      qualifyingOfficer: body.signatoryName || 'Qualifying Contractor',
      licenseNumber: 'Active State License',
    },
    tradeMilestone: body.tradeMilestone || 'ice_barrier_dryin',
    rawPhotos: body.photos,
    signatoryName: body.signatoryName,
  });

  return NextResponse.json({
    success: true,
    affidavit,
  });
}
