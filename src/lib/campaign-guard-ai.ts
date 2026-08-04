// The half of Campaign Guard that reads.
//
// The model gets the message and the trade. It does NOT get the customer list,
// the reach counts, or anything about who this is going to — the audience is a
// database question with consent rules attached, and the model has no business
// near it.
//
// Everything it can return is the name of something MISSING. It is never asked
// whether the message is good, and it cannot rewrite it: a review that returns
// improved text is a review whose output somebody sends without reading, and
// the whole point of a check before an irreversible send is that a human looks.

import type { CampaignFinding } from '@/lib/campaign-guard';

export type CampaignReadContext = {
  trade: string | null;
  channel: 'email' | 'sms' | 'both';
  subject: string;
  body: string;
  /** The month it's going out in, so "does it say why now" is answerable. */
  monthName: string;
};

type RawGap = { id?: unknown; title?: unknown; why?: unknown; confidence?: unknown };

const INSTRUCTIONS = [
  'You are reviewing a marketing message a small home-services contractor is about to send to their past customers. You are looking ONLY for things that are MISSING from it.',
  '',
  'Return JSON: {"gaps":[{"id":string,"title":string,"why":string,"confidence":"high"|"medium"|"low"}]}',
  '',
  'WHAT TO LOOK FOR',
  '- No reason why it is being sent THIS month. Timing is the whole justification for a seasonal message; without it there is no reason for the reader to act now rather than never.',
  '- Nothing useful to a reader who will never book. A message that is only an advert is a message that gets unsubscribed from.',
  '- No clear single ask. The reader should finish it knowing the one thing to do.',
  '- No way to act on the ask: no phone number, no link, no "reply to this", nothing.',
  '- A claim that needs evidence and has none, or a number presented as fact.',
  '- It reads as written by a marketing department rather than by the owner between jobs.',
  '',
  'RULES',
  '- Only say what is ABSENT. Never rewrite, never suggest wording, never provide a replacement sentence or subject line. You are pointing at a hole, not filling it.',
  '- Never comment on who it should go to, how many people should get it, or when to schedule it. You have not been told any of that and cannot know.',
  '- Return an EMPTY array when nothing is genuinely missing. A check that always finds something gets ignored, and then it finds nothing.',
  '- "why" points at the actual message. If you cannot point at anything, do not raise it.',
  '- "confidence" is high only when it is plainly absent. A stylistic preference is low.',
  '- At most 4 gaps, best first.',
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
 * Text that looks like a suggested replacement rather than a description of a
 * gap. Quoted sentences, "try:", "consider adding X so that…" — the model
 * drifting from naming the hole to filling it.
 *
 * Dropped rather than trimmed, for the same reason Quote Guard drops a finding
 * that names a price: the instruction not to rewrite is a request, and this is
 * the rule. A contractor who is handed a sentence will paste it, and then the
 * message going to their whole list was written by something that never saw
 * their customers.
 */
const REWRITES = /(^|\s)(try|use|say|write|change it to|replace .* with|something like)\s*[:"“]/i;

export function toGapFindings(raw: unknown): CampaignFinding[] {
  const record = (raw ?? {}) as { gaps?: unknown };
  const list = Array.isArray(record.gaps) ? record.gaps : [];
  const findings: CampaignFinding[] = [];

  for (const entry of list.slice(0, 4)) {
    const item = entry as RawGap;
    const title = String(item?.title ?? '').trim();
    const why = String(item?.why ?? '').trim();
    if (!title || !why) continue;
    if (REWRITES.test(title) || REWRITES.test(why)) continue;

    const confidence = String(item?.confidence ?? 'low').toLowerCase();
    findings.push({
      id: `ai:${String(item?.id ?? title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
      // Never 'high'. A model's read of tone sits below "you have no mailing
      // address on file", and topping the list with an opinion is how the
      // findings that actually block a send get scrolled past.
      severity: confidence === 'high' ? 'medium' : 'low',
      title,
      detail: why,
      source: 'ai',
    });
  }
  return findings;
}

/**
 * Exported so the "json" requirement can be pinned by a test.
 *
 * The Responses API rejects `text.format: json_object` unless the word appears
 * in the INPUT — having it in the instructions is not enough. That 400 is
 * caught below and returns an empty list, which would mean the read half of the
 * guard failing on every campaign while the panel carried on looking like it
 * had run. A silent 100% failure is exactly the bug a test should own.
 */
export function buildCampaignReadInput(context: CampaignReadContext): string {
  return [
    context.trade ? `TRADE: ${context.trade}` : '',
    `GOING OUT IN: ${context.monthName}`,
    context.channel === 'sms' ? 'FORMAT: a text message.' : 'FORMAT: an email.',
    context.subject.trim() ? `SUBJECT: ${context.subject.trim().slice(0, 300)}` : '',
    `MESSAGE:\n${context.body.trim().slice(0, 4000)}`,
    'What is missing? Answer as JSON.',
  ].filter(Boolean).join('\n\n');
}

/**
 * Ask what's missing. Returns an empty list — not null — when it can't run, so
 * the panel shows the deterministic findings rather than an error: a campaign
 * checked with no API key still gets everything in campaign-guard.ts.
 */
export async function readCampaign(context: CampaignReadContext): Promise<CampaignFinding[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !context.body.trim()) return [];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        // Low but not zero, matching Quote Guard: noticing that a message never
        // says why it is arriving in October is exactly the kind of leap greedy
        // decoding skips, and that leap is the whole feature.
        temperature: 0.2,
        instructions: INSTRUCTIONS,
        input: buildCampaignReadInput(context),
        text: { format: { type: 'json_object' } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    return toGapFindings(JSON.parse(extractOutputText(await response.json())));
  } catch (error) {
    console.error('Campaign guard read failed:', error instanceof Error ? error.message : error);
    return [];
  }
}
