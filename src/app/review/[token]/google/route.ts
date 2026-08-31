import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { recordGoogleClick } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Every response here must be uncacheable, and force-dynamic alone was not
 * enough — a redirect got reused for later requests on the same token. That is
 * a quiet way to reintroduce the gate: one customer hitting this before the
 * owner had set a Google URL would poison the link for everyone after them, and
 * the page would look perfectly fine while the public route silently vanished.
 */
function uncached(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  return response;
}

/**
 * The public review route. A plain GET so it works without JavaScript and can be
 * a real link rather than a form.
 *
 * Order matters here: the destination is resolved first and the click is stamped
 * best-effort inside recordGoogleClick. A failed analytics write must never
 * become a closed door — that would be the gate coming back by accident.
 */
export async function GET(request: Request, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const back = new URL(`/review/${params.token}`, request.url);

  let googleUrl: string | null = null;
  try {
    googleUrl = await recordGoogleClick(createAdminClient(), params.token);
  } catch (error) {
    console.error('Review Google redirect lookup failed:', error instanceof Error ? error.message : error);
    return uncached(NextResponse.redirect(back));
  }

  if (!googleUrl) return uncached(NextResponse.redirect(back));

  // The URL is owner-supplied (set in the website builder), so treat it as
  // untrusted: an https destination only, never javascript: or data:.
  let destination: URL;
  try {
    destination = new URL(googleUrl);
  } catch {
    return uncached(NextResponse.redirect(back));
  }
  if (destination.protocol !== 'https:') return uncached(NextResponse.redirect(back));

  return uncached(NextResponse.redirect(destination));
}
