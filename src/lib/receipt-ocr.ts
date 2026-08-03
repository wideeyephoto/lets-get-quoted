// Reading a receipt or supplier invoice off a photo.
//
// No new vendor: this rides the OpenAI key the quote drafter already uses, and a
// receipt image costs about a cent. The alternative was a dedicated OCR service
// with a monthly minimum, to do a worse job on a crumpled thermal receipt.
//
// What comes back is a DRAFT. It is never posted straight to the ledger — the
// whole point of the cost_source field is that a number can say where it came
// from, and "a model read it off a photo" is not the same as "a person checked
// it". The person confirms, then it becomes a receipt-backed cost.

export type ReceiptLine = { description: string; amount: number };

export type ReceiptRead = {
  supplier: string | null;
  /** ISO date, or null when the photo doesn't show one. Never guessed. */
  purchasedAt: string | null;
  total: number | null;
  tax: number | null;
  lines: ReceiptLine[];
  /** The model's own read on legibility, 0..1. Drives the wording, not the gate. */
  confidence: number;
  /** What it couldn't make out. Shown so the person knows where to look. */
  unreadable: string[];
};

const INSTRUCTIONS = [
  'You read receipts and supplier invoices for a home-services contractor and return JSON.',
  '',
  'Return exactly this shape:',
  '{"supplier":string|null,"purchased_at":"YYYY-MM-DD"|null,"total":number|null,"tax":number|null,',
  ' "lines":[{"description":string,"amount":number}],"confidence":number,"unreadable":[string]}',
  '',
  'RULES',
  '- Transcribe. Do not calculate, correct or complete anything. If the line items do not add up to the printed total, return both as printed and say so in "unreadable".',
  '- Any figure you cannot read is null. NEVER estimate a number from context — a plausible wrong amount is worse than a blank one, because nobody checks a field that looks filled in.',
  '- "total" is the amount actually charged, after tax and after any discount.',
  '- "purchased_at" is the date printed on the receipt, not today. Null if it is not shown or not legible.',
  '- "supplier" is the business name at the top. Null if you cannot read it.',
  '- Keep line descriptions as printed, trimmed of SKUs and quantities only where they are obvious noise.',
  '- "confidence" is how legible the image was overall: 1 is a flat, sharp, fully readable document; below 0.5 means a person should retype it.',
  '- "unreadable" lists what defeated you, in plain words ("the total is cut off", "bottom third is out of focus"). Empty array if the document read cleanly.',
  '- If the image is not a receipt or invoice at all, return every field null with confidence 0 and say so in "unreadable".',
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

function money(value: unknown): number | null {
  // null/undefined/'' mean the model couldn't read the figure and must stay
  // null. Going straight to Number() turns all three into 0, and a line item
  // silently priced at $0.00 is exactly the fabricated-looking-certain number
  // this whole module refuses to produce.
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Only a real calendar date survives. A malformed one becomes null, never today. */
function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${value.trim()}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // A receipt dated in the future is a misread, not a purchase.
  if (date.getTime() > Date.now() + 86_400_000) return null;
  return match[0];
}

export function normalizeReceiptRead(raw: unknown): ReceiptRead {
  const record = (raw ?? {}) as Record<string, unknown>;
  const rawLines = Array.isArray(record.lines) ? record.lines : [];
  const lines: ReceiptLine[] = [];
  for (const entry of rawLines.slice(0, 60)) {
    const line = entry as Record<string, unknown>;
    const description = String(line?.description ?? '').trim().slice(0, 200);
    const amount = money(line?.amount);
    if (description && amount !== null) lines.push({ description, amount });
  }

  const confidenceRaw = Number(record.confidence);
  return {
    supplier: (String(record.supplier ?? '').trim() || null)?.slice(0, 120) ?? null,
    purchasedAt: isoDate(record.purchased_at),
    total: money(record.total),
    tax: money(record.tax),
    lines,
    confidence: Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0,
    unreadable: (Array.isArray(record.unreadable) ? record.unreadable : [])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, 6),
  };
}

/**
 * Does the sum of the lines match the printed total?
 *
 * Reported rather than corrected. A transcription that quietly adjusts itself to
 * balance is a transcription you can't audit, and the mismatch is usually a
 * genuine signal — a line got cut off, or a discount wasn't captured.
 */
export function receiptBalances(read: ReceiptRead): { balanced: boolean; lineSum: number; difference: number } | null {
  if (read.total === null || read.lines.length === 0) return null;
  const lineSum = Math.round(read.lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  const withTax = Math.round((lineSum + (read.tax ?? 0)) * 100) / 100;
  const difference = Math.round((read.total - withTax) * 100) / 100;
  return { balanced: Math.abs(difference) <= 0.02, lineSum, difference };
}

/** How to describe a read to the person checking it. Never overstates. */
export function describeReceiptRead(read: ReceiptRead): { tone: 'ok' | 'check' | 'poor'; message: string } {
  if (read.confidence === 0 && read.total === null && !read.supplier) {
    return { tone: 'poor', message: read.unreadable[0] || 'That didn’t read as a receipt. Try a flatter, closer photo.' };
  }
  if (read.confidence < 0.5) {
    return { tone: 'poor', message: `Hard to read${read.unreadable.length ? ` — ${read.unreadable[0]}` : ''}. Check every figure before saving.` };
  }
  const balance = receiptBalances(read);
  if (balance && !balance.balanced) {
    return {
      tone: 'check',
      message: `The lines add up to ${balance.lineSum.toFixed(2)} but the total reads ${read.total?.toFixed(2)}. Nothing was adjusted — check which is right.`,
    };
  }
  if (read.total === null) {
    return { tone: 'check', message: 'Couldn’t find a total. Enter it yourself.' };
  }
  return { tone: 'ok', message: 'Read cleanly. Check it against the paper before saving.' };
}

/**
 * Read a receipt image. Returns null when it genuinely could not run — no API
 * key, a provider failure, unparseable output — so the caller can say "couldn't
 * read that" rather than showing an empty form that looks like a considered
 * answer.
 */
export async function readReceipt(input: { dataUrl: string }): Promise<ReceiptRead | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !input.dataUrl.startsWith('data:image/')) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        // Zero: this is transcription. Any creativity here invents a number
        // that lands in somebody's books.
        temperature: 0,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Transcribe this receipt as JSON.' },
              { type: 'input_image', image_url: input.dataUrl },
            ],
          },
        ],
        text: { format: { type: 'json_object' } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    return normalizeReceiptRead(JSON.parse(extractOutputText(await response.json())));
  } catch (error) {
    console.error('Receipt read failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
