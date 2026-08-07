// A year of marketing that makes sense for the trade and the weather.
//
// The thing that makes a generic content calendar useless is that it doesn't
// know where you are. "Book your furnace tune-up" in October is exactly right in
// Minnesota and faintly ridiculous in Phoenix, where nobody has thought about a
// furnace in their life. So every beat below is keyed to a climate zone as well
// as a trade, and a beat with no months for your zone simply doesn't appear.
//
// Nothing here sends anything. It proposes what's worth saying and when; the
// contractor writes or approves it, and the existing campaign machinery does the
// sending with its own consent and unsubscribe rules.

export type ClimateZone = 'cold' | 'temperate' | 'hot' | 'marine';
export type Channel = 'blog' | 'email';
export type Audience = 'everyone' | 'past-service' | 'maintenance-due';

export const CLIMATE_LABEL: Record<ClimateZone, string> = {
  cold: 'Cold winters',
  temperate: 'Four seasons',
  hot: 'Hot summers, mild winters',
  marine: 'Wet and mild',
};

/**
 * Climate zone from a US state.
 *
 * Coarse on purpose — this decides whether to talk about frozen pipes, not
 * whether to wear a coat. Anything unrecognised falls to temperate, which is the
 * zone whose advice is least wrong everywhere else.
 */
const ZONE_BY_STATE: Record<string, ClimateZone> = {
  AK: 'cold', ME: 'cold', VT: 'cold', NH: 'cold', MN: 'cold', ND: 'cold', SD: 'cold', WI: 'cold',
  MI: 'cold', MT: 'cold', WY: 'cold', ID: 'cold', IA: 'cold', NE: 'cold', MA: 'cold', NY: 'cold',
  CT: 'cold', RI: 'cold', PA: 'cold', CO: 'cold', UT: 'cold',
  WA: 'marine', OR: 'marine',
  FL: 'hot', TX: 'hot', AZ: 'hot', NV: 'hot', NM: 'hot', LA: 'hot', MS: 'hot', AL: 'hot',
  GA: 'hot', SC: 'hot', HI: 'hot', OK: 'hot',
  CA: 'temperate', OH: 'temperate', IN: 'temperate', IL: 'temperate', MO: 'temperate', KS: 'temperate',
  KY: 'temperate', TN: 'temperate', VA: 'temperate', WV: 'temperate', NC: 'temperate', AR: 'temperate',
  MD: 'temperate', DE: 'temperate', NJ: 'temperate', DC: 'temperate',
};

export function climateZoneForState(state: string | null | undefined): ClimateZone {
  return ZONE_BY_STATE[(state ?? '').trim().toUpperCase()] ?? 'temperate';
}

/**
 * The state's name, for prose.
 *
 * A two-letter code is the right thing to store and the wrong thing to read.
 * The marketing page said "timed to BrokePipes and MI weather", which is a
 * database value wearing a sentence — nobody says "MI weather" out loud. Only
 * for display; every comparison stays on the code.
 */
const STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, D.C.', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};

/** Null rather than the raw code, so a caller never prints "MI" by accident. */
export function stateName(state: string | null | undefined): string | null {
  return STATE_NAME[(state ?? '').trim().toUpperCase()] ?? null;
}

/** Pull a state code off the end of a US address. Returns null when unsure. */
export function stateFromAddress(address: string | null | undefined): string | null {
  const match = /\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec((address ?? '').trim().toUpperCase());
  const code = match?.[1] ?? null;
  return code && code in ZONE_BY_STATE ? code : null;
}

/**
 * Trade families. Deliberately broader than the trade list on the website: a
 * "gutter cleaning and roof repair" business and a "roofing" business want the
 * same October beat.
 */
export type TradeFamily = 'roofing' | 'hvac' | 'plumbing' | 'exterior' | 'landscaping' | 'general';

export function tradeFamily(trade: string | null | undefined): TradeFamily {
  const text = (trade ?? '').toLowerCase();
  if (/roof|gutter|siding|chimney/.test(text)) return 'roofing';
  if (/hvac|heat|furnace|air condition|ac\b|cooling/.test(text)) return 'hvac';
  if (/plumb|drain|septic|water heater/.test(text)) return 'plumbing';
  if (/paint|deck|fence|power ?wash|pressure ?wash|window/.test(text)) return 'exterior';
  if (/landscap|lawn|garden|tree|irrigation|snow/.test(text)) return 'landscaping';
  return 'general';
}

export type Beat = {
  id: string;
  title: string;
  /** What makes this the right month. The contractor reads this to decide. */
  whyNow: string;
  trades: TradeFamily[];
  channels: Channel[];
  audience: Audience;
  /** Months (1-12) per zone. A zone with no entry means the beat doesn't apply. */
  monthsByZone: Partial<Record<ClimateZone, number[]>>;
};

/**
 * The beats themselves.
 *
 * Each one earns its place by being time-sensitive: something a homeowner should
 * act on THIS month and not in general. A calendar full of "5 tips for a happy
 * home" is a calendar nobody opens twice.
 */
export const BEATS: Beat[] = [
  {
    id: 'heating-tuneup',
    title: 'Book a heating tune-up before the first cold snap',
    whyNow: 'Everyone calls the week it first gets cold, and by then you are booked out. Ask now and you fill October instead of scrambling in November.',
    trades: ['hvac', 'plumbing', 'general'],
    channels: ['email', 'blog'],
    audience: 'maintenance-due',
    // Absent in 'hot' on purpose. Nobody in Phoenix is thinking about a furnace.
    monthsByZone: { cold: [9, 10], temperate: [10, 11], marine: [10] },
  },
  {
    id: 'frozen-pipes',
    title: 'What to do before the first hard freeze',
    whyNow: 'A burst pipe costs a homeowner thousands and you an emergency callout. The advice only lands if it arrives before the freeze, not during it.',
    trades: ['plumbing', 'general'],
    channels: ['email', 'blog'],
    audience: 'everyone',
    monthsByZone: { cold: [10, 11], temperate: [11, 12] },
  },
  {
    id: 'ac-service',
    title: 'Get the air conditioning serviced before you need it',
    whyNow: 'The first 90-degree day generates a week of emergency calls. The people who booked in spring are the ones who are comfortable.',
    trades: ['hvac', 'general'],
    channels: ['email', 'blog'],
    audience: 'maintenance-due',
    monthsByZone: { hot: [2, 3], temperate: [4, 5], cold: [5], marine: [5] },
  },
  {
    id: 'gutter-clear',
    title: 'Clear the gutters before the leaves finish falling',
    whyNow: 'Blocked gutters in a wet autumn mean water where it should not be. This is the cheapest job that prevents the most expensive one.',
    trades: ['roofing', 'landscaping', 'general'],
    channels: ['email', 'blog'],
    audience: 'past-service',
    monthsByZone: { cold: [10, 11], temperate: [11], marine: [10, 11], hot: [12] },
  },
  {
    id: 'storm-season',
    title: 'What to check after a storm — and what not to climb up to look at',
    whyNow: 'Storm season brings damage people cannot see from the ground, and chasers who knock the next morning. Being the one who told them first is worth more than the post.',
    trades: ['roofing', 'general'],
    channels: ['blog', 'email'],
    audience: 'everyone',
    monthsByZone: { hot: [5, 6], temperate: [4, 6], cold: [6], marine: [11] },
  },
  {
    id: 'ice-dams',
    title: 'Ice dams: why they form and what actually stops them',
    whyNow: 'The month people first see icicles is the month they will pay to understand them. In warmer zones this beat does not exist at all.',
    trades: ['roofing', 'general'],
    channels: ['blog'],
    audience: 'everyone',
    monthsByZone: { cold: [12, 1] },
  },
  {
    id: 'exterior-paint',
    title: 'Book exterior painting while the weather still allows it',
    whyNow: 'Paint needs a dry stretch above 50°F. The window closes earlier than people expect, and the ones who wait get told no.',
    trades: ['exterior', 'general'],
    channels: ['email', 'blog'],
    audience: 'everyone',
    monthsByZone: { cold: [5, 8], temperate: [4, 9], hot: [3, 10], marine: [6, 7] },
  },
  {
    id: 'deck-season',
    title: 'Get the deck sorted before the first barbecue',
    whyNow: 'Decks get looked at the first warm weekend and booked the week after. Arriving a fortnight before that is the whole trick.',
    trades: ['exterior', 'landscaping', 'general'],
    channels: ['email'],
    audience: 'everyone',
    monthsByZone: { cold: [4], temperate: [3, 4], hot: [2], marine: [4] },
  },
  {
    id: 'spring-cleanup',
    title: 'Spring clean-up: book your slot',
    whyNow: 'Everyone wants the same three weekends. The customers who booked in February get them.',
    trades: ['landscaping', 'general'],
    channels: ['email'],
    audience: 'past-service',
    monthsByZone: { cold: [3], temperate: [2, 3], hot: [1, 2], marine: [2, 3] },
  },
  {
    id: 'irrigation-blowout',
    title: 'Irrigation blow-out before the ground freezes',
    whyNow: 'Miss it and the system splits over winter. There is a real deadline, which is why this one converts.',
    trades: ['landscaping', 'plumbing'],
    channels: ['email'],
    audience: 'past-service',
    monthsByZone: { cold: [9, 10], temperate: [10, 11] },
  },
  {
    id: 'year-review',
    title: 'What we did this year, and thank you',
    whyNow: 'A December note that asks for nothing is the one people remember in March. Send it to everyone and sell nothing.',
    trades: ['roofing', 'hvac', 'plumbing', 'exterior', 'landscaping', 'general'],
    channels: ['email'],
    audience: 'everyone',
    monthsByZone: { cold: [12], temperate: [12], hot: [12], marine: [12] },
  },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type PlannedBeat = {
  beat: Beat;
  /** The first month in the window — what the list sorts by. */
  month: number;
  /** "September", or "September–October" when the window spans months. */
  monthName: string;
  /** Every month in the window, in order. */
  months: number[];
  /** The channel this beat leads with. */
  channel: Channel;
  /** Every channel it supports, so the card can offer each one. */
  channels: Channel[];
};

/**
 * How a beat's months read on its card.
 *
 * A dash means a run: "September–October" is one season two months long. It is
 * used ONLY when the months are genuinely consecutive, because several beats
 * are deliberately not — exterior painting in a hot climate is [3, 10], March
 * and October, the two moments either side of a summer nobody paints in.
 * "March–October" would advertise an eight-month season that does not exist.
 *
 * Consecutive is checked modulo 12 so a December–January run reads as one.
 */
export function windowLabel(months: number[]): string {
  if (months.length === 0) return '';
  const names = months.map((month) => MONTH_NAMES[month - 1]);
  if (months.length === 1) return names[0];

  const isRun = months.every((month, index) => index === 0 || month === (months[index - 1] % 12) + 1);
  if (isRun) return `${names[0]}–${names[names.length - 1]}`;

  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * What's worth saying in the months ahead.
 *
 * Returns nothing rather than filler when a trade and zone genuinely have no
 * beat for a month. A calendar that invents something for every square is a
 * calendar of things nobody needed to read.
 *
 * ONE ENTRY PER BEAT, not one per month. A beat whose season runs across two
 * months used to appear twice — "Book a heating tune-up before the first cold
 * snap" listed under September and again under October, because its zone says
 * [9, 10]. That reads as two things to do. It is one thing with a two-month
 * window, and a calendar that pads itself by repetition is one nobody trusts to
 * mean what it says.
 */
export function planCalendar(input: {
  trade: string | null;
  zone: ClimateZone;
  fromMonth: number;
  monthsAhead?: number;
}): PlannedBeat[] {
  const family = tradeFamily(input.trade);
  const ahead = Math.min(12, Math.max(1, input.monthsAhead ?? 3));

  // Walk the window in order and collect each beat's eligible months as we
  // meet them, so the FIRST month a beat appears fixes its place in the list.
  const order: string[] = [];
  const monthsByBeat = new Map<string, number[]>();

  for (let offset = 0; offset < ahead; offset += 1) {
    const month = ((input.fromMonth - 1 + offset) % 12) + 1;
    for (const beat of BEATS) {
      if (!beat.trades.includes(family)) continue;
      const months = beat.monthsByZone[input.zone];
      if (!months || !months.includes(month)) continue;
      if (!monthsByBeat.has(beat.id)) {
        monthsByBeat.set(beat.id, []);
        order.push(beat.id);
      }
      monthsByBeat.get(beat.id)!.push(month);
    }
  }

  return order.map((beatId) => {
    const beat = BEATS.find((entry) => entry.id === beatId) as Beat;
    const months = monthsByBeat.get(beatId) as number[];
    return {
      beat,
      month: months[0],
      monthName: windowLabel(months),
      months,
      channel: beat.channels[0],
      channels: beat.channels,
    };
  });
}

/**
 * Who a beat is for, in the contractor's words.
 *
 * 'maintenance-due' is the one that actually earns money: people whose warranty
 * or service interval says they're due, rather than everybody on the list.
 */
export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone who has used you',
  'past-service': 'Customers who have had this kind of work done',
  'maintenance-due': 'Customers whose service is coming due',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  blog: 'Post on your website',
  email: 'Email your past customers',
};

/**
 * Why SMS isn't a channel here.
 *
 * A marketing text is not the same as a job update, and US law treats them very
 * differently: prior express WRITTEN consent, at $500–$1,500 per message if you
 * get it wrong. The consent ledger in this app records one status per phone and
 * does not separate the two, so an SMS marketing send would be built on consent
 * nobody gave for this purpose. Email carries an unsubscribe and a postal
 * address and is already wired for exactly this.
 */
// Short on purpose. The full reasoning is in the comment above, where it is
// useful; on screen it sat under three topic cards as a paragraph of law
// nobody rereads after the first time.
export const SMS_EXCLUSION_NOTE =
  'Email only — marketing texts need their own written opt-in under US law, and job-update consent is not it.';
