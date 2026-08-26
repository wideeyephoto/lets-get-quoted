import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getJob } from '@/lib/jobs';
import { listPermitDocuments, registerPermitDocument } from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/jobs/:id/permits/documents
 * List all permit documents attached to a job.
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

    const documents = await listPermitDocuments(supabase, membership.accountId, params.id);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Error fetching permit documents:', error);
    return NextResponse.json({ error: 'Failed to fetch permit documents.' }, { status: 500 });
  }
}

/**
 * POST /api/jobs/:id/permits/documents
 * Registers a new permit document attachment.
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
    if (!payload?.fileName || !payload?.storagePath) {
      return NextResponse.json({ error: 'fileName and storagePath are required.' }, { status: 400 });
    }

    const doc = await registerPermitDocument(supabase, membership.accountId, params.id, {
      permitCaseId: payload.permitCaseId,
      documentType: payload.documentType || 'application_draft',
      fileName: payload.fileName,
      fileSizeBytes: Number(payload.fileSizeBytes || 0),
      mimeType: payload.mimeType || 'application/pdf',
      storagePath: payload.storagePath,
      sha256Hash: payload.sha256Hash,
      uploadedBy: user.id,
    });

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    console.error('Error registering permit document:', error);
    return NextResponse.json({ error: 'Failed to register permit document.' }, { status: 500 });
  }
}
