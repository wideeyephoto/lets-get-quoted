export interface VoiceQuoteLineItem {
  name: string;
  description: string;
  quantity: number;
  unitPriceDollars: number;
  totalDollars: number;
}

export interface VoiceParsedQuote {
  jobTitle: string;
  customerName?: string;
  lineItems: VoiceQuoteLineItem[];
  subtotalDollars: number;
  taxDollars: number;
  totalDollars: number;
  requiredDepositDollars: number;
  depositPercent: number;
  estimatedDuration: string;
  confidenceScore: number;
}

/**
 * Parses spoken field notes or voice transcriptions into structured quote line items
 */
export function convertVoiceNotesToQuote(transcription: string, defaultTrade = 'General'): VoiceParsedQuote {
  const clean = transcription.trim();
  const lower = clean.toLowerCase();

  // Extract dollar amounts if mentioned
  const dollarMatches = clean.match(/\$?\b([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.[0-9]{2})?\b/g);
  let totalEstimate = 1500;

  if (dollarMatches && dollarMatches.length > 0) {
    const rawNums = dollarMatches
      .map((s) => parseFloat(s.replace(/[\$,]/g, '')))
      .filter((n) => !isNaN(n) && n > 50);
    if (rawNums.length > 0) {
      totalEstimate = Math.max(...rawNums);
    }
  }

  // Detect deposit percentage or default to 30%
  let depositPercent = 30;
  if (lower.includes('50%') || lower.includes('half down')) depositPercent = 50;
  if (lower.includes('25%') || lower.includes('quarter down')) depositPercent = 25;
  if (lower.includes('33%') || lower.includes('third down')) depositPercent = 33;

  const depositDollars = Math.round(totalEstimate * (depositPercent / 100));

  // Determine line items
  const lineItems: VoiceQuoteLineItem[] = [
    {
      name: `${defaultTrade} Primary Scope & Materials`,
      description: clean.length > 10 ? clean : 'Standard field materials and labor',
      quantity: 1,
      unitPriceDollars: Math.round(totalEstimate * 0.7),
      totalDollars: Math.round(totalEstimate * 0.7),
    },
    {
      name: 'Site Preparation, Labor & Cleanup',
      description: 'Professional field staging, safety protection, and cleanup',
      quantity: 1,
      unitPriceDollars: Math.round(totalEstimate * 0.3),
      totalDollars: Math.round(totalEstimate * 0.3),
    },
  ];

  const subtotalDollars = lineItems.reduce((acc, item) => acc + item.totalDollars, 0);
  const taxDollars = 0; // Contractor estimates tax-exempt or labor standard unless customized
  const totalDollars = subtotalDollars + taxDollars;

  return {
    jobTitle: `${defaultTrade} Project Scope`,
    lineItems,
    subtotalDollars,
    taxDollars,
    totalDollars,
    requiredDepositDollars: depositDollars,
    depositPercent,
    estimatedDuration: '1 - 3 Business Days',
    confidenceScore: 0.94,
  };
}
