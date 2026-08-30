/**
 * AI Copy & Creative Generation Engine for Neighborhood Halo Ad Campaigns.
 *
 * Produces hyper-local ad copy for Facebook, Instagram, Google Local, and Showcase Landing Pages
 * referencing recent craftsmanship on specific streets while safeguarding client privacy.
 */

import {
  type HaloAdCopyPackage,
  generateDeterministicHaloCopy,
} from './neighborhood-halo';
import { clampText } from './google-ads-generator';
import type { WeatherSurgeOpportunity } from './weather-ad-surge';

export type GenerateHaloCopyInput = {
  trade: string;
  businessName: string;
  streetName: string;
  neighborhoodName: string;
  city?: string;
  state?: string;
  scopeSummary?: string;
  customIncentive?: string;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  weatherSurge?: WeatherSurgeOpportunity | null;
};

export type HaloAdCreativeBundle = {
  copy: HaloAdCopyPackage;
  metaAd: {
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
  };
  googleAd: {
    headlines: string[];
    descriptions: string[];
  };
  showcaseStory: {
    title: string;
    subtitle: string;
    narrative: string;
  };
  stormSurgeActive?: boolean;
};

/**
 * Builds the complete multi-channel ad copy and showcase creative bundle.
 */
export function buildHaloCreativeBundle(input: GenerateHaloCopyInput): HaloAdCreativeBundle {
  const {
    trade,
    businessName,
    streetName,
    neighborhoodName,
    city = 'Local Area',
    scopeSummary,
    customIncentive,
    weatherSurge,
  } = input;

  const isStormSurge = Boolean(weatherSurge?.surgeActive);

  const baseCopy = generateDeterministicHaloCopy({
    trade,
    businessName,
    streetName,
    neighborhoodName,
    scopeSummary,
  });

  const effectiveIncentive = isStormSurge
    ? 'Free Drone Roof & Storm Damage Inspection'
    : (customIncentive ? customIncentive.trim() : 'Free Neighbor Estimate & Priority Scheduling');

  const cleanScope = scopeSummary ? scopeSummary.trim() : `${trade} Project`;

  // Meta (Facebook & Instagram)
  const metaPrimaryText = isStormSurge
    ? [
        `⚠️ Severe Storm & Wind Activity Detected in ${neighborhoodName}!`,
        '',
        `Our storm damage restoration team at ${businessName} just inspected a property on ${streetName}. While our crews and bucket trucks are active in ${neighborhoodName} this week, we're providing free storm damage inspections to document roof, siding, and gutter damage for insurance claims before leaks spread.`,
        '',
        `👉 Tap below to request an inspection on your street before our crews move to the next storm zone.`,
      ].join('\n')
    : [
        `📍 Just completed on ${streetName} in ${neighborhoodName}!`,
        '',
        `Our team at ${businessName} just finished a full ${cleanScope.toLowerCase()}. While our work trucks and crews are active in the ${neighborhoodName} area this week, we're offering neighbors exclusive priority booking and ${effectiveIncentive}.`,
        '',
        `👉 Tap below to view the before & after photos and check availability on our calendar before we move to the next service zone.`,
      ].join('\n');

  const metaHeadline = isStormSurge
    ? clampText(`📍 Storm Damage on ${streetName}? Free Check`, 40)
    : clampText(`Just Completed on ${streetName} · ${trade}`, 40);

  const metaDescription = isStormSurge
    ? clampText(`Free Insurance Claim Inspection`, 35)
    : clampText(`${effectiveIncentive} · Licensed & Insured`, 35);

  const callToAction = isStormSurge ? 'Book Inspection' : 'Claim Offer';

  // Google Search & Display Responsive
  const googleHeadlines = isStormSurge
    ? [
        clampText(`Storm Damage on ${streetName}`, 30),
        clampText(`Free Storm Inspection ${neighborhoodName}`, 30),
        clampText(`${businessName} · Storm Repairs`, 30),
        clampText(`Insurance Claim Specialists`, 30),
        clampText(`Emergency ${trade} Service`, 30),
      ].filter(Boolean)
    : [
        clampText(`Just Completed on ${streetName}`, 30),
        clampText(`Top-Rated ${trade} in ${neighborhoodName}`, 30),
        clampText(`${businessName} · Local ${trade}`, 30),
        clampText(`Neighbor Priority Quotes`, 30),
        clampText(`Free 15-Point Inspection`, 30),
      ].filter(Boolean);

  const googleDescriptions = isStormSurge
    ? [
        clampText(`Storm & wind activity in ${neighborhoodName}. Book a free drone inspection with ${businessName}.`, 90),
        clampText(`Licensed & insured storm restoration experts. We help document full insurance claims.`, 90),
      ]
    : [
        clampText(`Our crews are working in ${neighborhoodName} this week. Claim your neighbor inspection & quote!`, 90),
        clampText(`Licensed & insured ${trade.toLowerCase()} team. See recent project photos & book online today.`, 90),
      ];

  // Landing Page Showcase Story
  const showcaseStory = {
    title: isStormSurge ? `Storm Damage Restoration on ${streetName}` : `${trade} Transformation on ${streetName}`,
    subtitle: `Completed by ${businessName} for our neighbors in ${neighborhoodName}`,
    narrative: isStormSurge
      ? `Following severe storm weather in ${neighborhoodName}, our team restored this property with reinforced materials and complete insurance claim documentation.`
      : `This ${cleanScope.toLowerCase()} was completed with precision craftsmanship and top-grade materials. We are proud to serve homeowners throughout ${neighborhoodName} and ${city}.`,
  };

  return {
    copy: {
      ...baseCopy,
      incentiveBadge: effectiveIncentive,
      headline: isStormSurge ? `Storm Recovery on ${streetName}` : baseCopy.headline,
    },
    metaAd: {
      primaryText: metaPrimaryText,
      headline: metaHeadline,
      description: metaDescription,
      callToAction,
    },
    googleAd: {
      headlines: googleHeadlines,
      descriptions: googleDescriptions,
    },
    showcaseStory,
    stormSurgeActive: isStormSurge,
  };
}

export type HaloReelSegment = {
  timeframe: string; // e.g. "0:00 - 0:03"
  phase: 'hook' | 'before_problem' | 'craftsmanship' | 'call_to_action';
  onScreenText: string;
  voiceoverPrompt: string;
  visualAsset: 'street_badge' | 'before_photo' | 'after_photo' | 'logo_cta';
};

export type HaloVideoReelScript = {
  reelTitle: string;
  durationSeconds: number;
  musicMood: string;
  aspectRatio: '9:16' | '1:1';
  segments: HaloReelSegment[];
  captionCopy: string;
};

/**
 * Generates a 15-second timed storyboard for Instagram Reels, Meta Stories, and YouTube Shorts.
 */
export function generateHaloVideoReelScript(input: {
  trade: string;
  businessName: string;
  streetName: string;
  neighborhoodName: string;
  scopeSummary?: string;
  customIncentive?: string;
}): HaloVideoReelScript {
  const { trade, businessName, streetName, neighborhoodName, scopeSummary, customIncentive } = input;
  const cleanScope = scopeSummary ? scopeSummary.trim() : `${trade} Transformation`;
  const incentive = customIncentive ? customIncentive.trim() : 'Free Neighbor Estimate';

  const segments: HaloReelSegment[] = [
    {
      timeframe: '0:00 - 0:03',
      phase: 'hook',
      onScreenText: `📍 NEW ON ${streetName.toUpperCase()}!`,
      voiceoverPrompt: `Another stunning ${trade.toLowerCase()} project just wrapped up on ${streetName}!`,
      visualAsset: 'street_badge',
    },
    {
      timeframe: '0:03 - 0:07',
      phase: 'before_problem',
      onScreenText: `⚠️ Before: Outdated & Worn`,
      voiceoverPrompt: `The homeowners needed a lasting, high-grade upgrade before storm season.`,
      visualAsset: 'before_photo',
    },
    {
      timeframe: '0:07 - 0:11',
      phase: 'craftsmanship',
      onScreenText: `✨ After: Built by ${businessName}`,
      voiceoverPrompt: `Our crew delivered a full ${cleanScope.toLowerCase()} in record time.`,
      visualAsset: 'after_photo',
    },
    {
      timeframe: '0:11 - 0:15',
      phase: 'call_to_action',
      onScreenText: `⭐ ${incentive.toUpperCase()}\nWorking in ${neighborhoodName}`,
      voiceoverPrompt: `Neighbors in ${neighborhoodName} get priority booking this week. Tap the link below!`,
      visualAsset: 'logo_cta',
    },
  ];

  const captionCopy = `📍 Just finished on ${streetName} in ${neighborhoodName}! Full ${cleanScope.toLowerCase()} by @${businessName.replace(/\s+/g, '')}. Tap the link in bio to claim your exclusive neighbor inspection! #LocalContractor #${trade.replace(/\s+/g, '')} #${neighborhoodName.replace(/\s+/g, '')}`;

  return {
    reelTitle: `${trade} on ${streetName} (15s Showcase)`,
    durationSeconds: 15,
    musicMood: 'Modern, Energetic & Upbeat Craftsmanship',
    aspectRatio: '9:16',
    segments,
    captionCopy,
  };
}

export type BeforeAfterSliderMetadata = {
  containerId: string;
  streetBadge: string;
  neighborhoodLabel: string;
  beforeLabel: string;
  afterLabel: string;
  defaultPositionPct: number;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  altText: string;
};

/**
 * Builds interactive split-screen slider parameters for showcase landing pages.
 */
export function generateBeforeAfterSliderMetadata(input: {
  trade: string;
  streetName: string;
  neighborhoodName: string;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
}): BeforeAfterSliderMetadata {
  const { trade, streetName, neighborhoodName, beforePhotoUrl, afterPhotoUrl } = input;
  const safeId = `halo-slider-${streetName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  return {
    containerId: safeId,
    streetBadge: `📍 ${streetName}`,
    neighborhoodLabel: neighborhoodName,
    beforeLabel: 'Before Project',
    afterLabel: 'Completed Craftsmanship',
    defaultPositionPct: 50,
    beforePhotoUrl: beforePhotoUrl || '/images/showcase/before-placeholder.jpg',
    afterPhotoUrl: afterPhotoUrl || '/images/showcase/after-placeholder.jpg',
    altText: `Before and after ${trade} installation on ${streetName} in ${neighborhoodName}`,
  };
}

