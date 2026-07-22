import 'server-only';

// Shared server-side blog drafter. Used by the builder's "Generate a draft"
// action AND the biweekly cron, so it takes plain site fields (no auth context)
// and returns the raw post fields — the caller assembles the SiteBlogPost
// (id/slug/date/status) so drafts always land as unpublished, owner-approved.
export type GeneratedBlogPost = { title: string; excerpt: string; body: string };

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
  serviceArea?: string;
  topic?: string;
}): Promise<GeneratedBlogPost> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('AI generation is not configured yet.');

  const company = input.companyName.trim() || 'this local business';
  const area = (input.serviceArea || '').trim();
  const topic = (input.topic || '').trim();

  const instructions =
    "You write genuinely useful, informational blog posts for a local home-services contractor's website, written for homeowners. " +
    'Infer the trade (HVAC, plumbing, roofing, cleaning, painting, landscaping, electrical, remodeling, handyman, flooring, etc.) from the business name. ' +
    'The post MUST be helpful and educational — maintenance tips, seasonal advice, how-to guidance, warning signs to watch for, or what to know before hiring — NOT a sales pitch and NOT about the company itself. ' +
    'Write in a friendly, expert, plain-English tone. Do not use markdown headings, bullet characters, or links. Do not invent specific statistics, studies, prices, or brand names. ' +
    'Respond with strict JSON only, no other text, in this exact shape: ' +
    '{' +
    '"title":"<a clear, specific, non-clickbait title under 70 characters>",' +
    '"excerpt":"<one sentence summarizing the post, under 160 characters>",' +
    '"body":"<450 to 650 words as 5 to 7 short paragraphs separated by a blank line (\\n\\n). Plain prose only, no headings.>"' +
    '}';

  const userInput =
    `Business name: ${company}. ${area ? `Service area: ${area}. ` : ''}` +
    (topic
      ? `Write the post about: ${topic}. `
      : 'Choose a seasonally useful, on-trade topic a homeowner in this area would search for. ') +
    'Respond with json only.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 1,
      instructions,
      input: userInput,
      text: { format: { type: 'json_object' } },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = await response.json();
  const parsed = JSON.parse(extractOutputText(payload)) as Record<string, unknown>;

  const title = asString(parsed.title, 120);
  const body = asString(parsed.body, 8000);
  if (!title || !body) throw new Error('The AI returned an empty draft. Please try again.');

  return { title, excerpt: asString(parsed.excerpt, 200), body };
}
