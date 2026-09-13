import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { isPrivateIp } from '@/lib/public-api/ssrf-guard';

export const dynamic = 'force-dynamic';

// Whitelisted image hosts for proxying
const STATIC_ALLOWED_HOSTS = new Set([
  'files.cdn.printful.com',
  'images.unsplash.com',
  'api.dicebear.com',
]);

function getProjectSupabaseHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (raw) {
      return new URL(raw).hostname.toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}



function isHostPermitted(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (STATIC_ALLOWED_HOSTS.has(host)) {
    return true;
  }

  const projectHost = getProjectSupabaseHost();
  if (projectHost && host === projectHost) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  // 1. Session verification: Caller must be authenticated
  if (process.env.NODE_ENV !== 'test') {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  if (!(await checkRateLimit(admin, `merch_proxy:ip:${ip}`, 60, 60))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const urlParam = request.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
  }

  // Only permit HTTP and HTTPS schemes
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
  }

  const rawHost = parsedUrl.hostname.toLowerCase().trim().replace(/^\[|\]$/g, '');
  if (rawHost === 'localhost' || isPrivateIp(rawHost)) {
    return NextResponse.json({ error: 'Private network addresses not permitted' }, { status: 403 });
  }

  if (!isHostPermitted(parsedUrl.hostname)) {
    return NextResponse.json({ error: 'Host not permitted for proxying' }, { status: 403 });
  }

  try {
    // redirect: 'manual' prevents open redirects to internal network addresses
    const upstreamRes = await fetch(parsedUrl.toString(), {
      redirect: 'manual',
      headers: {
        'User-Agent': 'LetsGetQuoted-MerchandiseProxy/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      next: { revalidate: 86400 },
    });

    // If redirected, reject or disallow to prevent SSRF bypasses
    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      return NextResponse.json({ error: 'Redirects not permitted' }, { status: 403 });
    }

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `Upstream returned status ${upstreamRes.status}` },
        { status: upstreamRes.status }
      );
    }

    // Strictly validate that upstream content is an image
    const contentType = upstreamRes.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream resource is not a valid image' }, { status: 415 });
    }

    const buffer = await upstreamRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch upstream image' },
      { status: 502 }
    );
  }
}
