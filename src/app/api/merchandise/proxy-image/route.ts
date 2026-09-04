import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

// Whitelisted image hosts and domains for security
const ALLOWED_DOMAINS = [
  'files.cdn.printful.com',
  'images.unsplash.com',
  'api.dicebear.com',
  'supabase.co',
  'amazonaws.com',
  'cloudinary.com',
];

function isPrivateIp(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('169.254.')
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: NextRequest) {
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

  if (isPrivateIp(parsedUrl.hostname)) {
    return NextResponse.json({ error: 'Private network addresses not permitted' }, { status: 403 });
  }

  // Validate allowed domain
  const isAllowedHost = ALLOWED_DOMAINS.some(
    (domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
  );

  if (!isAllowedHost) {
    return NextResponse.json({ error: 'Host not permitted for proxying' }, { status: 403 });
  }

  try {
    const upstreamRes = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      next: { revalidate: 86400 }, // Cache on server edge for 24h
    });

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { error: `Upstream returned status ${upstreamRes.status}` },
        { status: upstreamRes.status }
      );
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstreamRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch upstream image' },
      { status: 502 }
    );
  }
}
