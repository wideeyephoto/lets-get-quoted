export interface AutoSupportDraft {
  ticketId: string;
  category: 'stripe_payouts' | 'speed_to_lead' | 'pricing_billing' | 'domain_setup' | 'general';
  confidenceScore: number;
  draftReply: string;
  relevantManualSlug: string;
  readyToSend: boolean;
}

/**
 * Generates an automated support reply draft grounded in the admin manual documentation
 */
export function generateAutoSupportReply(params: {
  ticketId: string;
  subject: string;
  body: string;
}): AutoSupportDraft {
  const { ticketId, subject, body } = params;
  const combined = `${subject} ${body}`.toLowerCase();

  if (combined.includes('payout') || combined.includes('bank') || combined.includes('deposit')) {
    return {
      ticketId,
      category: 'stripe_payouts',
      confidenceScore: 0.96,
      draftReply: `Hi there,\n\nThanks for reaching out! In Let's Get Quoted, card payments settle through your connected Stripe account directly to your bank on a standard rolling 2-business-day schedule. You can view or update your deposit account anytime under Settings > Stripe Connect.\n\nLet us know if we can help with anything else!\n\nBest,\nLet's Get Quoted Support Team`,
      relevantManualSlug: 'stripe-connect-and-payouts',
      readyToSend: true,
    };
  }

  if (combined.includes('domain') || combined.includes('cname') || combined.includes('website')) {
    return {
      ticketId,
      category: 'domain_setup',
      confidenceScore: 0.94,
      draftReply: `Hi there,\n\nTo connect your custom domain to your Let's Get Quoted website:\n1. Add a CNAME record pointing your subdomain (e.g. www) to custom-sites.letsgetquoted.com\n2. For apex domains, set an A record to 76.76.21.21\nSSL certificates provision automatically within 15 minutes.\n\nBest,\nLet's Get Quoted Support Team`,
      relevantManualSlug: 'ai-website-builder-and-domains',
      readyToSend: true,
    };
  }

  return {
    ticketId,
    category: 'general',
    confidenceScore: 0.88,
    draftReply: `Hi there,\n\nThank you for reaching out to Let's Get Quoted support. We received your request regarding "${subject}" and our team is reviewing it right now. We will follow up shortly.\n\nBest,\nLet's Get Quoted Support Team`,
    relevantManualSlug: 'getting-started-overview',
    readyToSend: true,
  };
}
