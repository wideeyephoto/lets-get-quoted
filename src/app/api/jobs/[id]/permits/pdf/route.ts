import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { compilePermitApplication, generatePermitApplicationPdf } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/jobs/:id/permits/pdf
 * Generates and streams an official Municipal Permit Application Packet PDF for the job.
 */
export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
) {
  const params = await paramsPromise;
  const supabase = await createSupabaseServerClient();
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

  if (membership.role !== 'owner' && !held.has('jobs.read')) {
    return NextResponse.json({ error: 'Permission jobs.read required.' }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
  }

  try {
    const packetData = await compilePermitApplication(
      supabase,
      membership.accountId,
      params.id,
    );

    if (!packetData) {
      return NextResponse.json({ error: 'Unable to compile permit application data for this job.' }, { status: 404 });
    }

    const pdfBuffer = await generatePermitApplicationPdf(packetData);
    const safeRef = packetData.property.streetAddress.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Permit-Application-${safeRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error generating permit PDF:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
