import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { listServices } from '@/lib/services';
import { parseQuoteItems } from '@/lib/jobs';
import { getAuthoritativeTrade } from '@/lib/workspace-trade';
import { callModel, AiDraftsExhaustedError } from '@/lib/ai-model-call';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import {
  formatPriceBook, formatQuoteHistory, reconcileDraft, MAX_DRAFT_LINES, MAX_HISTORY_JOBS,
  type HistoricalQuote, type PriceBookEntry, type QuoteDraft, type RawDraft,
} from '@/lib/quote-draft';
import {
  getPropertyIntelligence,
  summarizePropertyIntelligence,
  resolveProfileFromSummary,
  type PropertyIntelligenceSummary,
} from '@/lib/property-intel';
import { loadRoomScan } from '@/lib/property-intel/room-scan-store';
import { calculateRoomSummary, type RoomDimensionsSummary } from '@/lib/property-intel/room-spatial-intel';
import {
  computeAccountPricingIntelligence,
  formatPricingIntelligenceForPrompt,
  extractZipFromAddress,
  isJobWon,
  type AccountPricingIntelligence,
  type HistoricalPricingJob,
} from '@/lib/pricing-intelligence';

// The model call behind "Draft this quote".
//
// The model decides WHAT the work is and which of the owner's services each
// line maps to. It does NOT get the last word on price — reconcileDraft snaps
// every matched line to the price book, and anything it priced itself comes
// back flagged. See lib/quote-draft for that boundary.

export type DraftContext = {
  /** Whose AI-writing balance this draft is charged to. */
  accountId: string;
  scope: string;
  trade: string | null;
  estimatedHours: number | null;
  services: PriceBookEntry[];
  history: HistoricalQuote[];
  refinement?: string | null;
  propertyIntel?: PropertyIntelligenceSummary | null;
  /** Validated imported room takeoffs; source accuracy is not independently verified. */
  roomSpatialScan?: RoomDimensionsSummary | null;
  /** Signed URLs or data URLs of job/lead photos to visually ground the quote */
  photos?: string[];
  /** Adaptive ZIP, seasonal, and close-rate pricing intelligence */
  pricingIntel?: AccountPricingIntelligence | null;
  /** Target 5-digit ZIP code if resolved from job address */
  targetZip?: string | null;
};

export { QUICK_QUOTE_REFINE_CHIPS } from '@/lib/quote-draft';

/**
 * Everything the drafter needs, in one place.
 *
 * Deliberately does NOT load the client's name, phone, email or street address into the prompt.
 * Only verified geometric measurements (e.g. roof squares, footprint sq ft), visual photos,
 * and aggregated non-PII pricing intelligence (ZIP market signals, seasonal demand posture, close-rate analytics) are passed.
 */
export async function loadDraftContext(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  refinement?: string | null,
): Promise<DraftContext | null> {
  const { data: job } = await supabase
    .from('jobs')
    .select('id, scope, estimated_hours, address, photo_paths, lead_id')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return null;

  const admin = createAdminClient();
  const [services, trade, { data: past }, propertyIntel, savedRoom] = await Promise.all([
    listServices(supabase, accountId, { activeOnly: true }),
    getAuthoritativeTrade(admin, accountId),
    // Recent priced work, newest first — what this business actually charges,
    // which beats what the trade charges nationally every time.
    supabase
      .from('jobs')
      .select('id, scope, quoted_amount, quote_items, address, status, created_at')
      .eq('account_id', accountId)
      .neq('id', jobId)
      .gt('quoted_amount', 0)
      .order('created_at', { ascending: false })
      .limit(50),
    // If the job has an address, fetch property & roof measurements to size quantities accurately
    typeof job.address === 'string' && job.address.trim().length >= 5
      ? getPropertyIntelligence({ address: job.address.trim() }).catch(() => null)
      : Promise.resolve(null),
    loadRoomScan(supabase, accountId, { kind: 'job', id: jobId }),
  ]);

  let photoUrls: string[] = [];
  const jobPhotoPaths = Array.isArray(job.photo_paths) ? (job.photo_paths as string[]) : [];
  if (jobPhotoPaths.length > 0) {
    photoUrls = await createJobPhotoUrls(accountId, jobPhotoPaths);
  } else if (job.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('photo_paths')
      .eq('account_id', accountId)
      .eq('id', job.lead_id)
      .maybeSingle();
    const leadPhotoPaths = Array.isArray(lead?.photo_paths) ? (lead?.photo_paths as string[]) : [];
    if (leadPhotoPaths.length > 0) {
      photoUrls = await createLeadPhotoUrls(accountId, leadPhotoPaths);
    }
  }

  const targetZip = typeof job.address === 'string' ? extractZipFromAddress(job.address) : null;

  const rawPricingJobs: HistoricalPricingJob[] = (past ?? []).map((row) => ({
    id: row.id,
    scope: (row.scope as string | null) ?? null,
    quotedAmount: Number(row.quoted_amount) || 0,
    quoteItems: row.quote_items,
    status: (row.status as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    zip: extractZipFromAddress(row.address as string | null),
    createdAt: (row.created_at as string | null) ?? null,
    lines: parseQuoteItems(row.quote_items).map((item) => ({ label: item.label, amount: Number(item.amount) || 0 })),
  }));

  const pricingIntel = computeAccountPricingIntelligence({
    jobs: rawPricingJobs,
    targetAddress: typeof job.address === 'string' ? job.address : null,
    trade,
    referenceDate: new Date(),
  });

  const history: HistoricalQuote[] = rawPricingJobs.map((row) => {
    const isSameZip = Boolean(targetZip && row.zip === targetZip);
    const won = isJobWon(row.status);
    return {
      scope: row.scope,
      total: row.quotedAmount,
      lines: row.lines ?? [],
      status: row.status,
      zip: row.zip,
      isSameZip,
      won,
    };
  });

  // Prioritize localized same-ZIP comps, then won jobs, then recent quotes
  history.sort((a, b) => {
    if (a.isSameZip && !b.isSameZip) return -1;
    if (!a.isSameZip && b.isSameZip) return 1;
    if (a.won && !b.won) return -1;
    if (!a.won && b.won) return 1;
    return 0;
  });

  return {
    accountId,
    scope: ((job.scope as string | null) ?? '').trim(),
    trade,
    estimatedHours: job.estimated_hours == null ? null : Number(job.estimated_hours),
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      unitPrice: Number(service.unit_price) || 0,
      unit: service.unit,
      description: service.description,
    })),
    history,
    refinement: refinement?.trim() || null,
    propertyIntel: summarizePropertyIntelligence(propertyIntel),
    roomSpatialScan: savedRoom?.scan ? calculateRoomSummary(savedRoom.scan) : null,
    photos: photoUrls.slice(0, 4),
    pricingIntel,
    targetZip,
  };
}

function extractOutputText(payload: unknown): string {
  const record = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof record?.output_text === 'string') return record.output_text;
  const message = record?.output?.find(
    (item): item is { type: string; content?: unknown[] } => (item as { type?: string })?.type === 'message',
  );
  const textPart = message?.content?.find(
    (part): part is { type: string; text?: string } => (part as { type?: string })?.type === 'output_text',
  );
  return textPart?.text ?? '{}';
}

export function buildDraftInstructions(context: DraftContext): string {
  const book = formatPriceBook(context.services);
  const history = formatQuoteHistory(context.history);
  const pricingIntelLines = formatPricingIntelligenceForPrompt(context.pricingIntel);

  let propertyLines = '';
  if (context.propertyIntel) {
    const profile = resolveProfileFromSummary(context.propertyIntel, context.trade, context.scope);
    const lines: string[] = ['VERIFIED PROPERTY SPECS (Use for structural context and sizing):'];

    // Lead screening alert (injected when trigger is met, independent of section visibility)
    if (context.propertyIntel.yearBuilt) {
      lines.push(
        `- Year Built: ${context.propertyIntel.yearBuilt}${
          profile.needsLeadScreening
            ? ' (Pre-1978 build: scope plausibly disturbs paint; note EPA RRP lead-safe containment assumptions)'
            : ''
        }`
      );
    }

    if (profile.primarySections.includes('building_specs')) {
      if (context.propertyIntel.livingAreaSqFt) {
        lines.push(`- Finished Living Area: ${context.propertyIntel.livingAreaSqFt.toLocaleString()} sq ft`);
      }
      if (context.propertyIntel.stories) lines.push(`- Stories: ${context.propertyIntel.stories}`);
      if (context.propertyIntel.bedrooms || context.propertyIntel.bathrooms) {
        lines.push(`- Layout: ${context.propertyIntel.bedrooms ?? '?'} beds / ${context.propertyIntel.bathrooms ?? '?'} baths`);
      }
    }

    if (profile.primarySections.includes('mep_systems')) {
      if (context.propertyIntel.foundationType) lines.push(`- Foundation: ${context.propertyIntel.foundationType}`);
      if (context.propertyIntel.heatingFuel) lines.push(`- Heating Fuel: ${context.propertyIntel.heatingFuel}`);
    }

    if (profile.primarySections.includes('roof_geometry')) {
      if (context.propertyIntel.totalRoofAreaSqFt) {
        lines.push(
          `- Total Roof Area: ${context.propertyIntel.totalRoofAreaSqFt.toLocaleString()} sq ft (${context.propertyIntel.roofingSquares ?? Math.round(context.propertyIntel.totalRoofAreaSqFt / 100)} roofing squares)`
        );
      }
      if (context.propertyIntel.dominantPitch) {
        lines.push(
          `- Roof Pitch: ${context.propertyIntel.dominantPitch}${
            context.propertyIntel.isSteep ? ' (Steep slope - access safety/labor difficulty consideration)' : ''
          }`
        );
      }
      if (context.propertyIntel.complexityLabel) {
        lines.push(`- Roof Complexity: ${context.propertyIntel.complexityLabel}`);
      }
    }

    if (profile.primarySections.includes('solar_energy') && context.propertyIntel.solarPanelCapacity) {
      lines.push(`- Max Solar Capacity: ~${context.propertyIntel.solarPanelCapacity} panels`);
    }

    if (profile.primarySections.includes('site_lot')) {
      if (context.propertyIntel.lotSizeAcres || context.propertyIntel.lotSizeSqFt) {
        lines.push(
          `- Total Lot Size: ${context.propertyIntel.lotSizeAcres ? `${context.propertyIntel.lotSizeAcres} acres` : ''}${context.propertyIntel.lotSizeSqFt ? ` (${context.propertyIntel.lotSizeSqFt.toLocaleString()} sq ft)` : ''}`
        );
      }
      if (context.propertyIntel.groundFootprintSqFt) {
        lines.push(`- Building Ground Footprint: ${context.propertyIntel.groundFootprintSqFt.toLocaleString()} sq ft`);
      }
    }

    if (lines.length > 1) {
      propertyLines = lines.join('\n');
    }
  }

  let roomScanLines = '';
  if (context.roomSpatialScan) {
    const scan = context.roomSpatialScan;
    const rLines = [
      `IMPORTED ROOM MEASUREMENTS (one room only; verify critical dimensions on site):`,
      `- Floor Area: ${scan.floorAreaSqFt} sq ft (use directly for flooring/tile/carpet quantities)`,
      `- Net Paintable Wall Area: ${scan.netPaintableWallSqFt} sq ft (excl. ${scan.openingsAreaSqFt} sq ft doors/windows; use for paint/drywall quantities)`,
      `- Ceiling Height: ${scan.ceilingHeightFt} ft`,
      `- Baseboard Perimeter Trim: ${scan.baseboardLinearFt} lin ft (${scan.doorsCount} doors deducted)`,
    ];
    if (scan.primaryAlcoveSpanInches) {
      rLines.push(`- Shower/Tub Alcove Span: ${scan.primaryAlcoveSpanInches.toFixed(1)}" (indicates standard 60" vs custom pan fit)`);
      rLines.push(`- Estimated Tile Area: ${scan.tileAreaSqFt} sq ft (floor plus assumed three-sided surround; verify coverage before quoting)`);
    }
    roomScanLines = rLines.join('\n');
  }

  return [
    `You draft an itemized quote for a ${context.trade || 'home services'} contractor to review before they send it.`,
    'You are drafting FOR THE CONTRACTOR, not for their customer: be specific and practical, not reassuring.',
    '',
    book
      ? `THIS CONTRACTOR'S PRICE BOOK — use these services wherever the work matches one:\n${book}`
      : 'This contractor has not set up a price book, so you will have to estimate every line.',
    '',
    pricingIntelLines ? `${pricingIntelLines}\n` : '',
    history ? `WHAT THEY HAVE CHARGED RECENTLY (their real quotes):\n${history}` : '',
    '',
    propertyLines ? `${propertyLines}\n` : '',
    roomScanLines ? `${roomScanLines}\n` : '',
    'Return STRICT JSON only:',
    '{"lines":[{"label":"<what the line is>","service":"<exact price-book name, or omit>","quantity":<number|null>,',
    '"amount":<number>,"kind":"base"|"addon","priced_from":"book"|"history"|"estimate","note":"<short, optional>"}],',
    '"summary":"<one sentence for the contractor>","assumptions":["<what you had to assume>"],',
    '"needs_more_info":true|false,"questions":["<what to ask the customer>"]}',
    '',
    'RULES:',
    '- ITEMIZE. Break the work into the parts a customer would expect to see priced separately — that is the entire point of this draft. A single line for a big job is a failure: the contractor could have typed one number themselves.',
    `  A quick service call is 1-2 lines. Substantial work (a replacement, a repipe, a re-roof) is 4-8 lines covering the real components a tradesperson knows it takes: access and demolition, materials, labour, fixtures or units, permits and inspection where that trade requires them, and making good afterwards. Never more than ${MAX_DRAFT_LINES}.`,
    '- Do NOT pad. Every line must be work somebody actually does on this job; if you would struggle to justify it to the customer, leave it out. A line the contractor has to delete costs them more attention than one they have to add.',
    '- When a line matches a price-book service, put that service name in "service" EXACTLY as written above, and set "quantity" (hours, sqft, or how many of that flat job). The contractor\'s own price will be applied — your "amount" is only a sanity check.',
    '- ADAPTIVE PRICING & CLOSE-RATE OPTIMIZATION:',
    '  * Leverage the account close-rate and sweet-spot intelligence provided above to structure quotes for maximum conversion.',
    '  * Keep essential core work in "base" lines priced competitively around winning historical ranges. Place nice-to-have or premium additions in "kind":"addon" so clients can opt in without jeopardizing base quote approval.',
    '  * Reflect seasonal demand posture: in peak seasons, quote full rates without undercutting; in shoulder/off-peak seasons, emphasize clear value and high-conversion base pricing.',
    '  * When historical comps marked [Same ZIP] are available, give them strong weighting for localized labor and material scale.',
    '- SCOPE-CONSCIOUS MEASUREMENT APPLICATION:',
    '  * When imported room measurements are provided above, snap relevant line-item quantities DIRECTLY to these numbers:',
    '    - Flooring/tile lines MUST use the Floor Area.',
    '    - Wall painting/drywall lines MUST use the Net Paintable Wall Area.',
    '    - Baseboard/trim lines MUST use the Baseboard Perimeter Trim linear feet.',
    '  * Raw property dimensions provide structural context, not direct line-item quantities.',
    '  * Living Area is total finished interior floor space; it must NOT be used as paintable wall area or single-room square footage.',
    '  * Roof Squares and Pitch reflect 3D roof surface geometry; use them ONLY for roofing, shingle replacement, and solar scopes. Pitch informs safety and access difficulty; roof squares must NOT price gutters, siding, or interior work.',
    '  * Foundation type and heating fuel indicate equipment accessibility and utility types; they do NOT substitute for Manual J HVAC load sizing.',
    '  * For pre-1978 properties, include EPA RRP lead-safe containment/testing assumptions ONLY when the scope plausibly disturbs painted surfaces.',
    context.photos && context.photos.length > 0
      ? '- Attached job photos are provided. Inspect visible equipment tags, damage, materials, and working conditions to ground your line items, quantities, and price-book selections directly in what is visible.'
      : '',
    '- When nothing in the book matches, omit "service" and price it yourself. Set priced_from to "history" whenever you leaned on their recent quotes above — including scaling one of them up or down — and "estimate" only when you priced it from general knowledge of the trade. Be honest about this; the contractor is shown which is which.',
    '- Prefer their own numbers over national averages. These are the prices this business actually gets in its own market.',
    '- Put genuinely optional work in "kind":"addon". Do not invent add-ons to make the quote look thorough.',
    '- "assumptions" is where you say what you could not tell from the description — the contractor reads this before sending, so it is the most useful field you produce. Say what you assumed about size, access, materials and condition.',
    '- Set needs_more_info true and return questions with NO lines only when the description is too vague to price at all. A thin description with an obvious most-likely job should still be drafted, with the assumption stated.',
    '- Never include the customer\'s name or address in any label.',
    'Output nothing except the JSON object.',
  ].filter(Boolean).join('\n');
}

/**
 * Draft a quote. Returns null when it genuinely could not run — no API key, a
 * provider failure, unparseable output — so the caller can say "couldn't draft"
 * rather than showing an empty quote that looks like a considered answer.
 */
export async function draftQuote(context: DraftContext): Promise<QuoteDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !context.scope) return null;

  const input = [
    `JOB TO QUOTE:\n${context.scope.slice(0, 2000)}`,
    context.estimatedHours ? `The contractor estimates about ${context.estimatedHours} hours of work.` : '',
    context.refinement ? `CONTRACTOR REFINEMENT INSTRUCTION:\n${context.refinement}` : '',
    'Draft the quote as JSON.',
  ].filter(Boolean).join('\n\n');

  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: input },
  ];
  if (context.photos && context.photos.length > 0) {
    for (const url of context.photos.slice(0, 4)) {
      if (typeof url === 'string' && url.length > 5) {
        content.push({ type: 'input_image', image_url: url });
      }
    }
  }

  try {
    const response = await callModel({
      model: 'gpt-4o',
      // Low but not zero: quoting benefits from recognizing that a job needs a
      // line nobody wrote down, which greedy decoding tends to skip.
      temperature: 0.2,
      instructions: buildDraftInstructions(context),
      input: content,
      text: { format: { type: 'json_object' } },
    }, { accountId: context.accountId, kind: 'quote_draft' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

    const raw = JSON.parse(extractOutputText(await response.json())) as RawDraft;
    return reconcileDraft(raw, context.services);
  } catch (error) {
    if (error instanceof AiDraftsExhaustedError) throw error;
    console.error('Quote draft failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
