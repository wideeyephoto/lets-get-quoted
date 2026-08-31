import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

async function requireAuthenticatedUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

function isAllowedProxyHost(targetUrl: URL): boolean {
  const hostname = targetUrl.hostname.toLowerCase();

  // Explicitly reject private IP ranges, loopback, and cloud metadata endpoints
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  ) {
    return false;
  }

  // Allow configured Supabase project domain
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const allowedSupabaseHost = new URL(supabaseUrl).hostname.toLowerCase();
      if (hostname === allowedSupabaseHost) return true;
    } catch {
      // ignore parse error
    }
  }

  // Allow standard Supabase storage cloud domains
  if (hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.in')) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return auth.error;

  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  try {
    const targetUrl = new URL(urlParam);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
    }

    if (!isAllowedProxyHost(targetUrl)) {
      return NextResponse.json({ error: 'Host is not allowed for proxying' }, { status: 403 });
    }

    const response = await fetch(urlParam, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch source image' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Target URL is not a valid image' }, { status: 415 });
    }

    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
