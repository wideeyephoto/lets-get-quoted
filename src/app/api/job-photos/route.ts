import { NextResponse } from 'next/server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { addJobPhotos, getJob, removeJobPhoto, reorderJobPhotos } from '@/lib/jobs';
import { createJobPhotoUrls, deleteJobPhotos, uploadJobPhoto } from '@/lib/job-photo-storage';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

async function requireOwnerMembership() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in to manage photos.' }, { status: 401 }) };

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') {
    return { error: NextResponse.json({ error: 'Owner access required.' }, { status: 403 }) };
  }

  return { accountId: membership.accountId };
}

export async function POST(request: Request) {
  const auth = await requireOwnerMembership();
  if (auth.error) return auth.error;

  const data = await request.formData();
  const jobId = data.get('jobId');
  const file = data.get('image');
  if (typeof jobId !== 'string' || !jobId) {
    return NextResponse.json({ error: 'Missing job.' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const job = await getJob(admin, auth.accountId, jobId);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

  try {
    const path = await uploadJobPhoto(auth.accountId, file);
    await addJobPhotos(admin, auth.accountId, jobId, [path]);
    const [url] = await createJobPhotoUrls(auth.accountId, [path]);
    return NextResponse.json({ path, url }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Photo upload failed.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOwnerMembership();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const jobId = body?.jobId;
  const path = body?.path;
  if (typeof jobId !== 'string' || typeof path !== 'string' || !jobId || !path) {
    return NextResponse.json({ error: 'Missing job or photo.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await removeJobPhoto(admin, auth.accountId, jobId, path);
    await deleteJobPhotos(auth.accountId, [path]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to remove photo.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOwnerMembership();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const jobId = body?.jobId;
  const paths = body?.paths;
  if (typeof jobId !== 'string' || !jobId || !Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    return NextResponse.json({ error: 'Missing job or photo order.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await reorderJobPhotos(admin, auth.accountId, jobId, paths);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to reorder photos.' }, { status: 400 });
  }
}
