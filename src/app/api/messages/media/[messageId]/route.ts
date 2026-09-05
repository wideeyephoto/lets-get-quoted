import { NextRequest, NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { buildAuthenticatedSmsMediaRequest, type SmsProviderId } from '@/lib/sms-provider';

function isPrivateIpOrHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '::'
  ) {
    return true;
  }

  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, o1, o2] = ipv4Match.map(Number);
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    if (o1 === 169 && o2 === 254) return true;
    if (o1 === 127) return true;
    if (o1 === 0) return true;
  }

  return false;
}

export async function GET(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { supabase, accountId } = await requireOfficeContext('messages.read');
    const { messageId } = await paramsPromise;

    if (!messageId || typeof messageId !== 'string') {
      return NextResponse.json({ error: 'Missing message ID' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const indexParam = searchParams.get('index') ?? '0';
    const index = parseInt(indexParam, 10);
    if (Number.isNaN(index) || index < 0) {
      return NextResponse.json({ error: 'Invalid media index' }, { status: 400 });
    }

    const { data: message, error } = await supabase
      .from('sms_messages')
      .select('id, account_id, provider, media_urls')
      .eq('id', messageId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (error || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const mediaUrls = Array.isArray(message.media_urls) ? (message.media_urls as string[]) : [];
    const rawUrl = mediaUrls[index];
    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json({ error: 'Media part not found' }, { status: 404 });
    }

    const provider = (message.provider ?? 'twilio') as SmsProviderId;
    const authRequest = buildAuthenticatedSmsMediaRequest(rawUrl, provider);

    let mediaRes: Response;
    if (authRequest) {
      const initialRes = await fetch(authRequest.url, {
        headers: authRequest.headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      if (initialRes.status >= 300 && initialRes.status < 400) {
        const location = initialRes.headers.get('location');
        if (!location) {
          return NextResponse.json({ error: 'Redirect missing Location header' }, { status: 502 });
        }
        const redirectUrl = new URL(location, authRequest.url);
        if (redirectUrl.protocol !== 'https:' || isPrivateIpOrHost(redirectUrl.hostname)) {
          return NextResponse.json({ error: 'Disallowed redirect location' }, { status: 403 });
        }
        // Fetch redirected resource (e.g. S3 CDN signed URL) without Twilio/SignalWire Basic auth
        mediaRes = await fetch(redirectUrl.toString(), {
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });
      } else {
        mediaRes = initialRes;
      }
    } else {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid media URL' }, { status: 400 });
      }

      if (parsedUrl.protocol !== 'https:' || isPrivateIpOrHost(parsedUrl.hostname)) {
        return NextResponse.json({ error: 'Disallowed media URL' }, { status: 403 });
      }

      const initialRes = await fetch(parsedUrl.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      if (initialRes.status >= 300 && initialRes.status < 400) {
        const location = initialRes.headers.get('location');
        if (!location) {
          return NextResponse.json({ error: 'Redirect missing Location header' }, { status: 502 });
        }
        const redirectUrl = new URL(location, parsedUrl);
        if (redirectUrl.protocol !== 'https:' || isPrivateIpOrHost(redirectUrl.hostname)) {
          return NextResponse.json({ error: 'Disallowed redirect location' }, { status: 403 });
        }
        mediaRes = await fetch(redirectUrl.toString(), {
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });
      } else {
        mediaRes = initialRes;
      }
    }

    if (!mediaRes.ok) {
      return NextResponse.json(
        { error: `Upstream media request failed with status ${mediaRes.status}` },
        { status: mediaRes.status },
      );
    }

    let contentType = (mediaRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType || contentType === 'application/octet-stream') {
      if (rawUrl.match(/\.(jpg|jpeg)(\?.*)?$/i)) contentType = 'image/jpeg';
      else if (rawUrl.match(/\.png(\?.*)?$/i)) contentType = 'image/png';
      else if (rawUrl.match(/\.webp(\?.*)?$/i)) contentType = 'image/webp';
      else if (rawUrl.match(/\.gif(\?.*)?$/i)) contentType = 'image/gif';
      else if (rawUrl.match(/\.heic(\?.*)?$/i)) contentType = 'image/heic';
      else contentType = 'image/jpeg';
    }

    const buffer = await mediaRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Failed to proxy SMS media:', error);
    return NextResponse.json({ error: 'Failed to retrieve media' }, { status: 500 });
  }
}
