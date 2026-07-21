import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';

export const runtime = 'nodejs';

const VALID_SIZES = ['small', 'medium', 'large'] as const;
const VALID_TIERS = ['economical', 'standard', 'premium'] as const;

// Best-effort in-memory throttle. Resets on cold start / across instances,
// but this is a low-traffic public endpoint that calls a paid API — this is
// just a cheap deterrent against naive scripted abuse, not a real rate limiter.
const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = (requestLog.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  history.push(now);
  requestLog.set(ip, history);
  return history.length > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === 'string' ? body.siteId.slice(0, 80) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : '';
  if (!siteId || !description) {
    return NextResponse.json({ error: 'Missing description.' }, { status: 400 });
  }

  // Only classify for real, published sites — keeps this endpoint from being
  // a free-standing OpenAI proxy for anyone who finds the URL.
  const admin = createAdminClient();
  const { data: site } = await admin.from('sites').select('id').eq('id', siteId).eq('published', true).maybeSingle();
  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key configured yet — degrade gracefully rather than breaking the wizard.
    return NextResponse.json({ size: 'medium', tier: 'standard', usedAi: false });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              "You classify a home contracting project description into a rough job size and material tier. " +
              'Respond with strict JSON only: {"size": "small"|"medium"|"large", "tier": "economical"|"standard"|"premium"}. ' +
              'small = touch-up or single room. medium = full room remodel. large = whole-home or addition. ' +
              'economical = budget-friendly materials mentioned or implied. standard = balanced/default when unclear. premium = high-end finishes mentioned or implied.',
          },
          { role: 'user', content: description },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const result = await response.json();
    const parsed = JSON.parse(result.choices?.[0]?.message?.content ?? '{}');
    const size = VALID_SIZES.includes(parsed.size) ? parsed.size : 'medium';
    const tier = VALID_TIERS.includes(parsed.tier) ? parsed.tier : 'standard';

    return NextResponse.json({ size, tier, usedAi: true });
  } catch (error) {
    console.error('Estimate classification failed:', error);
    return NextResponse.json({ size: 'medium', tier: 'standard', usedAi: false });
  }
}
