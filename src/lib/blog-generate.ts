import 'server-only';
import { callModel } from '@/lib/ai-model-call';

// Shared server-side blog drafter. Used by the builder's "Generate a draft"
// action AND the biweekly cron, so it takes plain site fields (no auth context)
// and returns the raw post fields — the caller assembles the SiteBlogPost
// (id/slug/date/status) so drafts always land as unpublished, owner-approved.
export type GeneratedBlogPost = {
  title: string;
  excerpt: string;
  body: string;
  /**
   * The trade this was written for, echoed back so the caller can stamp it on
   * the post.
   *
   * Returned from HERE rather than read off the site again by whoever saves the
   * draft: this is the trade the prompt actually used, and the two could differ
   * if the owner changes trade while a draft is generating. The stamp has to
   * describe the article, not the account at save time — that is the whole
   * point of it. Empty when the trade was unknown and the model was left to
   * infer it from the business name, because a guess is not a record.
   */
  trade: string;
};

function asString(value: unknown, max: number): string {
  return (typeof value === 'string' ? value : '').trim().slice(0, max);
}

// The Responses API returns content under output[].content[].text; fall back
// through the convenience field and concatenate any text parts.
function extractOutputText(payload: unknown): string {
  const root = payload as { output_text?: unknown; output?: unknown };
  if (typeof root.output_text === 'string') return root.output_text;
  const out = root.output;
  if (Array.isArray(out)) {
    const parts: string[] = [];
    for (const item of out) {
      const content = (item as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const chunk of content) {
          const text = (chunk as { text?: unknown }).text;
          if (typeof text === 'string') parts.push(text);
        }
      }
    }
    if (parts.length) return parts.join('');
  }
  return '';
}

export async function draftBlogPost(input: {
  companyName: string;
  /**
   * The trade the site is actually configured for.
   *
   * PASS THIS. Without it the model is asked to guess the trade from the
   * business name, and a plumbing site called "BrokePipes" got a post about
   * window cleaning — published, on a live site, under the contractor's own
   * name. The site has always known its trade; the drafter was simply never
   * told. Guessing is now the fallback for sites saved before the trade field
   * existed, not the normal path.
   */
  trade?: string;
  serviceArea?: string;
  topic?: string;
}): Promise<GeneratedBlogPost> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI generation is not configured yet.');

  const company = input.companyName.trim() || 'this local business';
  const trade = (input.trade || '').trim().slice(0, 80);
  const area = (input.serviceArea || '').trim();
  const topic = (input.topic || '').trim();

  const instructions =
    "You write genuinely useful, informational blog posts for a local home-services contractor's website, written for homeowners. " +
    (trade
      ? `The business is a ${trade}. Write the post about that trade and no other — never about a different trade, however related, and never about work this business does not do. `
      : 'Infer the trade (HVAC, plumbing, roofing, cleaning, painting, landscaping, electrical, remodeling, handyman, flooring, etc.) from the business name. ') +
    'The post MUST be helpful and educational — maintenance tips, seasonal advice, how-to guidance, warning signs to watch for, or what to know before hiring — NOT a sales pitch and NOT about the company itself. ' +
    'Write in a friendly, expert, plain-English tone. Do not use markdown headings, bullet characters, or links. Do not invent specific statistics, studies, prices, or brand names. ' +
    'Respond with strict JSON only, no other text, in this exact shape: ' +
    '{' +
    '"title":"<a clear, specific, non-clickbait title under 70 characters>",' +
    '"excerpt":"<one sentence summarizing the post, under 160 characters>",' +
    '"body":"<450 to 650 words as 5 to 7 short paragraphs separated by a blank line (\\n\\n). Plain prose only, no headings.>"' +
    '}';

  const userInput =
    `Business name: ${company}. ${trade ? `Trade: ${trade}. ` : ''}${area ? `Service area: ${area}. ` : ''}` +
    (topic
      ? `Write the post about: ${topic}. `
      : 'Choose a seasonally useful, on-trade topic a homeowner in this area would search for. ') +
    'Respond with json only.';

  const response = await callModel({
    model: 'gpt-4o-mini',
    temperature: 1,
    instructions,
    input: userInput,
    text: { format: { type: 'json_object' } },
  }, { accountId: null, kind: 'platform_content' });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(extractOutputText(payload)) as Record<string, unknown>;

  const title = asString(parsed.title, 120);
  const body = asString(parsed.body, 8000);
  if (!title || !body) throw new Error('The AI returned an empty draft. Please try again.');

  return { title, excerpt: asString(parsed.excerpt, 200), body, trade };
}
