import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { getSiteContent } from '@/lib/site-content';
import { estimatePostureBias } from '@/lib/estimate-posture';
import { checkRateLimit, checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';
import {
  aiIntakeUsageGateEnabled,
  allowAiIntakeProviderAttempt,
  beginAiIntakeUsage,
  commitAiIntakeUsage,
  releaseAiIntakeUsage,
  type AiIntakeUsageLease,
} from '@/lib/billing/ai-intake-usage';
import { isAiIntakeFlowKind } from '@/lib/ai-intake-thread';
import { applyEstimateGuardrails } from '@/lib/estimate-guardrails';
import { matchTradePreset } from '@/lib/trade-intake-presets';
import { createContinuationToken, verifyContinuationToken, type EstimateContinuationTurn } from '@/lib/estimate-continuation-token';

export const runtime = 'nodejs';

// Accuracy beats speed: the model may ask up to 6 scoping questions, but is
// told to stop the moment more questions stop improving the price — confident
// cases still resolve in 2-3.
const MAX_QUESTIONS = 6;

// An estimate with no numbers: the wizard still collects the lead, it just
// skips showing a price. Never invent a generic number — a wrong range is
// worse than none.
function fallback() {
  return { type: 'estimate' as const };
}

function classicFallback() {
  return { type: 'classic_fallback' as const };
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
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  // Durable cross-instance limit on a paid-OpenAI endpoint (15/min per IP).
  if (!(await checkRateLimit(admin, `classify:ip:${ip}`, 15, 60))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === 'string' ? body.siteId.slice(0, 80) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 500) : '';
  const answer = typeof body?.answer === 'string' ? body.answer.trim().slice(0, 300) : '';
  const rawToken = typeof body?.continuationToken === 'string' ? body.continuationToken : (typeof body?.previousResponseId === 'string' ? body.previousResponseId : '');
  const tokenData = verifyContinuationToken(rawToken, siteId);
  const isContinuing = Boolean(tokenData);

  // Smart Intake asks for a shorter cap; Instant Booking keeps the legacy six
  // unless it opts in. One protocol, two deliberately different journeys.
  const maxQuestions = Number.isFinite(body?.maxQuestions)
    ? Math.max(1, Math.min(MAX_QUESTIONS, Math.round(Number(body.maxQuestions))))
    : MAX_QUESTIONS;
  const turn = tokenData?.turn ?? (Number.isFinite(body?.turn) ? Math.max(0, Math.min(maxQuestions, Number(body.turn))) : 0);
  const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
  const businessSummary = typeof body?.businessSummary === 'string' ? body.businessSummary.trim().slice(0, 200) : '';
  const serviceArea = typeof body?.serviceArea === 'string' ? body.serviceArea.trim().slice(0, 120) : '';
  const visitorLocation = typeof body?.location === 'string' ? body.location.trim().slice(0, 120) : '';

  if (!siteId || (!description && !isContinuing)) {
    return NextResponse.json({ error: 'Missing description.' }, { status: 400 });
  }

  // Only run for real, published sites — keeps this endpoint from being a
  // free-standing OpenAI proxy for anyone who finds the URL.
  const { data: site } = await admin.from('sites').select('id, account_id, content, service_area').eq('id', siteId).eq('published', true).maybeSingle();
  if (!site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 });
  }

  // The owner's pricing posture biases the estimate lower/higher (see
  // estimate-posture.ts). Defensive: a missing column degrades to the default
  // 'lean' bias — the estimator never breaks over a settings read.
  const { data: postureRow } = await admin.from('accounts').select('estimate_posture, instant_book_enabled').eq('id', site.account_id).maybeSingle();
  const postureBias = estimatePostureBias(postureRow?.estimate_posture);

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
    return NextResponse.json(aiIntakeUsageGateEnabled() ? classicFallback() : fallback());
  }

  // This is a public route: the opaque browser thread is only an idempotency
  // capability. Workspace authority comes from the published site row above.
  // With the rollout flag off, beginAiIntakeUsage returns before validation and
  // performs no ledger call, preserving the current endpoint behavior exactly.
  const usageEnabled = aiIntakeUsageGateEnabled();
  const intakeFlowKind = isAiIntakeFlowKind(body?.intakeFlowKind) ? body.intakeFlowKind : null;
  if (usageEnabled && (
    !intakeFlowKind
    || (intakeFlowKind === 'smart_intake' && !siteContent.estimateRanges.enabled)
    || (intakeFlowKind === 'instant_booking' && !postureRow?.instant_book_enabled)
  )) {
    return NextResponse.json(classicFallback());
  }
  const usageDecision = await beginAiIntakeUsage(admin, {
    accountId: site.account_id,
    siteId: site.id,
    threadId: typeof body?.intakeThreadId === 'string' ? body.intakeThreadId : '',
    flowKind: intakeFlowKind ?? 'smart_intake',
  }, {
    enabled: usageEnabled,
    dependencies: {
      // This strict limiter is reached only after the helper proves there is no
      // reservation for this published site/thread. Existing thread follow-ups
      // never spend the six-new-threads-per-hour allowance.
      allowNewThread: async () => {
        if (!(await checkRateLimitStrict(admin, `ai-intake:new:${site.id}:${ip}`, 6, 60 * 60))) {
          return false;
        }
        // IP buckets deter ordinary retry/bot loops; this site-wide ceiling
        // also bounds a distributed drain of a contractor's paid credits.
        // Real visitors still fall back to the normal quote form at the cap.
        return checkRateLimitStrict(admin, `ai-intake:new:${site.id}:all`, 10, 60 * 60);
      },
    },
  });
  if (usageDecision.kind === 'classic_fallback') {
    return NextResponse.json(classicFallback());
  }
  const usageLease: AiIntakeUsageLease | null = usageDecision.kind === 'allowed' ? usageDecision : null;

  const releaseUsage = async (reason: string) => {
    if (!usageLease) return;
    try {
      await releaseAiIntakeUsage(admin, usageLease, reason);
    } catch (error) {
      console.error('AI Intake credit release failed:', error);
    }
  };
  const substantiveResponse = async (value: Record<string, unknown>) => {
    if (usageLease && !(await commitAiIntakeUsage(admin, usageLease))) {
      await releaseUsage('commit_failed');
      return NextResponse.json(classicFallback());
    }
    return NextResponse.json(value);
  };
  const fetchProvider = async (init: RequestInit) => {
    // The idempotency key contains only a SHA-256 digest of the server-bound
    // account/site/flow/thread identity. Count every paid provider attempt,
    // including the forced retry below, and fail closed if the limiter cannot
    // prove this one-credit thread is still within its 24-hour budget.
    if (!(await allowAiIntakeProviderAttempt(
      usageLease,
      (bucket, limit, windowSeconds) => checkRateLimitStrict(admin, bucket, limit, windowSeconds),
    ))) {
      throw new Error('AI Intake provider attempt budget reached.');
    }
    return fetch('https://api.openai.com/v1/responses', init);
  };

  const questionsRemaining = maxQuestions - turn;
  const activeTradePreset = matchTradePreset(siteContent.trade || businessSummary || businessName);

  // Free context from the site's own profile (already stored, no extra AI call) —
  // helps the model tailor questions/classification to this specific trade and
  // region instead of asking generically.
  const businessContext = !isContinuing && (businessName || businessSummary || serviceArea || siteContent.trade)
    ? ` This business is in the ${activeTradePreset.name} trade ("${businessName || 'unknown'}"${businessSummary ? ` - ${businessSummary}` : ''}${serviceArea ? `, serving ${serviceArea}` : ''}). Use this trade context to inform pricing, questions, and typical scope standards.`
    : '';
  const qualityContext = !isContinuing ? `${areaContext}${exclusionContext}${locationContext}` : '';

  // Out of questions? The model gets NO option to ask again — vague answers
  // ("not sure", "no") otherwise make it keep probing forever and the visitor
  // ends up with no number at all.
  const askingRules = questionsRemaining > 0
    ? `Ask short, simple follow-up questions one at a time to clarify the job's scope and quality/finish level. You may ask up to ${questionsRemaining} more question(s), but ask another ONLY while the answer would meaningfully change the price — the moment you can price the job confidently, stop and estimate. If an answer was vague ("not sure"), try ONE different angle on that detail, then move on rather than repeating it. ` +
      `While still asking: {"type":"question","question":"<one short, plain-language question>","photo_prompt":"<optional 2-8 word specific photo request relevant to this trade: ${activeTradePreset.photoGuidance}>"}. ` +
      'Once ready (or out of questions): '
    : 'You are OUT of questions — do NOT ask anything else. Even if details are vague, give your best-judgment range for the most common version of this job, priced toward the cheaper outcome. Respond ONLY with: ';

  const rawImages: unknown[] = Array.isArray(body?.images) ? body.images : [];
  const validImages = rawImages
    .filter((img): img is string => typeof img === 'string' && img.startsWith('data:image/'))
    .slice(0, 4);

  const visualInstruction = validImages.length > 0
    ? ` Images or video frames of the project are provided. Inspect them for equipment technical specs (${activeTradePreset.equipmentSpecs.join(', ')}), existing damage, materials, and job difficulty. Do not ask questions about details clearly visible in the images, and account for visible difficulty in the estimate. You may optionally include "visual_observation":"<one brief sentence acknowledging what was spotted, e.g. 'Spotted a 40-gal atmospheric gas water heater with minor corrosion at the inlet nipple'>" in your JSON response. `
    : '';

  const siteVisitTriggersStr = activeTradePreset.siteVisitTriggers.join('; ');

  const instructions =
    "You help a local home-services business's website understand a project's scope before showing a rough price range." +
    businessContext +
    qualityContext +
    visualInstruction +
    ' ' +
    'Respond with strict JSON only, no other text. ' +
    askingRules +
    '{"type":"estimate","min":<number>,"max":<number>,"basis":"<short>","in_area":true|false|null,"excluded":true|false,"requires_site_visit":true|false,"visit_reason":"<short reason>","visual_observation":"<optional short note>"} — min/max is a realistic pre-visit price range in whole US dollars for THIS SPECIFIC JOB as this trade would actually charge for it in the US today, including typical labor and materials. ' +
    'basis: a short plain-language phrase naming what you priced, under 60 characters, starting lowercase, no price in it (e.g. "a standard running-toilet repair", "a deep clean of a 2-bed home"). ' +
    'in_area: false ONLY when the visitor\'s stated location is clearly outside the served areas listed; true when it clearly matches or neighbors them; null when no location was given or you are unsure. ' +
    'excluded: true ONLY when the described work clearly matches something the business does NOT take on; otherwise false. Never refuse to estimate — always include min/max regardless of these two fields. ' +
    `requires_site_visit: true ONLY when the job involves high-complexity structural work or major unknown variables that cannot be accurately priced without in-person inspection. For ${activeTradePreset.name}, key site-visit triggers include: ${siteVisitTriggersStr}. For these, min/max must reflect true full-scope baseline price floors, never trivial patch repair numbers. ` +
    'Price the described job itself, not a generic project category: cleaning one 150 sq ft room is a low-cost routine service call, not a renovation. ' +
    'For active emergencies (burst pipes, severe flooding, gas leaks, complete power outage), account for emergency response/dispatch diagnostic fees. ' +
    postureBias + ' ' +
    'Round to natural amounts (e.g. 120-220, 850-1500, 4000-7500). ' +
    (questionsRemaining > 0
      ? 'If the homeowner is unsure whether they need a repair or a full replacement, ask a clarifying question (e.g. age/condition of the item) before estimating, and if still unsure, price the smaller/cheaper outcome rather than assuming the most expensive one.'
      : 'When unsure between repair and replacement, price the repair.');

  try {
    const priorHistory: unknown[] = tokenData?.history ?? [];
    let currentUserTurn: unknown;

    if (validImages.length > 0) {
      const contentParts: Array<Record<string, unknown>> = [
        { type: 'input_text', text: `${isContinuing ? answer : description}\n\nRespond with json only.` },
      ];
      for (const imgUrl of validImages) {
        contentParts.push({ type: 'input_image', image_url: imgUrl });
      }
      currentUserTurn = { role: 'user', content: contentParts };
    } else {
      currentUserTurn = { role: 'user', content: `${isContinuing ? answer : description}\n\nRespond with json only.` };
    }

    const fullStatelessInput = [...priorHistory, currentUserTurn];

    const response = await fetchProvider({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        store: false,
        instructions,
        // OpenAI requires the word "json" to appear in the input when using
        // text.format: json_object — the instructions alone don't count.
        input: fullStatelessInput.length === 1 && typeof (fullStatelessInput[0] as { content?: unknown })?.content !== 'undefined'
          ? (fullStatelessInput[0] as { content: unknown }).content
          : fullStatelessInput,
        text: { format: { type: 'json_object' } },
      }),
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    let parsed = JSON.parse(extractOutputText(payload));

    const visualObservation = typeof parsed.visual_observation === 'string'
      ? parsed.visual_observation.trim().slice(0, 150)
      : typeof parsed.observation === 'string'
        ? parsed.observation.trim().slice(0, 150)
        : undefined;

    const photoPrompt = typeof parsed.photo_prompt === 'string'
      ? parsed.photo_prompt.trim().slice(0, 100)
      : undefined;

    if (parsed.type === 'question' && typeof parsed.question === 'string' && turn < maxQuestions) {
      const assistantOutputItems = Array.isArray(payload.output)
        ? payload.output
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }];

      const continuationToken = createContinuationToken({
        siteId,
        turn: turn + 1,
        history: [...priorHistory, currentUserTurn, ...assistantOutputItems],
      });

      const questionResponse = {
        type: 'question',
        question: parsed.question.trim(),
        continuationToken,
        responseId: continuationToken, // Backwards compatibility for existing clients
        ...(visualObservation ? { visualObservation } : {}),
        ...(photoPrompt ? { photoPrompt } : {}),
      };
      // Preserve the legacy response shape exactly while the gate is dark.
      if (!usageLease) {
        return NextResponse.json(questionResponse);
      }
      return substantiveResponse(questionResponse);
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
      const assistantOutputItems = Array.isArray(payload.output)
        ? payload.output
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }];

      const retryInput = [
        ...fullStatelessInput,
        ...assistantOutputItems,
        { role: 'user', content: 'No more questions. Using everything discussed, give your best-judgment price range for the most common version of this job, priced toward the cheaper outcome. Respond with strict json only: {"type":"estimate","min":<number>,"max":<number>,"in_area":true|false|null,"excluded":true|false}.' },
      ];

      const retryResponse = await fetchProvider({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          store: false,
          instructions: 'No more questions. Using everything discussed, give your best-judgment price range for the most common version of this job, priced toward the cheaper outcome. Respond with strict json only: {"type":"estimate","min":<number>,"max":<number>,"in_area":true|false|null,"excluded":true|false}.',
          input: retryInput,
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

    // Sanity-gate the model's numbers; on anything incoherent or safety-critical,
    // collect the lead without showing a price rather than showing an unsafe one.
    const guardrail = applyEstimateGuardrails({
      minCents: band ? band.min * 100 : null,
      maxCents: band ? band.max * 100 : null,
      description,
      exclusions,
    });

    const fit = {
      inArea: parsed.in_area === true ? true : parsed.in_area === false ? false : null,
      excluded: parsed.excluded === true || (guardrail.withheldReason?.includes('excluded') ?? false),
    };
    const siteVisit = (parsed.requires_site_visit === true || parsed.site_visit_required === true || guardrail.inspectionRequired)
      ? {
          requiresSiteVisit: true,
          visitReason: guardrail.withheldReason || (typeof parsed.visit_reason === 'string'
            ? parsed.visit_reason.trim().slice(0, 100)
            : typeof parsed.reason === 'string'
              ? parsed.reason.trim().slice(0, 100)
              : 'On-site inspection required for accurate scope & access'),
        }
      : {};
    if (guardrail.valid && guardrail.minCents !== undefined && guardrail.maxCents !== undefined) {
      const basis = typeof parsed.basis === 'string' ? parsed.basis.trim().slice(0, 60) : '';
      return substantiveResponse({
        type: 'estimate',
        min: Math.round(guardrail.minCents / 100),
        max: Math.round(guardrail.maxCents / 100),
        ...(basis ? { basis } : {}),
        ...(visualObservation ? { visualObservation } : {}),
        ...fit,
        ...siteVisit,
      });
    }
    if (usageLease) {
      await releaseUsage('non_substantive_result');
      return NextResponse.json(classicFallback());
    }
    return NextResponse.json({ ...fallback(), ...(visualObservation ? { visualObservation } : {}), ...fit, ...siteVisit });
  } catch (error) {
    console.error('Estimate chat failed:', error);
    if (usageLease) {
      await releaseUsage('provider_or_internal_failure');
      return NextResponse.json(classicFallback());
    }
    return NextResponse.json(fallback());
  }
}
