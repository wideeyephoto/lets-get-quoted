import { callModel } from '@/lib/ai-model-call';

export type LeadDetectedEquipment = {
  type?: string;
  brand?: string;
  model?: string;
  specs?: string;
  approxAgeYears?: number;
};

export type LeadVisualPickListItem = {
  category: string;
  name: string;
  quantity?: string;
  notes?: string;
};

export type LeadVisualAnalysis = {
  summary: string;
  detectedEquipment: LeadDetectedEquipment[];
  observedIssues: string[];
  suggestedPickList: LeadVisualPickListItem[];
  safetyOrCodeFlags: string[];
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  confidence: number;
};

const INSTRUCTIONS = [
  'You are an expert master tradesperson and field estimator inspecting homeowner photos of a job.',
  'Analyze the provided job photos carefully and extract structured technical details as JSON.',
  '',
  'Return JSON shape exactly:',
  '{',
  '  "summary": "<1-2 sentence plain-English technical overview of what is seen in the photos>",',
  '  "detectedEquipment": [',
  '    {',
  '      "type": "<e.g. Water Heater, Main Panel, Furnace, Condenser, Drain Stack>",',
  '      "brand": "<e.g. Rheem, Square D, Carrier, Bradford White or null>",',
  '      "model": "<e.g. Model number if legible on data badge, or null>",',
  '      "specs": "<e.g. 50 Gallon Gas, 200A 30-Space, 3-Ton 14-SEER or null>",',
  '      "approxAgeYears": <estimated age in years or null>',
  '    }',
  '  ],',
  '  "observedIssues": [',
  '    "<specific visible point of failure, damage, corrosion, rot, or leak>"',
  '  ],',
  '  "suggestedPickList": [',
  '    {',
  '      "category": "<e.g. Valves, Pipes & Fittings, Electrical, Roof & Flashing, Hardware>",',
  '      "name": "<specific part name contractor should pick up at supply house>",',
  '      "quantity": "<e.g. 1 pc, 10 ft, 2 bundles, 1 box>",',
  '      "notes": "<why this part is recommended for this repair/install>"',
  '    }',
  '  ],',
  '  "safetyOrCodeFlags": [',
  '    "<clear code requirement or safety hazard, e.g. missing drip pan, lack of sediment trap, ungrounded wiring, pre-1978 lead risk>"',
  '  ],',
  '  "urgency": "low" | "medium" | "high" | "emergency",',
  '  "confidence": <number between 0 and 1 indicating visual clarity and certainty>',
  '}',
  '',
  'RULES:',
  '- Ground your analysis in what is ACTUALLY visible in the photos. Do not hallucinate equipment badges you cannot read.',
  '- If no specific equipment badge is readable, provide realistic specs from visual appearance (e.g. "Standard 40-50 gal atmospheric gas water heater").',
  '- The suggested pick-list should contain practical, standard supply house materials necessary to fix or install what is pictured.',
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

export function normalizeVisualAnalysis(raw: unknown): LeadVisualAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) return null;

  const rawEquip = Array.isArray(obj.detectedEquipment) ? obj.detectedEquipment : [];
  const detectedEquipment: LeadDetectedEquipment[] = rawEquip.map((item) => {
    const e = item as Record<string, unknown>;
    return {
      type: typeof e.type === 'string' && e.type.trim() ? e.type.trim().slice(0, 80) : undefined,
      brand: typeof e.brand === 'string' && e.brand.trim() ? e.brand.trim().slice(0, 80) : undefined,
      model: typeof e.model === 'string' && e.model.trim() ? e.model.trim().slice(0, 80) : undefined,
      specs: typeof e.specs === 'string' && e.specs.trim() ? e.specs.trim().slice(0, 120) : undefined,
      approxAgeYears: Number.isFinite(Number(e.approxAgeYears)) ? Math.max(0, Math.min(100, Math.round(Number(e.approxAgeYears)))) : undefined,
    };
  }).filter((e) => e.type || e.brand || e.specs);

  const rawIssues = Array.isArray(obj.observedIssues) ? obj.observedIssues : [];
  const observedIssues = rawIssues
    .map((s) => (typeof s === 'string' ? s.trim().slice(0, 200) : ''))
    .filter(Boolean);

  const rawPickList = Array.isArray(obj.suggestedPickList) ? obj.suggestedPickList : [];
  const suggestedPickList: LeadVisualPickListItem[] = rawPickList.map((item) => {
    const p = item as Record<string, unknown>;
    return {
      category: typeof p.category === 'string' && p.category.trim() ? p.category.trim().slice(0, 60) : 'General Materials',
      name: typeof p.name === 'string' ? p.name.trim().slice(0, 120) : 'Part / Material',
      quantity: typeof p.quantity === 'string' && p.quantity.trim() ? p.quantity.trim().slice(0, 40) : undefined,
      notes: typeof p.notes === 'string' && p.notes.trim() ? p.notes.trim().slice(0, 200) : undefined,
    };
  }).filter((p) => p.name);

  const rawSafety = Array.isArray(obj.safetyOrCodeFlags) ? obj.safetyOrCodeFlags : [];
  const safetyOrCodeFlags = rawSafety
    .map((s) => (typeof s === 'string' ? s.trim().slice(0, 200) : ''))
    .filter(Boolean);

  const validUrgencies = new Set(['low', 'medium', 'high', 'emergency']);
  const urgency = typeof obj.urgency === 'string' && validUrgencies.has(obj.urgency.toLowerCase())
    ? (obj.urgency.toLowerCase() as LeadVisualAnalysis['urgency'])
    : 'medium';

  const confidence = Number.isFinite(Number(obj.confidence))
    ? Math.max(0, Math.min(1, Number(obj.confidence)))
    : 0.8;

  return {
    summary,
    detectedEquipment,
    observedIssues,
    suggestedPickList,
    safetyOrCodeFlags,
    urgency,
    confidence,
  };
}

/**
 * Analyzes lead photos using GPT-4o vision to extract equipment specs, observed issues,
 * and a suggested supply house pick-list.
 */
export async function analyzeLeadPhotos(params: {
  accountId: string;
  trade?: string | null;
  description?: string | null;
  photoUrls: string[];
}): Promise<LeadVisualAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || params.photoUrls.length === 0) return null;

  const validUrls = params.photoUrls.filter((url) => typeof url === 'string' && url.length > 5).slice(0, 4);
  if (validUrls.length === 0) return null;

  const textHeader = [
    params.trade ? `TRADE: ${params.trade}` : '',
    params.description ? `HOMEOWNER REQUEST:\n${params.description.slice(0, 1500)}` : '',
    'Analyze the attached job photos and output technical JSON.',
  ].filter(Boolean).join('\n\n');

  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: textHeader }
  ];

  for (const url of validUrls) {
    content.push({ type: 'input_image', image_url: url });
  }

  try {
    const response = await callModel({
      model: 'gpt-4o',
      temperature: 0.1,
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_object' } },
    }, { accountId: params.accountId, kind: 'lead_photo_analysis' });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    return normalizeVisualAnalysis(JSON.parse(extractOutputText(payload)));
  } catch (error) {
    console.error('Lead photo analysis failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
