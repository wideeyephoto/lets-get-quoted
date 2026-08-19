// Turning a photo and a crew member's note into a priced change order.
//
// Same boundary as everywhere else money is involved: the model decides WHAT
// work is needed, and the price book decides what it costs. reconcileDraft in
// quote-draft.ts is reused wholesale, so a line that matches a price-book entry
// is priced from the book and the model's number is overridden.
//
// The photo is genuinely useful here in a way it isn't for a quote: the crew
// member is describing something they are looking at, and "six sheets" means
// something different on a photo of a wall than on a photo of a roof.

import { reconcileDraft, type PriceBookEntry, type QuoteDraft, type RawDraft } from '@/lib/quote-draft';
import { callModel } from '@/lib/ai-model-call';

export type ChangeOrderDraftContext = {
  trade: string | null;
  /** The original job, so the model doesn't re-quote work already sold. */
  jobScope: string;
  /** What the crew member said they found. */
  fieldNote: string;
  /** Data URLs of what they photographed. At most a few. */
  photos: string[];
  services: PriceBookEntry[];
};

export const MAX_CHANGE_ORDER_PHOTOS = 3;

const INSTRUCTIONS = [
  'You write up change orders for a home-services contractor. A crew member on site has found something that was not part of the original job, and has described it and photographed it.',
  '',
  'Return JSON:',
  '{"title":string,"scope":string,"lines":[{"label":string,"service_name":string|null,"quantity":number|null,"amount":number,"priced_from":"price_book"|"estimate"}],',
  ' "assumptions":[string],"questions":[string],"needs_more_info":boolean}',
  '',
  'RULES',
  '- Write ONLY the additional work. The original job is given for context so you do not re-sell what the customer has already bought.',
  '- "scope" is read by the HOMEOWNER, who is being asked to pay more than they agreed to. Say plainly what was found, why it needs doing, and what happens if it is not done. No jargon, no blame, no pressure.',
  '- "title" is short and factual: "Replace rotted sheathing", not "Additional works required".',
  '- Set "service_name" to the contractor\'s price-book entry when one covers the line. Their price will replace whatever number you give.',
  '- Use "quantity" for anything sold per unit — sheets, feet, hours. It is how their per-unit price gets multiplied correctly.',
  '- "amount" is your best estimate ONLY for lines with no price-book match. Say so with "priced_from":"estimate".',
  '- Read the photo for what it actually shows. If it does not show what the note describes, say so in "assumptions" rather than writing up work you cannot see.',
  '- "assumptions" is what you could not tell from the note or the photo. The contractor reads this before sending, so it is the most useful thing you produce.',
  '- Set needs_more_info true with questions and NO lines only when you genuinely cannot tell what work is needed.',
  '- Never include the customer\'s name or address.',
  'Output nothing except the JSON object.',
].join('\n');

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

/**
 * Exported so a test can pin the "json" requirement.
 *
 * The Responses API 400s on text.format json_object unless the word appears in
 * the INPUT — instructions are not enough — and that 400 is caught and returns
 * null, so the whole drafter would fail silently on every change order.
 */
export function buildChangeOrderInput(context: ChangeOrderDraftContext): string {
  return [
    context.trade ? `TRADE: ${context.trade}` : '',
    context.jobScope ? `THE JOB ALREADY SOLD:\n${context.jobScope.slice(0, 1200)}` : '',
    `WHAT THE CREW FOUND:\n${context.fieldNote.slice(0, 1500)}`,
    'Write up the additional work as JSON.',
  ].filter(Boolean).join('\n\n');
}

export type ChangeOrderDraft = QuoteDraft & { title: string; scope: string };

/**
 * Draft a change order. Returns null when it genuinely could not run, so the
 * caller says "couldn't draft" rather than showing an empty write-up that looks
 * like a considered answer.
 */
export async function draftChangeOrder(context: ChangeOrderDraftContext): Promise<ChangeOrderDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !context.fieldNote.trim()) return null;

  const content: Record<string, unknown>[] = [{ type: 'input_text', text: buildChangeOrderInput(context) }];
  for (const photo of context.photos.slice(0, MAX_CHANGE_ORDER_PHOTOS)) {
    if (photo.startsWith('data:image/')) content.push({ type: 'input_image', image_url: photo });
  }

  try {
    const response = await callModel({
      model: 'gpt-4o',
      temperature: 0.2,
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_object' } },
    }, { accountId: null, kind: 'change_order_draft' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

    const raw = JSON.parse(extractOutputText(await response.json())) as RawDraft & { title?: unknown; scope?: unknown };
    // Money is reconciled against the price book here, exactly as a quote is.
    const draft = reconcileDraft(raw, context.services);
    return {
      ...draft,
      title: String(raw?.title ?? '').trim().slice(0, 120) || 'Additional work',
      scope: String(raw?.scope ?? '').trim().slice(0, 2000),
    };
  } catch (error) {
    console.error('Change order draft failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
