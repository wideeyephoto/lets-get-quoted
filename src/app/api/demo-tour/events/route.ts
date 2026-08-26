import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { sanitizeTourEventPayload } from '@/lib/product-tour/events';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const ip = clientIpFrom(req.headers);

    // Durable rate-limiting: 60 events per minute per IP
    const allowed = await checkRateLimit(admin, `demo_tour_events:${ip}`, 60, 60);
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { valid, sanitized, error } = sanitizeTourEventPayload(raw as Record<string, unknown>);
    if (!valid || !sanitized) {
      return NextResponse.json({ error: error ?? 'Invalid event payload' }, { status: 400 });
    }

    // Insert sanitized event into product_tour_events
    const { error: dbError } = await admin.from('product_tour_events').insert({
      client_event_id: sanitized.client_event_id,
      tour_key: sanitized.tour_key,
      tour_version: sanitized.tour_version,
      event_type: sanitized.event_type,
      step_id: sanitized.step_id ?? null,
      anonymous_session_id: sanitized.anonymous_session_id ?? null,
      source: sanitized.source ?? 'demo_public',
      pathname: sanitized.pathname ?? null,
      metadata: sanitized.metadata ?? {},
    });

    if (dbError) {
      // Log and fail gracefully so client tour flow never breaks
      console.error('Failed to insert product tour event:', dbError);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('Unhandled demo tour event error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
