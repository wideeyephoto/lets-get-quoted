/**
 * Google Business Profile (GBP) Growth Hub Utilities
 *
 * Powers Google Places review management, direct review links, QR code generation,
 * AI & template-based Google Posts generation, compliant review response drafting,
 * and Local SEO 3-Pack Growth Scorecard audit.
 *
 * Client-safe, zero-dependency, pure TypeScript.
 */

import { googleReviewUrl } from '@/lib/review-routing';

export type GbpPostCategory = 'project_showcase' | 'seasonal_offer' | 'maintenance_tip' | 'review_celebration';

export type GbpPost = {
  category: GbpPostCategory;
  categoryLabel: string;
  headline: string;
  body: string;
  ctaType: 'BOOK' | 'CALL' | 'LEARN_MORE' | 'GET_OFFER';
  ctaLabel: string;
  suggestedHashtags: string[];
  fullPostText: string;
};

export type GbpPostInput = {
  category: GbpPostCategory;
  businessName: string;
  trade?: string;
  city?: string;
  phone?: string;
  websiteUrl?: string;
  projectDetail?: string;
  offerDetail?: string;
  tipTopic?: string;
  reviewQuote?: string;
  reviewerName?: string;
};

export type ReviewReplyTone = 'enthusiastic' | 'professional' | 'seo_boost' | 'resolution';

export type ReviewReplyInput = {
  rating: number; // 1-5
  reviewerName?: string;
  reviewText?: string;
  businessName: string;
  serviceCompleted?: string;
  city?: string;
  ownerContactPhone?: string;
  ownerContactEmail?: string;
  tone?: ReviewReplyTone;
};

export type GbpScorecardChecklistItem = {
  id: string;
  title: string;
  description: string;
  status: 'complete' | 'warning' | 'missing';
  impact: 'high' | 'medium' | 'essential';
  actionLabel: string;
  tip?: string;
};

export type GbpGrowthScorecard = {
  score: number; // 0-100
  level: 'beginner' | 'growing' | 'optimized' | 'elite';
  levelLabel: string;
  summary: string;
  checklist: GbpScorecardChecklistItem[];
};

/**
 * Extract Place ID or clean Google Place reference from raw text or URL.
 * Handles bare Place IDs (e.g., "ChIJ..."), maps URLs with placeid param,
 * and direct links.
 */
export function extractPlaceId(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Direct Place ID format (typical Google Place ID starts with ChIJ and is 20-80 chars)
  if (/^ChIJ[A-Za-z0-9_-]{10,90}$/.test(raw)) {
    return raw;
  }

  // Bare alphanumeric ID if user copies Place ID from Place ID Finder
  if (/^[A-Za-z0-9_-]{24,80}$/.test(raw) && !raw.includes('.') && !raw.includes('/')) {
    return raw;
  }

  try {
    const urlStr = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    const url = new URL(urlStr);

    // Look for placeid or place_id search parameter
    const placeIdParam = url.searchParams.get('placeid') || url.searchParams.get('place_id');
    if (placeIdParam && /^[A-Za-z0-9_-]+$/.test(placeIdParam)) {
      return placeIdParam;
    }

    // Look for /place/ or /maps/place/ path segments
    const pathMatch = url.pathname.match(/\/place\/([^\/@?]+)/);
    if (pathMatch && pathMatch[1]) {
      const segment = decodeURIComponent(pathMatch[1]);
      if (/^ChIJ[A-Za-z0-9_-]+$/.test(segment)) {
        return segment;
      }
    }
  } catch {
    // Unparseable URL
  }

  return null;
}

/**
 * Generates the direct 5-star Google review submission URL.
 */
export function generateDirectGoogleReviewLink(placeId: string | null | undefined, fallbackUrl?: string | null): string | null {
  return googleReviewUrl({ placeId, listingUrl: fallbackUrl });
}

/**
 * Generates direct shortcut URLs to Google Business Profile management.
 */
export function getGoogleBusinessProfileUrls(businessName: string, placeId?: string | null, city?: string) {
  const cleanName = (businessName || '').trim();
  const cleanCity = (city || '').trim();
  const query = encodeURIComponent(`${cleanName} ${cleanCity}`.trim());

  return {
    managerUrl: 'https://business.google.com/',
    googleSearchManageUrl: `https://www.google.com/search?q=${query || 'my+business'}`,
    directReviewUrl: placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : null,
    placeFinderUrl: 'https://developers.google.com/maps/documentation/places/web-service/place-id',
  };
}

/**
 * Generates structured, high-engagement Google Business Profile posts
 * formatted for Google Maps local ranking & customer conversions.
 */
export function generateGbpPost(input: GbpPostInput): GbpPost {
  const business = (input.businessName || 'Our Team').trim();
  const trade = (input.trade || 'contracting').trim();
  const city = (input.city || 'our local area').trim();
  const phone = input.phone?.trim();
  const website = input.websiteUrl?.trim();
  const project = input.projectDetail?.trim();
  const offer = input.offerDetail?.trim();
  const tip = input.tipTopic?.trim();
  const reviewer = input.reviewerName?.trim() || 'A satisfied homeowner';
  const quote = input.reviewQuote?.trim();

  const tradeTag = trade ? `#${trade.replace(/[^a-zA-Z0-9]/g, '')}` : '#Contractor';
  const cityTag = city && city !== 'our local area' ? `#${city.replace(/[^a-zA-Z0-9]/g, '')}` : '#LocalBusiness';
  const baseHashtags = [tradeTag, cityTag, '#HomeImprovement', '#QualityWorkmanship'].filter(Boolean);

  switch (input.category) {
    case 'project_showcase': {
      const headline = `🔨 Completed Project Spotlight in ${city}!`;
      const bodyLines = [
        `Another successful ${trade.toLowerCase()} project proudly completed by ${business}!`,
        project ? `\n📋 Project Highlights: ${project}` : `\nFrom initial planning to clean finish, our crew delivered top-tier craftsmanship on schedule.`,
        `\nLooking to upgrade or repair your property in ${city}? Let's talk about your next project.`,
        phone ? `📞 Call or text: ${phone}` : '',
        website ? `🌐 Request a fast quote: ${website}` : '',
      ].filter(Boolean);

      const body = bodyLines.join('\n');
      const fullPostText = `${headline}\n\n${body}\n\n${baseHashtags.join(' ')}`;

      return {
        category: 'project_showcase',
        categoryLabel: 'Project Showcase',
        headline,
        body,
        ctaType: 'BOOK',
        ctaLabel: 'Book an Estimate',
        suggestedHashtags: baseHashtags,
        fullPostText,
      };
    }

    case 'seasonal_offer': {
      const headline = `⭐ Limited-Time Offer: ${offer || `Seasonal ${trade} Special in ${city}`}`;
      const bodyLines = [
        `Now is the perfect time to schedule your ${trade.toLowerCase()} service with ${business}!`,
        offer ? `\n🔥 Special Promotion: ${offer}` : `\nTake advantage of early booking specials and priority scheduling this season.`,
        `\nSpots fill up fast in ${city} — reserve your appointment today!`,
        phone ? `📞 Call us at ${phone}` : '',
        website ? `🌐 Claim this offer: ${website}` : '',
      ].filter(Boolean);

      const body = bodyLines.join('\n');
      const fullPostText = `${headline}\n\n${body}\n\n${baseHashtags.join(' ')}`;

      return {
        category: 'seasonal_offer',
        categoryLabel: 'Seasonal Offer / Special',
        headline,
        body,
        ctaType: 'GET_OFFER',
        ctaLabel: 'Claim Offer',
        suggestedHashtags: [...baseHashtags, '#SpecialOffer', '#LimitedTime'],
        fullPostText,
      };
    }

    case 'maintenance_tip': {
      const headline = `💡 Pro Tip from ${business}: ${tip || `Maintaining Your Home's ${trade}`}`;
      const bodyLines = [
        `Regular upkeep saves thousands in premature replacements. Here is what we recommend for homeowners in ${city}:`,
        tip
          ? `\n✓ ${tip}`
          : `\n✓ Inspect periodically for minor wear before it turns into an emergency.\n✓ Keep surfaces clean and clear of moisture buildup.\n✓ Have a licensed professional do an annual inspection.`,
        `\nGot questions or need a quick assessment? ${business} is always happy to help our local community.`,
        phone ? `📞 Phone: ${phone}` : '',
        website ? `🌐 More info: ${website}` : '',
      ].filter(Boolean);

      const body = bodyLines.join('\n');
      const fullPostText = `${headline}\n\n${body}\n\n${baseHashtags.join(' ')}`;

      return {
        category: 'maintenance_tip',
        categoryLabel: 'Pro Maintenance Tip',
        headline,
        body,
        ctaType: 'LEARN_MORE',
        ctaLabel: 'Learn More',
        suggestedHashtags: [...baseHashtags, '#ProTips', '#HomeMaintenance'],
        fullPostText,
      };
    }

    case 'review_celebration': {
      const headline = `🌟 Customer Spotlight: What ${city} Homeowners Say About ${business}`;
      const bodyLines = [
        quote ? `"${quote}"` : `"Outstanding service from start to finish. On time, transparent pricing, and quality workmanship."`,
        `— ${reviewer}`,
        `\nThank you for trusting ${business} with your home! We take pride in serving ${city} with honesty and dedication.`,
        `\nReady to experience 5-star ${trade.toLowerCase()} service?`,
        phone ? `📞 Contact: ${phone}` : '',
        website ? `🌐 Start your quote: ${website}` : '',
      ].filter(Boolean);

      const body = bodyLines.join('\n');
      const fullPostText = `${headline}\n\n${body}\n\n${baseHashtags.join(' ')}`;

      return {
        category: 'review_celebration',
        categoryLabel: 'Review Celebration',
        headline,
        body,
        ctaType: 'BOOK',
        ctaLabel: 'Book Now',
        suggestedHashtags: [...baseHashtags, '#HappyCustomer', '#5StarService'],
        fullPostText,
      };
    }
  }
}

/**
 * Generates professional, compliant review replies.
 * - 5-star: Warm, incorporates local SEO keywords (service + city), invites referrals.
 * - 4-star: Appreciative, validates experience, commits to continuous improvement.
 * - 1-3 star: FTC/Google compliant de-escalation, never argumentative, invites private phone/email resolution.
 */
export function generateReviewReply(input: ReviewReplyInput): string {
  const business = (input.businessName || 'Our team').trim();
  const reviewer = (input.reviewerName || 'there').trim().split(/\s+/)[0] || 'there';
  const service = (input.serviceCompleted || 'project').trim();
  const city = (input.city || '').trim();
  const phone = input.ownerContactPhone?.trim();
  const email = input.ownerContactEmail?.trim();
  const tone = input.tone || (input.rating >= 5 ? 'seo_boost' : input.rating >= 4 ? 'professional' : 'resolution');

  if (input.rating >= 5) {
    if (tone === 'seo_boost') {
      const locationMention = city ? ` here in ${city}` : '';
      return `Hi ${reviewer}, thank you so much for the 5-star review! The team at ${business} loved helping you with your ${service}${locationMention}. We take great pride in delivering reliable, top-quality craftsmanship to our community. If you ever need anything else, we're just a phone call away!`;
    }
    if (tone === 'enthusiastic') {
      return `Thank you ${reviewer}! It was an absolute pleasure working with you on your ${service}. We truly appreciate your kind words and your support of ${business}. Please don't hesitate to reach out whenever we can help again!`;
    }
    return `Thank you for taking the time to share your feedback, ${reviewer}. ${business} is proud to have completed your ${service} to your satisfaction. We look forward to serving you again in the future!`;
  }

  if (input.rating === 4) {
    return `Hi ${reviewer}, thank you for your review and for choosing ${business} for your ${service}! We're glad we could deliver a great outcome for you. We are always striving for a 5-star experience on every job, so if there's ever anything we can do to make your experience even better next time, please let us know. Thank you again!`;
  }

  // 1-3 Star: Resolution & De-escalation (Strictly FTC & Google Policy Compliant)
  const contactParts = [phone ? `phone at ${phone}` : '', email ? `email at ${email}` : ''].filter(Boolean);
  const contactText = contactParts.length > 0 ? `directly via ${contactParts.join(' or ')}` : 'directly';

  return `Hi ${reviewer}, thank you for your honest feedback. At ${business}, we hold ourselves to high standards of quality and communication, and we're sorry to hear that your experience fell short of expectations. We would appreciate the opportunity to discuss this with you and make things right. Please reach out to our management team ${contactText} so we can assist you promptly.`;
}

/**
 * Computes a 0-100 Local SEO Growth Scorecard and actionable checklist.
 */
export function computeGbpGrowthScore(params: {
  placeId?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  importedReviewCount?: number | null;
  autoReviewRequestsEnabled?: boolean;
  hasWebsiteDomain?: boolean;
}): GbpGrowthScorecard {
  const placeId = params.placeId?.trim();
  const isLinked = Boolean(placeId);
  const reviewCount = params.googleReviewCount ?? 0;
  const rating = params.googleRating ?? 0;
  const autoRequests = Boolean(params.autoReviewRequestsEnabled);

  const checklist: GbpScorecardChecklistItem[] = [];
  let score = 0;

  // 1. Connection (30 pts)
  if (isLinked) {
    score += 30;
    checklist.push({
      id: 'place_linked',
      title: 'Google Business Profile Connected',
      description: 'Your verified Place ID is linked to automate review display and direct 5-star review links.',
      status: 'complete',
      impact: 'essential',
      actionLabel: 'Connected',
    });
  } else {
    checklist.push({
      id: 'place_linked',
      title: 'Connect Google Business Profile',
      description: 'Link your business profile to activate verified review imports, direct review deep links, and automated review collection.',
      status: 'missing',
      impact: 'essential',
      actionLabel: 'Search & Link Profile',
      tip: 'Contractors with verified Google profiles generate up to 3x more local inquiries.',
    });
  }

  // 2. Automated Review Asks (25 pts)
  if (autoRequests) {
    score += 25;
    checklist.push({
      id: 'auto_requests',
      title: 'Automated Post-Job Review Requests Active',
      description: 'SMS and email review invites trigger automatically upon job completion.',
      status: 'complete',
      impact: 'high',
      actionLabel: 'Active',
    });
  } else {
    checklist.push({
      id: 'auto_requests',
      title: 'Turn on Automated Review Requests',
      description: 'Send automatic review requests via SMS/email the moment a job is marked complete.',
      status: 'warning',
      impact: 'high',
      actionLabel: 'Enable in Settings',
      tip: 'Asking within 1 hour of job completion increases review submission rates by 68%.',
    });
  }

  // 3. Review Volume Benchmark (25 pts)
  if (reviewCount >= 25) {
    score += 25;
    checklist.push({
      id: 'review_volume',
      title: `High Review Volume (${reviewCount} Reviews)`,
      description: 'Strong social proof and keyword density boosting your Google Maps 3-Pack rank.',
      status: 'complete',
      impact: 'high',
      actionLabel: 'Established',
    });
  } else if (reviewCount >= 5) {
    score += 15;
    checklist.push({
      id: 'review_volume',
      title: `Growing Review Count (${reviewCount} of 25 Target)`,
      description: 'You have solid initial reviews. Aim for 25+ to consistently outrank local competitors in Maps.',
      status: 'warning',
      impact: 'high',
      actionLabel: 'Request More Reviews',
      tip: 'Share your direct QR code or SMS link on every completed job.',
    });
  } else if (isLinked) {
    score += 5;
    checklist.push({
      id: 'review_volume',
      title: `Initial Reviews Needed (${reviewCount} Reviews)`,
      description: 'Reaching your first 5-10 verified Google reviews unlocks Google star ratings in local search.',
      status: 'missing',
      impact: 'high',
      actionLabel: 'Send Review Links',
      tip: 'Send direct review links to your past happy clients to build momentum.',
    });
  }

  // 4. Rating Quality (10 pts)
  if (rating >= 4.7 && reviewCount >= 5) {
    score += 10;
    checklist.push({
      id: 'rating_quality',
      title: `Exceptional Rating (${rating.toFixed(1)}★)`,
      description: 'Maintaining a 4.7+ average rating maximizes conversion rates from searchers.',
      status: 'complete',
      impact: 'medium',
      actionLabel: 'Excellent',
    });
  } else if (rating >= 4.0 && reviewCount > 0) {
    score += 7;
    checklist.push({
      id: 'rating_quality',
      title: `Good Rating (${rating.toFixed(1)}★)`,
      description: 'Maintain high standards and encourage detailed feedback from your top clients.',
      status: 'complete',
      impact: 'medium',
      actionLabel: 'Solid',
    });
  }

  // 5. Weekly Posting & Response Cadence (10 pts)
  score += 10; // Default baseline for having the Growth Hub toolkit available
  checklist.push({
    id: 'weekly_posts',
    title: 'Weekly Google Posts & Fast Review Replies',
    description: 'Post weekly project updates and reply to all reviews within 24 hours to signal freshness to Google.',
    status: 'complete',
    impact: 'medium',
    actionLabel: 'Tools Available',
    tip: 'Active profiles with regular posts receive 2.7x more direction requests.',
  });

  let level: GbpGrowthScorecard['level'] = 'beginner';
  let levelLabel = 'Starter';
  let summary = 'Connect your profile and start gathering verified Google reviews to boost local ranking.';

  if (score >= 85) {
    level = 'elite';
    levelLabel = 'Google 3-Pack Contender (Elite)';
    summary = 'Your profile has stellar signals for high Google Maps visibility and top local rankings.';
  } else if (score >= 65) {
    level = 'optimized';
    levelLabel = 'Optimized & Growing';
    summary = 'Strong foundation. Keep generating steady post-job reviews and posting project updates.';
  } else if (score >= 40) {
    level = 'growing';
    levelLabel = 'Building Momentum';
    summary = 'Good start. Turn on automated review requests and target your first 25 reviews.';
  }

  return {
    score: Math.min(100, score),
    level,
    levelLabel,
    summary,
    checklist,
  };
}
