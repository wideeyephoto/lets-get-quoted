import { callModel } from '@/lib/ai-model-call';

export type ShowcaseCaseStudy = {
  title: string;
  headline: string;
  problemDescription: string;
  solutionDescription: string;
  keyMaterialsUsed: string[];
  tags: string[];
};

export type ShowcaseCaseStudyInput = {
  accountId: string;
  trade: string | null;
  businessName?: string | null;
  location?: string | null;
  jobScope?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

const INSTRUCTIONS = [
  'You are an expert marketing writer and project portfolio editor for a local trade contractor.',
  'Generate an engaging, SEO-friendly Before & After project case study from the provided photos and job scope.',
  '',
  'Return JSON shape exactly:',
  '{',
  '  "title": "<factual, location-rich title, under 70 chars, e.g. Rheem 50-Gal Water Heater Replacement in Rochester, MI>",',
  '  "headline": "<catchy benefit headline under 100 chars, e.g. From active basement leak to brand-new high-efficiency hot water>",',
  '  "problemDescription": "<1-2 concise paragraphs explaining what was wrong, the homeowner\'s situation, and symptoms visible in the Before photo>",',
  '  "solutionDescription": "<1-2 concise paragraphs detailing the craftsmanship, cleanup, and finished result visible in the After photo>",',
  '  "keyMaterialsUsed": ["<specific material or equipment installed>"],',
  '  "tags": ["<3 to 6 search tags, e.g. Water Heater, Plumbing Repair, Rochester MI, Rheem>"]',
  '}',
  '',
  'RULES:',
  '- Compare the Before and After photos for visible craftsmanship, clean installation lines, new fixtures, and quality workmanship.',
  '- Keep language authentic, professional, and confidence-inspiring. Avoid hype words like "revolutionized" or "miraculous".',
  '- Never invent non-existent customer names or private street addresses.',
  '- Output nothing except the strict JSON object.',
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

export function normalizeShowcaseCaseStudy(raw: unknown): ShowcaseCaseStudy | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 100) : '';
  const headline = typeof obj.headline === 'string' ? obj.headline.trim().slice(0, 140) : '';
  const problemDescription = typeof obj.problemDescription === 'string' ? obj.problemDescription.trim() : '';
  const solutionDescription = typeof obj.solutionDescription === 'string' ? obj.solutionDescription.trim() : '';

  if (!title || !solutionDescription) return null;

  const rawMaterials = Array.isArray(obj.keyMaterialsUsed) ? obj.keyMaterialsUsed : [];
  const keyMaterialsUsed = rawMaterials
    .map((m) => (typeof m === 'string' ? m.trim().slice(0, 100) : ''))
    .filter(Boolean);

  const rawTags = Array.isArray(obj.tags) ? obj.tags : [];
  const tags = rawTags
    .map((t) => (typeof t === 'string' ? t.trim().slice(0, 50) : ''))
    .filter(Boolean);

  return {
    title,
    headline: headline || title,
    problemDescription,
    solutionDescription,
    keyMaterialsUsed,
    tags,
  };
}

/**
 * Generates a Before & After portfolio showcase story using GPT-4o vision.
 */
export async function generateShowcaseCaseStudy(
  input: ShowcaseCaseStudyInput
): Promise<ShowcaseCaseStudy | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const textHeader = [
    input.trade ? `TRADE: ${input.trade}` : '',
    input.businessName ? `CONTRACTOR: ${input.businessName}` : '',
    input.location ? `LOCATION: ${input.location}` : '',
    input.jobScope ? `JOB SCOPE & COMPLETED WORK:\n${input.jobScope.slice(0, 2000)}` : '',
    'Generate the Before & After showcase case study as JSON.',
  ].filter(Boolean).join('\n\n');

  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: textHeader },
  ];

  if (input.beforePhotoUrl && input.beforePhotoUrl.length > 5) {
    content.push({
      type: 'input_text',
      text: 'BEFORE PHOTO (Starting condition / Problem):',
    });
    content.push({ type: 'input_image', image_url: input.beforePhotoUrl });
  }

  if (input.afterPhotoUrl && input.afterPhotoUrl.length > 5) {
    content.push({
      type: 'input_text',
      text: 'AFTER PHOTO (Finished craftsmanship / Solution):',
    });
    content.push({ type: 'input_image', image_url: input.afterPhotoUrl });
  }

  try {
    const response = await callModel({
      model: 'gpt-4o',
      temperature: 0.2,
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_object' } },
    }, { accountId: input.accountId, kind: 'showcase_case_study' });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    return normalizeShowcaseCaseStudy(JSON.parse(extractOutputText(payload)));
  } catch (error) {
    console.error('Showcase case study generation failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
