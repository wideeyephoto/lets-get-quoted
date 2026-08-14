import { NextResponse } from 'next/server';
import { loadCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { isJobPhotoFile, uploadJobPhoto } from '@/lib/job-photo-storage';

/**
 * One photo, one request.
 *
 * The field app used to hand every photo to the server action alongside the
 * note, in a single multipart POST. On a site connection that meant the note
 * was hostage to the largest image, and a failure lost both. Uploading each
 * photo on its own — as it is picked, compressed, with progress — turns the
 * action into something that only ever receives storage paths.
 *
 * The path returned is account-scoped by uploadJobPhoto, and the form action
 * that later consumes it re-checks the prefix. Nothing here trusts a path from
 * a client, because nothing here ever accepts one.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const resolved = await loadCrewContext();
  if (!resolved.ok) {
    const status = resolved.reason === 'choose-business' ? 409 : 401;
    return NextResponse.json({ error: resolved.reason }, { status });
  }
  const { supabase, accountId, crew } = resolved.context;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Malformed upload.' }, { status: 400 });
  }

  // Assignment, not just a session: a crew member with a valid login must not be
  // able to put images into a job they were taken off.
  const jobId = String(form.get('jobId') ?? '').trim();
  if (!jobId) return NextResponse.json({ error: 'Missing job.' }, { status: 400 });
  if (!(await isJobAssignedToCrew(supabase, accountId, jobId, crew.id))) {
    return NextResponse.json({ error: 'You are not assigned to this job.' }, { status: 403 });
  }

  const file = form.get('photo');
  if (!isJobPhotoFile(file)) return NextResponse.json({ error: 'No photo in that upload.' }, { status: 400 });

  try {
    const path = await uploadJobPhoto(accountId, file);
    return NextResponse.json({ path });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save that photo.';
    console.error('Field photo upload failed:', message);
    // 4xx for the two messages that are about the FILE (type, size) — the
    // client shows them and there is no point retrying. Everything else is ours.
    const isFileProblem = /must be|smaller/i.test(message);
    return NextResponse.json({ error: message }, { status: isFileProblem ? 400 : 500 });
  }
}
