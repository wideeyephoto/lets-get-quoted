import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

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

/**
 * Checks if a hostname or IP is private, local, or loopback (IPv4 & IPv6).
 */
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

  // IPv6 Unique Local (fc00::/7) and Link-Local (fe80::/10)
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true;
  }

  // IPv4 CIDR checks
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [_, o1, o2] = ipv4Match.map(Number);
    if (o1 === 10) return true; // 10.0.0.0/8
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12 (172.16 - 172.31)
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 link-local
    if (o1 === 127) return true; // 127.0.0.0/8 loopback
    if (o1 === 0) return true;
  }

  return false;
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

  if (isPrivateIpOrHost(parsedUrl.hostname)) {
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
