import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchProxyImage } from '@/lib/photo-proxy-guard';

export const runtime = 'nodejs';

async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUser();
  if (auth.error) return auth.error;

  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  try {
    const result = await fetchProxyImage(targetUrl);
    if (!result.ok || !result.buffer) {
      return NextResponse.json(
        { error: result.error || 'Proxy error' },
        { status: result.status || 500 },
      );
    }

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': result.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

