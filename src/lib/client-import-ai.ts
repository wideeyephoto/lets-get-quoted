import type { ColumnMapping, ColumnSources } from '@/lib/client-import';
import { callModel } from '@/lib/ai-model-call';

// AI column mapping for the client importer. When a file's columns don't match
// by name (any headings, any order, any language, split first/last or
// street/city/state/zip), the model maps them to our fixed schema.
//
// Cost/latency are flat regardless of file size: the model only ever sees the
// header + a handful of sample rows and returns a column->field map, which the
// caller then applies locally to every row. Any failure returns null so the
// caller falls back to the rule-based / positional parser — the import never
// breaks just because the AI is unavailable.

const FIELDS = ['name', 'phone', 'email', 'address'] as const;
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

export async function aiDetectColumns(grid: string[][]): Promise<ColumnMapping | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || grid.length === 0) return null;

  const width = grid.reduce((max, r) => Math.max(max, r.length), 0);
  if (width === 0) return null;

  // A compact, index-annotated view of the first few rows — enough for the model
  // to recognize each column from its heading and/or its values.
  const tableText = grid
    .slice(0, SAMPLE_ROWS)
    .map((r, ri) => {
      const cells = Array.from({ length: width }, (_, ci) =>
        `[${ci}]=${JSON.stringify((r[ci] ?? '').replace(/\s+/g, ' ').trim().slice(0, CELL_CHARS))}`,
      );
      return `row ${ri}: ${cells.join('  ')}`;
    })
    .join('\n');

  const instructions =
    "You map a home-services contractor's uploaded customer list to a fixed CRM schema. " +
    'The schema fields are: name, phone, email, address. ' +
    'You are given up to 8 sample rows; each cell is shown as [columnIndex]=value, columns 0-indexed. ' +
    'Return STRICT JSON only: {"has_header":true|false,"columns":{"name":[i,...],"phone":[i,...],"email":[i,...],"address":[i,...]}}. ' +
    'Rules: ' +
    '- Each array lists the 0-indexed COLUMN numbers that make up that field; use [] when the field is absent. ' +
    '- Combine a split name by listing the first-name column then the last-name column in "name". ' +
    '- Combine a split address by listing street, then city, then state, then ZIP columns in "address", in that order. ' +
    '- For phone and email, list the single best column; if several phone columns exist, list the primary/mobile one. ' +
    '- has_header is true only when the first row holds column titles rather than a real customer. ' +
    `- Only use column indices from 0 to ${width - 1}. Never invent columns. ` +
    'Output nothing except the JSON object.';

  try {
    const response = await callModel({
      model: 'gpt-4o-mini',
      temperature: 0,
      instructions,
      input: `Columns: ${width}. Sample rows:\n${tableText}\n\nReturn the mapping json only.`,
      text: { format: { type: 'json_object' } },
    }, { accountId: null, kind: 'import_assist' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as {
      has_header?: unknown;
      columns?: Record<string, unknown>;
    };

    const cols = parsed.columns ?? {};
    const sources: ColumnSources = { name: [], phone: [], email: [], address: [] };
    for (const field of FIELDS) {
      const raw = cols[field];
      if (Array.isArray(raw)) {
        const idxs = raw
          .map((v) => Number(v))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < width);
        sources[field] = Array.from(new Set(idxs));
      }
    }

    // A mapping with no name and no contact column is useless — fall back.
    if (sources.name.length === 0 && sources.phone.length === 0 && sources.email.length === 0) {
      return null;
    }
    return { hasHeader: parsed.has_header === true, sources };
  } catch (error) {
    console.error('AI column mapping failed:', error);
    return null;
  }
}
