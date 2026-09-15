const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function integerWords(value: number): string {
  if (value < 20) return SMALL[value];
  if (value < 100) return [TENS[Math.floor(value / 10)], value % 10 ? SMALL[value % 10] : ''].filter(Boolean).join(' ');
  if (value < 1000) return [SMALL[Math.floor(value / 100)], 'hundred', value % 100 ? integerWords(value % 100) : ''].filter(Boolean).join(' ');
  const groups: string[] = [];
  for (let scale = 0; value > 0; scale++, value = Math.floor(value / 1000)) {
    const group = value % 1000;
    if (group) groups.unshift([integerWords(group), SCALES[scale]].filter(Boolean).join(' '));
  }
  return groups.join(' ');
}

/** Speak a stored USD amount without currency-symbol/decimal TTS normalization.
 * Reject unsupported precision instead of changing a saved amount by rounding it.
 */
export function spokenUsd(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) return null;
  const dollarDigits = match[2];
  const centDigits = (match[3] ?? '').padEnd(2, '0');
  const totalCents = Number(dollarDigits + centDigits);
  if (!Number.isSafeInteger(totalCents)) return null;
  const dollars = Number(dollarDigits);
  const cents = Number(centDigits);
  const result = [
    `${integerWords(dollars)} ${dollars === 1 ? 'dollar' : 'dollars'}`,
    ...(cents ? [`and ${integerWords(cents)} ${cents === 1 ? 'cent' : 'cents'}`] : []),
  ].join(' ');
  return match[1] && totalCents !== 0 ? `minus ${result}` : result;
}
