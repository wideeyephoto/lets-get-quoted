import { NextResponse } from 'next/server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { addLeadPhotos, getLead, removeLeadPhoto, reorderLeadPhotos } from '@/lib/leads';
import { createLeadPhotoUrls, deleteLeadPhotos, uploadLeadPhoto } from '@/lib/lead-photo-storage';
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
  const leadId = data.get('leadId');
  const file = data.get('image');
  if (typeof leadId !== 'string' || !leadId) {
    return NextResponse.json({ error: 'Missing lead.' }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a photo to upload.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const lead = await getLead(admin, auth.accountId, leadId);
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  try {
    const path = await uploadLeadPhoto(auth.accountId, file);
    await addLeadPhotos(admin, auth.accountId, leadId, [path]);
    const [url] = await createLeadPhotoUrls(auth.accountId, [path]);
    return NextResponse.json({ path, url }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Photo upload failed.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOwnerMembership();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const leadId = body?.leadId;
  const path = body?.path;
  if (typeof leadId !== 'string' || typeof path !== 'string' || !leadId || !path) {
    return NextResponse.json({ error: 'Missing lead or photo.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await removeLeadPhoto(admin, auth.accountId, leadId, path);
    await deleteLeadPhotos(auth.accountId, [path]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to remove photo.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOwnerMembership();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const leadId = body?.leadId;
  const paths = body?.paths;
  if (typeof leadId !== 'string' || !leadId || !Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) {
    return NextResponse.json({ error: 'Missing lead or photo order.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await reorderLeadPhotos(admin, auth.accountId, leadId, paths);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to reorder photos.' }, { status: 400 });
  }
}
