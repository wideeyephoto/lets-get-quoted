import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { isTrustedVoiceMediaUrl } from '@/lib/voice/auth';

export async function GET(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ recordingId: string }> },
) {
  const params = await paramsPromise;
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

    // Validate that the media URL is a secure HTTPS link from trusted provider/storage hostnames
    if (storageUrl.startsWith('https://')) {
      if (!isTrustedVoiceMediaUrl(storageUrl)) {
        return NextResponse.json({ error: 'untrusted_storage_host' }, { status: 403 });
      }

      const media = new URL(storageUrl);
      const configured = process.env.SIGNALWIRE_SPACE_URL || '';
      const providerHost = configured.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      const headers: Record<string, string> = {};
      if (media.hostname === providerHost && process.env.SIGNALWIRE_PROJECT_ID && process.env.SIGNALWIRE_API_TOKEN) {
        headers.Authorization = `Basic ${Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64')}`;
      }
      const range = req.headers.get('range');
      if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
      // Do not disclose permanent provider URLs or forward credentials through redirects.
      let currentUrl = storageUrl;
      let audio: Response | null = null;
      for (let hop = 0; hop < 4; hop += 1) {
        const hopHeaders = { ...headers };
        if (new URL(currentUrl).origin !== media.origin) delete hopHeaders.Authorization;
        audio = await fetch(currentUrl, { headers: hopHeaders, redirect: 'manual', signal: AbortSignal.timeout(15000), cache: 'no-store' });
        if (![301, 302, 303, 307, 308].includes(audio.status)) break;
        const location = audio.headers.get('location');
        await audio.body?.cancel();
        if (!location) return NextResponse.json({ error: 'invalid_media_redirect' }, { status: 502 });
        currentUrl = new URL(location, currentUrl).toString();
        if (!isTrustedVoiceMediaUrl(currentUrl)) return NextResponse.json({ error: 'untrusted_media_redirect' }, { status: 502 });
      }
      if (!audio?.ok || !audio.body) return NextResponse.json({ error: 'recording_provider_unavailable' }, { status: 502 });
      const responseHeaders = new Headers({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      for (const name of ['content-length', 'content-range', 'accept-ranges']) {
        const value = audio.headers.get(name); if (value) responseHeaders.set(name, value);
      }
      return new Response(audio.body, { status: audio.status, headers: responseHeaders });
    }

    return NextResponse.json({ error: 'unsupported_storage_format' }, { status: 500 });
  } catch (error) {
    console.error('Error fetching voice recording audio:', error);
    return NextResponse.json({ error: 'unauthorized_or_unavailable' }, { status: 403 });
  }
}
