import type { ImportField, SmartMapping, FieldSources } from '@/lib/smart-import';

// Generic AI column mapper (the entity-agnostic version of client-import-ai).
// The model only ever sees the header + a handful of sample rows and returns a
// column->field map, applied locally to every row — so cost/latency are flat
// regardless of file size. Any failure returns null so the caller falls back to
// the rule-based / positional mapping.

const SAMPLE_ROWS = 8;
const CELL_CHARS = 60;

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

export async function aiDetectGenericColumns(
  grid: string[][],
  fields: ImportField[],
  entity: string,
): Promise<SmartMapping | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || grid.length === 0) return null;

  const width = grid.reduce((max, r) => Math.max(max, r.length), 0);
  if (width === 0) return null;

  const tableText = grid
    .slice(0, SAMPLE_ROWS)
    .map((r, ri) => {
      const cells = Array.from({ length: width }, (_, ci) =>
        `[${ci}]=${JSON.stringify((r[ci] ?? '').replace(/\s+/g, ' ').trim().slice(0, CELL_CHARS))}`,
      );
      return `row ${ri}: ${cells.join('  ')}`;
    })
    .join('\n');

  const fieldList = fields.map((f) => `"${f.key}" (${f.hint})`).join(', ');
  const schemaKeys = fields.map((f) => `"${f.key}":[i,...]`).join(',');

  const instructions =
    `You map a home-services contractor's uploaded ${entity} list to a fixed schema so it can be imported. ` +
    `The schema fields are: ${fieldList}. ` +
    'You are given up to 8 sample rows; each cell is shown as [columnIndex]=value, columns 0-indexed. ' +
    `Return STRICT JSON only: {"has_header":true|false,"columns":{${schemaKeys}}}. ` +
    'Rules: ' +
    '- Each array lists the 0-indexed COLUMN numbers that make up that field; use [] when the field is absent. ' +
    '- When a value is split across columns (e.g. first/last name, or street/city/state/zip), list all the columns in reading order. ' +
    '- For single-value fields, list the single best column. ' +
    '- has_header is true only when the first row holds column titles rather than real data. ' +
    `- Only use column indices from 0 to ${width - 1}. Never invent columns. ` +
    'Output nothing except the JSON object.';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        instructions,
        input: `Columns: ${width}. Sample rows:\n${tableText}\n\nReturn the mapping json only.`,
        text: { format: { type: 'json_object' } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as {
      has_header?: unknown;
      columns?: Record<string, unknown>;
    };

    const cols = parsed.columns ?? {};
    const sources: FieldSources = {};
    for (const f of fields) {
      const raw = cols[f.key];
      sources[f.key] = Array.isArray(raw)
        ? Array.from(
            new Set(raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n < width)),
          )
        : [];
    }

    // Need at least one required field (or, if none are required, any field).
    const requiredFields = fields.filter((f) => f.required);
    const ok = requiredFields.length > 0
      ? requiredFields.some((f) => sources[f.key].length > 0)
      : fields.some((f) => sources[f.key].length > 0);
    if (!ok) return null;

    return { hasHeader: parsed.has_header === true, sources };
  } catch (error) {
    console.error('AI column mapping failed:', error);
    return null;
  }
}
