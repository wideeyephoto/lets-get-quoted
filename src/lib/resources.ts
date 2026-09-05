// Marketing resource center (/resources and /guides). Evergreen, genuinely useful articles
// for contractors — written honestly, with soft, truthful ties to the product
// where relevant. Body is structured blocks so it renders without a markdown
// dependency. Dates are static strings (no new Date at module load).

export type ArticleBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] };

/** A contextual link out of an article, into the product or another guide. */
export type ArticleLink = { href: string; label: string; blurb: string };

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  datePublished: string; // ISO date
  /**
   * ISO date, set BY HAND when an article is genuinely revised.
   */
  dateModified?: string;
  body: ArticleBlock[];
  /**
   * Where to go next inside the product. Contextual internal links rendered
   * under the article body.
   */
  featureLinks?: ArticleLink[];
};

export const ARTICLES: Article[] = [
  // --------------------------------------------------------------------------
  // Category: Pricing & profit
  // --------------------------------------------------------------------------
  {
    slug: 'price-a-job-for-real-margin',
    title: 'How to price a contracting job and keep the margin',
    excerpt:
      'Most contractors quote the labor and materials, win the job, and wonder where the profit went. Here’s how to price so the margin survives to the bank.',
    category: 'Pricing & profit',
    readMinutes: 5,
    datePublished: '2026-07-08',
    body: [
      { type: 'p', text: 'A job can be busy and still lose money. The usual culprit isn’t bad work — it’s a quote that covered the obvious costs and quietly skipped the rest. Here’s a simple way to price so the number you quote is a number you keep.' },
      { type: 'h2', text: 'Start from cost, not gut feel' },
      { type: 'p', text: 'Before you think about what to charge, add up what the job actually costs you to deliver. That’s materials, the labor hours at what you really pay (including the time nobody bills — loading, driving, cleanup), plus a slice of the overhead that keeps your business running whether or not you’re on a job.' },
      { type: 'ul', items: [
        'Materials, with a little waste factor built in',
        'Labor hours × your true loaded labor rate',
        'Subcontractors, dump fees, permits, equipment',
        'A share of overhead: truck, insurance, phone, software, your own time quoting',
      ] },
      { type: 'h2', text: 'Markup covers cost. Margin is what you keep.' },
      { type: 'p', text: 'These two get mixed up constantly, and it’s expensive. Marking up materials 20% does not give you a 20% profit margin. If your all-in cost on a job is $8,000 and you want to actually keep 30%, you don’t add 30% — you divide by 0.70 and quote about $11,430. The difference between “add 30%” and “keep 30%” is real money on every job.' },
      { type: 'h2', text: 'Track cost against the quote — every job' },
      { type: 'p', text: 'The only way to price better next time is to know what happened this time. Log materials and labor against the job as you go, so you can see the real margin before the invoice goes out — not discover it at tax time. A few jobs of honest tracking will tell you exactly which kinds of work make you money and which quietly don’t.' },
      { type: 'p', text: 'Let’s Get Quoted tracks labor and materials against every job and shows the margin live, and its quotes are itemized so you can price from your real costs. But the discipline matters more than the tool: quote from cost, keep margin instead of adding markup, and check the number afterward.' },
    ],
    featureLinks: [
      { href: '/features/quotes', label: 'Itemized quotes', blurb: 'Price from a saved cost book, line by line, and get it e-signed.' },
      { href: '/features/cash-flow', label: 'Cash flow & margin', blurb: 'Watch labor and materials land against the quote while the job runs.' },
      { href: '/pricing', label: 'What the platform costs', blurb: 'The fee that comes off a payment, with a calculator.' },
    ],
  },
  {
    slug: 'good-better-best-quoting-guide',
    title: 'Good, Better, Best quotes: How to lift average ticket size',
    excerpt:
      'Sending a single price forces a yes-or-no decision. Presenting three clear options turns it into "which tier fits us best?"',
    category: 'Pricing & profit',
    readMinutes: 6,
    datePublished: '2026-08-10',
    body: [
      { type: 'p', text: 'When you send a homeowner a single number, their only decision is whether to hire you or keep shopping. When you present three curated options — Good, Better, and Best — you change the question from “Should we do this?” to “Which level of quality do we want?”' },
      { type: 'h2', text: 'Why single-price quotes leave money on the table' },
      { type: 'p', text: 'About 20% of homeowners are looking for the absolute minimum to solve an immediate problem. Another 15% want the premium, top-tier materials and extended warranties, no matter the price. The remaining 65% want the sweet spot in the middle. If you only quote the middle, you lose the budget shopper and under-sell the premium buyer.' },
      { type: 'h2', text: 'Structuring your 3 tiers' },
      { type: 'ul', items: [
        'Good (Baseline): Meets code, uses dependable builder-grade materials, covers standard warranty. Anchors the project affordably.',
        'Better (The Sweet Spot): Upgraded durability, architectural styling, enhanced efficiency, and extended workmanship guarantee. This is the option 60%+ will choose.',
        'Best (Premium Executive): Premium architectural brand, lifetime transferable warranty, priority scheduling, and annual maintenance inspection included.',
      ] },
      { type: 'h2', text: 'The rule of clear distinctions' },
      { type: 'p', text: 'Never make tiers confusing with technical jargon. Highlight the tangible outcome: longevity, quietness, aesthetic finish, or warranty duration. If the difference between Good and Better isn’t clear in 10 seconds of scanning, the customer will default to the cheapest option.' },
      { type: 'p', text: 'Let’s Get Quoted lets contractors build multi-tier quotes in one click, presenting side-by-side interactive packages where customers can select their tier and e-sign directly on their phone.' },
    ],
    featureLinks: [
      { href: '/features/quotes', label: 'Tiered quote builder', blurb: 'Present side-by-side packages and let homeowners choose and sign online.' },
      { href: '/features/client-portal', label: 'Interactive client approvals', blurb: 'See what option your customer picked before you order materials.' },
    ],
  },
  {
    slug: 'markup-vs-margin-calculator-guide',
    title: 'Markup vs. Margin: The contractor’s pricing cheat sheet',
    excerpt:
      'Confusing markup with margin is the #1 math mistake that costs contractors profit. Here is the formula to always price accurately.',
    category: 'Pricing & profit',
    readMinutes: 5,
    datePublished: '2026-08-12',
    body: [
      { type: 'p', text: 'If your total job cost is $1,000 and you mark it up by 30%, you charge $1,300. But $300 profit divided by your $1,300 revenue is only 23% profit margin — not 30%. That 7% shortfall comes straight out of your pocket.' },
      { type: 'h2', text: 'The mathematical difference' },
      { type: 'p', text: 'Markup is the percentage added to your costs. Margin is the percentage of total selling price that remains as gross profit. Because margin is calculated against the higher selling price, your required markup percentage must always be significantly higher than your target margin.' },
      { type: 'ul', items: [
        'Target 20% Margin = Need 25.0% Markup (Cost × 1.25)',
        'Target 30% Margin = Need 42.9% Markup (Cost ÷ 0.70)',
        'Target 40% Margin = Need 66.7% Markup (Cost ÷ 0.60)',
        'Target 50% Margin = Need 100.0% Markup (Cost × 2.00)',
      ] },
      { type: 'h2', text: 'The Margin Formula: Divide, never multiply' },
      { type: 'p', text: 'To hit a target gross margin percentage, use this formula: Quote Price = Total Direct Cost ÷ (1 - Desired Margin). For example, if direct labor and materials equal $4,500 and your target margin is 35%: $4,500 ÷ 0.65 = $6,923.' },
      { type: 'h2', text: 'Accounting for unbillable overhead' },
      { type: 'p', text: 'Gross margin must cover your vehicle payments, general liability insurance, software, marketing, tools, and office salaries before you take a penny in net profit. If your business overhead runs at 18% of revenue, pricing at a 20% gross margin leaves you with a paper-thin 2% net profit margin.' },
    ],
    featureLinks: [
      { href: '/features/cash-flow', label: 'Live margin tracker', blurb: 'Calculate real margin automatically on every estimate line item.' },
      { href: '/pricing', label: 'Zero monthly fee structure', blurb: 'Keep overhead low with pay-on-payment pricing.' },
    ],
  },
  {
    slug: 'building-contractor-cost-catalog',
    title: 'How to build a line-item cost catalog to quote 5x faster',
    excerpt:
      'Re-calculating the same breaker panel, shingle square, or pipe from scratch wastes hours. Here’s how to build a modular price book.',
    category: 'Pricing & profit',
    readMinutes: 5,
    datePublished: '2026-08-15',
    body: [
      { type: 'p', text: 'Estimating from scratch on every lead is exhausting and error-prone. One day you forget to include fasteners; the next day you undercount labor hours. Building a modular line-item catalog turns quoting into a 2-minute assembly task.' },
      { type: 'h2', text: 'Unitize your most frequent assemblies' },
      { type: 'p', text: 'Instead of listing every individual wire nut, nail, and fitting, bundle items into repeatable assemblies based on standard units of measure (per linear foot, per square, per fixture, or per room).' },
      { type: 'ul', items: [
        'Materials package cost (unit price + 10% scrap/waste factor)',
        'Standard installation labor hours per unit',
        'Direct equipment allowance (e.g. lift rental, disposal fee per ton)',
      ] },
      { type: 'h2', text: 'Review and update pricing quarterly' },
      { type: 'p', text: 'Supply houses adjust material pricing constantly. Set a calendar reminder on the first of every quarter to check your top 20 high-volume items with your distributors and update catalog baselines so inflation doesn’t eat your margin.' },
      { type: 'p', text: 'Let’s Get Quoted provides saved item templates with preset costs and margins, letting contractors build custom quotes with accurate math in seconds.' },
    ],
    featureLinks: [
      { href: '/features/quotes', label: 'Saved line item catalog', blurb: 'Assemble professional quotes in seconds with pre-built cost assemblies.' },
    ],
  },

  // --------------------------------------------------------------------------
  // Category: Getting leads
  // --------------------------------------------------------------------------
  {
    slug: 'stop-losing-leads',
    title: '7 ways contractors lose leads — and how to plug each one',
    excerpt:
      'You paid for the lead one way or another. Here are the seven quiet places good leads leak out, and a fix for each.',
    category: 'Getting leads',
    readMinutes: 6,
    datePublished: '2026-07-15',
    body: [
      { type: 'p', text: 'Most contractors don’t have a lead problem so much as a leak problem. The calls and form fills come in — they just slip away before they turn into signed work. Here are the seven most common leaks and how to close them.' },
      { type: 'h2', text: '1. You answer too slowly' },
      { type: 'p', text: 'Fast responses improve your chances of winning the job. If a homeowner fills out your form at 8pm and hears back in two days, they’ve often already booked someone else. An instant estimate or an auto-reply that sets expectations buys you the time to follow up properly.' },
      { type: 'h2', text: '2. No price, no trust' },
      { type: 'p', text: 'Homeowners are nervous about calling because they’re afraid of the unknown number. Giving a realistic ballpark up front — even a range — lowers the barrier to reaching out and filters out the people who were never going to hire you anyway.' },
      { type: 'h2', text: '3. The lead lands nowhere' },
      { type: 'p', text: 'If leads arrive as scattered texts, emails, and voicemails, some will get buried. Every lead needs one place to live, with a status, so nothing goes cold by accident.' },
      { type: 'h2', text: '4. You treat every lead the same' },
      { type: 'p', text: 'A $40,000 remodel and a “just researching” low-intent shopper don’t deserve the same response time. Sort leads by value so the big ones get your attention first and the noise doesn’t interrupt your day.' },
      { type: 'h2', text: '5. You quote once and never follow up' },
      { type: 'p', text: 'Plenty of jobs are won on the second or third touch. A homeowner who didn’t reply isn’t always a no — often they got busy. A polite nudge a couple of days later recovers a surprising number of jobs.' },
      { type: 'h2', text: '6. Booking is a phone-tag marathon' },
      { type: 'p', text: 'Every round of “what day works for you?” is a chance to lose momentum. Letting a customer pick an open window themselves closes the gap between interested and booked.' },
      { type: 'h2', text: '7. You never ask past customers back' },
      { type: 'p', text: 'Your warmest leads are people who already paid you. A simple reminder to a customer whose last job was months ago costs very little and books work no ad can match.' },
      { type: 'p', text: 'You don’t need a tool to fix most of these — you need a habit. But if you want the habits handled for you, instant estimates, lead sorting, follow-ups, self-scheduling, and rebook reminders are all part of Let’s Get Quoted.' },
    ],
    featureLinks: [
      { href: '/features/ai-intake', label: 'AI intake & lead scoring', blurb: 'Qualify a request at 8pm and rank it before you read it.' },
      { href: '/how-it-works', label: 'How lead ranking works', blurb: 'What decides that a job deserves an answer now.' },
      { href: '/features/scheduling', label: 'Self-scheduling', blurb: 'Let a customer take an open window instead of trading calls.' },
    ],
  },
  {
    slug: 'speed-to-lead-contractor-playbook',
    title: 'Speed-to-lead: Why answering in 5 minutes wins 70% of jobs',
    excerpt:
      'Contractors who respond within 5 minutes are 21x more likely to qualify and close the lead. Here’s how to automate rapid responses.',
    category: 'Getting leads',
    readMinutes: 5,
    datePublished: '2026-08-16',
    body: [
      { type: 'p', text: 'Homeowners rarely submit a form to just one contractor. In most cases, they submit requests to three or four companies in a single sitting. The contractor who acknowledges the request first establishes an immediate psychological advantage.' },
      { type: 'h2', text: 'The decay curve of an uncontacted lead' },
      { type: 'p', text: 'Data across thousands of home service transactions shows that lead conversion drops by nearly 400% after 30 minutes, and by over 800% after 2 hours. After 24 hours, the lead has usually scheduled an on-site visit with your competitor.' },
      { type: 'h2', text: 'Automating the first touch without sounding like a robot' },
      { type: 'ul', items: [
        'Send an instant two-way SMS acknowledgement within 60 seconds.',
        'Reference the specific project type they inquired about.',
        'Offer an instant estimate or direct link to choose an available consultation slot.',
        'Include your contractor license number and insurance confirmation for immediate trust.',
      ] },
      { type: 'h2', text: 'Handling calls when you are on a ladder' },
      { type: 'p', text: 'You can’t always answer the phone when you are swinging a hammer or crawling under a house. Setting up an automated missed-call text back ensures that every caller receives an instant text explaining you are on a job site and giving them an immediate link to submit photos and details.' },
    ],
    featureLinks: [
      { href: '/features/ai-intake', label: 'Instant SMS lead intake', blurb: 'Engage inbound leads with intelligent SMS auto-replies in under 60 seconds.' },
      { href: '/features/scheduling', label: 'Instant booking links', blurb: 'Allow qualified prospects to lock in appointment windows immediately.' },
    ],
  },
  {
    slug: 'after-hours-instant-estimates',
    title: 'How to capture after-hours leads with instant estimates',
    excerpt:
      'Over 48% of home service research happens between 7pm and 11pm. Turn night-owl website visitors into high-intent quotes while you sleep.',
    category: 'Getting leads',
    readMinutes: 4,
    datePublished: '2026-08-18',
    body: [
      { type: 'p', text: 'When homeowners relax on their couch after work, they search for fence repairs, electrical upgrades, or bathroom remodels. If your website only offers a generic “contact us for a quote” form, they bounce to someone who gives them immediate feedback.' },
      { type: 'h2', text: 'Why ballpark estimates build trust' },
      { type: 'p', text: 'Giving an interactive estimated range (e.g. $3,200 – $4,100 based on square footage and material grade) does not lock you into a final price. It demonstrates transparency, filters out unqualified tire-kickers, and gives genuine buyers the confidence to submit their contact info.' },
      { type: 'h2', text: 'The three questions that qualify after-hours leads' },
      { type: 'ul', items: [
        'Scope metric: Linear feet, square footage, or fixture count',
        'Timeline expectation: Emergency/immediate vs. within 30 days',
        'Photo upload: Encourage them to snap a quick photo of the current condition',
      ] },
      { type: 'p', text: 'Let’s Get Quoted includes an interactive Instant Estimate calculator built into your free contractor website, capturing verified customer details automatically.' },
    ],
    featureLinks: [
      { href: '/features/website-builder', label: 'AI website with instant estimates', blurb: 'Get a contractor website with interactive price calculators built in.' },
    ],
  },
  {
    slug: 'local-seo-google-maps-contractors',
    title: 'Local SEO: How contractors rank #1 in Google Maps',
    excerpt:
      'The Google Maps 3-Pack is the most valuable digital real estate for any local trade. Here are the 5 ranking signals you can control today.',
    category: 'Getting leads',
    readMinutes: 6,
    datePublished: '2026-08-20',
    body: [
      { type: 'p', text: 'Over 60% of clicks on mobile home service searches go to the top three Google Map results (the “Local 3-Pack”). You do not need to spend thousands on Google Ads to appear there; Google ranks local profiles based on proximity, relevance, and prominence.' },
      { type: 'h2', text: '1. Optimize your Google Business Profile categories' },
      { type: 'p', text: 'Your Primary Category carries 60%+ of your categorical ranking weight. Make sure your primary category matches your main service (e.g., “Plumber” or “Roofing Contractor”) and add specific secondary categories for sub-specialties.' },
      { type: 'h2', text: '2. Keep Name, Address, and Phone (NAP) strictly consistent' },
      { type: 'p', text: 'Ensure your business name, street address, and phone number are formatted identically across your website, state licensing board, Yelp, Facebook, and local directories.' },
      { type: 'h2', text: '3. Upload weekly geotagged job photos' },
      { type: 'p', text: 'Google loves fresh visual activity. Uploading 3–5 real job site photos every week signals to Google’s algorithm that your company is actively completing work in the local service area.' },
      { type: 'h2', text: '4. Embed Schema.org LocalBusiness structured data' },
      { type: 'p', text: 'Your website must include proper JSON-LD LocalBusiness metadata stating your service areas, operating hours, accepted payment methods, and licensing.' },
    ],
    featureLinks: [
      { href: '/features/website-builder', label: 'SEO-ready contractor websites', blurb: 'Every Let’s Get Quoted site ships with built-in Schema.org LocalBusiness structured data.' },
      { href: '/features/reviews', label: 'Google review automation', blurb: 'Generate a steady stream of authentic reviews to boost map rank.' },
    ],
  },

  // --------------------------------------------------------------------------
  // Category: Getting paid
  // --------------------------------------------------------------------------
  {
    slug: 'deposits-and-payment-plans',
    title: 'Deposits and payment plans that don’t scare customers',
    excerpt:
      'Asking for money up front feels awkward until you frame it right. How to use deposits and installments to protect your cash and win bigger jobs.',
    category: 'Getting paid',
    readMinutes: 5,
    datePublished: '2026-07-22',
    body: [
      { type: 'p', text: 'Cash flow kills more contracting businesses than slow sales do. You front the materials, you make payroll, and then you wait weeks for a check. Deposits and payment plans fix that — and, framed right, they make customers more comfortable, not less.' },
      { type: 'h2', text: 'Why a deposit is normal, not pushy' },
      { type: 'p', text: 'A deposit isn’t you being difficult — it’s standard practice that protects both sides. It confirms the customer is serious, covers your upfront material cost, and locks the date so a no-show doesn’t cost you a crew day. Most homeowners expect it. The trick is to tie it to something concrete: “The deposit reserves your spot and covers materials; the balance is due on completion.”' },
      { type: 'h2', text: 'Gate the schedule on it' },
      { type: 'p', text: 'The cleanest way to make deposits stick is to require one before the job goes on the calendar. No awkward chasing — the booking simply isn’t confirmed until the deposit is paid. It sounds firm, but customers read it as organized and professional.' },
      { type: 'h2', text: 'Payment plans win the big jobs' },
      { type: 'p', text: 'On a large project, sticker shock loses sales. Breaking the total into a deposit plus a few fixed installments can make a $12,000 job easier for a customer to budget. The mechanism is simple: split an approved balance into scheduled, 0%-interest installments charged to a saved card. Whether an arrangement like that creates financing or disclosure obligations depends on your state and how you present it — worth checking with your own advisor before you offer it.' },
      { type: 'ul', items: [
        'Ask for a deposit that at least covers your materials',
        'Tie the balance to a milestone: completion, or a stage',
        'For big jobs, offer a deposit plus fixed installments',
        'Never mark a job “paid” until the money actually clears',
      ] },
      { type: 'p', text: 'Let’s Get Quoted handles all of this on Stripe — deposits, stage payments, and 0%-interest payment plans that auto-charge — with the money paying out straight to your bank. But the principle stands on its own: ask for a fair deposit, gate the schedule on it, and make big jobs easy to say yes to.' },
    ],
    featureLinks: [
      { href: '/features/payments', label: 'Deposits & payment plans', blurb: 'Stage payments and 0%-interest installments on a saved card.' },
      { href: '/features/scheduling', label: 'Gate the calendar on a deposit', blurb: 'A booking that is not confirmed until the deposit clears.' },
      { href: '/features/cash-flow', label: 'Cash flow', blurb: 'What is owed, what has cleared, and what is due next.' },
    ],
  },
  {
    slug: 'gate-schedule-on-deposits',
    title: 'Why you should never schedule before the deposit clears',
    excerpt:
      'Holding a calendar date on verbal promise costs you money when a homeowner reschedules. Here is how gating the schedule protects your crew.',
    category: 'Getting paid',
    readMinutes: 4,
    datePublished: '2026-08-21',
    body: [
      { type: 'p', text: 'Every time you write a job onto your whiteboard or calendar without collecting a deposit, you are taking 100% of the financial and scheduling risk. If the homeowner decides to delay or shop around, your crew sits idle on Monday morning.' },
      { type: 'h2', text: 'The psychology of calendar gating' },
      { type: 'p', text: 'When you tell a customer, “We will hold your installation slot for 48 hours while your deposit link is active, after which the slot opens to our queue,” you introduce healthy urgency. Serious buyers pay immediately; non-serious buyers filter themselves out without wasting your crew’s time.' },
      { type: 'h2', text: 'Setting standard deposit thresholds' },
      { type: 'ul', items: [
        'Service calls under $1,000: Full payment pre-authorized or $150 dispatch deposit.',
        'Projects $1,000 – $10,000: 30% to 50% deposit upon quote acceptance.',
        'Major projects $10,000+: 33% initial deposit, 33% at rough-in stage, 34% upon final completion.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted lets you automatically lock scheduling calendar dates to successful Stripe payment intents, confirming bookings only after funds clear.' },
    ],
    featureLinks: [
      { href: '/features/scheduling', label: 'Deposit-gated scheduling', blurb: 'Only confirm calendar dates once upfront deposits clear.' },
      { href: '/features/payments', label: 'Instant Stripe payouts', blurb: 'Receive customer deposit payments directly into your business bank account.' },
    ],
  },
  {
    slug: 'card-on-file-contractor-billing',
    title: 'Card-on-file billing: Get paid the minute the crew packs up',
    excerpt:
      'Chasing unpaid invoices for 30–60 days ruins your working capital. Learn how pre-authorized card-on-file billing eliminates accounts receivable.',
    category: 'Getting paid',
    readMinutes: 5,
    datePublished: '2026-08-22',
    body: [
      { type: 'p', text: 'The traditional contracting billing cycle is broken: finish the job, drive home, write an invoice on the weekend, email it, and wait 30 days hoping a check arrives in the mail. Card-on-file billing changes this completely.' },
      { type: 'h2', text: 'How card-on-file works legally and professionally' },
      { type: 'p', text: 'When a customer approves your quote and pays the deposit via Stripe, their payment method is securely tokenized. Your agreement states that upon job walk-through and completion sign-off, the remaining balance will be automatically charged to the card on file.' },
      { type: 'h2', text: 'Key steps to eliminate billing disputes' },
      { type: 'ul', items: [
        'Take clear before-and-after photos and attach them to the digital job record.',
        'Get the homeowner’s digital signature on the completion checklist.',
        'Send an automated receipt via text and email immediately when the card is charged.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted handles tokenized card storage through Stripe, enabling instant settlement without storing sensitive card numbers on your devices.' },
    ],
    featureLinks: [
      { href: '/features/payments', label: 'Secure card-on-file billing', blurb: 'Charge remaining balances automatically upon job completion.' },
      { href: '/features/cash-flow', label: 'Real-time receivables', blurb: 'Track revenue, fees, and instant payouts from a single dashboard.' },
    ],
  },
  {
    slug: 'offering-payment-plans-big-jobs',
    title: 'How to offer 0%-interest payment plans on $10,000+ jobs',
    excerpt:
      'Homeowners want the better system or higher-grade roof but hesitate at the lump sum. Here’s how installment plans turn shoppers into closed jobs.',
    category: 'Getting paid',
    readMinutes: 5,
    datePublished: '2026-08-23',
    body: [
      { type: 'p', text: 'A homeowner facing a sudden $14,000 HVAC replacement or full roof tear-off often freezes because they don’t have liquid cash available. Providing structured installment options removes friction and helps them say yes without waiting.' },
      { type: 'h2', text: 'In-house milestone installments vs. Third-party financing' },
      { type: 'p', text: 'Third-party consumer financing companies often charge contractors steep 6%–12% dealer fees (merchant discounts). Setting up structured milestone installments directly through your payment gateway lets you collect payments without giving away your profit margins.' },
      { type: 'h2', text: 'Standard 4-part installment structure' },
      { type: 'ul', items: [
        '25% Deposit upon contract signing (covers initial materials and scheduling)',
        '25% Milestone 1 upon commencement and demolition',
        '25% Milestone 2 upon rough-in or midpoint milestone inspection',
        '25% Final balance upon project completion walkthrough',
      ] },
      { type: 'p', text: 'With Let’s Get Quoted, you can split invoices into automated scheduled milestone installments that auto-debit the customer’s saved card on specified dates.' },
    ],
    featureLinks: [
      { href: '/features/payments', label: 'Milestone payment schedules', blurb: 'Split large project estimates into automatic milestone billing schedules.' },
    ],
  },

  // --------------------------------------------------------------------------
  // Category: Reputation
  // --------------------------------------------------------------------------
  {
    slug: 'more-google-reviews',
    title: 'How to get more Google reviews (the honest way)',
    excerpt:
      'Reviews are the cheapest marketing you have. Here’s how to earn more of them without gaming the system or annoying your customers.',
    category: 'Reputation',
    readMinutes: 4,
    datePublished: '2026-07-25',
    body: [
      { type: 'p', text: 'For a local contractor, Google reviews are worth more than almost any ad. They’re the first thing a homeowner checks, and a steady stream of recent reviews wins work. The good news: earning them is mostly about timing and asking.' },
      { type: 'h2', text: 'Ask at the peak moment' },
      { type: 'p', text: 'The best time to ask is right after the job wraps, while it’s fresh — not a week later when the memory has faded. A short, friendly message the same day, with a direct link to your Google profile, gets far more responses than “leave us a review sometime.”' },
      { type: 'h2', text: 'Make it one tap' },
      { type: 'p', text: 'Every extra step loses people. Send the review link by text so it’s one tap from their phone to the review box. Don’t make them search for your business or log into anything they don’t have to.' },
      { type: 'h2', text: 'Ask everyone the same way' },
      { type: 'p', text: 'Send every customer the same neutral review request. Give everyone access to the public-review option and a separate way to contact you directly — without changing the options based on their rating. Sorting customers by how happy they seem, and showing the public link only to the happy ones, is review gating however it is worded. Suppressing negative reviews or writing fake ones is worse. Earn the good ones; fix the bad experiences.' },
      { type: 'h2', text: 'Make it a routine, not a one-off' },
      { type: 'p', text: 'A single review push gives you a bump; a routine gives you a reputation. Ask after every completed job and it compounds. Automating the ask — a message that goes out on completion — is the difference between meaning to and actually doing it.' },
      { type: 'p', text: 'Let’s Get Quoted sends review requests automatically after a job and offers every customer both routes — the public review page and a private note to you — with no branching on what they rated. However you do it, the formula is the same: ask everyone, ask fast, make it one tap, and never fake it.' },
    ],
    featureLinks: [
      { href: '/features/reviews', label: 'Automatic review requests', blurb: 'The same neutral ask to every customer, on completion.' },
      { href: '/features/client-portal', label: 'The customer’s side', blurb: 'Where the ask lands, and what it looks like on a phone.' },
      { href: '/features/recurring', label: 'Rebook the ones who are due', blurb: 'Standing plans and reminders for work that repeats.' },
    ],
  },
  {
    slug: 'post-job-review-automation-playbook',
    title: 'The 3-step post-job review sequence homeowners answer',
    excerpt:
      'Asking once by email gets a 3% response rate. A 3-step automated text sequence timed to job completion routinely hits 25%+. Here is the blueprint.',
    category: 'Reputation',
    readMinutes: 4,
    datePublished: '2026-08-23',
    body: [
      { type: 'p', text: 'Most homeowners genuinely intend to leave a review, but everyday distractions get in the way. Creating a thoughtful, polite 3-step sequence makes it effortless for them to share their experience.' },
      { type: 'h2', text: 'Step 1: The Same-Day Completion Text (Hour 0)' },
      { type: 'p', text: 'Sent 15–30 minutes after your crew marks the job complete: “Hi [Name], thank you for having [Company] out today! We hope your new [Service] looks great. If you have 30 seconds, sharing a quick review on Google helps our local crew tremendously: [Direct Review Link]”' },
      { type: 'h2', text: 'Step 2: The Photo Attachment Follow-up (Day 2)' },
      { type: 'p', text: 'Sent 48 hours later, including the finished photos: “Hi [Name], here are the completed photos from your project for your home records! If you haven’t had a chance to share your feedback yet, we’d love your review: [Link]”' },
      { type: 'h2', text: 'Step 3: The Final Courtesy Check-in (Day 7)' },
      { type: 'p', text: 'A final gentle message: “Hi [Name], just checking in to make sure everything is performing perfectly with your [Service]. Have a great weekend!”' },
    ],
    featureLinks: [
      { href: '/features/reviews', label: 'Automated review sequences', blurb: 'Trigger customized SMS review requests automatically upon job completion.' },
    ],
  },
  {
    slug: 'how-to-respond-to-bad-contractor-reviews',
    title: 'How to respond to negative reviews and build credibility',
    excerpt:
      'A negative review isn’t the end of your business — how you publicly handle it determines whether prospective clients trust you or move on.',
    category: 'Reputation',
    readMinutes: 5,
    datePublished: '2026-08-24',
    body: [
      { type: 'p', text: 'Every contractor who does enough volume will eventually receive a dissatisfied review. Future customers reading your reviews aren’t just looking at the star rating — they are evaluating how mature, calm, and reasonable you are when something goes wrong.' },
      { type: 'h2', text: 'The Golden Rules of Public Replies' },
      { type: 'ul', items: [
        'Never argue, insult, or post private contract details publicly.',
        'Acknowledge the customer’s frustration with empathy.',
        'State your company’s standard of quality clearly.',
        'Take the conversation offline immediately by providing a direct owner phone number.',
      ] },
      { type: 'h2', text: 'The 4-sentence response template' },
      { type: 'p', text: '“Hi [Name], thank you for sharing your feedback. We hold our work to the highest standards, and we are disappointed to hear that your experience didn’t meet those expectations. We want to inspect this and make it right for you immediately. Please call me directly at [Owner Phone Number] so we can resolve this today. — [Owner Name], [Company]”' },
    ],
    featureLinks: [
      { href: '/features/reviews', label: 'Reputation dashboard', blurb: 'Monitor new Google reviews and reply with professional templates.' },
    ],
  },

  // --------------------------------------------------------------------------
  // Category: Operations & crew
  // --------------------------------------------------------------------------
  {
    slug: 'eliminate-phone-tag-self-scheduling',
    title: 'How to eliminate phone tag with automated arrival windows',
    excerpt:
      'Trading 5 phone calls back and forth just to book a 30-minute estimate wastes hours. Here’s how online self-scheduling solves it.',
    category: 'Operations & crew',
    readMinutes: 5,
    datePublished: '2026-08-24',
    body: [
      { type: 'p', text: 'Playing phone tag with homeowners to set up consultation times is one of the biggest friction points in contracting. By the time you agree on a slot, three days have passed and the lead has gone cold.' },
      { type: 'h2', text: 'Why 2-hour arrival windows beat exact times' },
      { type: 'p', text: 'Never promise an exact minute (e.g. 10:15am). Traffic, supply runs, and previous job overruns will make you late. Offering 2-hour arrival windows (e.g. 8am–10am, 10am–12pm, 1pm–3pm) gives your field crew operational breathing room while setting realistic expectations.' },
      { type: 'h2', text: 'Automated calendar buffer rules' },
      { type: 'ul', items: [
        'Set a minimum notice window (e.g. no same-day bookings within 4 hours).',
        'Add 30-minute drive time buffers between geographical zones.',
        'Cap the maximum number of estimates per day to protect production time.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted provides an integrated self-scheduling calendar where homeowners can pick open arrival windows synced to your real-time availability.' },
    ],
    featureLinks: [
      { href: '/features/scheduling', label: 'Automated self-scheduling', blurb: 'Allow homeowners to select arrival windows directly from your website or quote.' },
    ],
  },
  {
    slug: 'quick-stops-route-density',
    title: 'Quick-stops & route density: Squeeze 2 extra jobs a day',
    excerpt:
      'Driving 45 minutes across town for small repairs kills your day. Here’s how to cluster quick service stops along your primary route.',
    category: 'Operations & crew',
    readMinutes: 5,
    datePublished: '2026-08-25',
    body: [
      { type: 'p', text: 'Windshield time is pure unbillable waste. If your crew spends 2.5 hours every day driving between opposite corners of your service territory, you are losing tens of thousands of dollars in billable capacity each month.' },
      { type: 'h2', text: 'What is a Quick-Stop?' },
      { type: 'p', text: 'A Quick-Stop is a minor service, diagnostic, or tune-up job that takes 15–45 minutes to execute. Instead of dispatching a separate truck across town, you fit the quick stop between your primary major jobs based on geographic proximity.' },
      { type: 'h2', text: 'Strategies for building route density' },
      { type: 'ul', items: [
        'Geographic territory grouping: Schedule North side jobs on Tuesdays and South side jobs on Thursdays.',
        'Neighborhood alert broadcasts: Text past clients in a neighborhood when a crew is already scheduled on their street.',
        'Automated proximity matching: Flag new inbound inquiries that fall within 2 miles of an existing scheduled job.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted includes a dedicated Quick-Stops engine that automatically matches short service leads with nearby crew routes.' },
    ],
    featureLinks: [
      { href: '/features/quick-stops', label: 'Quick-Stops engine', blurb: 'Cluster short service jobs along active routes to maximize daily revenue.' },
    ],
  },

  // --------------------------------------------------------------------------
  // Category: Customer messaging
  // --------------------------------------------------------------------------
  {
    slug: 'contractor-10dlc-sms-compliance-guide',
    title: 'The contractor’s simple guide to 10DLC SMS registration',
    excerpt:
      'Cell carriers now block business text messages from unverified numbers. Here is everything you need to know to ensure your estimate texts arrive.',
    category: 'Customer messaging',
    readMinutes: 6,
    datePublished: '2026-08-25',
    body: [
      { type: 'p', text: 'If you use software to text quotes, invoices, or appointment reminders to customers, you must comply with A2P 10DLC (Application-to-Person 10-Digit Long Code) carrier regulations. Unregistered numbers face severe carrier filtering and message drops.' },
      { type: 'h2', text: 'What carriers require for TCR approval' },
      { type: 'p', text: 'The Campaign Registry (TCR) verifies that your business is legitimate and that your customers have given proper consent to receive text messages from your company.' },
      { type: 'ul', items: [
        'Valid legal business name and Employer Identification Number (EIN).',
        'A compliant website privacy policy explicitly stating customer phone numbers will not be shared or sold.',
        'Clear SMS terms and opt-in language on all web contact and estimate request forms.',
        'Automatic support for standard carrier opt-out keywords (STOP, CANCEL, UNSUBSCRIBE).',
      ] },
      { type: 'h2', text: 'How Let’s Get Quoted handles 10DLC for you' },
      { type: 'p', text: 'Let’s Get Quoted automates the entire SignalWire / TCR brand and campaign registry workflow, provisions dedicated business phone numbers, and formats compliant opt-in/opt-out handlers out of the box.' },
    ],
    featureLinks: [
      { href: '/sms-terms', label: 'Compliant SMS terms template', blurb: 'See our standard carrier-compliant SMS disclosure and opt-in language.' },
      { href: '/features/client-portal', label: 'Two-way SMS platform', blurb: 'Send verified customer messages with high carrier deliverability.' },
    ],
  },
  {
    slug: 'ai-phone-receptionist-guide',
    title: 'AI phone receptionists: Automate after-hours calls',
    excerpt:
      'Missing a homeowner call usually means losing the job to the next contractor on Google. Here is how 24/7 AI receptionists qualify leads without interruptions.',
    category: 'Customer messaging',
    readMinutes: 6,
    datePublished: '2026-08-26',
    body: [
      { type: 'p', text: 'When a homeowner with a burst pipe or a leaking roof calls three contractors, they hire the first one who answers. If you are on a ladder or running a crew, answering every call is impossible — but letting calls roll to voicemail means losing thousands in high-margin emergency jobs.' },
      { type: 'h2', text: 'Why traditional voicemail fails contractors' },
      { type: 'p', text: 'Over 75% of homeowners hang up rather than leave a voicemail. They search Google, tap the next phone number, and book with whoever answers. Traditional call centers are expensive, unfamiliar with your specific trade pricing, and often take days to relay lead details.' },
      { type: 'h2', text: 'How dedicated AI voice agents qualify leads live' },
      { type: 'p', text: 'An AI receptionist gives your contracting business a dedicated local phone line that answers on the first ring, 24/7. It listens intelligently, asks trade-specific qualification questions (job scope, location, urgency, property type), and filters out spam callers.' },
      { type: 'ul', items: [
        'Instant emergency triage: Escalates burst pipes or power outages straight to your mobile phone.',
        'Pricing guardrails: Gives approximate price ranges based on your pre-configured rate sheet.',
        'Automatic transcription & CRM sync: Logs caller details, audio recordings, and project scope directly onto your lead board.',
        'Instant SMS confirmation: Sends the homeowner a branded text with an online booking or estimate link before they call a competitor.',
      ] },
      { type: 'h2', text: 'Getting started with zero phone tree complexity' },
      { type: 'p', text: 'With Let’s Get Quoted, you can provision a verified 10DLC business number in 3 steps, set your business hours, and activate AI call answering without expensive PBX hardware or answering service retainers.' },
    ],
    featureLinks: [
      { href: '/features/ai-voice', label: '24/7 AI Receptionist', blurb: 'See how automated phone intake captures and qualifies homeowner leads.' },
      { href: '/dashboard/voice-calls', label: 'Voice Assistant settings', blurb: 'Configure call triage rules and provision your dedicated local number.' },
    ],
  },
  {
    slug: 'crew-gps-geofenced-timesheets-guide',
    title: 'Geofenced timesheets: Stop losing field labor margin',
    excerpt:
      'Travel time, inaccurate clock-ins, and messy routes eat away contractor margin. Here is how modern GPS geofencing and workbenches streamline field operations.',
    category: 'Operations & crew',
    readMinutes: 5,
    datePublished: '2026-08-26',
    body: [
      { type: 'p', text: 'Labor is almost always a contractor’s single largest and most variable expense. When crews write estimated hours on paper timesheets or text end-of-day guesses, payroll inflation quickly erodes job margins.' },
      { type: 'h2', text: 'The true cost of timesheet rounding' },
      { type: 'p', text: 'Rounding clock-in and clock-out times by just 15 minutes per worker per day adds up to over $1,800 in unbilled labor costs per technician annually. Multiply that across a 5-person crew, and you are losing nearly $10,000 every year on work that was never performed.' },
      { type: 'h2', text: 'How automated geofencing solves the problem' },
      { type: 'p', text: 'Geofencing establishes a virtual perimeter around active job coordinates. When a crew member arrives at the job site, their smartphone detects their proximity and automatically logs the arrival time.' },
      { type: 'ul', items: [
        'Verified on-site clock-ins: Guarantees billable hours match physical presence on the property.',
        'Roster privacy & battery optimization: Smart adaptive sampling tracks location only during transit and on-site shifts.',
        'Drag-and-drop schedule dispatching: Move unscheduled work orders onto the calendar and dispatch driving directions directly to crew mobile portals.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted unites the Schedule Workbench with live crew GPS tracking and automated timesheet auditing, giving trade business owners full operational clarity from dispatch to payroll.' },
    ],
    featureLinks: [
      { href: '/features/scheduling', label: 'Schedule Workbench', blurb: 'Drag and drop jobs onto calendar slots with auto-adjusted queue widths.' },
      { href: '/features/crew', label: 'Crew & Labor Management', blurb: 'Track live map locations, geofenced timesheets, and loaded labor costs.' },
    ],
  },
  {
    slug: 'clean-energy-rebates-permit-intel-guide',
    title: 'Clean energy rebates & permit intel: Win quotes in 2026',
    excerpt:
      'Homeowners want IRA tax credits, utility rebates, and zero permit surprises. Here is how leading contractors present instant rebate deductions on quotes.',
    category: 'Pricing & profit',
    readMinutes: 6,
    datePublished: '2026-08-26',
    body: [
      { type: 'p', text: 'High-ticket home improvement quotes are often delayed by two major homeowner hesitations: sticker shock and permitting uncertainty. Contractors who proactively calculate energy rebates and handle permit requirements win more bids at higher margins.' },
      { type: 'h2', text: 'Inflation Reduction Act (IRA) incentives' },
      { type: 'p', text: 'Federal Section 25C Energy Efficient Home Improvement Credits allow homeowners to claim up to 30% of project costs (up to $2,000 for heat pumps and $1,200 for insulation, windows, and electrical panel upgrades). When you show the net post-rebate price side-by-side with the gross investment, homeowners sign faster.' },
      { type: 'h2', text: 'Instant Permit Intel before sending the crew' },
      { type: 'p', text: 'Municipal permit fees and inspection requirements vary wildly across neighboring cities and counties. Forgetting to factor in permit costs or failing to submit COI documentation can trigger stop-work orders and costly municipal fines.' },
      { type: 'ul', items: [
        'Automated jurisdiction lookups: Check local building department permit mandates by property address.',
        'Aerial roof takeoff calculations: Measure square footage and slope pitch multipliers instantly via satellite data.',
        'Itemized line-item rebate deductions: Present net out-of-pocket pricing directly on digital quotes with e-signature sign-off.',
      ] },
      { type: 'p', text: 'Let’s Get Quoted integrates North American permit intel, aerial takeoffs, and clean energy rebate calculators directly into every estimate, making your quotes standout as the most professional option in your market.' },
    ],
    featureLinks: [
      { href: '/tools/estimate-generator', label: 'Free Estimate Generator', blurb: 'Calculate pitch multipliers, permit fees, and itemized materials.' },
      { href: '/features/quotes', label: 'Itemized Quote Builder', blurb: 'Send interactive Good/Better/Best quotes with instant clean energy discounts.' },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

/**
 * Every category that has at least one article, in the order the articles are
 * declared. Derived rather than typed out, so filing a new article under a new
 * category cannot leave the index's filter list one category short.
 */
export const ARTICLE_CATEGORIES: string[] = ARTICLES.reduce<string[]>((seen, article) => {
  if (!seen.includes(article.category)) seen.push(article.category);
  return seen;
}, []);

/**
 * What to read next: same category first, then the rest, newest first, never
 * the article you are on.
 */
export function relatedArticles(slug: string, limit = 3): Article[] {
  const current = getArticle(slug);
  if (!current) return ARTICLES.slice(0, limit);

  return ARTICLES.filter((article) => article.slug !== slug)
    .sort((a, b) => {
      const aSame = a.category === current.category ? 0 : 1;
      const bSame = b.category === current.category ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return b.datePublished.localeCompare(a.datePublished);
    })
    .slice(0, limit);
}

export function formatArticleDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
