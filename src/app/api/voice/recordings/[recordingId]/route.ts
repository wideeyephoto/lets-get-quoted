import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: { recordingId: string } },
) {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.read');
    const recordingId = params.recordingId;

    if (!recordingId) {
      return NextResponse.json({ error: 'missing_recording_id' }, { status: 400 });
    }

    const { data: call, error } = await supabase
      .from('voice_calls')
      .select('id, recording_status, recording_storage_path, recording_duration_seconds, started_at')
      .eq('id', recordingId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error || !call) {
      return NextResponse.json({ error: 'recording_not_found' }, { status: 404 });
    }

    if (call.recording_status !== 'ready' || !call.recording_storage_path) {
      return NextResponse.json({ error: 'recording_not_available' }, { status: 404 });
    }

    const storageUrl = call.recording_storage_path;

    // If it's a remote URL from the provider, stream or redirect with private no-store headers
    if (storageUrl.startsWith('http://') || storageUrl.startsWith('https://')) {
      // In production, we can proxy or redirect with short expiration
      return NextResponse.redirect(storageUrl, {
        status: 307,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
        },
      });
    }

    return NextResponse.json({ error: 'unsupported_storage_format' }, { status: 500 });
  } catch (error) {
    console.error('Error fetching voice recording audio:', error);
    return NextResponse.json({ error: 'unauthorized_or_unavailable' }, { status: 403 });
  }
}
