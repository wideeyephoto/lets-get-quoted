// Reading a receipt or supplier invoice off a photo.
//
// No new vendor: this rides the OpenAI key the quote drafter already uses, and a
// receipt image costs about a cent. The alternative was a dedicated OCR service
// with a monthly minimum, to do a worse job on a crumpled thermal receipt.
//
// What comes back is a DRAFT. It is never posted straight to the ledger -- the
// whole point of the cost_source field is that a number can say where it came
// from, and "a model read it off a photo" is not the same as "a person checked
// it". The person confirms, then it becomes a receipt-backed cost.
//
// The SHAPE of a read, and the words for one, live in lib/receipt-read so a
// client component can render them without pulling this file into the browser.

import { callModel } from '@/lib/ai-model-call';
import { normalizeReceiptRead, type ReceiptRead } from '@/lib/receipt-read';

export type { ReceiptLine, ReceiptRead } from '@/lib/receipt-read';
export { normalizeReceiptRead, receiptBalances, describeReceiptRead } from '@/lib/receipt-read';

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
    const response = await callModel({
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
    }, { accountId: null, kind: 'transcription' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    return normalizeReceiptRead(JSON.parse(extractOutputText(await response.json())));
  } catch (error) {
    console.error('Receipt read failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
