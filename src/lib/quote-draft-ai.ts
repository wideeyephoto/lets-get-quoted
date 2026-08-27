import type { SupabaseClient } from '@supabase/supabase-js';
import { listServices } from '@/lib/services';
import { parseQuoteItems } from '@/lib/jobs';
import { getSiteContent } from '@/lib/site-content';
import { callModel, AiDraftsExhaustedError } from '@/lib/ai-model-call';
import { createLeadPhotoLinks } from '@/lib/lead-photo-storage';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import {
  formatPriceBook, formatQuoteHistory, reconcileDraft, MAX_DRAFT_LINES, MAX_HISTORY_JOBS,
  type HistoricalQuote, type PriceBookEntry, type QuoteDraft, type RawDraft,
} from '@/lib/quote-draft';
import {
  getPropertyIntelligence,
  summarizePropertyIntelligence,
  type PropertyIntelligenceSummary,
} from '@/lib/property-intel';

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
  /** Signed URLs or data URLs of job/lead photos to visually ground the quote */
  photos?: string[];
};

export { QUICK_QUOTE_REFINE_CHIPS } from '@/lib/quote-draft';

/**
 * Everything the drafter needs, in one place.
 *
 * Deliberately does NOT load the client's name, phone, email or address into the prompt.
 * Only verified geometric measurements (e.g. roof squares, footprint sq ft) and visual photos are passed.
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

  const [services, { data: site }, { data: past }, propertyIntel] = await Promise.all([
    listServices(supabase, accountId, { activeOnly: true }),
    // The trade lives in the website's content, not on the account — it's the
    // owner's own words for what they do ("window cleaning", "roofing"), which
    // is exactly the context that stops a drain job being priced like a remodel.
    supabase.from('sites').select('content').eq('account_id', accountId).limit(1).maybeSingle(),
    // Recent priced work, newest first — what this business actually charges,
    // which beats what the trade charges nationally every time.
    supabase
      .from('jobs')
      .select('scope, quoted_amount, quote_items')
      .eq('account_id', accountId)
      .neq('id', jobId)
      .gt('quoted_amount', 0)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_JOBS * 2),
    // If the job has an address, fetch property & roof measurements to size quantities accurately
    typeof job.address === 'string' && job.address.trim().length >= 5
      ? getPropertyIntelligence({ address: job.address.trim() }).catch(() => null)
      : Promise.resolve(null),
  ]);

  let photoUrls: string[] = [];
  const jobPhotoPaths = Array.isArray(job.photo_paths) ? (job.photo_paths as string[]) : [];
  if (jobPhotoPaths.length > 0) {
    try {
      const links = await createJobPhotoLinks(accountId, jobPhotoPaths);
      photoUrls = links.map((l) => l.url);
    } catch {
      // Photo signing fallback
    }
  } else if (job.lead_id) {
    try {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('photo_paths')
        .eq('account_id', accountId)
        .eq('id', job.lead_id)
        .maybeSingle();
      const leadPhotoPaths = Array.isArray(leadRow?.photo_paths) ? (leadRow.photo_paths as string[]) : [];
      if (leadPhotoPaths.length > 0) {
        const links = await createLeadPhotoLinks(accountId, leadPhotoPaths);
        photoUrls = links.map((l) => l.url);
      }
    } catch {
      // Photo signing fallback
    }
  }

  const history: HistoricalQuote[] = (past ?? []).map((row) => ({
    scope: (row.scope as string | null) ?? null,
    total: Number(row.quoted_amount) || 0,
    lines: parseQuoteItems(row.quote_items).map((item) => ({ label: item.label, amount: Number(item.amount) || 0 })),
  }));

  return {
    accountId,
    scope: ((job.scope as string | null) ?? '').trim(),
    trade: getSiteContent(site?.content as Record<string, unknown> | null).trade.trim() || null,
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
    photos: photoUrls.slice(0, 4),
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

  const propertyLines = context.propertyIntel
    ? [
        'VERIFIED PROPERTY & ROOF MEASUREMENTS (Use for accurate quantities and sizing):',
        context.propertyIntel.yearBuilt
          ? `- Year Built: ${context.propertyIntel.yearBuilt}${context.propertyIntel.isPre1978LeadRisk ? ' (Pre-1978 structure: consider EPA Lead-Safe certified protocols if disturbing painted surfaces/pipes)' : ''}`
          : '',
        context.propertyIntel.livingAreaSqFt
          ? `- Interior Living Area: ${context.propertyIntel.livingAreaSqFt.toLocaleString()} sq ft`
          : '',
        context.propertyIntel.lotSizeAcres || context.propertyIntel.lotSizeSqFt
          ? `- Total Lot Size: ${context.propertyIntel.lotSizeAcres ? `${context.propertyIntel.lotSizeAcres} acres` : ''}${context.propertyIntel.lotSizeSqFt ? ` (${context.propertyIntel.lotSizeSqFt.toLocaleString()} sq ft)` : ''}`
          : '',
        context.propertyIntel.stories ? `- Stories: ${context.propertyIntel.stories}` : '',
        context.propertyIntel.bedrooms || context.propertyIntel.bathrooms
          ? `- Layout: ${context.propertyIntel.bedrooms ?? '?'} beds / ${context.propertyIntel.bathrooms ?? '?'} baths`
          : '',
        context.propertyIntel.heatingFuel ? `- Heating Fuel: ${context.propertyIntel.heatingFuel}` : '',
        context.propertyIntel.foundationType ? `- Foundation: ${context.propertyIntel.foundationType}` : '',
        context.propertyIntel.totalRoofAreaSqFt
          ? `- Total Roof Area: ${context.propertyIntel.totalRoofAreaSqFt.toLocaleString()} sq ft (${context.propertyIntel.roofingSquares ?? Math.round(context.propertyIntel.totalRoofAreaSqFt / 100)} roofing squares)`
          : '',
        context.propertyIntel.groundFootprintSqFt
          ? `- Building Ground Footprint: ${context.propertyIntel.groundFootprintSqFt.toLocaleString()} sq ft`
          : '',
        context.propertyIntel.dominantPitch
          ? `- Roof Pitch: ${context.propertyIntel.dominantPitch}${context.propertyIntel.isSteep ? ' (Steep slope - include steep safety/labor adder if applicable)' : ''}`
          : '',
        context.propertyIntel.complexityLabel
          ? `- Roof Complexity: ${context.propertyIntel.complexityLabel}`
          : '',
        context.propertyIntel.solarPanelCapacity
          ? `- Max Solar Capacity: ~${context.propertyIntel.solarPanelCapacity} panels`
          : '',
      ].filter(Boolean).join('\n')
    : '';

  return [
    `You draft an itemized quote for a ${context.trade || 'home services'} contractor to review before they send it.`,
    'You are drafting FOR THE CONTRACTOR, not for their customer: be specific and practical, not reassuring.',
    '',
    book
      ? `THIS CONTRACTOR'S PRICE BOOK — use these services wherever the work matches one:\n${book}`
      : 'This contractor has not set up a price book, so you will have to estimate every line.',
    '',
    history ? `WHAT THEY HAVE CHARGED RECENTLY (their real quotes):\n${history}` : '',
    '',
    propertyLines ? `${propertyLines}\n` : '',
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
    '- When property dimensions are provided above, use the verified square footage, squares, and pitch for quantities and line items.',
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
