// Marketing resource center (/resources). Evergreen, genuinely useful articles
// for contractors — written honestly, with soft, truthful ties to the product
// where relevant. Body is structured blocks so it renders without a markdown
// dependency. Dates are static strings (no new Date at module load).

export type ArticleBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] };

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  datePublished: string; // ISO date
  body: ArticleBlock[];
};

export const ARTICLES: Article[] = [
  {
    slug: 'price-a-job-for-real-margin',
    title: 'How to price a contracting job so you actually keep the margin',
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
  },
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
  },
  {
    slug: 'deposits-and-payment-plans',
    title: 'Deposits and payment plans: get paid without scaring the customer',
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
  },
  {
    slug: 'more-google-reviews',
    title: 'How to get more 5-star Google reviews (the honest way)',
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
      // THE ADVICE THIS REPLACES was "catch the unhappy ones privately first",
      // which is review gating with a friendlier name — and it directly
      // contradicted the product page, which correctly says customers must not
      // be routed differently by rating. Google's policy is about the OFFER, not
      // about who ends up posting: sorting people by how they feel before you
      // show them the public option is the thing that gets a Business Profile
      // restricted, and it is the contractor's profile at risk, not ours.
      { type: 'p', text: 'Send every customer the same neutral review request. Give everyone access to the public-review option and a separate way to contact you directly — without changing the options based on their rating. Sorting customers by how happy they seem, and showing the public link only to the happy ones, is review gating however it is worded. Suppressing negative reviews or writing fake ones is worse. Earn the good ones; fix the bad experiences.' },
      { type: 'h2', text: 'Make it a routine, not a one-off' },
      { type: 'p', text: 'A single review push gives you a bump; a routine gives you a reputation. Ask after every completed job and it compounds. Automating the ask — a message that goes out on completion — is the difference between meaning to and actually doing it.' },
      { type: 'p', text: 'Let’s Get Quoted sends review requests automatically after a job and offers every customer both routes — the public review page and a private note to you — with no branching on what they rated. However you do it, the formula is the same: ask everyone, ask fast, make it one tap, and never fake it.' },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
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
