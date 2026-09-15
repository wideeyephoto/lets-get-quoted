import { MANUAL_ARTICLES } from '@/lib/admin-manual';

export interface AutoSupportDraft {
  ticketId: string;
  category: 'stripe_payouts' | 'speed_to_lead' | 'pricing_billing' | 'domain_setup' | 'general';
  confidenceScore: number;
  draftReply: string;
  relevantManualSlug: string;
  relevantManualSlugs: string[];
  readyToSend: boolean;
  groundingSources: string[];
}

/** Keyword bundles that map ticket content to support categories and manual articles. */
const CATEGORY_KEYWORDS: Record<AutoSupportDraft['category'], string[]> = {
  stripe_payouts: ['payout', 'bank', 'deposit', 'stripe', 'connect', 'transfer', 'direct deposit', 'settlement'],
  speed_to_lead: ['lead', 'speed', 'notification', 'alert', 'missed call', 'response time', 'first contact'],
  pricing_billing: ['billing', 'invoice', 'subscription', 'charge', 'plan', 'upgrade', 'downgrade', 'cancel', 'refund', 'price'],
  domain_setup: ['domain', 'cname', 'website', 'dns', 'ssl', 'custom domain', 'subdomain', 'a record'],
  general: [],
};

/**
 * Searches the admin manual articles for the best keyword match against ticket content.
 * Returns matching article slugs ordered by relevance score.
 */
function findRelevantManualArticles(subject: string, body: string, maxResults = 3): string[] {
  const combined = `${subject} ${body}`.toLowerCase();
  const words = combined.split(/\W+/).filter(Boolean);

  const scored = MANUAL_ARTICLES
    .map((article) => {
      let score = 0;

      // Match against article keywords
      for (const kw of article.keywords || []) {
        if (combined.includes(kw.toLowerCase())) {
          score += 3;
        }
      }

      // Match against article title and summary
      const articleText = `${article.title} ${article.summary}`.toLowerCase();
      for (const word of words) {
        if (word.length > 3 && articleText.includes(word)) {
          score += 1;
        }
      }

      return { slug: article.slug, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored.map((s) => s.slug);
}

/**
 * Extracts the key procedural steps from a matching manual article to ground the reply.
 */
function extractArticleGuidance(slug: string): string | null {
  const article = MANUAL_ARTICLES.find((a) => a.slug === slug);
  if (!article) return null;

  const steps = (article.procedure || [])
    .slice(0, 3)
    .map((step) => `${step.stepNumber}. ${step.title}: ${step.instruction}`)
    .join('\n');

  return steps || article.summary;
}

/**
 * Detects the best category for a ticket based on keyword matching.
 */
function detectCategory(combined: string): AutoSupportDraft['category'] {
  let bestCategory: AutoSupportDraft['category'] = 'general';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [AutoSupportDraft['category'], string[]][]) {
    if (category === 'general') continue;
    let score = 0;
    for (const kw of keywords) {
      if (combined.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Generates an automated support reply draft grounded in the admin manual documentation.
 * Uses keyword matching against the manual article corpus to find relevant guidance,
 * then constructs a reply incorporating actual procedural steps from the documentation.
 */
export function generateAutoSupportReply(params: {
  ticketId: string;
  subject: string;
  body: string;
}): AutoSupportDraft {
  const { ticketId, subject, body } = params;
  const combined = `${subject} ${body}`.toLowerCase();

  // Find matching manual articles
  const matchingSlugs = findRelevantManualArticles(subject, body);
  const category = detectCategory(combined);

  // Extract guidance from the best matching article
  const primarySlug = matchingSlugs[0] || 'getting-started-overview';
  const groundingGuidance = matchingSlugs.length > 0 ? extractArticleGuidance(matchingSlugs[0]) : null;
  const groundingSources = matchingSlugs.map((slug) => `/admin/manual/${slug}`);

  // Confidence is higher when we have strong manual article matches
  const baseConfidence = matchingSlugs.length >= 2 ? 0.92 : matchingSlugs.length === 1 ? 0.88 : 0.75;
  const confidenceScore = category !== 'general' ? Math.min(1, baseConfidence + 0.04) : baseConfidence;

  // Build grounded reply
  let draftReply: string;

  if (category === 'stripe_payouts') {
    draftReply = `Hi there,\n\nThanks for reaching out! In Let's Get Quoted, card payments settle through your connected Stripe account directly to your bank on a standard rolling 2-business-day schedule. You can view or update your deposit account anytime under Settings \u203a Stripe Connect.`;
    if (groundingGuidance) {
      draftReply += `\n\nHere are the relevant steps:\n${groundingGuidance}`;
    }
    draftReply += `\n\nLet us know if we can help with anything else!\n\nBest,\nLet's Get Quoted Support Team`;
  } else if (category === 'domain_setup') {
    draftReply = `Hi there,\n\nTo connect your custom domain to your Let's Get Quoted website:\n1. Add a CNAME record pointing your subdomain (e.g. www) to custom-sites.letsgetquoted.com\n2. For apex domains, set an A record to 76.76.21.21\nSSL certificates provision automatically within 15 minutes.`;
    if (groundingGuidance) {
      draftReply += `\n\nAdditional guidance:\n${groundingGuidance}`;
    }
    draftReply += `\n\nBest,\nLet's Get Quoted Support Team`;
  } else if (category === 'pricing_billing') {
    draftReply = `Hi there,\n\nThank you for reaching out about your billing. You can manage your subscription, view invoices, and update your payment method from Settings \u203a Billing in your dashboard.`;
    if (groundingGuidance) {
      draftReply += `\n\nHere's more detail:\n${groundingGuidance}`;
    }
    draftReply += `\n\nIf you need further assistance, we're happy to help!\n\nBest,\nLet's Get Quoted Support Team`;
  } else if (category === 'speed_to_lead') {
    draftReply = `Hi there,\n\nSpeed-to-lead notifications are sent via SMS and push as soon as a new lead comes in. You can configure notification preferences under Settings \u203a Notifications.`;
    if (groundingGuidance) {
      draftReply += `\n\nRelevant steps:\n${groundingGuidance}`;
    }
    draftReply += `\n\nBest,\nLet's Get Quoted Support Team`;
  } else {
    // General category with manual grounding
    if (groundingGuidance) {
      draftReply = `Hi there,\n\nThank you for reaching out to Let's Get Quoted support. Based on your question about "${subject}", here's what we found:\n\n${groundingGuidance}\n\nIf this doesn't fully address your question, our team will follow up shortly with more specific guidance.\n\nBest,\nLet's Get Quoted Support Team`;
    } else {
      draftReply = `Hi there,\n\nThank you for reaching out to Let's Get Quoted support. We received your request regarding "${subject}" and our team is reviewing it right now. We will follow up shortly.\n\nBest,\nLet's Get Quoted Support Team`;
    }
  }

  return {
    ticketId,
    category,
    confidenceScore,
    draftReply,
    relevantManualSlug: primarySlug,
    relevantManualSlugs: matchingSlugs,
    readyToSend: confidenceScore >= 0.88 && category !== 'general',
    groundingSources,
  };
}
