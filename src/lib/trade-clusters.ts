import { TRADES, getTrade, type Trade } from './trades';
import { TRADE_CATEGORIES } from './trade-categories';
import { ARTICLES, type Article } from './resources';

export type TopicClusterLink = {
  href: string;
  title: string;
  blurb: string;
  anchorText: string;
  category: 'guide' | 'tool' | 'feature' | 'comparison' | 'trade';
  badge: string;
};

export type TradeTopicCluster = {
  bestGuide: TopicClusterLink;
  bestTool: TopicClusterLink;
  bestFeature: TopicClusterLink;
  bestComparison: TopicClusterLink;
  relatedTrades: Trade[];
};

/**
 * Returns the best guide, interactive tool, platform feature, software comparison,
 * and related trade pages for any given trade.
 *
 * Grounded in descriptive anchor text and strong topical clustering so Google and
 * contractors can discover all connected resources across the platform.
 */
export function getTradeTopicCluster(trade: Trade): TradeTopicCluster {
  const slug = trade.slug;
  const work = trade.work;
  const name = trade.name;

  // 1. Determine the Best Guide / Playbook
  let bestGuide: TopicClusterLink;
  if (
    [
      'roofers', 'remodelers', 'pole-barns', 'grain-bins', 'wine-cellars', 'saunas',
      'home-theaters', 'deck-builders', 'pool-builders', 'bathroom-remodelers',
      'solar', 'solar-batteries', 'docks-and-seawalls', 'custom-closets',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/good-better-best-quoting-guide',
      title: 'Good, Better, Best quotes: How to lift average ticket size',
      blurb: `Learn how multi-option proposals stop price shopping and increase average contract sizes for ${name}.`,
      anchorText: `Read the Good, Better, Best Quoting Playbook for ${name}`,
      category: 'guide',
      badge: 'Contractor Playbook',
    };
  } else if (
    [
      'plumbers', 'electricians', 'hvac', 'locksmiths', 'trenchless-sewer', 'septic',
      'drain-cleaning', 'auto-glass', 'mobile-mechanics', 'hydraulic-hose-repair',
      'appliance-repair', 'biohazard-remediation', 'garage-doors',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/speed-to-lead-contractor-playbook',
      title: 'Speed-to-lead: Why answering in 5 minutes wins 70% of jobs',
      blurb: `Discover how automated 60-second SMS responses and instant intake secure high-ticket emergency calls.`,
      anchorText: `Explore the Speed-to-Lead Playbook for ${name}`,
      category: 'guide',
      badge: 'Contractor Playbook',
    };
  } else if (
    [
      'concrete', 'concrete-leveling', 'paver-sealing', 'fencing', 'farm-fencing',
      'excavation', 'sports-courts', 'ironwork-and-railings', 'historic-masonry',
      'masonry', 'paving', 'sealcoating', 'asbestos-abatement', 'demolition',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/markup-vs-margin-calculator-guide',
      title: 'Markup vs. Margin: The contractor’s pricing cheat sheet',
      blurb: `Avoid the #1 mathematical pricing mistake that drains profits on labor and material estimates.`,
      anchorText: `Master pricing and profit margins for ${name}`,
      category: 'guide',
      badge: 'Pricing Guide',
    };
  } else if (
    [
      'cabinetry', 'cabinet-refacing', 'cabinet-refinishing', 'flooring',
      'hardwood-refinishing', 'tile', 'drop-ceilings', 'storefront-glass',
      'finish-carpentry', 'drywall', 'countertops',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/building-contractor-cost-catalog',
      title: 'How to build a line-item cost catalog to quote 5x faster',
      blurb: `Unitize frequent assemblies and standard material packages to assemble custom bids in 2 minutes.`,
      anchorText: `Build a line-item cost catalog for ${name}`,
      category: 'guide',
      badge: 'Operations Guide',
    };
  } else if (
    [
      'lawn-care', 'pool-services', 'mobile-pet-grooming', 'cleaning-services',
      'window-cleaning', 'carpet-cleaning', 'commercial-cleaning', 'pet-waste-removal',
      'bin-cleaning', 'fleet-washing', 'hood-cleaning', 'commercial-floor-care',
      'mobile-knife-sharpening', 'small-engine-repair', 'rv-repair',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/card-on-file-contractor-billing',
      title: 'Card-on-file billing: Get paid the minute the crew packs up',
      blurb: `Eliminate 30-day unpaid invoice chasing by tokenizing customer cards at quote sign-off.`,
      anchorText: `Set up card-on-file billing for ${name}`,
      category: 'guide',
      badge: 'Billing Playbook',
    };
  } else if (
    [
      'shed-builders', 'greenhouses', 'outdoor-kitchens', 'hardscaping',
      'artificial-turf', 'landscape-lighting', 'holiday-lighting', 'event-rentals',
      'boat-lifts', 'hot-tub-services',
    ].includes(slug)
  ) {
    bestGuide = {
      href: '/resources/gate-schedule-on-deposits',
      title: 'Why you should never schedule before the deposit clears',
      blurb: `Protect crew time and material commitments by tying calendar reservations to cleared Stripe deposits.`,
      anchorText: `Lock in deposit-gated scheduling for ${name}`,
      category: 'guide',
      badge: 'Operations Playbook',
    };
  } else {
    bestGuide = {
      href: '/resources/stop-losing-leads',
      title: '7 ways contractors lose leads — and how to plug each one',
      blurb: `Identify and fix the hidden leaks where good homeowner inquiries slip away unquoted.`,
      anchorText: `Learn how ${name} plug hidden lead leaks`,
      category: 'guide',
      badge: 'Contractor Guide',
    };
  }

  // 2. Determine the Best Interactive Tool
  let bestTool: TopicClusterLink;
  if (
    [
      'plumbers', 'electricians', 'hvac', 'handyman', 'locksmiths', 'appliance-repair',
      'mobile-mechanics', 'mobile-welding', 'hydraulic-hose-repair', 'small-engine-repair',
    ].includes(slug)
  ) {
    bestTool = {
      href: '/tools/hourly-rate-calculator',
      title: 'True Loaded Hourly Rate Calculator',
      blurb: `Calculate your real billable hourly rate factoring unbilled drive time, vehicle overhead, insurance, and target profit.`,
      anchorText: `Calculate your true loaded hourly labor rate for ${work}`,
      category: 'tool',
      badge: 'Interactive Calculator',
    };
  } else if (
    [
      'cleaning-services', 'window-cleaning', 'carpet-cleaning', 'pressure-washing',
      'lawn-care', 'pest-control', 'auto-detailing', 'junk-removal', 'landscapers',
    ].includes(slug)
  ) {
    bestTool = {
      href: '/tools/leakage-calculator',
      title: 'Revenue Leakage & Missed Lead Calculator',
      blurb: `Audit how many uncontacted after-hours inquiries and delayed replies slip away each month.`,
      anchorText: `Audit lost inquiries with the ${work} revenue leakage calculator`,
      category: 'tool',
      badge: 'Interactive Audit Tool',
    };
  } else {
    bestTool = {
      href: '/tools/estimate-generator',
      title: 'Free Contractor Estimate Generator',
      blurb: `Generate branded, itemized PDF estimates with custom line items, markup calculations, and instant download.`,
      anchorText: `Generate instant itemized estimates for ${work}`,
      category: 'tool',
      badge: 'Free Contractor Tool',
    };
  }

  // 3. Determine the Best Platform Feature
  let bestFeature: TopicClusterLink;
  if (
    [
      'roofers', 'siding', 'solar', 'gutters', 'window-installers', 'insulation',
      'commercial-roofing', 'solar-batteries', 'crawlspace-encapsulation',
    ].includes(slug)
  ) {
    bestFeature = {
      href: '/features/property-intelligence',
      title: 'Property Intelligence & Roof Geometry',
      blurb: `Instantly inspect parcel square footage, roof pitch, living area, and electrical specs before estimating.`,
      anchorText: `See how Property Intelligence decodes building specs for ${name}`,
      category: 'feature',
      badge: 'Platform Feature',
    };
  } else if (
    [
      'pressure-washing', 'junk-removal', 'window-cleaning', 'auto-detailing',
      'mobile-mechanics', 'mobile-tires', 'paintless-dent-repair', 'pet-waste-removal',
      'bin-cleaning', 'fleet-washing', 'dry-ice-blasting', 'mobile-pet-grooming',
      'mobile-knife-sharpening', 'hydraulic-hose-repair',
    ].includes(slug)
  ) {
    bestFeature = {
      href: '/features/quick-stops',
      title: 'Route-Aware Quick Stops Dispatch',
      blurb: `Fill schedule gaps by dispatching nearby homeowners with same-day priority windows along active driving routes.`,
      anchorText: `Monetize daily travel downtime with Quick Stops for ${name}`,
      category: 'feature',
      badge: 'Dispatch Feature',
    };
  } else if (
    [
      'remodelers', 'bathroom-remodelers', 'custom-closets', 'kitchen-bath',
      'pole-barns', 'pool-builders', 'sports-courts', 'deck-builders', 'wine-cellars',
      'saunas', 'home-theaters', 'docks-and-seawalls', 'heavy-rigging',
    ].includes(slug)
  ) {
    bestFeature = {
      href: '/features/payments',
      title: 'Staged Deposits & Milestone Payments',
      blurb: `Collect upfront material deposits and progress payments on tokenized cards through Stripe without chasing checks.`,
      anchorText: `Collect staged milestone deposits for ${name}`,
      category: 'feature',
      badge: 'Payments Feature',
    };
  } else if (
    [
      'plumbers', 'electricians', 'hvac', 'drain-cleaning', 'trenchless-sewer',
      'gas-fitters', 'geothermal-hvac', 'mini-split-installers', 'well-water',
    ].includes(slug)
  ) {
    bestFeature = {
      href: '/features/ai-intake',
      title: '24/7 AI Smart Intake & Lead Scorer',
      blurb: `Ask technical scoping questions, analyze photo attachments, and qualify emergency dispatches automatically.`,
      anchorText: `Qualify emergency leads 24/7 with AI Smart Intake for ${name}`,
      category: 'feature',
      badge: 'AI Feature',
    };
  } else {
    bestFeature = {
      href: '/features/quotes',
      title: 'Itemized Quotes & Tiered Proposals',
      blurb: `Assemble branded Good/Better/Best options with saved cost assemblies and e-signatures in seconds.`,
      anchorText: `Build high-converting proposal tiers for ${name}`,
      category: 'feature',
      badge: 'Quoting Feature',
    };
  }

  // 4. Determine the Best Competitor Comparison
  let bestComparison: TopicClusterLink;
  if (
    [
      'commercial-roofing', 'geothermal-hvac', 'fire-protection', 'heavy-rigging',
      'asbestos-abatement', 'biohazard-remediation', 'generator-maintenance',
    ].includes(slug)
  ) {
    bestComparison = {
      href: '/compare/servicetitan-alternative',
      title: 'Let’s Get Quoted vs. ServiceTitan',
      blurb: `Eliminate $5,000 implementation fees, technician seat penalties, and locked multi-year enterprise contracts.`,
      anchorText: `Compare Let’s Get Quoted vs. ServiceTitan for ${name}`,
      category: 'comparison',
      badge: 'Software Comparison',
    };
  } else if (
    [
      'plumbers', 'electricians', 'hvac', 'garage-doors', 'appliance-repair',
      'carpet-cleaning', 'air-duct-cleaning', 'water-damage-restoration',
    ].includes(slug)
  ) {
    bestComparison = {
      href: '/compare/housecall-pro-alternative',
      title: 'Let’s Get Quoted vs. Housecall Pro',
      blurb: `Get a free SEO contractor website, AI intake, and 2-way texting without expensive module add-on fees.`,
      anchorText: `Compare Let’s Get Quoted vs. Housecall Pro for ${name}`,
      category: 'comparison',
      badge: 'Software Comparison',
    };
  } else if (
    [
      'roofers', 'remodelers', 'siding', 'window-installers', 'deck-builders',
      'painters', 'fencing', 'masonry', 'foundation-repair', 'basement-waterproofing',
    ].includes(slug)
  ) {
    bestComparison = {
      href: '/compare/angi-leads-alternative',
      title: 'Let’s Get Quoted vs. Angi Leads (Shared vs. Exclusive)',
      blurb: `Stop paying $75+ for shared directory leads. Build your own high-converting website and keep 100% of customer equity.`,
      anchorText: `Stop paying for shared broker leads with our Angi comparison for ${name}`,
      category: 'comparison',
      badge: 'Directory Comparison',
    };
  } else if (
    [
      'handyman', 'drywall', 'locksmiths', 'tree-services', 'stump-grinding',
      'window-tinting', 'mobile-pet-grooming', 'small-engine-repair',
    ].includes(slug)
  ) {
    bestComparison = {
      href: '/compare/thumbtack-alternative',
      title: 'Let’s Get Quoted vs. Thumbtack (Per-Message Fees vs. Free)',
      blurb: `Avoid auto-billed credit card fees for customer messages. Capture direct inquiries with $0 lead fees.`,
      anchorText: `Eliminate per-message fees with our Thumbtack comparison for ${name}`,
      category: 'comparison',
      badge: 'Directory Comparison',
    };
  } else {
    bestComparison = {
      href: '/compare/jobber-alternative',
      title: 'Let’s Get Quoted vs. Jobber',
      blurb: `Run your business starting at $0/month on Flex with an included marketing website and 24/7 AI intake.`,
      anchorText: `Compare Let’s Get Quoted vs. Jobber for ${name}`,
      category: 'comparison',
      badge: 'Software Comparison',
    };
  }

  // 5. Related Trades with guaranteed fallback
  let relatedTrades: Trade[] = [];
  if (trade.relatedSlugs && trade.relatedSlugs.length > 0) {
    relatedTrades = trade.relatedSlugs
      .map(getTrade)
      .filter((t): t is Trade => Boolean(t));
  }

  if (relatedTrades.length < 3) {
    // Find category siblings
    const category = TRADE_CATEGORIES.find((cat) => cat.slugs.includes(trade.slug));
    if (category) {
      const siblings = category.slugs
        .filter((s) => s !== trade.slug && !trade.relatedSlugs?.includes(s))
        .map(getTrade)
        .filter((t): t is Trade => Boolean(t));
      relatedTrades = [...relatedTrades, ...siblings].slice(0, 4);
    }
  }

  return {
    bestGuide,
    bestTool,
    bestFeature,
    bestComparison,
    relatedTrades,
  };
}
