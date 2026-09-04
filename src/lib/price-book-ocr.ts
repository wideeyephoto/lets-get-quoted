import { callModel } from '@/lib/ai-model-call';

export type PriceBookOcrItem = {
  name: string;
  unit_price: number | null;
  unit_cost?: number | null;
  unit?: string | null;
  description?: string | null;
};

export type PriceBookOcrResult = {
  items: PriceBookOcrItem[];
  confidence: number;
  rawCsv: string;
  unreadable?: string[];
};

const INSTRUCTIONS = [
  'You read contractor price books, rate sheets, service catalogs, laminated truck sheets, and estimating menus off photos and scans and return JSON.',
  '',
  'Return exactly this shape:',
  '{"items":[{"name":string,"unit_price":number|null,"unit_cost":number|null,"unit":string|null,"description":string|null}],"confidence":number,"unreadable":[string]}',
  '',
  'RULES:',
  '- Transcribe every visible service, task, labor rate, or material line item.',
  '- "name" is the clean title or service name (e.g., "50-Gallon Gas Water Heater Install", "200A Electrical Panel Upgrade", "Gutter Cleaning (up to 2 stories)").',
  '- "unit_price" is the dollar amount or rate as a positive number (e.g. 150, 45.50, 1200). If a price range is shown (e.g. $150–$200), use the lower base number. If no price is stated, return null.',
  '- "unit_cost" is what the service or material costs the contractor (wholesale / expense / COGS) if printed. Null if not specified.',
  '- "unit" must be normalized to one of: "each", "hour", "sqft", "visit", "job" (or null if unspecified, which defaults to "each").',
  '- "description" captures scope notes, included materials, labor details, or specifications printed with the line item. Null if none provided.',
  '- "confidence" is your assessment of document legibility from 0.0 to 1.0 (1.0 = crystal clear).',
  '- "unreadable" lists any blurred, cut off, or illegible sections. Empty array if document was fully readable.',
  '- If the image does not contain any service or pricing information, return empty items array with confidence 0.',
  'Output nothing except valid JSON.',
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

function sanitizeCsvField(field: string | number | null | undefined): string {
  if (field === null || field === undefined) return '';
  const str = String(field).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts structured OCR items into CSV text suitable for the SmartImport pipeline. */
export function priceBookItemsToCsv(items: PriceBookOcrItem[]): string {
  const hasCost = items.some((i) => i.unit_cost !== undefined && i.unit_cost !== null);
  if (hasCost) {
    const header = 'Name,Price,Cost,Unit,Description';
    const rows = items.map((item) => {
      const name = sanitizeCsvField(item.name);
      const price = sanitizeCsvField(item.unit_price ?? '');
      const cost = sanitizeCsvField(item.unit_cost ?? '');
      const unit = sanitizeCsvField(item.unit ?? 'each');
      const desc = sanitizeCsvField(item.description ?? '');
      return `${name},${price},${cost},${unit},${desc}`;
    });
    return [header, ...rows].join('\n');
  }

  const header = 'Name,Price,Unit,Description';
  const rows = items.map((item) => {
    const name = sanitizeCsvField(item.name);
    const price = sanitizeCsvField(item.unit_price ?? '');
    const unit = sanitizeCsvField(item.unit ?? 'each');
    const desc = sanitizeCsvField(item.description ?? '');
    return `${name},${price},${unit},${desc}`;
  });
  return [header, ...rows].join('\n');
}

/** Normalizes parsed OCR raw output into clean PriceBookOcrResult. */
export function normalizePriceBookOcr(raw: unknown): PriceBookOcrResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as {
    items?: unknown[];
    confidence?: unknown;
    unreadable?: unknown[];
  };

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: PriceBookOcrItem[] = rawItems
    .map((item): PriceBookOcrItem | null => {
      if (!item || typeof item !== 'object') return null;
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) return null;

      let price: number | null = null;
      if (typeof rec.unit_price === 'number' && Number.isFinite(rec.unit_price)) {
        price = rec.unit_price;
      } else if (typeof rec.unit_price === 'string') {
        const parsed = parseFloat(rec.unit_price.replace(/[^0-9.]/g, ''));
        if (Number.isFinite(parsed)) price = parsed;
      }

      let cost: number | null = null;
      if (typeof rec.unit_cost === 'number' && Number.isFinite(rec.unit_cost)) {
        cost = rec.unit_cost;
      } else if (typeof rec.unit_cost === 'string') {
        const parsed = parseFloat(rec.unit_cost.replace(/[^0-9.]/g, ''));
        if (Number.isFinite(parsed)) cost = parsed;
      }

      let unit = 'each';
      if (typeof rec.unit === 'string') {
        const u = rec.unit.trim().toLowerCase();
        if (['each', 'hour', 'sqft', 'visit', 'job'].includes(u)) {
          unit = u;
        } else if (u.includes('hr') || u.includes('hour')) {
          unit = 'hour';
        } else if (u.includes('sq') || u.includes('ft') || u.includes('foot')) {
          unit = 'sqft';
        } else if (u.includes('visit') || u.includes('trip')) {
          unit = 'visit';
        } else if (u.includes('job') || u.includes('flat')) {
          unit = 'job';
        }
      }

      const description = typeof rec.description === 'string' && rec.description.trim() ? rec.description.trim() : null;

      return {
        name,
        unit_price: price,
        ...(cost !== null ? { unit_cost: cost } : {}),
        unit,
        description,
      };
    })
    .filter((i): i is PriceBookOcrItem => i !== null);

  const confidence = typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.8;
  const unreadable = Array.isArray(data.unreadable)
    ? data.unreadable.filter((u): u is string => typeof u === 'string')
    : [];

  return {
    items,
    confidence,
    rawCsv: priceBookItemsToCsv(items),
    unreadable,
  };
}

/**
 * Reads a photo, scan, or screenshot of a contractor price book / rate sheet.
 * Returns null if the model could not be contacted or failed.
 */
export async function readPriceBookOcr(input: { dataUrl: string }): Promise<PriceBookOcrResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !input.dataUrl.startsWith('data:image/')) return null;

  try {
    const response = await callModel({
      model: 'gpt-4o',
      temperature: 0,
      instructions: INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Transcribe this contractor price sheet / service catalog into structured items.' },
            { type: 'input_image', image_url: input.dataUrl },
          ],
        },
      ],
      text: { format: { type: 'json_object' } },
    }, { accountId: null, kind: 'transcription' });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const raw = JSON.parse(extractOutputText(await response.json()));
    return normalizePriceBookOcr(raw);
  } catch (error) {
    console.error('Price book OCR failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
