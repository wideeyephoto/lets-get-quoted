import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { verifyVoiceReceiptAuthorization, verifySignedVoiceWebhook, isTrustedVoiceMediaUrl } from '@/lib/voice/auth';

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function integer(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function isValidRecordingUrl(urlStr: string): boolean {
  return isTrustedVoiceMediaUrl(urlStr);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.clone().text();
    const signature = verifySignedVoiceWebhook(req, rawBody);
    const authCheck = verifyVoiceReceiptAuthorization(req);
    if (!signature.ok && !authCheck.ok && authCheck.reason === 'not_configured') {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }
    if (!signature.ok && !authCheck.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const params = payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params) ? payload.params as Record<string, unknown> : {};
    payload = { ...payload, ...params };
    const providerCallId = text(payload.call_id) ?? text(payload.CallSid) ?? text(payload.call_sid);
    if (!providerCallId) {
      return NextResponse.json({ error: 'missing_call_id' }, { status: 400 });
    }

    const statusRaw = (text(payload.recording_status) ?? text(payload.RecordingStatus) ?? text(payload.state) ?? 'unknown').toLowerCase();
    const isCompleted = statusRaw === 'completed' || statusRaw === 'ready' || statusRaw === 'finished';

    const recordingUrl = text(payload.recording_url) ?? text(payload.RecordingUrl) ?? text(payload.url);
    if (recordingUrl && !isValidRecordingUrl(recordingUrl)) {
      return NextResponse.json({ error: 'invalid_recording_url' }, { status: 400 });
    }

    if (isCompleted && !recordingUrl) return NextResponse.json({ error: 'missing_recording_url' }, { status: 400 });
    const pending = ['recording', 'paused', 'in-progress', 'pending'].includes(statusRaw);
    if (!isCompleted && !pending && !['failed', 'error', 'no_input', 'absent'].includes(statusRaw)) return NextResponse.json({ error: 'invalid_recording_status' }, { status: 400 });
    const durationSeconds = integer(payload.recording_duration) ?? integer(payload.RecordingDuration) ?? (typeof payload.duration === 'number' && Number.isFinite(payload.duration) && payload.duration >= 0 ? Math.ceil(payload.duration) : null);
    const sizeBytes = integer(payload.recording_size) ?? integer(payload.RecordingSize) ?? integer(payload.size);

    const admin = createAdminClient();
    const callbackUrl = new URL(req.url);
    const { error } = await admin.rpc('apply_voice_recording_observation', {
      p_call_id: providerCallId,
      p_status: isCompleted ? 'ready' : pending ? 'pending' : 'failed',
      p_url: isCompleted ? recordingUrl : null,
      p_duration: durationSeconds, p_size: sizeBytes,
      // Only provider-signed recovery URLs can supply inventory attribution.
      p_to_number: signature.ok ? callbackUrl.searchParams.get('to') : null,
      p_caller: signature.ok ? callbackUrl.searchParams.get('from') : null,
    });

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
