// Homeowner-useful blog topic recommendations, keyed off the contractor's trade.
// The angles are deliberately the ones that earn local search + repeat visits:
// simple at-home fixes, what to check first when something breaks, and how often
// to maintain a thing (with the "why"). Pure + import-free so it's easy to test
// and safe to use on the server or the client.

// A trade slug that reads naturally mid-sentence ("your HVAC system", "stump
// grinding") — trimmed, collapsed whitespace, lowercased, with a sane fallback.
function tradeLabel(trade: string | null | undefined): string {
  const cleaned = (trade || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return cleaned || 'home service';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Ordered so the first few are the strongest general-interest angles. Every
// template fits both equipment trades (HVAC, plumbing) and service trades
// (stump removal, cleaning) because it talks about "the work" / "a problem",
// not a specific machine.
export function recommendedBlogTopics(trade: string | null | undefined): string[] {
  const t = tradeLabel(trade);
  const T = capitalize(t);
  return [
    `3 ${t} problems homeowners can often fix themselves before calling a pro`,
    `What to check first when a ${t} problem pops up at home`,
    `How often does your home really need ${t}? A simple maintenance schedule`,
    `5 early warning signs it's time to call a ${t} pro`,
    `A seasonal ${t} checklist that stops small problems from becoming big ones`,
    `${T}: which jobs are safe to DIY and which ones need a pro`,
    `Why keeping up with regular ${t} saves you money (and headaches)`,
    `The homeowner's guide to ${t}: what to do the moment something breaks`,
    `${T} myths that cost homeowners money — and what's actually true`,
    `What to do before, during, and after your next ${t} appointment`,
  ];
}

// A single recommendation, rotating with `seed` (e.g. the count of posts you've
// already published) so the nudge suggests something fresh each time.
export function recommendBlogTopic(trade: string | null | undefined, seed = 0): string {
  const topics = recommendedBlogTopics(trade);
  const index = ((Math.floor(seed) % topics.length) + topics.length) % topics.length;
  return topics[index];
}
