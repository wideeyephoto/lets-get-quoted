/**
 * Social-preview cards for the five feature pages.
 *
 * WHY THEY EXIST. All five inherited the root layout's Open Graph object, which
 * meant every one of them unfurled as the homepage: the homepage's title, the
 * homepage's description, a screenshot of a website template, and — the part
 * that actually costs clicks — og:url pointing at letsgetquoted.com. Sharing a
 * link to /features/quick-stops produced a card for a different page.
 *
 * WHY TYPOGRAPHY AND NOT A SCREENSHOT. There are real product screenshots in
 * public/features, but they are 16:10 captures of a dark dashboard; cropped to
 * 1.91:1 and rendered at 300px wide in a Slack unfurl, none of them is legible
 * enough to say which feature the link is about. The headline is. So the card
 * is the page's own eyebrow and headline on the brand ground, which is both
 * readable at thumbnail size and impossible to get wrong.
 *
 * Rendered through headless Chromium — the same tool prepare-hero-shots.mjs
 * uses, and for the same reason: neither sharp nor jimp is a dependency here
 * and five images is not a reason to add a native module.
 *
 *   node scripts/build-feature-og.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

/** The OG spec's recommended size, and what every scraper crops to. */
const W = 1200;
const H = 630;

const OUT = 'public/features';

/* The eyebrow and headline are each page's own, so the card cannot drift from
   the page it represents. Kept short: at a 300px-wide unfurl, anything past
   about eight words is unreadable. */
const CARDS = [
  {
    slug: 'website-builder',
    eyebrow: 'AI WEBSITE BUILDER',
    title: 'A contractor website that turns visits into ready-to-quote jobs.',
    foot: 'Minutes, not weeks · 100 trades · Your domain stays yours',
  },
  {
    slug: 'ai-intake',
    eyebrow: 'AI SMART INTAKE',
    title: 'Qualify every lead before you pick up the phone.',
    foot: 'Trade-specific questions · Photos and timing · Scored by fit and value',
  },
  {
    slug: 'quick-stops',
    eyebrow: 'QUICK STOPS',
    title: 'Fill schedule gaps with prepaid jobs nearby.',
    foot: 'You set the price · You approve every request · Nothing books until they pay',
  },
  {
    slug: 'client-portal',
    eyebrow: 'CLIENT PORTAL + TEXTING',
    title: 'Every message tied to the right job.',
    foot: 'One link per job · No app · No password',
  },
  {
    slug: 'back-office',
    eyebrow: 'THE CONNECTED BACK OFFICE',
    title: 'One job record, from signed quote to final payment.',
    foot: 'Quote · Schedule · Crew · Payment · Follow-up',
  },
  /* The seven suite pages. Same rule as above: the eyebrow and headline are the
     page's own, so a card cannot end up advertising something the page it links
     to does not say. */
  {
    slug: 'quotes',
    eyebrow: 'QUOTES + E-SIGNATURE',
    title: 'Send the quote. Get it signed from a phone.',
    foot: 'Priced from your book · Optional upgrades · Signed and timestamped',
  },
  {
    slug: 'scheduling',
    eyebrow: 'SCHEDULING + ONLINE BOOKING',
    title: 'Book the job without the phone tag.',
    foot: 'They pick the window · Booking from your site · See a day is full',
  },
  {
    slug: 'crew',
    eyebrow: 'CREW, LABOR + THE FIELD APP',
    title: 'Your crew gets the job. You get the real margin.',
    foot: 'The job on their phone · Hours and materials on site · Margin before the invoice',
  },
  {
    slug: 'payments',
    eyebrow: 'PAYMENTS THROUGH STRIPE',
    title: 'Get paid on the job, not thirty days after it.',
    foot: 'Deposits and balances · 0% payment plans · You pay only when you get paid',
  },
  {
    slug: 'recurring',
    eyebrow: 'RECURRING + AUTO-BILLING',
    title: 'Set the plan once. It books and bills itself.',
    foot: 'Weekly, biweekly or monthly · A real job each visit · A real invoice each time',
  },
  {
    slug: 'cash-flow',
    eyebrow: 'CASH FLOW + INSIGHTS',
    title: 'Find out about the bad week before it arrives.',
    foot: 'Dated, not averaged · Confirmed vs expected · Clean books at year end',
  },
  {
    slug: 'reviews',
    eyebrow: 'REVIEWS + GROWTH',
    title: 'More reviews, without gaming the reviews.',
    foot: 'No star-rating gating · Sent when the job is done · Bring past customers back',
  },
];

/** The real mark, inlined — the renderer has no origin to fetch it from. */
const LOGO = `data:image/webp;base64,${readFileSync('public/lets-get-quoted-logo.webp').toString('base64')}`;

const page = (card) => `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;600&family=JetBrains+Mono:wght@700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 62px 68px;
    background:
      radial-gradient(circle at 84% 12%, rgba(255,106,36,.22), transparent 42%),
      radial-gradient(circle at 8% 88%, rgba(69,148,165,.18), transparent 40%),
      linear-gradient(160deg, #0d222e, #061a23);
    color: #f8f4ed;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  /* The same faint grid the marketing hero carries, so the card reads as part
     of the site rather than as a generic quote graphic. */
  body::after {
    content: ""; position: absolute; inset: 0; opacity: .22; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px);
    background-size: 52px 52px;
  }
  header { display: flex; align-items: center; justify-content: space-between; gap: 24px; position: relative; z-index: 1; }
  .mark { width: 264px; height: 92px; overflow: hidden; display: block; }
  .mark img { width: 106%; max-width: none; display: block; transform: translate(-2.3%, -8.2%); }
  .eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 19px; font-weight: 700; letter-spacing: .17em; color: #ff7840;
  }
  main { position: relative; z-index: 1; }
  h1 {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 72px; font-weight: 700; line-height: 1.02; letter-spacing: -.035em;
    max-width: 17ch; text-wrap: balance;
  }
  footer { position: relative; z-index: 1; display: flex; align-items: center; gap: 18px; }
  .rule { flex: 0 0 54px; height: 4px; background: #ff6a24; border-radius: 2px; }
  .foot { font-size: 23px; font-weight: 600; color: #a8bdc5; }
</style></head>
<body>
  <header>
    <span class="mark"><img src="${LOGO}" alt=""></span>
    <span class="eyebrow">${card.eyebrow}</span>
  </header>
  <main><h1>${card.title}</h1></main>
  <footer><span class="rule"></span><span class="foot">${card.foot}</span></footer>
</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

for (const card of CARDS) {
  await tab.setContent(page(card), { waitUntil: 'networkidle' });
  // The webfonts are display:block, so a screenshot taken before they land
  // would be the fallback stack. Wait for the font set rather than a timer.
  await tab.evaluate(() => document.fonts.ready);
  const shot = await tab.screenshot({ type: 'jpeg', quality: 88 });
  const path = `${OUT}/og-${card.slug}.jpg`;
  writeFileSync(path, shot);
  console.log(`wrote ${path} (${Math.round(shot.length / 1024)}KB)`);
}

await browser.close();
