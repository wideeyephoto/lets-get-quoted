import { NextResponse } from 'next/server';
import { revalidatePublicSiteCache, PUBLIC_SITES_CACHE_TAG } from '@/lib/cached-sites';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const subdomain = body.subdomain ? String(body.subdomain) : undefined;
  const customDomain = body.customDomain ? String(body.customDomain) : undefined;

  revalidatePublicSiteCache({ subdomain, customDomain });
  revalidateTag(PUBLIC_SITES_CACHE_TAG);

  return NextResponse.json({ ok: true, revalidated: { subdomain, customDomain, tag: PUBLIC_SITES_CACHE_TAG } });
}
