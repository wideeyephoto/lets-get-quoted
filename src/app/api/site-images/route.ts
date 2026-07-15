import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { uploadSiteImage } from '@/lib/site-image-storage';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to upload images.' }, { status: 401 });
  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  const data = await request.formData();
  const file = data.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await uploadSiteImage(membership.accountId, file), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Image upload failed.' }, { status: 400 });
  }
}