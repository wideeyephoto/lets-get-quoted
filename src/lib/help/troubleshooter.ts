/**
 * Pure Deterministic Troubleshooter Matcher for Let's Get Quoted Help Center
 * Zero external dependencies. Normalizes contractions, punctuation, and whitespace,
 * matching user queries against core support intents and suggesting fallback articles.
 */

export interface TroubleshooterIntent {
  id: string;
  title: string;
  aliases: string[];
  articleId: string;
  articleSlug?: string;
  explanation: string;
  estimatedTime: string;
}

export interface TroubleshooterMatchResult {
  matched: boolean;
  intent?: TroubleshooterIntent;
  confidence: number;
  suggestedArticles?: {
    id: string;
    slug?: string;
    title: string;
    category: string;
    readTime: string;
  }[];
}

export interface MinimalArticle {
  id: string;
  slug?: string;
  title: string;
  category: string;
  readTime: string;
  content?: string;
}

export const TROUBLESHOOTER_INTENTS: TroubleshooterIntent[] = [
  {
    id: 'quote-send',
    title: 'Quote won’t send',
    aliases: [
      'quote',
      'estimate',
      'proposal',
      'send',
      'sending',
      'wont send',
      'not sending',
      'cant send',
      'approve',
      'approval',
      'customer cannot view',
      'customer cant view',
      'quote link broken'
    ],
    articleId: 'art-quote-send-troubleshooting',
    articleSlug: 'quote-delivery-failures-quick-fix',
    explanation: 'Resolve customer quote delivery failures, expired token links, and approval permissions.',
    estimatedTime: '2 mins'
  },
  {
    id: 'sms-delivery',
    title: 'SMS not delivering',
    aliases: [
      'sms',
      'text',
      'texts',
      'message',
      'messages',
      'pending',
      'failed',
      '10dlc',
      'phone',
      'carrier',
      'signalwire',
      'not delivering',
      'not receiving texts'
    ],
    articleId: 'art-sms-delivery-troubleshooting',
    articleSlug: '10dlc-carrier-verification-pending-sms',
    explanation: 'Check 10DLC brand approval status, remaining SMS credits, and carrier delivery logs.',
    estimatedTime: '3 mins'
  },
  {
    id: 'payout-missing',
    title: 'Stripe payout missing',
    aliases: [
      'stripe',
      'payout',
      'payouts',
      'deposit',
      'deposits',
      'payment',
      'payments',
      'bank',
      'missing money',
      'missing payout',
      'funds',
      'transfer',
      'payout delayed',
      'deposit delayed'
    ],
    articleId: 'art-stripe-payout-troubleshooting',
    articleSlug: 'stripe-payout-schedules-holds',
    explanation: 'Trace deposit schedules, Stripe Connect verification holds, and bank account routing.',
    estimatedTime: '2 mins'
  },
  {
    id: 'domain-offline',
    title: 'Website or domain offline',
    aliases: [
      'domain',
      'domains',
      'dns',
      'website',
      'offline',
      'down',
      'ssl',
      'godaddy',
      'squarespace',
      'cloudflare',
      'nameserver',
      'cname',
      'a record'
    ],
    articleId: 'art-domain-offline-troubleshooting',
    articleSlug: 'custom-domain-dns-ssl-troubleshooting',
    explanation: 'Verify custom DNS A/CNAME records, SSL certificate generation, and registrar propagation.',
    estimatedTime: '4 mins'
  },
  {
    id: 'team-access',
    title: 'Team member can’t sign in',
    aliases: [
      'login',
      'log in',
      'sign in',
      'signin',
      'invitation',
      'invite',
      'role',
      'roles',
      'permission',
      'permissions',
      'employee',
      'technician',
      'password',
      'cant sign in'
    ],
    articleId: 'art-team-access-troubleshooting',
    articleSlug: 'crew-login-role-permissions',
    explanation: 'Resend crew invitations, unlock technician accounts, and audit role permission tiers.',
    estimatedTime: '2 mins'
  },
  {
    id: 'schedule-missing',
    title: 'Job missing from schedule',
    aliases: [
      'schedule',
      'calendar',
      'dispatch',
      'appointment',
      'appointments',
      'job',
      'jobs',
      'routing',
      'crew calendar',
      'missing from schedule'
    ],
    articleId: 'art-schedule-sync-troubleshooting',
    articleSlug: 'dispatched-job-missing-calendar',
    explanation: 'Check booking confirmation status, crew truck assignment filters, and calendar sync.',
    estimatedTime: '2 mins'
  },
  {
    id: 'webhook-api',
    title: 'Webhook or API delivery failure',
    aliases: [
      'webhook',
      'webhooks',
      'api',
      'api key',
      'api token',
      'openapi',
      'endpoint',
      'signature',
      'x lgq signature',
      'hmac',
      'delivery failed',
      'zapier',
      'make'
    ],
    articleId: 'art-webhook-api-troubleshooting',
    articleSlug: 'webhook-api-delivery-and-signature-troubleshooting',
    explanation: 'Troubleshoot failed webhook deliveries, endpoint timeouts, HTTPS requirements, and HMAC signatures.',
    estimatedTime: '3 mins'
  },
  {
    id: 'trash-recovery',
    title: 'Deleted record or quote recovery',
    aliases: [
      'trash',
      'deleted',
      'restore',
      'recover',
      'accidental delete',
      'recovery',
      'undo delete',
      'deleted lead',
      'deleted quote',
      'deleted job',
      'deleted client'
    ],
    articleId: 'art-trash-recovery-troubleshooting',
    articleSlug: 'recovering-deleted-records-from-trash',
    explanation: 'Recover soft-deleted leads, quotes, clients, and jobs from the 30-day Trash workspace.',
    estimatedTime: '2 mins'
  }
];

export function normalizeQuery(query: string): string {
  if (!query) return '';
  return query
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeQuery(query);
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'in', 'at', 'of', 'on', 'for', 'to', 'from',
    'my', 'our', 'your', 'i', 'we', 'me', 'it', 'where', 'why', 'how',
    'when', 'what', 'see', 'seeing', 'have', 'has', 'had', 'do', 'does',
    'did', 'can', 'could', 'would', 'should', 'get', 'getting', 'am'
  ]);
  return normalized
    .split(' ')
    .filter(token => token.length > 1 && !stopWords.has(token));
}

export function scoreIntent(query: string, intent: TroubleshooterIntent): number {
  const normalizedQuery = normalizeQuery(query);
  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) return 0;

  let score = 0;

  const normalizedTitle = normalizeQuery(intent.title);
  if (normalizedQuery === normalizedTitle) {
    return 100;
  }
  if (normalizedQuery.includes(normalizedTitle)) {
    score += 45;
  }

  for (const alias of intent.aliases) {
    const normAlias = normalizeQuery(alias);
    if (normalizedQuery === normAlias) {
      score += 55;
    } else if (normalizedQuery.includes(normAlias)) {
      score += normAlias.includes(' ') ? 35 : 20;
    }
  }

  const intentKeywords = new Set<string>();
  tokenizeQuery(intent.title).forEach(t => intentKeywords.add(t));
  intent.aliases.forEach(a => tokenizeQuery(a).forEach(t => intentKeywords.add(t)));

  let matchingTokensCount = 0;
  for (const token of queryTokens) {
    if (intentKeywords.has(token)) {
      matchingTokensCount++;
    }
  }

  score += (matchingTokensCount / queryTokens.length) * 30;

  return score;
}

export function matchTroubleshooter(
  rawQuery: string,
  allArticles: MinimalArticle[] = []
): TroubleshooterMatchResult {
  const query = rawQuery.trim();
  if (!query) {
    return {
      matched: false,
      confidence: 0,
      suggestedArticles: []
    };
  }

  const scoredIntents = TROUBLESHOOTER_INTENTS.map(intent => ({
    intent,
    score: scoreIntent(query, intent)
  })).sort((a, b) => b.score - a.score);

  const topMatch = scoredIntents[0];

  // Intent matching threshold
  if (topMatch && topMatch.score >= 20) {
    return {
      matched: true,
      intent: topMatch.intent,
      confidence: Math.min(topMatch.score / 100, 1),
      suggestedArticles: []
    };
  }

  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) {
    return {
      matched: false,
      confidence: 0,
      suggestedArticles: allArticles.slice(0, 3).map(a => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        category: a.category,
        readTime: a.readTime
      }))
    };
  }

  const scoredArticles = allArticles.map(article => {
    const titleTokens = tokenizeQuery(article.title);
    const categoryTokens = tokenizeQuery(article.category);
    const artText = normalizeQuery(`${article.title} ${article.category} ${article.content || ''}`);
    
    let score = 0;
    for (const token of queryTokens) {
      if (titleTokens.includes(token)) {
        score += 10;
      } else if (categoryTokens.includes(token)) {
        score += 5;
      } else if (artText.includes(token)) {
        score += 2;
      }
    }
    return {
      article,
      score
    };
  }).sort((a, b) => b.score - a.score);

  const matchedArticles = scoredArticles.filter(sa => sa.score >= 5);
  const hasStrongMatch = matchedArticles.length > 0;

  const suggestions = (hasStrongMatch ? matchedArticles : scoredArticles).slice(0, 3).map(sa => ({
    id: sa.article.id,
    slug: sa.article.slug,
    title: sa.article.title,
    category: sa.article.category,
    readTime: sa.article.readTime
  }));

  return {
    matched: false,
    confidence: hasStrongMatch ? Math.min(matchedArticles[0].score / 50, 0.8) : 0,
    suggestedArticles: suggestions.length > 0 ? suggestions : allArticles.slice(0, 3).map(a => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      category: a.category,
      readTime: a.readTime
    }))
  };
}
