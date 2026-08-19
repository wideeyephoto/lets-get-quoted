// What a receipt READ is, and how to talk about one.
//
// Split from receipt-ocr.ts because that module reaches a model and is therefore
// server-only, while describeReceiptRead is rendered by a client component
// (components/job-expense-fields.tsx). Importing the two through one file pulled
// server-only into the browser bundle and broke the build. Same split, and the
// same reason, as lib/sms-templates against lib/sms.

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

