import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import {
  compilePermitApplication,
  generatePermitApplicationHtml,
  registerPermitDocument,
  updatePermitCase,
} from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/jobs/:id/permits/application
 * Compiles a prefilled Building Permit Application dataset and printable HTML.
 */
export async function GET(
  _request: Request,
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

  if (membership.role !== 'owner' && !held.has('jobs.read')) {
    return NextResponse.json({ error: 'Permission jobs.read required.' }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
  }

  try {
    const job = await getJob(supabase, membership.accountId, params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const applicationData = await compilePermitApplication(
      supabase,
      membership.accountId,
      params.id,
    );

    const html = generatePermitApplicationHtml(applicationData);

    return NextResponse.json({ data: applicationData, html });
  } catch (error) {
    console.error('Error compiling permit application:', error);
    return NextResponse.json({ error: 'Failed to compile permit application.' }, { status: 500 });
  }
}

/**
 * POST /api/jobs/:id/permits/application
 * Saves the drafted application payload into job_permit_documents and advances status.
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

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id format.' }, { status: 400 });
  }

  try {
    const job = await getJob(supabase, membership.accountId, params.id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const payload = await request.json();
    const addressSafe = (job.address || params.id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const fileName = `Permit-Application-${addressSafe}.html`;

    const doc = await registerPermitDocument(
      supabase,
      membership.accountId,
      params.id,
      {
        documentType: 'application_draft',
        fileName,
        fileSizeBytes: (payload?.html || '').length || 1024,
        mimeType: 'text/html',
        storagePath: `permits/${membership.accountId}/${params.id}/${fileName}`,
        uploadedBy: user.id,
      },
    );

    await updatePermitCase(
      supabase,
      membership.accountId,
      params.id,
      { applicationStatus: 'ready_for_review' },
      user.email || 'Office',
    );

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    console.error('Error saving permit application draft:', error);
    return NextResponse.json({ error: 'Failed to save application draft.' }, { status: 500 });
  }
}
