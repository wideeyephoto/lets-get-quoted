import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function integer(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export async function POST(req: Request) {
  try {
    let payload: Record<string, unknown> = {};
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    } else if (contentType.includes('form')) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        formData.forEach((value, key) => {
          payload[key] = value;
        });
      }
    }

    const providerCallId = text(payload.call_id) ?? text(payload.CallSid) ?? text(payload.call_sid);
    if (!providerCallId) {
      return NextResponse.json({ error: 'missing_call_id' }, { status: 400 });
    }

    const statusRaw = (text(payload.recording_status) ?? text(payload.RecordingStatus) ?? 'completed').toLowerCase();
    const isCompleted = statusRaw === 'completed' || statusRaw === 'ready';

    const recordingUrl = text(payload.recording_url) ?? text(payload.RecordingUrl);
    const durationSeconds = integer(payload.recording_duration) ?? integer(payload.RecordingDuration);
    const sizeBytes = integer(payload.recording_size) ?? integer(payload.RecordingSize);

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { error } = await admin
      .from('voice_calls')
      .update({
        recording_status: isCompleted ? 'ready' : 'failed',
        recording_storage_path: isCompleted ? recordingUrl : null,
        recording_duration_seconds: durationSeconds,
        recording_size_bytes: sizeBytes,
        recording_content_type: 'audio/mp3',
        recording_captured_at: nowIso,
      })
      .eq('provider', 'signalwire')
      .eq('provider_call_id', providerCallId);

    if (error) {
      console.error('Failed to update voice recording status:', error);
      return NextResponse.json({ error: 'database_error' }, { status: 500 });
    }

    return NextResponse.json({ received: true, call_id: providerCallId });
  } catch (error) {
    console.error('Unexpected error processing recording status callback:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
