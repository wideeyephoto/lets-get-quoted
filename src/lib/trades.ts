// Trade landing pages (/for/[slug]). Each entry is real, trade-specific copy —
// headline, pain points, example services, and the templates built for that
// trade — so the pages rank for "<software> for <trade>" searches without being
// thin duplicates of one another. templateIds reference AVAILABLE_TEMPLATES.

export type TradePain = { title: string; body: string };

export type Trade = {
  slug: string;
  name: string; // plural, headline case — "Landscapers"
  work: string; // lowercase noun for inline copy — "landscaping"
  headline: string;
  subhead: string;
  pains: TradePain[];
  services: string[];
  templateIds: string[];
  metaTitle: string;
  metaDescription: string;
};

export const TRADES: Trade[] = [
  {
    slug: 'landscapers',
    name: 'Landscapers',
    work: 'landscaping & lawn care',
    headline: 'The website and payment tool built for landscapers.',
    subhead:
      'Win more spring contracts, quote mowing and installs on the spot, and get paid — recurring visits schedule and bill themselves, all season long.',
    pains: [
      { title: 'Recurring that runs itself', body: 'Weekly and biweekly plans auto-create each visit and charge the card on file — no re-invoicing every mow.' },
      { title: 'Quote installs on-site', body: 'Send a branded, itemized quote for a patio or planting from your phone and get it e-signed before you leave.' },
      { title: 'Smooth the seasonal dip', body: 'Deposits on big installs and cards on file keep cash coming in when the schedule tightens up.' },
    ],
    services: ['Lawn mowing', 'Landscape design', 'Sod & seeding', 'Mulch & beds', 'Irrigation', 'Snow removal'],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Landscapers',
    metaDescription:
      'A landscaping website with instant estimates, online booking, recurring auto-billing, and Stripe payments straight to your bank. No subscription — pay only when you get paid.',
  },
  {
    slug: 'roofers',
    name: 'Roofers',
    work: 'roofing',
    headline: 'Roofing websites that turn storm calls into signed jobs.',
    subhead:
      'Capture the lead the moment a roof leaks, quote big jobs with deposits and payment plans, and get paid to your bank — with every photo on the record.',
    pains: [
      { title: 'Win the high-ticket job', body: 'Offer a deposit plus 0%-interest payment plans so a $15k roof is an easy yes, not a financing headache.' },
      { title: 'Answer first, win first', body: 'An AI estimator qualifies the homeowner 24/7 and flags high-value leads so you respond before the next roofer does.' },
      { title: 'Document everything', body: 'Photos attach to every job and quote — handy when the claim or the customer asks later.' },
    ],
    services: ['Roof replacement', 'Repairs', 'Inspections', 'Gutters', 'Storm damage', 'Flat & metal'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Roofers',
    metaDescription:
      'A roofing website with instant estimates, high-value lead alerts, deposits, payment plans, and Stripe payments to your bank. No subscription — pay only when you get paid.',
  },
  {
    slug: 'plumbers',
    name: 'Plumbers',
    work: 'plumbing',
    headline: 'Plumbing websites that book the emergency call first.',
    subhead:
      'Be the plumber homeowners reach at 9pm — instant estimates, online booking, and card-or-bank payment before you pull out of the driveway.',
    pains: [
      { title: 'Catch after-hours leads', body: 'The AI intake takes the details and books a window while you sleep — no missed 2am water heater.' },
      { title: 'Get paid on site', body: 'Send a pay link or take card and bank payment the moment the job is done.' },
      { title: 'Keep the maintenance', body: 'Recurring plans and cards on file turn one repair into a standing customer.' },
    ],
    services: ['Repairs', 'Water heaters', 'Drain cleaning', 'Repiping', 'Fixtures', 'Sump pumps'],
    templateIds: ['handy', 'fixit'],
    metaTitle: 'Website & Software for Plumbers',
    metaDescription:
      'A plumbing website with 24/7 instant estimates, online booking, on-site card & bank payments, and no subscription. Pay only when a homeowner pays you.',
  },
  {
    slug: 'painters',
    name: 'Painters',
    work: 'painting',
    headline: 'Painting websites that make your work the pitch.',
    subhead:
      'Lead with a gallery that sells, quote by the room, take a deposit to lock the date, and offer payment plans on the big repaints.',
    pains: [
      { title: 'Sell with before/afters', body: 'A photo-first template puts your best transformations front and center where they close the deal.' },
      { title: 'Hold the schedule', body: 'Require a deposit before the date is booked so no-shows stop costing you a crew day.' },
      { title: 'Make big jobs easy', body: 'Payment plans break a whole-house repaint into installments that auto-charge.' },
    ],
    services: ['Interior', 'Exterior', 'Cabinet refinishing', 'Staining', 'Commercial', 'Drywall repair'],
    templateIds: ['coat', 'modern'],
    metaTitle: 'Website & Software for Painters',
    metaDescription:
      'A painting website with a photo-first gallery, itemized quotes, deposits, payment plans, and Stripe payments. No subscription — pay only when you get paid.',
  },
  {
    slug: 'electricians',
    name: 'Electricians',
    work: 'electrical work',
    headline: "Electrician websites that capture the panel job while it's hot.",
    subhead:
      'Instant estimates, online booking, and deposits on panel and EV-charger work — with texts that keep the homeowner in the loop start to finish.',
    pains: [
      { title: 'Quote varied work fast', body: 'Save your common jobs to a price book and drop them into a branded quote in seconds.' },
      { title: 'Deposit on big installs', body: 'Collect a deposit on panel upgrades and generators before you order the gear.' },
      { title: 'Show your license & trust', body: 'Certifications, reviews, and a clean site tell a homeowner you are the safe choice.' },
    ],
    services: ['Panel upgrades', 'EV chargers', 'Rewiring', 'Lighting', 'Generators', 'Inspections'],
    templateIds: ['carbon', 'fixit'],
    metaTitle: 'Website & Software for Electricians',
    metaDescription:
      'An electrician website with instant estimates, online booking, deposits, and Stripe card & bank payments. No subscription — pay only when a homeowner pays you.',
  },
  {
    slug: 'hvac',
    name: 'HVAC Contractors',
    work: 'HVAC',
    headline: 'HVAC websites that book installs and keep members on plan.',
    subhead:
      'Capture summer breakdown calls, quote replacements with payment plans, and auto-bill maintenance memberships that carry you through the shoulder season.',
    pains: [
      { title: 'Survive the surge', body: 'AI intake and online booking handle the heat-wave rush so no call goes to voicemail.' },
      { title: 'Finance the replacement', body: '0%-interest payment plans make a new system an easy yes at the worst possible time for the homeowner.' },
      { title: 'Recurring memberships', body: 'Seasonal maintenance plans schedule and auto-charge themselves, all year.' },
    ],
    services: ['AC repair', 'Furnaces', 'System installs', 'Maintenance plans', 'Indoor air', 'Heat pumps'],
    templateIds: ['handy', 'professional'],
    metaTitle: 'Website & Software for HVAC Contractors',
    metaDescription:
      'An HVAC website with instant estimates, online booking, payment plans, recurring maintenance billing, and Stripe payments. No subscription — pay only when you get paid.',
  },
  {
    slug: 'cleaning-services',
    name: 'Cleaning Services',
    work: 'cleaning',
    headline: 'Cleaning-service websites that fill the recurring schedule.',
    subhead:
      'Turn one-time cleans into weekly plans that book and bill themselves, with cards on file, automatic per-visit invoices, and reviews on autopilot.',
    pains: [
      { title: 'Recurring on rails', body: 'Weekly, biweekly, or monthly plans create each visit and charge the saved card — you just clean.' },
      { title: 'Cards on file', body: 'Save the card once; every future visit bills hands-off with a real invoice each time.' },
      { title: 'More 5-star reviews', body: 'Automatic review requests after each clean send happy clients straight to Google.' },
    ],
    services: ['Recurring house cleaning', 'Deep cleans', 'Move-in / move-out', 'Office cleaning', 'Post-construction', 'Carpets'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Cleaning Services',
    metaDescription:
      'A cleaning-business website with online booking, recurring auto-billing, cards on file, automatic reviews, and Stripe payments. No subscription — pay only when you get paid.',
  },
  {
    slug: 'remodelers',
    name: 'Remodelers',
    work: 'remodeling & renovation',
    headline: 'Remodeling websites that sell the transformation.',
    subhead:
      'Before/after galleries, itemized quotes with add-on upsells, staged deposits, and payment plans on the projects that fund your whole year.',
    pains: [
      { title: 'Quote the big project', body: 'Itemized quotes with optional add-ons let the homeowner build their dream and see the price update.' },
      { title: 'Stage the payments', body: 'Collect a deposit, then progress payments at each phase — all on the same job.' },
      { title: 'Showcase the work', body: 'A project gallery and before/after sliders turn past jobs into your best salesperson.' },
    ],
    services: ['Kitchens', 'Bathrooms', 'Additions', 'Basements', 'Whole-home', 'Decks'],
    templateIds: ['reno', 'professional'],
    metaTitle: 'Website & Software for Remodelers',
    metaDescription:
      'A remodeling website with project galleries, itemized quotes, staged deposits, payment plans, and Stripe payments. No subscription — pay only when you get paid.',
  },
  {
    slug: 'handyman',
    name: 'Handyman Services',
    work: 'handyman work',
    headline: 'Handyman websites that keep the small jobs booked back-to-back.',
    subhead:
      'Instant estimates, online booking, and tap-to-pay so the little jobs stop leaking time — and turn into repeat customers who call you first.',
    pains: [
      { title: 'Book without the back-and-forth', body: 'Online booking lets customers grab an open window while you are on another job.' },
      { title: 'Quote small jobs fast', body: 'A saved price book turns a quick estimate into a sent quote in under a minute.' },
      { title: 'Turn one job into ten', body: 'Rebook invites and a saved client list bring last month’s customer back this month.' },
    ],
    services: ['Repairs', 'Furniture assembly', 'TV mounting', 'Drywall', 'Doors & locks', 'Odd jobs'],
    templateIds: ['fixit', 'handy'],
    metaTitle: 'Website & Software for Handyman Businesses',
    metaDescription:
      'A handyman website with instant estimates, online booking, tap-to-pay, and rebook reminders. No subscription — pay only when a homeowner pays you.',
  },
];

export function getTrade(slug: string): Trade | undefined {
  return TRADES.find((trade) => trade.slug === slug);
}
