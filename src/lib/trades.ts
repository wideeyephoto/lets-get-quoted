// Trade landing pages (/for/[slug]). Each entry is real, trade-specific copy —
// headline, pain points, example services, and the templates built for that
// trade — so the pages rank for "<software> for <trade>" searches without being
// thin duplicates of one another. templateIds reference AVAILABLE_TEMPLATES.

export type TradePain = { title: string; body: string };

export type TradeSeasonality = {
  kind: 'year-round' | 'seasonal-peak' | 'seasonal';
  activeMonthsPerYear: number;
  peakLabel?: string;
};

export type TradeEconomics = {
  avgTicket: number;
  typicalMonthlyVolume: number;
  typicalJobsPerMonth: number;
  quickStopMonthlyBonus: number;
  activeMonthsPerYear?: number;
  quickStopActiveMonthsPerYear?: number;
  volumeLabel?: string;
};

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
  payer?: string;
  economics?: TradeEconomics;
  relatedSlugs?: string[];
  seasonality?: TradeSeasonality;
};

export const TRADES: Trade[] = [
  {
    slug: 'landscapers',
    name: 'Landscapers',
    work: 'landscaping',
    headline: 'The website and payment tool built for landscapers.',
    subhead:
      'Win more design/build contracts, quote plantings and hardscaping on the spot, and get paid with staged deposits that keep cash flow steady.',
    pains: [
      { title: 'Quote installs on-site', body: 'Send a branded, itemized quote for a patio, retaining wall, or planting bed from your phone and get it e-signed before you leave.' },
      { title: 'Stage the project payments', body: 'Collect a deposit before ordering materials and progress payments at each milestone—all tracked on one job.' },
      { title: 'Showcase design transformations', body: 'A photo-first gallery puts your before-and-after outdoor transformations front and center where they sell the project.' },
    ],
    services: ['Landscape design', 'Hardscaping & patios', 'Planting & mulch beds', 'Sod installation', 'Retaining walls', 'Drainage solutions'],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Landscapers',
    metaDescription:
      'A landscaping website with instant estimates, itemized quotes, staged deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['lawn-care', 'pond-services'],
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 9, peakLabel: 'Mar–Nov' },
  },
  {
    slug: 'roofers',
    name: 'Roofers',
    work: 'roofing',
    headline: 'Roofing websites that turn storm calls into signed jobs.',
    subhead:
      'Capture the lead the moment a roof leaks, quote big jobs with deposits and payment plans, and get paid to your bank — with every photo on the record.',
    pains: [
      { title: 'Win the high-ticket job', body: 'Offer a deposit plus 0%-interest payment plans so larger projects are easier for customers to budget.' },
      { title: 'Answer first, win first', body: 'An AI estimator qualifies the homeowner 24/7 and flags high-value leads so you respond before the next roofer does.' },
      { title: 'Document everything', body: 'Photos attach to every job and quote — handy when the claim or the customer asks later.' },
    ],
    services: ['Roof replacement', 'Repairs', 'Inspections', 'Gutters', 'Storm damage', 'Flat & metal'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Roofers',
    metaDescription:
      'A roofing website with instant estimates, high-value lead alerts, deposits, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'plumbers',
    name: 'Plumbers',
    work: 'plumbing',
    headline: 'Plumbing websites that book the emergency call first.',
    subhead:
      'Be the plumber homeowners reach at 9pm — instant estimates, online booking, and card-or-bank payment before you pull out of the driveway.',
    pains: [
      { title: 'Catch after-hours leads', body: 'The AI intake collects job details and a preferred arrival window after hours — no missed 2am water heater.' },
      { title: 'Get paid on site', body: 'Send a pay link or take card and bank payment the moment the job is done.' },
      { title: 'Keep the maintenance', body: 'Recurring plans and cards on file turn one repair into a standing customer.' },
    ],
    services: ['Repairs', 'Water heaters', 'Drain cleaning', 'Repiping', 'Fixtures', 'Sump pumps'],
    templateIds: ['handy', 'fixit'],
    metaTitle: 'Website & Software for Plumbers',
    metaDescription:
      'A plumbing website with 24/7 instant estimates, online booking, on-site card & bank payments. Plans start at $0/month with Flex.',
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
      'A painting website with a photo-first gallery, itemized quotes, deposits, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
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
      'An electrician website with instant estimates, online booking, deposits, and Stripe card & bank payments. Plans start at $0/month with Flex.',
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
      { title: 'Finance the replacement', body: '0%-interest installments on a saved card can make a new system easier to budget at the worst possible time for the homeowner.' },
      { title: 'Recurring memberships', body: 'Seasonal maintenance plans schedule and auto-charge themselves, all year.' },
    ],
    services: ['AC repair', 'Furnaces', 'System installs', 'Maintenance plans', 'Indoor air', 'Heat pumps'],
    templateIds: ['handy', 'professional'],
    metaTitle: 'Website & Software for HVAC Contractors',
    metaDescription:
      'An HVAC website with instant estimates, payment plans, recurring maintenance billing, and Stripe payments. Plans start at $0/month with Flex.',
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
      'A cleaning-business website with online booking, recurring auto-billing, cards on file, and Stripe payments. Plans start at $0/month with Flex.',
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
      'A remodeling website with project galleries, itemized quotes, staged deposits, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
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
      'A handyman website with instant estimates, online booking, tap-to-pay, and rebook reminders. Plans start at $0/month with Flex.',
  },
  {
    slug: 'concrete',
    name: 'Concrete Contractors',
    work: 'concrete',
    headline: 'Concrete websites that turn a pour into a signed, deposited job.',
    subhead:
      'Quote driveways, patios, and slabs with clear line items, take a deposit before you order the mix, and get paid to your bank the day the job wraps.',
    pains: [
      { title: 'Quote by the square foot', body: 'Save your slab, driveway, and patio pricing to a price book and send an itemized, branded quote from the job site in minutes.' },
      { title: 'Deposit before you pour', body: 'Collect a deposit to cover materials before the truck rolls, then the balance the day it cures — never front the concrete yourself.' },
      { title: 'Let the finish sell', body: 'A photo-first gallery of stamped, stained, and exposed-aggregate work turns your best pours into your best salesperson.' },
    ],
    services: ['Driveways', 'Patios & walkways', 'Slabs & foundations', 'Stamped concrete', 'Retaining walls', 'Repairs & resurfacing'],
    templateIds: ['carbon', 'reno'],
    metaTitle: 'Website & Software for Concrete Contractors',
    metaDescription:
      'A concrete-contractor website with instant estimates, itemized quotes, deposits, and Stripe payments to your bank. Plans start at $0/month with Flex.',
  },
  {
    slug: 'fencing',
    name: 'Fencing Contractors',
    work: 'fencing',
    headline: 'Fencing websites that quote the whole run on the spot.',
    subhead:
      'Price wood, vinyl, and chain-link by the linear foot, send a branded quote before you leave the driveway, and take a deposit to lock the install date.',
    pains: [
      { title: 'Price by the linear foot', body: 'Save per-foot pricing for each fence type and gate to a price book so a full quote takes a minute, not an evening at the kitchen table.' },
      { title: 'Lock the install date', body: 'A deposit holds the slot and covers the lumber, so a booked job doesn’t evaporate before your crew shows up.' },
      { title: 'Book the spring backlog', body: 'Online booking and instant estimates capture demand while you’re still finishing last week’s run.' },
    ],
    services: ['Wood fencing', 'Vinyl fencing', 'Chain-link', 'Aluminum & ornamental', 'Gates & repairs', 'Commercial fencing'],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Fencing Contractors',
    metaDescription:
      'A fencing-contractor website with instant estimates, per-foot quotes, deposits, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'flooring',
    name: 'Flooring Contractors',
    work: 'flooring',
    headline: 'Flooring websites that turn a room measurement into a signed job.',
    subhead:
      'Quote hardwood, tile, and LVP by the square foot with material options the homeowner can choose, take a deposit on the order, and get paid when it’s laid.',
    pains: [
      { title: 'Let them pick the material', body: 'Itemized quotes with optional upgrades let a homeowner compare oak, LVP, and tile and watch the price update — then sign.' },
      { title: 'Deposit on the order', body: 'Collect a deposit that covers the flooring order up front, then the balance on completion — never float a special-order box.' },
      { title: 'Sell with the room shots', body: 'A photo-first gallery of finished floors and before/afters closes the homeowner who’s still shopping around.' },
    ],
    services: ['Hardwood', 'Luxury vinyl (LVP)', 'Tile', 'Laminate', 'Refinishing', 'Subfloor repair'],
    templateIds: ['reno', 'modern'],
    metaTitle: 'Website & Software for Flooring Contractors',
    metaDescription:
      'A flooring-contractor website with itemized quotes, material options, deposits, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'pressure-washing',
    name: 'Pressure Washing Services',
    work: 'pressure washing',
    headline: 'Pressure-washing websites where the before/after does the selling.',
    subhead:
      'Quote houses, driveways, and decks by the job, book online, take tap-to-pay on the spot, and turn one clean into a recurring seasonal plan.',
    pains: [
      { title: 'Before/after that closes', body: 'A photo-first gallery of grimy-to-gleaming shots is the whole pitch — lead with it and let the results book the job.' },
      { title: 'Book while you spray', body: 'Online booking lets homeowners grab an open window without a call, so jobs stack up back-to-back all season.' },
      { title: 'Turn one wash into many', body: 'Recurring plans and rebook reminders bring the annual house-wash and quarterly driveway back on autopilot.' },
    ],
    services: ['House washing', 'Driveways & concrete', 'Decks & patios', 'Roof soft-wash', 'Gutter cleaning', 'Commercial & fleet'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Pressure Washing Businesses',
    metaDescription:
      'A pressure-washing website with instant estimates, online booking, tap-to-pay, and recurring plans. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 8, peakLabel: 'Mar–Oct' },
  },
  {
    slug: 'tree-services',
    name: 'Tree Services',
    work: 'tree care & removal',
    headline: 'Tree-service websites that book the removal before the next storm.',
    subhead:
      'Quote removals and trims with photos and clear scope, take a deposit on big takedowns, and win the storm call the moment a limb comes down.',
    pains: [
      { title: 'Answer the storm call first', body: 'An AI estimator takes the details and photos 24/7 and flags the urgent, high-value takedowns so you respond before the competition.' },
      { title: 'Deposit on the big takedown', body: 'Collect a deposit on large removals and crane jobs before you schedule the crew and the equipment.' },
      { title: 'Show it’s done right', body: 'Photos on every job and quote — plus your license and insurance up front — tell a homeowner you’re the safe call.' },
    ],
    services: ['Tree removal', 'Trimming & pruning', 'Stump grinding', 'Storm & emergency', 'Lot clearing', 'Health & treatment'],
    templateIds: ['carbon', 'fixit'],
    metaTitle: 'Website & Software for Tree Service Companies',
    metaDescription:
      'A tree-service website with 24/7 instant estimates, high-value lead alerts, deposits, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'pest-control',
    name: 'Pest Control Companies',
    work: 'pest control',
    headline: 'Pest-control websites that fill the recurring route.',
    subhead:
      'Turn one treatment into a quarterly plan that books and bills itself, catch the “bugs now” call 24/7, and keep every home on schedule with cards on file.',
    pains: [
      { title: 'Recurring on rails', body: 'Quarterly and monthly plans auto-create each visit and charge the card on file — you run the route, not the invoicing.' },
      { title: 'Catch the urgent call', body: 'AI intake and online booking take the “there’s a wasp nest now” lead any hour and slot it into the next open window.' },
      { title: 'Keep the home on plan', body: 'Cards on file and automatic per-visit invoices turn a one-time treatment into a standing customer for years.' },
    ],
    services: ['General pest control', 'Termite treatments', 'Rodent exclusion', 'Bed bug remediation', 'Wildlife exclusion', 'Commercial pest plans'],
    templateIds: ['professional', 'handy'],
    metaTitle: 'Website & Software for Pest Control Companies',
    metaDescription:
      'A pest-control website with online booking, recurring auto-billing, cards on file, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['mosquito-tick-control'],
  },
  {
    slug: 'pool-services',
    name: 'Pool Service Companies',
    work: 'pool service',
    headline: 'Pool-service websites that keep the weekly route billed and full.',
    subhead:
      'Book weekly maintenance that charges the card on file, quote repairs and openings on-site, and keep every pool on schedule from open to close.',
    pains: [
      { title: 'Weekly service that bills itself', body: 'Recurring maintenance plans create each visit and charge the saved card automatically — no chasing a monthly check.' },
      { title: 'Quote repairs on-site', body: 'Send a branded quote for a pump, heater, or liner from the pool deck and get it e-signed before you leave.' },
      { title: 'Open and close on time', body: 'Online booking fills your seasonal opening and closing calendar before the rush every spring and fall.' },
    ],
    services: ['Weekly maintenance', 'Openings & closings', 'Equipment repair', 'Green-to-clean', 'Liner & leak', 'Inspections'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Pool Service Companies',
    metaDescription:
      'A pool-service website with online booking, recurring auto-billing, on-site quotes, and Stripe payments. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 7, peakLabel: 'Apr–Oct' },
  },
  {
    slug: 'garage-doors',
    name: 'Garage Door Services',
    work: 'garage door repair & install',
    headline: 'Garage-door websites that book the broken-spring call first.',
    subhead:
      'Capture the “door won’t open” emergency 24/7, quote openers and new doors with photos, and take card or bank payment before you pack up the truck.',
    pains: [
      { title: 'Win the emergency call', body: 'AI intake and online booking take the broken-spring or off-track lead any hour and slot it into the next window while you’re on another job.' },
      { title: 'Quote the upgrade on-site', body: 'A saved price book turns a new opener or full door replacement into a branded, e-signable quote in under a minute.' },
      { title: 'Get paid before you leave', body: 'Send a pay link or take card and bank payment the moment the door’s running smooth again.' },
    ],
    services: ['Spring & cable repair', 'Opener install', 'New doors', 'Off-track & rollers', 'Tune-ups', 'Commercial doors'],
    templateIds: ['fixit', 'professional'],
    metaTitle: 'Website & Software for Garage Door Companies',
    metaDescription:
      'A garage-door website with 24/7 instant estimates, online booking, on-site card & bank payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'gutters',
    name: 'Gutter Companies',
    work: 'gutter install & cleaning',
    headline: 'Gutter websites that book seamless installs and seasonal cleanings.',
    subhead:
      'Quote seamless gutters and guards by the linear foot, fill your fall cleaning route with online booking, and get paid the day the job’s done.',
    pains: [
      { title: 'Quote runs and guards fast', body: 'Save per-foot pricing for seamless gutter, downspouts, and guards to a price book and send a branded quote from the ladder in minutes.' },
      { title: 'Fill the seasonal calendar', body: 'Online booking packs your spring and fall cleaning routes before the leaves even drop.' },
      { title: 'Turn cleanings into repeats', body: 'Recurring plans and rebook reminders bring every fall cleaning back on autopilot.' },
    ],
    services: ['Seamless gutters', 'Gutter guards', 'Cleaning', 'Downspouts', 'Repairs', 'Fascia & soffit'],
    templateIds: ['handy', 'fixit'],
    metaTitle: 'Website & Software for Gutter Companies',
    metaDescription:
      'A gutter-company website with instant estimates, online booking, recurring cleaning plans, and Stripe payments. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 8, peakLabel: 'Spring/Fall Peak' },
  },
  {
    slug: 'siding',
    name: 'Siding Contractors',
    work: 'siding',
    headline: 'Siding websites that sell the whole-home transformation.',
    subhead:
      'Quote vinyl, fiber-cement, and repairs with material options and photos, take a deposit before you order, and offer payment plans on the big wraps.',
    pains: [
      { title: 'Let them choose the look', body: 'Itemized quotes with material and color options let a homeowner compare vinyl and fiber-cement and watch the price update — then sign.' },
      { title: 'Finance the whole wrap', body: '0%-interest installments on a saved card can make a full re-side easier for customers to budget.' },
      { title: 'Show the before/after', body: 'A photo-first gallery of finished exteriors turns your past jobs into your strongest close.' },
    ],
    services: ['Vinyl siding', 'Fiber-cement', 'Wood & cedar', 'Repairs', 'Trim & soffit', 'Insulated siding'],
    templateIds: ['reno', 'professional'],
    metaTitle: 'Website & Software for Siding Contractors',
    metaDescription:
      'A siding-contractor website with itemized quotes, material options, deposits, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'deck-builders',
    name: 'Deck Builders',
    work: 'deck building',
    headline: 'Deck-builder websites that turn a backyard dream into a booked build.',
    subhead:
      'Quote decks by material and square foot with add-ons the homeowner can pick, take a staged deposit before you order lumber, and get paid at each phase.',
    pains: [
      { title: 'Build the quote with them', body: 'Itemized quotes with optional railings, lighting, and composite upgrades let a homeowner design their deck and see the price move.' },
      { title: 'Stage the payments', body: 'Collect a deposit on the material, then progress payments as the build hits each phase — all on one job.' },
      { title: 'Sell with the portfolio', body: 'A photo-first gallery of finished decks and before/afters is the pitch that closes the weekend shopper.' },
    ],
    services: ['Wood decks', 'Composite decks', 'Railings', 'Pergolas', 'Repairs & staining', 'Porches'],
    templateIds: ['reno', 'modern'],
    metaTitle: 'Website & Software for Deck Builders',
    metaDescription:
      'A deck-builder website with itemized quotes, add-on options, staged deposits, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'junk-removal',
    name: 'Junk Removal Services',
    work: 'junk removal & hauling',
    headline: 'Junk-removal websites that book the haul while they’re staring at the pile.',
    subhead:
      'Give instant ballpark pricing, let homeowners book a pickup window online, and take tap-to-pay the moment the truck is loaded.',
    pains: [
      { title: 'Price it before you roll', body: 'Instant estimates give a homeowner a ballpark by load size, so the job’s half-sold before you arrive.' },
      { title: 'Book the window online', body: 'Online booking fills your route with pickup windows without a single phone call.' },
      { title: 'Get paid at the curb', body: 'Take card or tap-to-pay the second the truck’s loaded — no invoice, no chasing a check.' },
    ],
    services: ['Furniture & appliances', 'Estate & cleanouts', 'Construction debris', 'Garage & basement', 'Yard waste', 'Commercial hauling'],
    templateIds: ['handy', 'fixit'],
    metaTitle: 'Website & Software for Junk Removal Businesses',
    metaDescription:
      'A junk-removal website with instant estimates, online booking, tap-to-pay. Plans start at $0/month with Flex.',
  },
  {
    slug: 'window-installers',
    name: 'Window & Door Installers',
    work: 'window & door installation',
    headline: 'Window and door websites that quote the whole house and finance it.',
    subhead:
      'Quote replacement windows and doors by the opening with options, take a deposit before you order, and offer payment plans on a full-home replacement.',
    pains: [
      { title: 'Quote by the opening', body: 'Save window and door pricing to a price book and build a full-home quote with options in minutes, not a week.' },
      { title: 'Deposit on the order', body: 'Collect a deposit that covers the special-order units before you place the order with the manufacturer.' },
      { title: 'Finance the full job', body: 'Payment plans turn a whole-home window replacement into monthly installments that auto-charge.' },
    ],
    services: ['Replacement windows', 'Entry doors', 'Patio & sliding doors', 'Storm doors', 'Bay & bow', 'Repairs'],
    templateIds: ['professional', 'modern'],
    metaTitle: 'Website & Software for Window & Door Installers',
    metaDescription:
      'A window-and-door-installer website with itemized quotes, deposits, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'appliance-repair',
    name: 'Appliance Repair Services',
    work: 'appliance repair',
    headline: 'Appliance-repair websites that book the service call first.',
    subhead:
      'Capture the “fridge is out” call 24/7, book a diagnostic window online, and take card or bank payment before you leave the kitchen.',
    pains: [
      { title: 'Catch the call any hour', body: 'AI intake and online booking take the broken-appliance lead at any hour and slot a diagnostic window while you’re on another job.' },
      { title: 'Quote the repair on-site', body: 'A saved price book turns a diagnosis into an e-signable repair quote in under a minute.' },
      { title: 'Get paid on completion', body: 'Send a pay link or take card and bank payment the moment the appliance is running again.' },
    ],
    services: ['Refrigerators', 'Washers & dryers', 'Ovens & ranges', 'Dishwashers', 'Microwaves', 'Diagnostics'],
    templateIds: ['fixit', 'handy'],
    metaTitle: 'Website & Software for Appliance Repair Businesses',
    metaDescription:
      'An appliance-repair website with 24/7 instant estimates, online booking, on-site card & bank payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'solar',
    name: 'Solar Installers',
    work: 'solar installation',
    headline: 'Solar websites that turn a curious homeowner into a signed install.',
    subhead:
      'Capture and qualify high-value solar leads 24/7, quote systems with clear line items, and stage deposits and payments across a long install.',
    pains: [
      { title: 'Qualify the big lead first', body: 'An AI estimator captures and qualifies solar inquiries 24/7 and flags the high-value ones so you respond before the next installer.' },
      { title: 'Quote the system clearly', body: 'Itemized quotes lay out panels, inverter, and labor so a homeowner sees exactly what they’re buying — then e-signs.' },
      { title: 'Stage a long install', body: 'Collect a deposit, then progress payments across permitting, install, and inspection — all on one job.' },
    ],
    services: ['Rooftop solar', 'Battery storage', 'EV chargers', 'System design', 'Permitting', 'Monitoring & service'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Solar Installers',
    metaDescription:
      'A solar-installer website with 24/7 lead capture, high-value alerts, itemized quotes, staged payments, and Stripe. Plans start at $0/month with Flex.',
  },
  {
    slug: 'masonry',
    name: 'Masonry Contractors',
    work: 'masonry',
    headline: 'Masonry websites that let the stonework close the job.',
    subhead:
      'Quote brick, block, and stone by the job with photos, take a deposit before you order material, and get paid to your bank when the last course is set.',
    pains: [
      { title: 'Let the craft sell', body: 'A photo-first gallery of brickwork, stone veneer, and hardscape turns your best jobs into your best salesperson.' },
      { title: 'Deposit on the material', body: 'Collect a deposit to cover brick, block, and stone before you order — never front a pallet of material.' },
      { title: 'Quote varied work fast', body: 'Save your common jobs — repointing, chimneys, walls — to a price book and send a branded quote from the site in minutes.' },
    ],
    services: ['Brick & block', 'Stone veneer', 'Chimneys', 'Repointing & repair', 'Retaining walls', 'Patios & hardscape'],
    templateIds: ['carbon', 'reno'],
    metaTitle: 'Website & Software for Masonry Contractors',
    metaDescription:
      'A masonry-contractor website with instant estimates, itemized quotes, deposits, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'drywall',
    name: 'Drywall Contractors',
    work: 'drywall',
    headline: 'Drywall websites that quote the hang, tape, and finish in one shot.',
    subhead:
      'Quote by the board or the room, book the job online, and get paid to your bank when the last coat is sanded — no chasing the builder for a check.',
    pains: [
      { title: 'Quote by the board or room', body: 'Save your hang, tape, and finish pricing to a price book and send a branded, itemized quote from the site in minutes.' },
      { title: 'Book around the trades', body: 'Online booking and a shared schedule slot your crew in as soon as the framing and rough-ins clear.' },
      { title: 'Get paid on completion', body: 'Send a pay link or take card and bank payment the moment the walls are sanded and ready for paint.' },
    ],
    services: ['Hang & finish', 'Tape & mud', 'Texture & popcorn removal', 'Patch & repair', 'Ceilings', 'Commercial'],
    templateIds: ['fixit', 'modern'],
    metaTitle: 'Website & Software for Drywall Contractors',
    metaDescription:
      'A drywall-contractor website with instant estimates, itemized quotes, online booking, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'insulation',
    name: 'Insulation Contractors',
    work: 'insulation',
    headline: 'Insulation websites that turn an energy-bill complaint into a booked job.',
    subhead:
      'Quote spray foam, blown-in, and batt work with clear line items, capture rebate-driven leads 24/7, and offer payment plans on whole-home jobs.',
    pains: [
      { title: 'Catch the rebate lead', body: 'An AI estimator captures and qualifies energy-upgrade inquiries 24/7 so the homeowner chasing a rebate books with you first.' },
      { title: 'Quote the whole home', body: 'Itemized quotes lay out attic, wall, and crawlspace work by area so a homeowner sees exactly what they’re paying for — then e-signs.' },
      { title: 'Finance the upgrade', body: '0%-interest installments on a saved card can make a whole-home insulation job easier to budget.' },
    ],
    services: ['Spray foam', 'Blown-in', 'Batt & roll', 'Attic & crawlspace', 'Air sealing', 'Removal & replace'],
    templateIds: ['professional', 'handy'],
    metaTitle: 'Website & Software for Insulation Contractors',
    metaDescription:
      'An insulation-contractor website with 24/7 lead capture, itemized quotes, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'window-cleaning',
    name: 'Window Cleaning Services',
    work: 'window cleaning',
    headline: 'Window-cleaning websites that fill the recurring route.',
    subhead:
      'Turn one clean into a quarterly plan that books and bills itself, take online bookings without the phone tag, and keep every home and storefront on schedule.',
    pains: [
      { title: 'Recurring on rails', body: 'Quarterly and monthly plans auto-create each visit and charge the card on file — you clean, the invoicing runs itself.' },
      { title: 'Book without the calls', body: 'Online booking lets homeowners and shops grab an open window while you’re up a ladder on the last job.' },
      { title: 'More 5-star reviews', body: 'Automatic review requests after each clean send happy customers straight to Google.' },
    ],
    services: ['Residential windows', 'Storefront & commercial', 'Screens & tracks', 'Skylights', 'Post-construction', 'Hard-to-reach'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Window Cleaning Businesses',
    metaDescription:
      'A window-cleaning website with online booking, recurring auto-billing, cards on file, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'movers',
    name: 'Moving Companies',
    work: 'moving',
    headline: 'Moving-company websites that quote the move and lock the date.',
    subhead:
      'Give instant ballpark quotes, take a deposit to hold the moving date, and get the balance paid at the truck — no paper contracts, no chasing checks.',
    pains: [
      { title: 'Quote the move fast', body: 'Instant estimates by home size and distance give a mover a ballpark up front, so the job’s half-sold before the survey.' },
      { title: 'Lock the date with a deposit', body: 'A deposit holds the moving date so a booked job doesn’t vanish the week before to a cheaper quote.' },
      { title: 'Get paid at the door', body: 'Take card or bank payment the moment the last box is off the truck — e-signed inventory and all.' },
    ],
    services: ['Local moves', 'Long-distance', 'Packing & unpacking', 'Loading & labor', 'Storage', 'Commercial & office'],
    templateIds: ['professional', 'modern'],
    metaTitle: 'Website & Software for Moving Companies',
    metaDescription:
      'A moving-company website with instant estimates, deposits to hold the date, and Stripe payments. Plans start at $0/month with Flex.',
    // Renters move too, and the mover is often paid by the one leaving.
    payer: 'customer',
  },
  {
    slug: 'paving',
    name: 'Paving & Asphalt Contractors',
    work: 'paving & asphalt',
    headline: 'Paving websites that quote the driveway and take the deposit.',
    subhead:
      'Quote driveways and lots by the square foot, take a deposit before you order material, and get paid to your bank the day the asphalt cools.',
    pains: [
      { title: 'Quote by the square foot', body: 'Save paving, sealcoating, and repair pricing to a price book and send a branded, itemized quote from the driveway in minutes.' },
      { title: 'Deposit before you order', body: 'Collect a deposit that covers the asphalt and equipment before you schedule the crew — never front a load.' },
      { title: 'Turn one job into upkeep', body: 'Sealcoating reminders and rebook invites bring the driveway back every few years on autopilot.' },
    ],
    services: ['Driveways', 'Parking lots', 'Sealcoating', 'Crack & pothole repair', 'Resurfacing', 'Striping'],
    templateIds: ['carbon', 'reno'],
    metaTitle: 'Website & Software for Paving & Asphalt Contractors',
    metaDescription:
      'A paving-contractor website with instant estimates, itemized quotes, deposits, and Stripe payments to your bank. Plans start at $0/month with Flex.',
  },
  {
    slug: 'chimney-sweep',
    name: 'Chimney Sweeps',
    work: 'chimney sweep & repair',
    // "Chimney websites" read as websites for chimneys. The trade is the sweep.
    headline: 'Chimney-sweep websites that fill the fall booking rush.',
    subhead:
      'Pack your busy season with online booking, quote repairs and liners on-site, and keep every home on a yearly inspection plan.',
    pains: [
      { title: 'Fill the fall calendar', body: 'Online booking packs your pre-winter inspection and cleaning route before the first cold snap.' },
      { title: 'Quote repairs on-site', body: 'Send a branded quote for a liner, cap, or masonry repair from the roof and get it e-signed before you climb down.' },
      { title: 'Keep them on a yearly plan', body: 'Rebook reminders and recurring inspections bring every chimney back each fall — safe and on schedule.' },
    ],
    services: ['Sweeping & cleaning', 'Inspections', 'Liners', 'Caps & dampers', 'Masonry repair', 'Waterproofing'],
    templateIds: ['fixit', 'professional'],
    metaTitle: 'Website & Software for Chimney Sweeps',
    metaDescription:
      'A chimney-sweep website with online booking, instant estimates, recurring inspection plans, and Stripe payments. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 6, peakLabel: 'Sep–Feb' },
  },
  {
    slug: 'epoxy-flooring',
    name: 'Epoxy Floor Coating Companies',
    work: 'epoxy & floor coatings',
    headline: 'Epoxy-coating websites where the glossy finish sells the job.',
    subhead:
      'Quote garage and shop floors by the square foot with finish options, take a deposit before you order material, and let the before/after close the sale.',
    pains: [
      { title: 'Let the finish sell', body: 'A photo-first gallery of flake, metallic, and high-gloss floors turns your best jobs into your best salesperson.' },
      { title: 'Quote by the square foot', body: 'Itemized quotes with finish and flake options let a homeowner pick their look and watch the price update — then sign.' },
      { title: 'Deposit on the material', body: 'Collect a deposit that covers the coating and prep before you schedule — never front the material.' },
    ],
    services: ['Garage floors', 'Basements', 'Shop & warehouse', 'Patios & pool decks', 'Flake & metallic', 'Concrete prep & repair'],
    templateIds: ['reno', 'carbon'],
    metaTitle: 'Website & Software for Epoxy Floor Coating Companies',
    metaDescription:
      'An epoxy-flooring website with itemized quotes, finish options, deposits, and before/after galleries. Plans start at $0/month with Flex.',
  },
  {
    slug: 'locksmiths',
    name: 'Locksmiths',
    work: 'locksmith work',
    headline: 'Locksmith websites that book the lockout before the next call.',
    subhead:
      'Capture the “I’m locked out” call 24/7, book on-site jobs online, and take card or tap-to-pay the moment the door’s open.',
    pains: [
      { title: 'Win the emergency call', body: 'AI intake and online booking take the lockout or rekey lead any hour and route it to the nearest open window.' },
      { title: 'Quote on the spot', body: 'A saved price book turns a rekey, lock change, or smart-lock install into an e-signable quote in under a minute.' },
      { title: 'Get paid at the door', body: 'Take card or tap-to-pay the second the job’s done — no invoice, no chasing a check.' },
    ],
    services: ['Lockouts', 'Rekeying', 'Lock installs', 'Smart locks', 'Safes', 'Commercial & master key'],
    templateIds: ['fixit', 'carbon'],
    metaTitle: 'Website & Software for Locksmiths',
    metaDescription:
      'A locksmith website with 24/7 instant estimates, online booking, on-site card & tap-to-pay. Plans start at $0/month with Flex.',
  },
  {
    slug: 'septic',
    name: 'Septic Services',
    work: 'septic',
    headline: 'Septic websites that book the pump-out and quote the install.',
    subhead:
      'Fill your pumping route with online booking, quote repairs and new systems on-site, and keep every tank on a recurring service schedule.',
    pains: [
      { title: 'Book the pump-out online', body: 'Online booking fills your route with pumping and inspection windows without a single phone call.' },
      { title: 'Quote big work on-site', body: 'Send a branded quote for a new system, drain field, or repair from the truck and get it e-signed before you leave.' },
      { title: 'Keep tanks on schedule', body: 'Recurring plans and rebook reminders bring every tank back for its regular pump-out on autopilot.' },
    ],
    services: ['Tank pumping', 'Inspections', 'New systems', 'Drain fields', 'Repairs', 'Emergency service'],
    templateIds: ['handy', 'fixit'],
    metaTitle: 'Website & Software for Septic Companies',
    metaDescription:
      'A septic-service website with online booking, instant estimates, recurring pumping plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'foundation-repair',
    name: 'Foundation Repair Contractors',
    work: 'foundation repair',
    headline: 'Foundation-repair websites that quote the fix and finance it.',
    subhead:
      'Capture and qualify high-value repair leads 24/7, quote piering and waterproofing with clear scope, and offer payment plans on the jobs that scare homeowners.',
    pains: [
      { title: 'Qualify the big lead first', body: 'An AI estimator captures and qualifies foundation inquiries 24/7 and flags the high-value ones so you respond before the competition.' },
      { title: 'Quote the fix clearly', body: 'Itemized quotes lay out piering, wall anchors, and waterproofing so a worried homeowner sees exactly what they’re buying — then e-signs.' },
      { title: 'Finance the repair', body: '0%-interest payment plans turn a five-figure foundation fix into monthly payments a homeowner can actually say yes to.' },
    ],
    services: ['Foundation piering', 'Wall anchors & bracing', 'Crawlspace repair', 'Basement waterproofing', 'Slab lifting', 'Drainage'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Foundation Repair Contractors',
    metaDescription:
      'A foundation-repair website with 24/7 lead capture, itemized quotes, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'water-damage-restoration',
    name: 'Water Damage Restoration Companies',
    work: 'water damage & restoration',
    headline: 'Restoration websites that answer the flood call the second it happens.',
    subhead:
      'Capture the emergency 24/7, document every room with photos for the claim, and keep cash moving on a big job with quotes, deposits, and card or bank payment.',
    pains: [
      { title: 'Answer the emergency first', body: 'AI intake takes the flood or leak call any hour and flags the urgent job so you dispatch before the water spreads — and before the next company answers.' },
      { title: 'Document for the claim', body: 'Photos attach to every job and quote, so the scope you send the homeowner is the same record the adjuster needs.' },
      { title: 'Get paid on a big job', body: 'Itemized quotes, deposits, and card or bank payment keep cash moving across a multi-day mitigation.' },
    ],
    services: ['Water extraction', 'Structural drying', 'Mold remediation', 'Fire & smoke', 'Sewage cleanup', 'Reconstruction'],
    templateIds: ['professional', 'carbon'],
    metaTitle: 'Website & Software for Water Damage Restoration Companies',
    metaDescription:
      'A restoration-company website with 24/7 emergency lead capture, photo documentation, and itemized quotes. Plans start at $0/month with Flex.',
  },
  {
    slug: 'carpet-cleaning',
    name: 'Carpet Cleaning Services',
    work: 'carpet & upholstery cleaning',
    headline: 'Carpet-cleaning websites that book by the room and rebook by the season.',
    subhead:
      'Give instant per-room pricing, let homeowners book a window online, take tap-to-pay on the spot, and turn one clean into a standing appointment.',
    pains: [
      { title: 'Price by the room', body: 'Instant estimates by room count give a homeowner a price up front, so the job’s booked before you load the van.' },
      { title: 'Book without the calls', body: 'Online booking fills your day with cleaning windows while you’re on the wand at the last job.' },
      { title: 'Turn one clean into many', body: 'Rebook reminders and recurring plans bring the seasonal deep-clean back on autopilot.' },
    ],
    services: ['Carpet cleaning', 'Upholstery', 'Area rugs', 'Tile & grout', 'Pet stains & odor', 'Commercial'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Carpet Cleaning Businesses',
    metaDescription:
      'A carpet-cleaning website with instant per-room estimates, online booking, tap-to-pay, and recurring plans. Plans start at $0/month with Flex.',
  },
  {
    slug: 'countertops',
    name: 'Countertop Installers',
    work: 'countertop fabrication & install',
    headline: 'Countertop websites that turn a kitchen dream into a signed slab.',
    subhead:
      'Quote granite, quartz, and marble by the square foot with material options, take a deposit before you order the slab, and let the gallery close the sale.',
    pains: [
      { title: 'Let them pick the stone', body: 'Itemized quotes with material and edge options let a homeowner compare quartz and granite and watch the price update — then sign.' },
      { title: 'Deposit before you order', body: 'Collect a deposit that covers the slab before you order from the yard — never front a special-order stone.' },
      { title: 'Sell with the gallery', body: 'A photo-first gallery of finished kitchens and baths turns your best installs into your best salesperson.' },
    ],
    services: ['Quartz', 'Granite', 'Marble & quartzite', 'Kitchen counters', 'Bathroom vanities', 'Repairs & resealing'],
    templateIds: ['reno', 'modern'],
    metaTitle: 'Website & Software for Countertop Installers',
    metaDescription:
      'A countertop-installer website with itemized quotes, material options, deposits, and project galleries. Plans start at $0/month with Flex.',
  },
  {
    slug: 'tile',
    name: 'Tile Contractors',
    work: 'tile installation',
    headline: 'Tile websites where the finished work does the selling.',
    subhead:
      'Quote backsplashes, floors, and showers by the square foot with material options, take a deposit before you order tile, and get paid when the grout sets.',
    pains: [
      { title: 'Quote by the square foot', body: 'Save your tile and labor pricing to a price book and send a branded, itemized quote with material options from the job in minutes.' },
      { title: 'Deposit on the tile', body: 'Collect a deposit that covers the tile order before you place it — never front a pallet of special-order material.' },
      { title: 'Sell with the detail shots', body: 'A photo-first gallery of showers, backsplashes, and floors turns your craftsmanship into your close.' },
    ],
    services: ['Backsplashes', 'Showers & tubs', 'Floors', 'Mosaics & accents', 'Repairs & regrout', 'Natural stone'],
    templateIds: ['reno', 'coat'],
    metaTitle: 'Website & Software for Tile Contractors',
    metaDescription:
      'A tile-contractor website with itemized quotes, material options, deposits, and project galleries. Plans start at $0/month with Flex.',
  },
  {
    slug: 'irrigation',
    name: 'Irrigation & Sprinkler Companies',
    work: 'irrigation & sprinklers',
    headline: 'Sprinkler websites that book installs and every seasonal start-up.',
    subhead:
      'Quote new systems on-site, fill your spring start-up and fall blow-out calendar with online booking, and keep every yard on a recurring service plan.',
    pains: [
      { title: 'Quote the install on-site', body: 'Send a branded quote for a new system or zone add from the yard and get it e-signed before you leave.' },
      { title: 'Fill the seasonal calendar', body: 'Online booking packs your spring start-up and fall winterization routes before the phones start ringing.' },
      { title: 'Recurring service on rails', body: 'Seasonal plans schedule and auto-charge start-ups, blow-outs, and mid-summer checks all year.' },
    ],
    services: ['System installs', 'Spring start-up', 'Winterization', 'Repairs & leaks', 'Zone & head add-ons', 'Backflow testing'],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Irrigation & Sprinkler Companies',
    metaDescription:
      'An irrigation-company website with instant estimates, recurring seasonal service, and Stripe payments. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 7, peakLabel: 'Apr–Oct' },
  },
  {
    slug: 'auto-detailing',
    name: 'Auto Detailing Services',
    work: 'auto detailing',
    headline: 'Detailing websites that book the package and take tap-to-pay.',
    subhead:
      'Show your packages, let customers book a mobile or shop appointment online, take payment on the spot, and turn one detail into a monthly regular.',
    pains: [
      { title: 'Book the package online', body: 'Online booking lets customers pick a package and grab a window without a call — mobile or in the shop.' },
      { title: 'Get paid at the car', body: 'Take card or tap-to-pay the moment the detail’s done — no invoice, no waiting on a check.' },
      { title: 'Turn one detail into many', body: 'Recurring plans and rebook reminders bring the monthly maintenance wash back on autopilot.' },
    ],
    services: ['Interior detail', 'Exterior & wash', 'Paint correction', 'Ceramic coating', 'Headlight restoration', 'Fleet & dealer'],
    templateIds: ['carbon', 'shine'],
    metaTitle: 'Website & Software for Auto Detailing Businesses',
    metaDescription:
      'An auto-detailing website with online booking, tap-to-pay, recurring plans, and Stripe payments. Plans start at $0/month with Flex.',
    // The job is a car. Nothing about this trade turns on owning a house.
    payer: 'customer',
  },
  {
    slug: 'snow-removal',
    name: 'Snow Removal Services',
    work: 'snow removal & plowing',
    headline: 'Snow-removal websites that lock in seasonal contracts before the first flake.',
    subhead:
      'Sign per-season and per-push contracts online, take deposits and cards on file, and bill every storm automatically — no invoicing at 4am.',
    pains: [
      { title: 'Lock in the season', body: 'Sell per-season contracts with a card on file so your route is booked and prepaid before winter hits.' },
      { title: 'Bill every push automatically', body: 'Per-push plans charge the saved card after each storm — you plow, the invoicing runs itself.' },
      { title: 'Sign it online', body: 'E-signed contracts and online booking lock in driveways and lots without a single kitchen-table meeting.' },
    ],
    services: ['Residential plowing', 'Commercial lots', 'Sidewalk clearing', 'Salting & de-icing', 'Per-season contracts', 'Per-push service'],
    templateIds: ['carbon', 'handy'],
    metaTitle: 'Website & Software for Snow Removal Businesses',
    metaDescription:
      'A snow-removal website with online contracts, deposits, cards on file, and per-storm auto-billing. Plans start at $0/month with Flex.',
    seasonality: { kind: 'seasonal', activeMonthsPerYear: 5, peakLabel: 'Nov–Mar' },
  },
  {
    slug: 'home-inspectors',
    name: 'Home Inspectors',
    work: 'home inspection',
    headline: 'Home-inspection websites that book the inspection and collect up front.',
    subhead:
      'Let buyers and agents book an inspection online, collect payment before you arrive, and keep your calendar full without the back-and-forth.',
    pains: [
      { title: 'Book without the phone tag', body: 'Online booking lets agents and buyers request an available inspection window 24/7 — no missed calls while you’re in a crawlspace.' },
      { title: 'Collect before you arrive', body: 'Take payment or a deposit at booking so you’re never chasing a check after the report goes out.' },
      { title: 'Win repeat agent business', body: 'A clean site, reviews, and easy rebooking make you the inspector agents send every client to.' },
    ],
    services: ['Buyer inspections', 'Seller pre-listing', 'New construction', 'Radon & mold', 'Sewer scope', 'Re-inspections'],
    templateIds: ['professional', 'modern'],
    metaTitle: 'Website & Software for Home Inspectors',
    metaDescription:
      'A home-inspection website with online booking, pay-at-booking, reviews, and Stripe payments. Plans start at $0/month with Flex.',
    // A buyer's inspector is hired by someone who does not own the house yet.
    payer: 'client',
  },
  {
    slug: 'excavation',
    name: 'Excavation Contractors',
    work: 'excavation & grading',
    headline: 'Excavation websites that quote the site work and lock the schedule.',
    subhead:
      'Quote grading, digging, and hauling by the job with photos, take a deposit before the equipment rolls, and get paid to your bank as the phases wrap.',
    pains: [
      { title: 'Quote the scope clearly', body: 'Itemized quotes lay out grading, excavation, and haul-off so a builder or homeowner sees exactly what they’re paying for — then e-signs.' },
      { title: 'Deposit before the dig', body: 'Collect a deposit that covers mobilization and equipment before you schedule the crew and the machines.' },
      { title: 'Stage the payments', body: 'Collect progress payments as the site work hits each phase — all tracked on one job.' },
    ],
    services: ['Site prep & grading', 'Foundation digs', 'Trenching', 'Land clearing', 'Drainage & ponds', 'Demolition & haul-off'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Excavation Contractors',
    metaDescription:
      'An excavation-contractor website with itemized quotes, deposits, staged payments, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'stucco',
    name: 'Stucco Contractors',
    work: 'stucco & plastering',
    headline: 'Stucco websites that quote the wall and show the finish.',
    subhead:
      'Quote new stucco, repairs, and re-coats by the square foot, take a deposit before you order material, and let a photo-first gallery close the job.',
    pains: [
      { title: 'Quote by the square foot', body: 'Save your stucco, EIFS, and repair pricing to a price book and send a branded, itemized quote from the site in minutes.' },
      { title: 'Deposit on the material', body: 'Collect a deposit that covers material and scaffolding before you schedule — never front the job yourself.' },
      { title: 'Let the finish sell', body: 'A photo-first gallery of smooth, textured, and color-coat finishes turns your best walls into your best salesperson.' },
    ],
    services: ['New stucco', 'Repairs & patching', 'Re-coat & color', 'EIFS', 'Plastering', 'Waterproofing'],
    templateIds: ['coat', 'reno'],
    metaTitle: 'Website & Software for Stucco Contractors',
    metaDescription:
      'A stucco-contractor website with itemized quotes, deposits, project galleries, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'cabinetry',
    name: 'Cabinet Makers',
    work: 'cabinetry & millwork',
    headline: 'Cabinetry websites that turn a kitchen idea into a signed build.',
    subhead:
      'Quote custom cabinets and built-ins with options and photos, take a deposit before you order material, and stage payments across the build.',
    pains: [
      { title: 'Quote the custom build', body: 'Itemized quotes with wood, finish, and hardware options let a homeowner design their kitchen and watch the price update — then sign.' },
      { title: 'Deposit before you order', body: 'Collect a deposit that covers material and shop time before you start — never float a custom order.' },
      { title: 'Sell with the portfolio', body: 'A photo-first gallery of finished kitchens, built-ins, and millwork is the pitch that closes the high-end job.' },
    ],
    services: ['Custom cabinets', 'Kitchen & bath', 'Built-ins', 'Refacing', 'Millwork & trim', 'Closets & storage'],
    templateIds: ['reno', 'modern'],
    metaTitle: 'Website & Software for Cabinet Makers',
    metaDescription:
      'A cabinetry website with itemized quotes, material options, deposits, staged payments, and project galleries. Plans start at $0/month with Flex.',
  },
  {
    slug: 'window-treatments',
    name: 'Window Treatment Companies',
    work: 'blinds, shades & window treatments',
    headline: 'Window-treatment websites that quote every window and book the install.',
    subhead:
      'Quote blinds, shades, and shutters by the window with material options, take a deposit before you order, and book the measure and install online.',
    pains: [
      { title: 'Quote window by window', body: 'Itemized quotes with fabric and style options let a homeowner outfit the whole house and see the price update — then sign.' },
      { title: 'Deposit on the order', body: 'Collect a deposit that covers the custom order before it goes to the manufacturer — never front a special order.' },
      { title: 'Book measure and install', body: 'Online booking slots the measure and install without the phone tag, and rebook invites bring the next room back.' },
    ],
    services: ['Blinds', 'Shades', 'Shutters', 'Drapery', 'Motorized', 'Commercial'],
    templateIds: ['modern', 'coat'],
    metaTitle: 'Website & Software for Window Treatment Companies',
    metaDescription:
      'A window-treatment website with itemized quotes, material options, deposits, and online booking. Plans start at $0/month with Flex.',
  },
  {
    slug: 'well-water',
    name: 'Well & Water Treatment Companies',
    work: 'well & water treatment',
    headline: 'Water-treatment websites that book the test and quote the system.',
    subhead:
      'Capture the “my water’s bad” call, quote softeners and filtration on-site, and keep every system on a recurring service and filter-change plan.',
    pains: [
      { title: 'Catch the water-quality call', body: 'AI intake and online booking take the “rusty water” or “no pressure” lead any hour and slot a test window.' },
      { title: 'Quote the system on-site', body: 'Send a branded quote for a softener, filter, or well pump from the basement and get it e-signed before you leave.' },
      { title: 'Recurring service on rails', body: 'Filter-change and service plans schedule and auto-charge themselves, keeping every system — and customer — on the books.' },
    ],
    services: ['Water softeners', 'Filtration & RO', 'Well pumps', 'Water testing', 'Iron & sulfur', 'Service plans'],
    templateIds: ['handy', 'professional'],
    metaTitle: 'Website & Software for Well & Water Treatment Companies',
    metaDescription:
      'A water-treatment website with online booking, instant estimates, recurring service plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'generators',
    name: 'Generator Installers',
    work: 'standby generator install',
    headline: 'Generator websites that book the install before the next outage.',
    subhead:
      'Capture and qualify standby-generator leads 24/7, quote the unit and install with clear line items, and offer payment plans on the whole job.',
    pains: [
      { title: 'Catch the outage-driven lead', body: 'An AI estimator captures and qualifies generator inquiries 24/7 — right when a storm has homeowners ready to buy.' },
      { title: 'Quote unit and install', body: 'Itemized quotes lay out the generator, transfer switch, and labor so a homeowner sees exactly what they’re getting — then e-signs.' },
      { title: 'Finance the whole job', body: '0%-interest payment plans turn a whole-home standby system into an easy monthly yes.' },
    ],
    services: ['Standby generators', 'Transfer switches', 'Portable hookups', 'Load calculations', 'Maintenance plans', 'Repairs'],
    templateIds: ['carbon', 'fixit'],
    metaTitle: 'Website & Software for Generator Installers',
    metaDescription:
      'A generator-installer website with 24/7 lead capture, itemized quotes, payment plans, and Stripe payments. Plans start at $0/month with Flex.',
  },
  {
    slug: 'holiday-lighting',
    name: 'Holiday Light Installers',
    work: 'holiday lighting',
    headline: 'Holiday lighting websites that sell out your season by October.',
    subhead:
      'Book early installations, quote custom roofline and tree displays on the spot, and manage takedown, storage, and annual renewal billing seamlessly.',
    pains: [
      { title: 'Lock the short booking window', body: 'Early-bird deposits and online scheduling secure your November installation calendar before the rush starts.' },
      { title: 'Quote custom displays on-site', body: 'Itemize roofline footage, tree wraps, and wreath add-ons from your phone and collect e-signatures in minutes.' },
      { title: 'Automate off-season renewals', body: 'Takedown, storage, and early rebooking reminders turn one holiday season into standing repeat revenue every year.' },
    ],
    services: [
      'Residential installs',
      'Commercial displays',
      'Wreaths & greenery',
      'In-season maintenance',
      'Takedown & storage',
      'Permanent roofline lighting',
    ],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Holiday Light Installers',
    metaDescription:
      'A holiday lighting website with instant estimates, online booking, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['electricians', 'pressure-washing'],
    seasonality: { kind: 'seasonal', activeMonthsPerYear: 4, peakLabel: 'Oct–Jan' },
    economics: {
      avgTicket: 1500,
      typicalMonthlyVolume: 35000,
      typicalJobsPerMonth: 23,
      quickStopMonthlyBonus: 2500,
      activeMonthsPerYear: 4,
      quickStopActiveMonthsPerYear: 3,
      volumeLabel: 'Estimated in-season monthly card volume',
    },
  },
  {
    slug: 'lawn-care',
    name: 'Lawn Care Companies',
    work: 'lawn care',
    headline: 'Lawn care websites that fill and auto-bill your recurring routes.',
    subhead:
      'Win recurring mowing and fertilization contracts, quote cleanups and aeration on the fly, and auto-charge cards on file after every service visit.',
    pains: [
      { title: 'Recurring route auto-billing', body: 'Weekly and biweekly mowing schedules auto-generate visits and bill saved cards—no invoicing every cut.' },
      { title: 'Quote treatment packages on-site', body: 'Send itemized quotes for aeration, overseeding, and multi-step weed control with easy one-tap approvals.' },
      { title: 'Bridge the winter shoulder', body: 'Seasonal cleanup packages and prepay discounts keep cash flowing reliably as the mowing season winds down.' },
    ],
    services: [
      'Lawn mowing & edging',
      'Fertilization & weed control',
      'Aeration & overseeding',
      'Spring & fall cleanups',
      'Leaf removal',
      'Dethatching',
    ],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Lawn Care Companies',
    metaDescription:
      'A lawn care website with recurring auto-billing, online booking, instant estimates, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['landscapers'],
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 8, peakLabel: 'Mar–Oct' },
    economics: {
      avgTicket: 450,
      typicalMonthlyVolume: 25000,
      typicalJobsPerMonth: 55,
      quickStopMonthlyBonus: 1800,
      activeMonthsPerYear: 8,
      quickStopActiveMonthsPerYear: 8,
      volumeLabel: 'Estimated in-season monthly card volume',
    },
  },
  {
    slug: 'mosquito-tick-control',
    name: 'Mosquito & Tick Control Companies',
    work: 'mosquito & tick control',
    headline: 'Mosquito & tick control websites that lock in season-long protection.',
    subhead:
      'Sell recurring barrier spray subscriptions, book one-time event sprays online, and auto-bill treatments across your seasonal routes.',
    pains: [
      { title: 'Season pass recurring billing', body: '21-day barrier spray cycles bill cards on file automatically all summer long with zero manual chasing.' },
      { title: 'Instant event spray booking', body: 'Online booking and upfront payments let homeowners schedule wedding and party sprays with zero back-and-forth.' },
      { title: 'Automated spring renewals', body: 'Rebook reminders and early-season prepay incentives reactivate last year’s yard list before pest activity peaks.' },
    ],
    services: [
      'Barrier spray treatments',
      'Tick control programs',
      'All-natural treatments',
      'Special event spraying',
      'Larvicide & water treatments',
      'Seasonal protection plans',
    ],
    templateIds: ['professional', 'handy'],
    metaTitle: 'Website & Software for Mosquito & Tick Control',
    metaDescription:
      'A mosquito & tick control website with recurring auto-billing, online booking, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['pest-control'],
    seasonality: { kind: 'seasonal', activeMonthsPerYear: 7, peakLabel: 'Apr–Oct' },
    economics: {
      avgTicket: 650,
      typicalMonthlyVolume: 22000,
      typicalJobsPerMonth: 34,
      quickStopMonthlyBonus: 1500,
      activeMonthsPerYear: 7,
      quickStopActiveMonthsPerYear: 7,
      volumeLabel: 'Estimated in-season monthly card volume',
    },
  },
  {
    slug: 'air-duct-cleaning',
    name: 'Air Duct & Dryer Vent Cleaners',
    work: 'air duct & dryer vent cleaning',
    headline: 'Air duct cleaning websites that turn airflow calls into booked jobs.',
    subhead:
      'Quote whole-home duct cleaning and dryer vents with transparent package pricing, book online 24/7, and offer seasonal maintenance reminders.',
    pains: [
      { title: 'Quote clear packages upfront', body: 'Pre-set system pricing by vent count or square footage turns quick estimates into confirmed bookings in minutes.' },
      { title: 'Dryer vent safety add-ons', body: 'One-click add-ons for lint clearing and sanitization increase your average ticket on every residential call.' },
      { title: 'Seasonal tune-up tie-ins', body: 'Automated seasonal reminders capture bookings right before furnace and air conditioning seasons start.' },
    ],
    services: [
      'Whole-home duct cleaning',
      'Dryer vent cleaning',
      'Sanitization & deodorizing',
      'Furnace & blower cleaning',
      'Air filter replacement',
      'Commercial duct cleaning',
    ],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Air Duct Cleaning',
    metaDescription:
      'An air duct cleaning website with instant estimates, online booking, package quotes, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['hvac'],
    seasonality: { kind: 'year-round', activeMonthsPerYear: 10, peakLabel: 'Spring/Fall Peak' },
    economics: {
      avgTicket: 500,
      typicalMonthlyVolume: 18000,
      typicalJobsPerMonth: 36,
      quickStopMonthlyBonus: 2000,
      activeMonthsPerYear: 10,
      quickStopActiveMonthsPerYear: 10,
    },
  },
  {
    slug: 'pond-services',
    name: 'Pond & Water Feature Services',
    work: 'pond & water feature services',
    headline: 'Pond service websites that book the spring opening and fall winterization.',
    subhead:
      'Quote cleanouts, pump repairs, and custom water features on-site, book recurring maintenance visits, and collect deposits on new installations.',
    pains: [
      { title: 'Capture the spring cleanout rush', body: 'Online booking and deposits lock in early opening dates before your spring schedule fills completely.' },
      { title: 'Quote equipment and repairs on-site', body: 'Send itemized quotes for replacement pumps, UV clarifiers, and filtration upgrades straight from the pond edge.' },
      { title: 'Firm winterization deadlines', body: 'Targeted fall netting and shutdown reminders get every customer scheduled before the first hard freeze.' },
    ],
    services: [
      'Pond openings & cleanouts',
      'Winterization & netting',
      'Algae & water quality',
      'Pump & filter repair',
      'Koi pond maintenance',
      'Custom water features',
    ],
    templateIds: ['modern', 'handy'],
    metaTitle: 'Website & Software for Pond & Water Feature Companies',
    metaDescription:
      'A pond service website with online booking, seasonal cleanout scheduling, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['landscapers', 'pool-services'],
    seasonality: { kind: 'seasonal-peak', activeMonthsPerYear: 8, peakLabel: 'Apr–Nov' },
    economics: {
      avgTicket: 850,
      typicalMonthlyVolume: 20000,
      typicalJobsPerMonth: 24,
      quickStopMonthlyBonus: 1800,
      activeMonthsPerYear: 8,
      quickStopActiveMonthsPerYear: 8,
      volumeLabel: 'Estimated in-season monthly card volume',
    },
  },
  {
    slug: 'hardscaping',
    name: 'Hardscaping Contractors',
    work: 'hardscaping & outdoor living',
    headline: 'Hardscaping websites that turn paver patios into signed builds.',
    subhead:
      'Quote paver patios, outdoor kitchens, and retaining walls with itemized materials, collect staged deposits, and showcase your best outdoor transformations.',
    pains: [
      { title: 'Quote high-ticket builds fast', body: 'Send itemized, branded quotes with paver choices, lighting add-ons, and outdoor kitchen options right from the yard.' },
      { title: 'Stage large project deposits', body: 'Collect upfront deposits to secure stone and pavers, followed by milestone payments at excavation, base prep, and final joint sand.' },
      { title: 'Sell with outdoor portfolios', body: 'Photo-first project galleries let prospective clients see your fire pits, retaining walls, and custom patios in stunning high resolution.' },
    ],
    services: ['Paver patios & walkways', 'Retaining & seating walls', 'Outdoor kitchens & BBQs', 'Fire pits & fireplaces', 'Pergolas & pavilions', 'Permeable pavers'],
    templateIds: ['carbon', 'reno'],
    metaTitle: 'Website & Software for Hardscaping Contractors',
    metaDescription:
      'A hardscaping website with instant estimates, itemized quotes, staged deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['landscapers', 'concrete'],
  },
  {
    slug: 'artificial-turf',
    name: 'Artificial Turf Installers',
    work: 'artificial turf installation',
    headline: 'Artificial turf websites that quote by the square foot and book installs.',
    subhead:
      'Quote lawns, putting greens, and pet turf by square footage with turf grade options, take upfront material deposits, and showcase evergreen transformations.',
    pains: [
      { title: 'Quote square footage on site', body: 'Save per-square-foot turf options, base prep, and infill pricing to build detailed quotes in minutes.' },
      { title: 'Deposit before ordering turf', body: 'Collect upfront deposits on custom turf rolls and base material so you never float inventory costs.' },
      { title: 'Before/after galleries that sell', body: 'Show mud-to-green transformations that convince homeowners and pet owners to switch.' },
    ],
    services: ['Residential turf lawns', 'Backyard putting greens', 'Pet & dog turf systems', 'Playground turf', 'Commercial turf', 'Turf maintenance & infill'],
    templateIds: ['handy', 'modern'],
    metaTitle: 'Website & Software for Artificial Turf Installers',
    metaDescription:
      'An artificial turf website with per-square-foot estimates, material deposits, project galleries, and Stripe payments. Plans start at $0/month.',
    relatedSlugs: ['landscapers', 'lawn-care'],
  },
  {
    slug: 'landscape-lighting',
    name: 'Landscape Lighting Contractors',
    work: 'landscape & architectural lighting',
    headline: 'Landscape lighting websites that showcase night-time drama.',
    subhead:
      'Quote low-voltage architectural and path lighting packages on-site, offer fixture upgrade tiers, and turn installs into recurring service contracts.',
    pains: [
      { title: 'Sell the night-time visual', body: 'A photo-first gallery highlighting illuminated trees, path lights, and facade uplights sells the visual package.' },
      { title: 'Quote fixture tiers in seconds', body: 'Offer bronze vs brass fixture packages and smart control upgrades with instant line-item pricing.' },
      { title: 'Annual maintenance memberships', body: 'Auto-charge seasonal bulb checks, timer adjustments, and fixture cleaning on saved cards.' },
    ],
    services: ['Architectural uplighting', 'Path & garden lights', 'Deck & patio lighting', 'Smart WiFi controllers', 'LED retrofits', 'Maintenance plans'],
    templateIds: ['modern', 'shine'],
    metaTitle: 'Website & Software for Landscape Lighting',
    metaDescription:
      'A landscape lighting website with package quotes, photo galleries, recurring service plans, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['electricians', 'holiday-lighting'],
  },
  {
    slug: 'land-clearing',
    name: 'Land Clearing Contractors',
    work: 'land clearing & forestry mulching',
    headline: 'Land clearing websites that quote acreage and lock machine schedules.',
    subhead:
      'Quote forestry mulching, brush clearing, and lot preparation by the acre or day rate, take mobilization deposits, and keep heavy equipment rolling.',
    pains: [
      { title: 'Quote acreage and day rates', body: 'Build itemized quotes for forestry mulching, tree shear, and brush mowing directly from the field.' },
      { title: 'Mobilization deposits up front', body: 'Collect deposits covering heavy equipment transport and fuel before hauling machines to site.' },
      { title: 'Photo documentation of site lines', body: 'Attach survey maps, boundary markers, and before/after clearing photos to quotes and job records.' },
    ],
    services: ['Forestry mulching', 'Lot & acreage clearing', 'Brush & undergrowth removal', 'Right-of-way clearing', 'Retention pond clearing', 'Stump shearing'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Land Clearing Contractors',
    metaDescription:
      'A land clearing website with instant estimates, acreage quotes, mobilization deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['excavation', 'tree-services'],
  },
  {
    slug: 'screen-enclosures',
    name: 'Screen Enclosure Companies',
    work: 'screen enclosures & lanais',
    headline: 'Screen enclosure websites that quote pool cages and lanai wraps.',
    subhead:
      'Quote pool enclosures, rescreening, and motorized screens with material options, take staged deposits, and fill your install calendar.',
    pains: [
      { title: 'Quote rescreens and new builds', body: 'Itemize standard mesh vs pet screen vs tuff screen per panel or linear foot in seconds.' },
      { title: 'Deposit before ordering extrusions', body: 'Collect deposits for custom aluminum extrusions and specialty screens prior to fabrication.' },
      { title: 'Catch storm repair demand', body: 'AI intake captures hurricane or storm wind damage leads 24/7 and queues urgent panel repairs.' },
    ],
    services: ['Pool cage enclosures', 'Lanai & patio screens', 'Full enclosure rescreening', 'Motorized roll-down screens', 'Pet screen upgrades', 'Storm & frame repair'],
    templateIds: ['handy', 'reno'],
    metaTitle: 'Website & Software for Screen Enclosure Companies',
    metaDescription:
      'A screen enclosure website with instant estimates, per-panel quotes, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['deck-builders', 'gutters'],
  },
  {
    slug: 'basement-waterproofing',
    name: 'Basement Waterproofing Contractors',
    work: 'basement waterproofing',
    headline: 'Waterproofing websites that turn wet basements into signed fixes.',
    subhead:
      'Capture emergency seepage calls 24/7, quote interior drains and sump pump systems with clear scope, and offer payment plans on five-figure jobs.',
    pains: [
      { title: 'Win urgent flood calls 24/7', body: 'AI intake captures active basement leaks and wet crawlspace inquiries any hour and flags urgent leads.' },
      { title: 'Quote drainage systems clearly', body: 'Itemize French drains, dual sump pumps, battery backups, and vapor barriers with clear warranties.' },
      { title: 'Finance high-ticket repairs', body: '0%-interest payment plans make major basement waterproofing systems accessible for homeowners.' },
    ],
    services: ['Interior French drains', 'Dual sump pump systems', 'Battery backup pumps', 'Vapor barrier membranes', 'Exterior waterproofing', 'Dehumidification systems'],
    templateIds: ['carbon', 'professional'],
    metaTitle: 'Website & Software for Basement Waterproofers',
    metaDescription:
      'A basement waterproofing website with 24/7 lead capture, itemized drainage quotes, payment plans, and Stripe. Plans start at $0/month with Flex.',
    relatedSlugs: ['foundation-repair', 'water-damage-restoration'],
  },
  {
    slug: 'glass-and-mirrors',
    name: 'Glass & Mirror Companies',
    work: 'glass & shower door installation',
    headline: 'Glass & mirror websites where frameless clarity closes the job.',
    subhead:
      'Quote frameless shower doors, custom mirrors, and glass railings with hardware choices, collect upfront glass deposits, and showcase stunning bathrooms.',
    pains: [
      { title: 'Quote custom glass on site', body: 'Configure glass thickness, hardware finishes, and protective coating options into itemized quotes in minutes.' },
      { title: 'Deposit on custom-tempered orders', body: 'Collect deposits covering fabricated tempered glass before placing orders with the glass plant.' },
      { title: 'Portfolio that sells luxury', body: 'High-res galleries of frameless enclosures and custom gym mirrors prove your fit and finish.' },
    ],
    services: ['Frameless shower doors', 'Custom vanity & gym mirrors', 'Glass railing systems', 'Wine cellar glass', 'Tabletops & shelves', 'Commercial storefronts'],
    templateIds: ['modern', 'reno'],
    metaTitle: 'Website & Software for Glass & Mirror Companies',
    metaDescription:
      'A glass & mirror website with itemized quotes, hardware options, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['window-installers', 'remodelers'],
  },
  {
    slug: 'ironwork-and-railings',
    name: 'Ironwork & Railing Contractors',
    work: 'custom ironwork & metal fabrication',
    headline: 'Ironwork websites that let custom metalcraft sell the project.',
    subhead:
      'Quote custom railings, driveway gates, and security doors with finish options, take shop-time deposits, and stage payments across fabrication and install.',
    pains: [
      { title: 'Quote custom fabrication easily', body: 'Itemize design, steel or aluminum material, powder coating, and on-site welding installation.' },
      { title: 'Deposit before buying steel', body: 'Collect upfront deposits to cover raw steel and shop cutting time before striking the first arc.' },
      { title: 'Showcase craftsmanship', body: 'A photo-first portfolio displaying custom stair railings, ornamental gates, and spiral stairs.' },
    ],
    services: ['Custom stair railings', 'Driveway & garden gates', 'Ornamental security doors', 'Balcony & porch railings', 'Spiral staircases', 'Powder-coated aluminum'],
    templateIds: ['carbon', 'modern'],
    metaTitle: 'Website & Software for Ironwork Contractors',
    metaDescription:
      'An ironwork website with custom fabrication quotes, deposits, staged payments, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['fencing', 'deck-builders'],
  },
  {
    slug: 'radon-mitigation',
    name: 'Radon Mitigation Contractors',
    work: 'radon mitigation & testing',
    headline: 'Radon mitigation websites that close real estate inspection deadlines.',
    subhead:
      'Capture time-sensitive real estate leads 24/7, quote active sub-slab mitigation systems on the spot, and get paid before the closing date.',
    pains: [
      { title: 'Win the real estate inspection rush', body: 'Fast online booking and instant estimates help agents and home buyers resolve radon contingencies on tight deadlines.' },
      { title: 'Quote standardized system installs', body: 'Select foundation type, piping route, and fan location from your price book and send a quote in 60 seconds.' },
      { title: 'Get paid at test verification', body: 'Send digital pay links or auto-charge cards on file as soon as the post-mitigation test confirms safe levels.' },
    ],
    services: ['Active sub-slab depressurization', 'Continuous radon testing', 'Crawlspace membrane encapsulation', 'Radon fan replacements', 'Sump pump lid seals', 'Commercial radon mitigation'],
    templateIds: ['professional', 'fixit'],
    metaTitle: 'Website & Software for Radon Mitigation Companies',
    metaDescription:
      'A radon mitigation website with 24/7 lead capture, fast quotes, online booking, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['home-inspectors', 'insulation'],
  },
  {
    slug: 'smart-home-av',
    name: 'Smart Home & Audio Visual Installers',
    work: 'smart home & audio visual installation',
    headline: 'Smart home websites that quote the whole system and book installs.',
    subhead:
      'Quote home theaters, multi-room audio, security cameras, and network cabling with tiered hardware options, collect deposits, and bill support plans.',
    pains: [
      { title: 'Quote complex hardware packages', body: 'Combine speakers, amplifiers, cameras, and labor into transparent tiered packages (Good/Better/Best).' },
      { title: 'Deposit on high-value gear', body: 'Collect upfront deposits to cover AV receivers, smart panels, and surveillance hardware before ordering.' },
      { title: 'Recurring remote support plans', body: 'Offer monthly network monitoring and firmware support memberships auto-billed via Stripe.' },
    ],
    services: ['Home theater systems', 'Whole-home audio', 'Security cameras & CCTV', 'Smart lighting automation', 'Mesh WiFi & structured cabling', 'Motorized shades integration'],
    templateIds: ['carbon', 'modern'],
    metaTitle: 'Website & Software for Smart Home & AV Installers',
    metaDescription:
      'A smart home & AV website with tiered package quotes, equipment deposits, support plans, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['electricians', 'locksmiths'],
  },
  {
    slug: 'fire-protection',
    name: 'Fire Protection Companies',
    work: 'fire protection & sprinkler service',
    headline: 'Fire protection websites that lock recurring inspection contracts.',
    subhead:
      'Quote fire sprinkler systems, backflow testing, and alarms, schedule compliance inspections online, and auto-bill recurring testing contracts.',
    pains: [
      { title: 'Recurring compliance inspections', body: 'Annual and semi-annual NFPA inspection contracts schedule and auto-bill themselves without administrative hassle.' },
      { title: 'Quote sprinkler repairs on site', body: 'Send branded quotes for pipe repair, valve replacement, or head relocation right from the riser room.' },
      { title: 'Digital inspection reports & invoices', body: 'Attach compliance certificates to invoices and receive card or ACH bank payments promptly.' },
    ],
    services: ['Fire sprinkler inspections', 'Backflow preventer testing', 'Fire alarm system testing', 'Fire extinguisher service', 'Kitchen hood suppression', 'Emergency pipe repairs'],
    templateIds: ['professional', 'carbon'],
    metaTitle: 'Website & Software for Fire Protection Companies',
    metaDescription:
      'A fire protection website with compliance inspection booking, recurring billing, quotes, and Stripe payments. Plans start at $0/month with Flex.',
    payer: 'client',
    relatedSlugs: ['plumbers', 'electricians'],
  },
  {
    slug: 'ev-chargers',
    name: 'EV Charger Installers',
    work: 'EV charger installation',
    headline: 'EV charger websites that book the install before delivery day.',
    subhead:
      'Quote Level 2 home chargers and commercial stations, capture homeowner rebates, collect deposits on panel work, and get paid upon commissioning.',
    pains: [
      { title: 'Quote standard installs fast', body: 'Price 240V NEMA 14-50 outlets vs hardwired Level 2 chargers with distance-based wiring add-ons in 60 seconds.' },
      { title: 'Deposit on panel upgrades', body: 'Collect deposits upfront when a 200A service upgrade or subpanel is required before installing the charger.' },
      { title: 'Photo-based remote assessments', body: 'Homeowners upload photos of their breaker panel and garage layout during intake for fast pre-qualification.' },
    ],
    services: ['Level 2 home chargers', 'Tesla wall connectors', 'Commercial charging stations', 'Electrical panel upgrades', 'Load management systems', 'Utility rebate documentation'],
    templateIds: ['carbon', 'fixit'],
    metaTitle: 'Website & Software for EV Charger Installers',
    metaDescription:
      'An EV charger installation website with instant estimates, photo intake, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['electricians', 'solar'],
  },
  {
    slug: 'cabinet-refinishing',
    name: 'Cabinet Refinishing Companies',
    work: 'cabinet refinishing & painting',
    headline: 'Cabinet refinishing websites where the finish sells the remodel.',
    subhead:
      'Quote kitchen cabinets by door and drawer count, let homeowners choose factory finishes and colors, collect deposits, and showcase stunning before/afters.',
    pains: [
      { title: 'Quote by door and drawer count', body: 'Calculate quotes in minutes based on total openings, finish type (paint vs stain), and optional new hardware.' },
      { title: 'Lock the schedule with a deposit', body: 'Collect a deposit to order specialty lacquer and schedule the spray shop crew.' },
      { title: 'Stunning kitchen before/afters', body: 'Before-and-after sliders highlight dramatic oak-to-white transformations that close clients instantly.' },
    ],
    services: ['Cabinet spray painting', 'Factory lacquer finishes', 'Cabinet door refacing', 'Hardware replacement & drilling', 'Island accent painting', 'Built-in bookcase painting'],
    templateIds: ['coat', 'modern'],
    metaTitle: 'Website & Software for Cabinet Refinishers',
    metaDescription:
      'A cabinet refinishing website with per-door quotes, finish options, deposits, and before/after galleries. Plans start at $0/month with Flex.',
    relatedSlugs: ['painters', 'cabinetry'],
  },
  {
    slug: 'custom-closets',
    name: 'Custom Closet Companies',
    work: 'custom closet & storage design',
    headline: 'Custom closet websites that turn messy storage into booked builds.',
    subhead:
      'Quote walk-in closets, pantry systems, and garage storage with modular finish options, collect upfront deposits, and stage payments across install.',
    pains: [
      { title: 'Quote modular configurations', body: 'Itemize hanging sections, drawer towers, shoe shelves, and jewelry trays so customers can customize their budget.' },
      { title: 'Deposit on fabricated parts', body: 'Collect deposits covering custom CNC cabinetry parts and hardware before production begins.' },
      { title: 'Showcase clean organization', body: 'High-definition portfolios of walk-ins, pantries, and mudrooms inspire homeowners to transform their homes.' },
    ],
    services: ['Walk-in closet systems', 'Reach-in closet organizers', 'Custom pantry shelving', 'Garage storage & workbenches', 'Mudroom lockers & drop zones', 'Home office built-ins'],
    templateIds: ['modern', 'reno'],
    metaTitle: 'Website & Software for Custom Closet Companies',
    metaDescription:
      'A custom closet website with itemized quotes, modular options, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['cabinetry', 'remodelers'],
  },
  {
    slug: 'finish-carpentry',
    name: 'Finish Carpenters',
    work: 'finish carpentry & millwork',
    headline: 'Finish carpentry websites that let precision craftsmanship sell the job.',
    subhead:
      'Quote crown molding, wainscoting, and interior doors by the linear foot, take deposits before purchasing lumber, and get paid when the trim is set.',
    pains: [
      { title: 'Quote by the linear foot or room', body: 'Save per-foot pricing for crown, baseboards, and coffered ceilings to build branded quotes in minutes.' },
      { title: 'Deposit on custom millwork orders', body: 'Collect deposits to cover custom wood profiles, interior doors, and lumber orders prior to delivery.' },
      { title: 'Showcase fine detail work', body: 'Detail-focused photo galleries highlight tight miters, custom mantels, and elegant accent walls.' },
    ],
    services: ['Crown molding & baseboards', 'Wainscoting & board and batten', 'Interior door installation', 'Custom fireplace mantels', 'Coffered & wood slat ceilings', 'Custom staircase trim'],
    templateIds: ['reno', 'carbon'],
    metaTitle: 'Website & Software for Finish Carpenters',
    metaDescription:
      'A finish carpentry website with per-foot estimates, millwork quotes, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['cabinetry', 'remodelers'],
  },
  {
    slug: 'wallpaper-installers',
    name: 'Wallpaper Installers',
    work: 'wallpaper & wallcovering installation',
    headline: 'Wallpaper websites where seamless pattern matching wins the job.',
    subhead:
      'Quote accent walls and commercial vinyl by the roll or square foot, book installation dates online, and collect payment the moment the paper is hung.',
    pains: [
      { title: 'Quote by the roll or square foot', body: 'Calculate paper requirements, pattern repeats, and prep work into clear, itemized quotes on site.' },
      { title: 'Lock dates with a deposit', body: 'Hold installation windows so your schedule stays reliable and designers lock in your time.' },
      { title: 'High-end design showcase', body: 'Photo galleries displaying luxury grasscloth, complex murals, and commercial vinyl build instant designer trust.' },
    ],
    services: ['Residential wallpaper hanging', 'Accent walls & powder rooms', 'Murals & panoramic wallcovering', 'Grasscloth & specialty materials', 'Commercial vinyl wallcovering', 'Wallpaper removal & wall prep'],
    templateIds: ['coat', 'modern'],
    metaTitle: 'Website & Software for Wallpaper Installers',
    metaDescription:
      'A wallpaper installer website with per-roll quotes, online booking, project galleries, and Stripe payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['painters', 'drywall'],
  },
  {
    slug: 'bin-cleaning',
    name: 'Trash Bin Cleaning Services',
    work: 'trash & dumpster bin cleaning',
    headline: 'Bin-cleaning websites that keep curbside recurring routes full.',
    subhead:
      'Sell monthly, bi-monthly, and quarterly can sanitizing plans that bill cards on file automatically on trash day without administrative headaches.',
    pains: [
      { title: 'Recurring route billing on autopilot', body: 'Subscribers are auto-charged per visit or monthly, syncing seamlessly with your neighborhood trash route.' },
      { title: 'Curbside instant signups', body: 'Neighborhood homeowners scan a QR code or visit your site to choose their schedule and enter card details in under 2 minutes.' },
      { title: 'Automated service day reminders', body: 'SMS notifications alert homeowners to leave cans out after trash pickup for immediate washing.' },
    ],
    services: ['Curbside trash bin cleaning', 'Recycle bin sanitizing', 'Yard waste can washing', 'Commercial dumpster deodorizing', 'HOA community cleanouts', 'High-pressure wash & sanitize'],
    templateIds: ['shine', 'handy'],
    metaTitle: 'Website & Software for Trash Bin Cleaners',
    metaDescription:
      'A trash bin cleaning website with recurring route billing, online signups, and Stripe card-on-file payments. Plans start at $0/month with Flex.',
    relatedSlugs: ['pressure-washing', 'cleaning-services'],
  },
  {
    slug: 'solar-panel-cleaning',
    name: 'Solar Panel Cleaning Companies',
    work: 'solar panel cleaning & bird proofing',
    headline: 'Solar cleaning websites that book recurring washes and critter guards.',
    subhead:
      'Quote pure deionized water panel washes by panel count, quote critter mesh guard installations on-site, and auto-bill seasonal maintenance plans.',
    pains: [
      { title: 'Quote by panel count instantly', body: 'Price 15, 30, or 50 panel systems with optional second-story or steep roof add-ons in seconds.' },
      { title: 'High-ticket bird guard upsells', body: 'Send branded quotes for critter mesh and pigeon proofing right from the roof edge and get them e-signed.' },
      { title: 'Seasonal cleaning memberships', body: 'Keep solar arrays generating peak output with bi-annual recurring wash plans that charge automatically.' },
    ],
    services: ['Deionized pure water washing', 'Bird proofing & critter guards', 'Pigeon nest removal & sanitize', 'Thermal imaging inspection', 'Commercial rooftop solar cleaning', 'Bi-annual maintenance plans'],
    templateIds: ['shine', 'carbon'],
    metaTitle: 'Website & Software for Solar Panel Cleaners',
    metaDescription:
      'A solar panel cleaning website with per-panel estimates, bird proofing quotes, recurring billing, and Stripe. Plans start at $0/month with Flex.',
    relatedSlugs: ['solar', 'window-cleaning', 'gutters'],
  },
  {
    slug: 'mobile-mechanics',
    name: 'Mobile Mechanics',
    work: 'mobile auto repair',
    headline: 'Mobile mechanic websites that book the driveway repair and get paid on site.',
    subhead:
      'Book diagnostics and routine services online, send itemized repair quotes from the driveway, and collect card or tap-to-pay before packing your tools.',
    pains: [
      { title: 'Book diagnostic windows online', body: 'Customers select their vehicle year/make/model and grab an open arrival window without endless phone tag.' },
      { title: 'Quote repairs in the driveway', body: 'Build branded quotes with parts and labor markups on your phone and get instant customer approval.' },
      { title: 'Tap-to-pay at the vehicle', body: 'Accept credit card, debit, or Apple Pay the second the repair is tested—no chasing invoices later.' },
    ],
    services: ['Mobile diagnostics & check engine', 'Brake pad & rotor replacement', 'Battery, starter & alternator', 'Spark plugs & ignition coils', 'Serpentine belts & cooling', 'Pre-purchase vehicle inspections'],
    templateIds: ['fixit', 'carbon'],
    metaTitle: 'Website & Software for Mobile Mechanics',
    metaDescription:
      'A mobile mechanic website with online booking, driveway estimates, tap-to-pay, and Stripe payments. Plans start at $0/month with Flex.',
    payer: 'customer',
    relatedSlugs: ['auto-detailing', 'appliance-repair'],
  },
  {
    slug: 'paintless-dent-repair',
    name: 'Paintless Dent Repair Services',
    work: 'paintless dent repair',
    headline: 'PDR websites that turn door dings and hail storms into booked jobs.',
    subhead:
      'Let customers upload photos for quick estimates, quote door dings and hail damage on-site, and collect card or tap-to-pay the moment the panel is smooth.',
    pains: [
      { title: 'Photo estimate intake 24/7', body: 'Customers snap and upload dent photos online so you can quote ballparks before driving to the vehicle.' },
      { title: 'Handle hail catastrophe surges', body: 'Storm response lead capture qualifies multi-panel hail claims and queues estimates efficiently.' },
      { title: 'Instant tap-to-pay on site', body: 'Take payment immediately after massaging out the dent at the customer’s home or workplace.' },
    ],
    services: ['Door ding & dent removal', 'Hail damage restoration', 'Crease & body line repair', 'Bumper dent repair', 'Lease return dent touch-ups', 'Mobile & shop-based PDR'],
    templateIds: ['carbon', 'shine'],
    metaTitle: 'Website & Software for Paintless Dent Repair',
    metaDescription:
      'A paintless dent repair website with photo estimates, mobile booking, tap-to-pay, and Stripe payments. Plans start at $0/month with Flex.',
    payer: 'customer',
    relatedSlugs: ['auto-detailing', 'mobile-mechanics'],
  },
  {
    slug: 'window-tinting',
    name: 'Window Tinting & PPF Services',
    work: 'window tinting & paint protection',
    headline: 'Window tinting websites where film packages and booking convert.',
    subhead:
      'Showcase ceramic tint and PPF packages, let customers book vehicle slots online with deposits, and turn one car into a lifelong enthusiast client.',
    pains: [
      { title: 'Tiered package selection (Carbon/Ceramic)', body: 'Customers pick their film quality, shade percentage, and coverage areas with instant price calculation.' },
      { title: 'Deposits to hold shop bays', body: 'Require a deposit at online booking to prevent no-shows from leaving your film plotter and bay idle.' },
      { title: 'Showcase flawless installs', body: 'High-gloss photos and video galleries highlight clean edges, ceramic gloss, and rock-chip protection.' },
    ],
    services: ['Ceramic automotive window tint', 'Carbon & dyed window film', 'Paint Protection Film (PPF)', 'Ceramic paint coating', 'Residential window tinting', 'Commercial architectural film'],
    templateIds: ['carbon', 'shine'],
    metaTitle: 'Website & Software for Window Tinting & PPF',
    metaDescription:
      'A window tinting website with package selectors, bay booking, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    payer: 'customer',
    relatedSlugs: ['auto-detailing', 'paintless-dent-repair'],
  },
  {
    slug: 'marine-services',
    name: 'Marine & Boat Services',
    work: 'marine service & boat detailing',
    headline: 'Marine service websites that book dockside repairs and seasonal routes.',
    subhead:
      'Quote hull detailing, winterization, and marine electronics by vessel length, take deposits on heavy service, and keep boaters on seasonal maintenance.',
    pains: [
      { title: 'Quote by vessel length and boat type', body: 'Calculate gelcoat oxidation removal, wash packages, and bottom paint by linear foot in seconds.' },
      { title: 'Fill seasonal spring & fall routes', body: 'Online booking packs your winterization, shrink-wrapping, and spring commissioning calendar before the frost.' },
      { title: 'Get paid dockside', body: 'Send digital payment links or take cards right at the slip or marina with instant Stripe settlement.' },
    ],
    services: ['Gelcoat restoration & ceramic', 'Hull washing & waxing', 'Winterization & shrink-wrap', 'Spring commissioning', 'Marine electronics & audio', 'Outboard & engine maintenance'],
    templateIds: ['shine', 'professional'],
    metaTitle: 'Website & Software for Boat & Marine Services',
    metaDescription:
      'A marine service website with per-foot boat quotes, seasonal booking, deposits, and Stripe payments. Plans start at $0/month with Flex.',
    payer: 'customer',
    relatedSlugs: ['auto-detailing', 'mobile-mechanics'],
  },
];

export function getTrade(slug: string): Trade | undefined {
  return TRADES.find((trade) => trade.slug === slug);
}

/**
 * "an appliance repair business", not "a appliance repair business".
 *
 * The trade template renders "Everything a {work} business needs" for all
 * trades, and eight of the `work` nouns begin with a vowel sound — appliance
 * repair, auto detailing, electrical work, epoxy & floor coatings, excavation &
 * grading, HVAC, insulation, irrigation & sprinklers. Every one of those pages
 * shipped the wrong article, twice per page.
 *
 * The rule is about SOUND and not spelling, which is why this is a function and
 * not `/^[aeiou]/`:
 *
 *   - An all-caps initialism is read letter by letter, so the article follows
 *     the name of the FIRST LETTER: "an HVAC business" (aitch), "an SBA loan"
 *     (ess). H, F, L, M, N, R, S and X all sound out with a leading vowel.
 *   - A leading "u" that says /juː/ takes "a": a uniform, a utility trailer, a
 *     used truck. None of the current trades hit this, which is exactly why it is
 *     guarded — the fiftieth trade should not have to rediscover it.
 */
const VOWEL_SOUND_LETTERS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);
const CONSONANT_SOUND_START = /^(uni|use|usu|uti|ubi|eu|one)/i;

export function indefiniteArticle(phrase: string): 'a' | 'an' {
  const word = phrase.trim().split(/[\s&/-]+/)[0] ?? '';
  if (!word) return 'a';
  if (/^[A-Z]{2,}$/.test(word)) return VOWEL_SOUND_LETTERS.has(word[0]) ? 'an' : 'a';
  if (CONSONANT_SOUND_START.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * Trade names lowercased for mid-sentence use, without flattening acronyms.
 *
 * `trade.name.toLowerCase()` gave "For hvac contractors" and "Built around what
 * hvac contractors actually struggle with" on the one page whose visitors are
 * most likely to notice. A word that is already all caps is an initialism and
 * keeps its case; everything else lowercases as before.
 */
export function lowerTradeName(name: string): string {
  return name
    .split(' ')
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

/** Who pays, for the "pay only when a ___ pays you" line. See Trade.payer. */
export function tradePayer(trade: Trade): string {
  return trade.payer ?? 'homeowner';
}

// The flagship dozen shown on the homepage "Built for your trade" row (in this
// order); the full list lives on the /for index. Keep every slug valid — a typo
// would silently drop a trade from the homepage.
export const FEATURED_TRADE_SLUGS = [
  'roofers', 'plumbers', 'electricians', 'hvac', 'landscapers', 'painters',
  'remodelers', 'handyman', 'cleaning-services', 'concrete', 'fencing', 'flooring',
];

export const FEATURED_TRADES: Trade[] = FEATURED_TRADE_SLUGS
  .map(getTrade)
  .filter((trade): trade is Trade => Boolean(trade));

const HIGH_TICKET_TRADES = new Set([
  'roofers',
  'remodelers',
  'general-contractors',
  'solar-installers',
  'pool-builders',
  'custom-home-builders',
  'siding-contractors',
  'deck-builders',
  'kitchen-bath',
  'framing-contractors',
  'excavation',
]);

const MID_TICKET_TRADES = new Set([
  'hvac',
  'electricians',
  'plumbers',
  'painters',
  'flooring',
  'concrete',
  'fencing',
  'masonry',
  'tree-service',
  'landscapers',
  'asphalt-paving',
  'epoxy-flooring',
  'drywall-contractors',
  'cabinet-makers',
  'insulation',
  'water-damage-restoration',
]);

export function getTradeEconomics(trade: Trade): TradeEconomics {
  const activeMonths = trade.seasonality?.activeMonthsPerYear ?? 12;

  if (trade.economics) {
    return {
      ...trade.economics,
      activeMonthsPerYear: trade.economics.activeMonthsPerYear ?? activeMonths,
      quickStopActiveMonthsPerYear:
        trade.economics.quickStopActiveMonthsPerYear ?? trade.economics.activeMonthsPerYear ?? activeMonths,
    };
  }

  if (HIGH_TICKET_TRADES.has(trade.slug)) {
    return {
      avgTicket: 11500,
      typicalMonthlyVolume: 46000,
      typicalJobsPerMonth: 4,
      quickStopMonthlyBonus: 3200,
      activeMonthsPerYear: activeMonths,
      quickStopActiveMonthsPerYear: activeMonths,
    };
  }

  if (MID_TICKET_TRADES.has(trade.slug)) {
    return {
      avgTicket: 1850,
      typicalMonthlyVolume: 28000,
      typicalJobsPerMonth: 15,
      quickStopMonthlyBonus: 2400,
      activeMonthsPerYear: activeMonths,
      quickStopActiveMonthsPerYear: activeMonths,
    };
  }

  // Standard / Service / Maintenance trades
  return {
    avgTicket: 420,
    typicalMonthlyVolume: 16000,
    typicalJobsPerMonth: 38,
    quickStopMonthlyBonus: 1600,
    activeMonthsPerYear: activeMonths,
    quickStopActiveMonthsPerYear: activeMonths,
  };
}
