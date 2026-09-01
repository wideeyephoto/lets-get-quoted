import type { SupabaseClient } from '@supabase/supabase-js';

export interface FirstQuoteTemplate {
  trade: string;
  sampleCustomerName: string;
  sampleAddress: string;
  lineItems: Array<{
    title: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  totalCents: number;
  depositPercent: number;
}

export const SAMPLE_TRADE_QUOTES: Record<string, FirstQuoteTemplate> = {
  roofing: {
    trade: 'Roofing',
    sampleCustomerName: 'Sarah Jenkins',
    sampleAddress: '742 Evergreen Terrace, Austin, TX',
    lineItems: [
      { title: 'Architectural Shingle Replacement', description: '30-year lifetime shingles, synthetic underlayment', quantity: 24, unitPriceCents: 38000 },
      { title: 'Ridge Vent & Flashing Installation', description: 'Continuous ridge ventilation and ice & water shield', quantity: 1, unitPriceCents: 75000 },
      { title: 'Old Roof Tear-Off & Disposal', description: 'Complete 1-layer tear-off with magnetic nail sweep', quantity: 24, unitPriceCents: 9500 },
    ],
    totalCents: 1215000,
    depositPercent: 25,
  },
  painting: {
    trade: 'Painting',
    sampleCustomerName: 'David Miller',
    sampleAddress: '1204 Oak Ridge Dr, Dallas, TX',
    lineItems: [
      { title: 'Interior Living & Dining Walls', description: '2 coats premium low-VOC satin paint + primer', quantity: 850, unitPriceCents: 350 },
      { title: 'Trim, Baseboards & Doors', description: 'Semi-gloss enamel finish on all door casings and baseboards', quantity: 180, unitPriceCents: 450 },
      { title: 'Surface Patching & Caulk Prep', description: 'Fill drywall nail holes, sand smooth, and caulk gaps', quantity: 1, unitPriceCents: 45000 },
    ],
    totalCents: 423500,
    depositPercent: 30,
  },
  plumbing: {
    trade: 'Plumbing',
    sampleCustomerName: 'Robert Martinez',
    sampleAddress: '550 Maple Ave, Houston, TX',
    lineItems: [
      { title: 'Tankless Water Heater Installation', description: 'High-efficiency 199k BTU gas tankless water heater with flush kit', quantity: 1, unitPriceCents: 285000 },
      { title: 'Gas Line & Venting Upgrade', description: 'Code-compliant concentric PVC venting and gas shutoff valve', quantity: 1, unitPriceCents: 65000 },
    ],
    totalCents: 350000,
    depositPercent: 50,
  },
};

/**
 * Returns a pre-filled instant quote draft to help new contractors send their very first quote in <60 seconds.
 */
export function getFirstQuoteWalkthroughTemplate(trade?: string | null): FirstQuoteTemplate {
  const key = (trade || 'roofing').toLowerCase();
  return SAMPLE_TRADE_QUOTES[key] || SAMPLE_TRADE_QUOTES.roofing;
}

/**
 * Checks if a contractor has sent their first quote, and if not, returns activation guidance.
 */
export async function evaluateContractorActivationStatus(
  accountId: string,
  supabase: SupabaseClient,
): Promise<{
  hasSentQuote: boolean;
  quotesSentCount: number;
  stripeConnected: boolean;
  activationRecommendation: string;
}> {
  try {
    const { count: quoteCount } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId);

    const { data: account } = await supabase
      .from('accounts')
      .select('connect_onboarded')
      .eq('id', accountId)
      .maybeSingle();

    const quotesSentCount = quoteCount ?? 0;
    const stripeConnected = Boolean(account?.connect_onboarded);

    let activationRecommendation = 'Contractor fully activated.';
    if (quotesSentCount === 0 && !stripeConnected) {
      activationRecommendation = 'Connect Stripe payouts and send 1 sample quote to unlock 100% platform readiness.';
    } else if (quotesSentCount === 0) {
      activationRecommendation = 'Stripe is ready! Send your first client quote to start collecting deposits.';
    }

    return {
      hasSentQuote: quotesSentCount > 0,
      quotesSentCount,
      stripeConnected,
      activationRecommendation,
    };
  } catch {
    return {
      hasSentQuote: false,
      quotesSentCount: 0,
      stripeConnected: false,
      activationRecommendation: 'Complete setup by sending your first quote.',
    };
  }
}
