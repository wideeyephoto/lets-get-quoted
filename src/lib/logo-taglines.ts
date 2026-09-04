/**
 * Tagline and Slogan generator helpers for brand identity and logo creation.
 */

export interface TaglinePromptParams {
  companyName?: string;
  trade?: string;
  serviceArea?: string;
  zip?: string;
}

/**
 * Builds the user input string for OpenAI Responses API.
 * CRITICAL: Must include the word "json" so OpenAI does not return a 400 Bad Request
 * when text.format is { type: 'json_object' }.
 */
export function buildTaglinePromptInput(params: TaglinePromptParams): string {
  const company = params.companyName?.trim() || 'Our Company';
  const trade = params.trade?.trim() || 'General Contractor';
  const loc = params.serviceArea?.trim() || params.zip?.trim() || 'Local';

  return `Company: ${company}. Trade: ${trade}. Location: ${loc}. Respond with json only.`;
}

export const TAGLINE_INSTRUCTIONS =
  'You generate 5 distinct, high-impact, professional marketing taglines/slogans for a local home services contractor logo. ' +
  'Rules: ' +
  '1. Each tagline must be under 40 characters so it fits cleanly on an invoice, truck wrap, or logo emblem. ' +
  '2. Make them punchy, trustworthy, and industry-specific (e.g. Plumbing, HVAC, Roofing, Electrical). ' +
  '3. Offer varied angles: one reliability/speed, one master craftsmanship/heritage, one local pride, one modern concise, one premium quality. ' +
  '4. Return strict JSON format: {"taglines": ["line 1", "line 2", "line 3", "line 4", "line 5"]}';

/**
 * Trade-specific fallback taglines so when offline, without an API key, or upon model failure,
 * the contractor is always presented with 5 sharp, trade-tailored slogans.
 */
export function getFallbackTaglines(trade?: string | null, companyName?: string | null): string[] {
  const norm = (trade || '').toLowerCase();
  const name = companyName?.trim();

  let pool: string[];

  if (norm.includes('plumb') || norm.includes('drain') || norm.includes('pipe') || norm.includes('sewer')) {
    pool = [
      'Fast, Honest & Precision Plumbing',
      'Clogged Drains to Water Heaters Done Right',
      'Local 24/7 Leak & Drain Specialists',
      'Master Plumbers. Guaranteed Flow.',
      'Clean Work. Transparent Pricing.',
      'Drains Cleared & Pipes Repaired Fast',
      'Prompt, Reliable Local Plumbing Pros',
    ];
  } else if (norm.includes('hvac') || norm.includes('heat') || norm.includes('cool') || norm.includes('air conditioning') || norm.includes('furnace')) {
    pool = [
      'Year-Round Heating & Cooling Comfort',
      'Fast Diagnostics, Honest HVAC Repairs',
      'Keep Your Home Cool, Warm & Efficient',
      'Trusted Furnace & AC Specialists',
      'Precision Climate Control for Every Season',
      'Emergency Heating & Air Conditioning',
      'High-Efficiency HVAC Installation & Care',
    ];
  } else if (norm.includes('roof') || norm.includes('gutter') || norm.includes('siding')) {
    pool = [
      'Built to Weather Every Storm',
      'Reliable Roof Replacements & Repairs',
      'Honest Estimates. Leak-Free Guarantees.',
      'Protecting Your Home from Top to Bottom',
      'Precision Roofing & Storm Restoration',
      'Licensed & Insured Local Roofers',
      'Durable Roofing Built to Last Decades',
    ];
  } else if (norm.includes('electr') || norm.includes('wire') || norm.includes('panel') || norm.includes('spark') || norm.includes('lighting')) {
    pool = [
      'Safe, Certified & Master Electrical',
      'From Panel Upgrades to Emergency Repairs',
      'Bright Ideas, Safe Wiring, Done Right',
      'Precision Power for Home & Business',
      'Trusted Local Electricians You Can Count On',
      'Licensed Electrical Contractors on Call',
      'Fast Troubleshooting & Safe Upgrades',
    ];
  } else if (norm.includes('landscap') || norm.includes('lawn') || norm.includes('tree') || norm.includes('mow') || norm.includes('garden')) {
    pool = [
      'Lush Lawns & Custom Outdoor Living',
      'Precision Maintenance on Your Schedule',
      'Transforming Yards into Beautiful Spaces',
      'Dependable Grounds Care & Hardscaping',
      'Crafted Landscapes Built to Thrive',
      'Professional Lawn Care You Can Set & Forget',
      'Local Green Space & Tree Specialists',
    ];
  } else if (norm.includes('paint') || norm.includes('drywall') || norm.includes('coat')) {
    pool = [
      'Flawless Finishes, Inside & Out',
      'Clean Lines & Long-Lasting Protection',
      'Transforming Spaces with Quality Paint',
      'Prompt, Neat & Detail-Obsessed Painters',
      'Premium Coatings Done Right the First Time',
      'Crisp Edges & Seamless Interior Painting',
      'Exterior Painting Built to Endure',
    ];
  } else if (norm.includes('remodel') || norm.includes('carpent') || norm.includes('build') || norm.includes('renovat') || norm.includes('floor')) {
    pool = [
      'Kitchens, Baths & Spaces Made to Live In',
      'Custom Carpentry & Master Remodeling',
      'Craftsmanship That Stands the Test of Time',
      'From Blueprints to Beautiful Finishes',
      'Your Home, Reimagined with Precision',
      'Seamless Additions & Quality Craftsmanship',
      'High-End Remodeling & Design Build',
    ];
  } else if (norm.includes('clean') || norm.includes('wash') || norm.includes('pressure') || norm.includes('janitor') || norm.includes('detail')) {
    pool = [
      'Spotless Results You Can See & Feel',
      'Deep Cleaning & Pressure Washing Pros',
      'Restoring Sparkle to Your Property',
      'Reliable, Thorough & Eco-Friendly Clean',
      'High-Pressure Precision, Zero Damage',
      'Exterior Washing & Grime Removal Experts',
      'The Clean You Expect, The Care You Deserve',
    ];
  } else {
    pool = [
      'Master Craftsmanship & Reliable Service',
      'Licensed, Insured & Family Owned',
      'Fast, Honest & Precision Quality',
      'Residential & Commercial Specialists',
      'Your Trusted Local Trade Experts',
      'Dependable Work, Transparent Pricing',
      'Quality Craftsmanship, Guaranteed Results',
      'Prompt Response & Precision Service',
    ];
  }

  // Shuffle pool so successive clicks yield fresh ideas
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 5);

  if (name && name.length > 2 && name.length < 24 && Math.random() > 0.4) {
    selected[0] = `${name}: Trusted Local Quality`;
  }

  return selected;
}
