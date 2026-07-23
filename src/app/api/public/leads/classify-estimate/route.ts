import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { getSiteContent } from '@/lib/site-content';

export const runtime = 'nodejs';

// Accuracy beats speed: the model may ask up to 6 scoping questions, but is
// told to stop the moment more questions stop improving the price — confident
// cases still resolve in 2-3.
const MAX_QUESTIONS = 6;

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

// An estimate with no numbers: the wizard still collects the lead, it just
// skips showing a price. Never invent a generic number — a wrong range is
// worse than none.
function fallback() {
  return { type: 'estimate' as const };
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
  const visitorLocation = typeof body?.location === 'string' ? body.location.trim().slice(0, 120) : '';

  if (!siteId || (!description && !previousResponseId)) {
    return NextResponse.json({ error: 'Missing description.' }, { status: 400 });
  }

  // Only run for real, published sites — keeps this endpoint from being a
  // free-standing OpenAI proxy for anyone who finds the URL.
  const admin = createAdminClient();
  const { data: site } = await admin.from('sites').select('id, content, service_area').eq('id', siteId).eq('published', true).maybeSingle();
  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  // Lead-quality context from the owner's settings: served towns and excluded
  // work, so the model can flag out-of-area or won't-do jobs alongside the
  // estimate (flags only — the lead still submits either way).
  const siteContent = getSiteContent(site.content as Record<string, unknown>);
  const servedCities = siteContent.serviceAreas.cities.map((city) => city.trim()).filter(Boolean).slice(0, 20);
  const exclusions = siteContent.leadFilters.exclusions.map((item) => item.trim()).filter(Boolean);
  const areaContext = servedCities.length ? ` The business serves these areas: ${servedCities.join(', ')}${site.service_area ? ` (${site.service_area})` : ''}.` : '';
  const exclusionContext = exclusions.length ? ` The business does NOT take on: ${exclusions.join('; ')}.` : '';
  const locationContext = visitorLocation ? ` The visitor says their location is: ${visitorLocation}.` : '';

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
  const qualityContext = !previousResponseId ? `${areaContext}${exclusionContext}${locationContext}` : '';
  // Out of questions? The model gets NO option to ask again — vague answers
  // ("not sure", "no") otherwise make it keep probing forever and the visitor
  // ends up with no number at all.
  const askingRules = questionsRemaining > 0
    ? `Ask short, simple follow-up questions one at a time to clarify the job's scope and quality/finish level. You may ask up to ${questionsRemaining} more question(s), but ask another ONLY while the answer would meaningfully change the price — the moment you can price the job confidently, stop and estimate. If an answer was vague ("not sure"), try ONE different angle on that detail, then move on rather than repeating it. ` +
      'While still asking: {"type":"question","question":"<one short, plain-language question>"}. ' +
      'Once ready (or out of questions): '
    : 'You are OUT of questions — do NOT ask anything else. Even if details are vague, give your best-judgment range for the most common version of this job, priced toward the cheaper outcome. Respond ONLY with: ';
  const instructions =
    "You help a local home-services business's website understand a project's scope before showing a rough price range." +
    businessContext +
    qualityContext +
    ' ' +
    'Respond with strict JSON only, no other text. ' +
    askingRules +
    '{"type":"estimate","min":<number>,"max":<number>,"in_area":true|false|null,"excluded":true|false} — min/max is a realistic pre-visit price range in whole US dollars for THIS SPECIFIC JOB as this trade would actually charge for it in the US today, including typical labor and materials. ' +
    'in_area: false ONLY when the visitor\'s stated location is clearly outside the served areas listed; true when it clearly matches or neighbors them; null when no location was given or you are unsure. ' +
    'excluded: true ONLY when the described work clearly matches something the business does NOT take on; otherwise false. Never refuse to estimate — always include min/max regardless of these two fields. ' +
    'Price the described job itself, not a generic project category: cleaning one 150 sq ft room is a low-cost routine service call, not a renovation. ' +
    'Keep the range honest but LEAN TOWARD THE AFFORDABLE SIDE, with a tight believable spread (max no more than roughly 2-2.5x min) — a scary high top number loses the customer before the business ever gets to quote in person. ' +
    'Round to natural amounts (e.g. 120-220, 850-1500, 4000-7500). ' +
    (questionsRemaining > 0
      ? 'If the homeowner is unsure whether they need a repair or a full replacement, ask a clarifying question (e.g. age/condition of the item) before estimating, and if still unsure, price the smaller/cheaper outcome rather than assuming the most expensive one.'
      : 'When unsure between repair and replacement, price the repair.');

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
    let parsed = JSON.parse(extractOutputText(payload));

    if (parsed.type === 'question' && typeof parsed.question === 'string' && turn < MAX_QUESTIONS) {
      return NextResponse.json({ type: 'question', question: parsed.question, responseId: payload.id });
    }

    const readBand = (value: { min?: unknown; max?: unknown }) => {
      const min = Math.round(Number(value.min));
      const max = Math.round(Number(value.max));
      return Number.isFinite(min) && Number.isFinite(max) && min >= 25 && min < max && max <= 200000 ? { min, max } : null;
    };

    // Belt and braces: if the final turn came back without usable numbers
    // (e.g. the model tried to ask a 4th question), chain one forced retry
    // that demands the estimate. A shown range is the whole point.
    let band = readBand(parsed);
    if (!band) {
      const retryResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          instructions: 'No more questions. Using everything discussed, give your best-judgment price range for the most common version of this job, priced toward the cheaper outcome. Respond with strict json only: {"type":"estimate","min":<number>,"max":<number>,"in_area":true|false|null,"excluded":true|false}.',
          input: 'Respond with the final estimate json now.',
          previous_response_id: payload.id,
          text: { format: { type: 'json_object' } },
        }),
      });
      if (retryResponse.ok) {
        const retryPayload = await retryResponse.json();
        const retryParsed = JSON.parse(extractOutputText(retryPayload));
        const retryBand = readBand(retryParsed);
        if (retryBand) {
          band = retryBand;
          parsed = retryParsed;
        }
      }
    }

    // Sanity-gate the model's numbers; on anything incoherent, collect the
    // lead without showing a price rather than showing a wrong one.
    const fit = {
      inArea: parsed.in_area === true ? true : parsed.in_area === false ? false : null,
      excluded: parsed.excluded === true,
    };
    if (band) {
      return NextResponse.json({ type: 'estimate', ...band, ...fit });
    }
    return NextResponse.json({ ...fallback(), ...fit });
  } catch (error) {
    console.error('Estimate chat failed:', error);
    return NextResponse.json(fallback());
  }
}
