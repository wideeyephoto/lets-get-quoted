import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';

export const runtime = 'nodejs';

const VALID_SIZES = ['small', 'medium', 'large'] as const;
const VALID_TIERS = ['economical', 'standard', 'premium'] as const;
const MAX_QUESTIONS = 3;

// Best-effort in-memory throttle. Resets on cold start / across instances,
// but this is a low-traffic public endpoint that calls a paid API — this is
// just a cheap deterrent against naive scripted abuse, not a real rate limiter.
const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const history = (requestLog.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  history.push(now);
  requestLog.set(ip, history);
  return history.length > RATE_LIMIT_MAX;
}

function fallback() {
  return { type: 'classification' as const, size: 'medium' as const, tier: 'standard' as const };
}

function extractOutputText(payload: unknown): string {
  const record = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof record?.output_text === 'string') return record.output_text;
  const message = record?.output?.find((item): item is { type: string; content?: unknown[] } => (item as { type?: string })?.type === 'message');
  const textPart = message?.content?.find((part): part is { type: string; text?: string } => (part as { type?: string })?.type === 'output_text');
  return textPart?.text ?? '{}';
}

// Multi-turn: the wizard sends the initial description first, then this
// route asks up to MAX_QUESTIONS short clarifying questions (via OpenAI's
// Responses API, chained with previous_response_id so we don't have to
// resend conversation history) before returning a size/tier classification.
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === 'string' ? body.siteId.slice(0, 80) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : '';
  const answer = typeof body?.answer === 'string' ? body.answer.trim().slice(0, 300) : '';
  const previousResponseId = typeof body?.previousResponseId === 'string' ? body.previousResponseId.slice(0, 120) : '';
  const turn = Number.isFinite(body?.turn) ? Math.max(0, Math.min(MAX_QUESTIONS, Number(body.turn))) : 0;
  const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
  const businessSummary = typeof body?.businessSummary === 'string' ? body.businessSummary.trim().slice(0, 200) : '';
  const serviceArea = typeof body?.serviceArea === 'string' ? body.serviceArea.trim().slice(0, 120) : '';

  if (!siteId || (!description && !previousResponseId)) {
    return NextResponse.json({ error: 'Missing description.' }, { status: 400 });
  }

  // Only run for real, published sites — keeps this endpoint from being a
  // free-standing OpenAI proxy for anyone who finds the URL.
  const admin = createAdminClient();
  const { data: site } = await admin.from('sites').select('id').eq('id', siteId).eq('published', true).maybeSingle();
  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key configured yet — degrade gracefully rather than breaking the wizard.
    return NextResponse.json(fallback());
  }

  const questionsRemaining = MAX_QUESTIONS - turn;
  // Free context from the site's own profile (already stored, no extra AI call) —
  // helps the model tailor questions/classification to this specific trade and
  // region instead of asking generically. Only needed on the first turn; once
  // chained via previous_response_id the model already has this in context.
  const businessContext = !previousResponseId && (businessName || businessSummary || serviceArea)
    ? ` This business is "${businessName || 'unknown'}"${businessSummary ? ` (${businessSummary})` : ''}${serviceArea ? `, serving ${serviceArea}` : ''}. Use this to inform what kind of work is likely being described.`
    : '';
  const instructions =
    "You help a home-improvement contractor's website understand a project's scope before showing a rough price range." +
    businessContext +
    ' ' +
    `Ask short, simple follow-up questions one at a time to clarify job size and material/finish level. You may ask up to ${questionsRemaining} more question(s) — fewer if you already have enough information. ` +
    'Respond with strict JSON only, no other text. ' +
    'While still asking: {"type":"question","question":"<one short, plain-language question>"}. ' +
    'Once ready (or out of questions): {"type":"classification","size":"small"|"medium"|"large","tier":"economical"|"standard"|"premium"}. ' +
    'size: small = touch-up or single room, medium = full room remodel, large = whole-home or addition. ' +
    'tier: economical = budget materials, standard = balanced/default when unclear, premium = high-end finishes.';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        instructions,
        // OpenAI requires the word "json" to appear in the input when using
        // text.format: json_object — the instructions alone don't count.
        input: `${previousResponseId ? answer : description}\n\nRespond with json only.`,
        previous_response_id: previousResponseId || undefined,
        text: { format: { type: 'json_object' } },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload));

    if (parsed.type === 'question' && typeof parsed.question === 'string' && turn < MAX_QUESTIONS) {
      return NextResponse.json({ type: 'question', question: parsed.question, responseId: payload.id });
    }

    const size = VALID_SIZES.includes(parsed.size) ? parsed.size : 'medium';
    const tier = VALID_TIERS.includes(parsed.tier) ? parsed.tier : 'standard';
    return NextResponse.json({ type: 'classification', size, tier });
  } catch (error) {
    console.error('Estimate chat failed:', error);
    return NextResponse.json(fallback());
  }
}
