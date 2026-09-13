import { NextRequest, NextResponse } from 'next/server';
import { sendFounderFeatureRequestAlert } from '@/lib/founder-alerts';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req.headers);
    const admin = createAdminClient();

    const allowed = await checkRateLimit(admin, `founder_feature:${ip}`, 15, 60);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const feature = typeof body.feature === 'string' ? body.feature.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : null;

    if (!feature || feature.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a feature description.' },
        { status: 400 },
      );
    }

    if (feature.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Feature description is too long (max 2000 characters).' },
        { status: 400 },
      );
    }

    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Dispatch notification to founder (non-blocking / resilient)
    await sendFounderFeatureRequestAlert({
      feature,
      contact: contact ? contact.slice(0, 150) : null,
      ip,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      message: 'Thanks! Your feature request was sent directly to Brett.',
    });
  } catch (err) {
    console.error('[/api/founder/feature-request] Error handling submission:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to submit feature request. Please try again.' },
      { status: 500 },
    );
  }
}
