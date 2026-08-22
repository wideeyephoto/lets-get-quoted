import { describe, it, expect } from 'vitest';
import {
  JOB_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  cityFromAddress,
  estimateRangeLabel,
  formatLeadClock,
  formatLeadDate,
  leadCityLabel,
  leadScoreLabel,
  leadStageLabel,
  streetFromAddress,
} from '@/lib/lead-detail-labels';
import { LEADS_VIEWS, normalizeLeadsView } from '@/lib/leads';

// These labels are shared by the leads board, the Focus pane and the full lead
// page. The point of the module is that the three can't describe the same lead
// differently — they had already drifted into separate copies — so the tests
// pin the wordings that aren't obvious from the enum.

describe('lead stage labels', () => {
  it('has a label for every stage', () => {
    for (const status of ['new', 'contacted', 'quoted', 'won', 'lost'] as const) {
      expect(LEAD_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it('reads "quoted" as what actually happened', () => {
    expect(LEAD_STATUS_LABEL.quoted).toBe('Quote sent');
  });

  /**
   * REVERSED, DELIBERATELY.
   *
   * This used to assert that only a website form said "Needs response" and that
   * a missed call or a hand-typed lead stayed the neutral "New request". The
   * reasoning was sound on its own — nobody is sitting on a form — but it was
   * the third copy of a source-gated rule, and the Smoothie chip that sits above
   * the same row buckets on status alone and had already been changed the other
   * way (see the note on QUEUE_STAGES). So one lead badged "New request" inside
   * a column headed "Needs response", and the count and the word disagreed.
   *
   * These labels now come from lib/lead-queue. A lead phoned in an hour ago
   * needs a reply exactly as much as one that arrived through the form.
   */
  it('calls every unanswered lead "Needs response", whatever it arrived on', () => {
    expect(leadStageLabel('new', 'website_form')).toBe('Needs response');
    expect(leadStageLabel('new', 'missed_call')).toBe('Needs response');
    expect(leadStageLabel('new')).toBe('Needs response');
    // Answered already — the badge must not keep demanding a response.
    expect(leadStageLabel('contacted', 'website_form')).toBe('Contacted');
  });

  it('gives the detail page the same word as the chip that led there', () => {
    expect(LEAD_STATUS_LABEL.new).toBe(leadStageLabel('new'));
  });
});

describe('job stage labels', () => {
  it('covers every job status, for the job a lead turned into', () => {
    for (const status of ['new_lead', 'in_progress', 'complete', 'archived'] as const) {
      expect(JOB_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

describe('score labels', () => {
  it('names each tier the way the chips do', () => {
    expect(leadScoreLabel('hot')).toBe('🔥 Hot');
    expect(leadScoreLabel('warm')).toBe('Warm');
    expect(leadScoreLabel('low')).toBe('Low');
  });
});

describe('estimate ranges', () => {
  it('formats a range with thousands separators', () => {
    expect(estimateRangeLabel({ min: 1200, max: 3400 })).toBe('$1,200–$3,400');
  });

  it('collapses a single number instead of printing it twice', () => {
    expect(estimateRangeLabel({ min: 900, max: 900 })).toBe('$900');
  });

  it('returns null when there is no usable number', () => {
    expect(estimateRangeLabel(null)).toBeNull();
    expect(estimateRangeLabel(undefined)).toBeNull();
    expect(estimateRangeLabel({ min: Number.NaN, max: 500 })).toBeNull();
    expect(estimateRangeLabel({ min: 500, max: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('lead timestamps', () => {
  it('keeps the clock on a touchpoint, so two the same day are tellable apart', () => {
    const label = formatLeadClock('2026-07-28T18:15:00.000Z');
    expect(label).toMatch(/\d:\d{2}\s?(AM|PM)/);
  });

  it('drops the clock from a received date, where it is noise', () => {
    const label = formatLeadDate('2026-07-28T18:15:00.000Z');
    expect(label).toMatch(/2026/);
    expect(label).not.toMatch(/(AM|PM)/);
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(formatLeadClock('not a date')).toBe('');
    expect(formatLeadDate('')).toBe('');
  });
});

describe('leads view cookie', () => {
  it('migrates the overlapping detail layouts into Inbox', () => {
    expect(LEADS_VIEWS).not.toContain('focus');
    expect(normalizeLeadsView('focus')).toBe('smoothie');
    expect(normalizeLeadsView('split')).toBe('smoothie');
    expect(normalizeLeadsView('inbox')).toBe('smoothie');
  });

  // The default moved from Focus to Smoothie. The PROPERTY this test was
  // really protecting is unchanged and still asserted: an unknown value falls
  // back to the deliberate default rather than to whatever happens to be first
  // in the enum, which is 'board'.
  it('opens on Smoothie for anyone who has not chosen', () => {
    expect(normalizeLeadsView('kanban')).toBe('smoothie');
    expect(normalizeLeadsView(undefined)).toBe('smoothie');
    expect(normalizeLeadsView('')).toBe('smoothie');
    expect(normalizeLeadsView('kanban')).not.toBe('board');
  });

  it('leaves an explicit choice alone', () => {
    // Board and Table still have distinct operational jobs.
    expect(normalizeLeadsView('board')).toBe('board');
    expect(normalizeLeadsView('table')).toBe('table');
  });
});

describe('cityFromAddress', () => {
  it('reads the town out of a full US address', () => {
    expect(cityFromAddress('1418 Maplewood Ave, Royal Oak, MI 48067, USA')).toBe('Royal Oak');
  });

  it('handles the shapes Google Places actually returns', () => {
    expect(cityFromAddress('1418 Maplewood Ave, Royal Oak, MI, USA')).toBe('Royal Oak');
    expect(cityFromAddress('1418 Maplewood Ave, Royal Oak, MI 48067')).toBe('Royal Oak');
    expect(cityFromAddress('1418 Maplewood Ave, Royal Oak')).toBe('Royal Oak');
    expect(cityFromAddress('Royal Oak, MI')).toBe('Royal Oak');
    expect(cityFromAddress('Royal Oak')).toBe('Royal Oak');
  });

  it('peels a spelled-out state and a ZIP+4', () => {
    expect(cityFromAddress('22 Elm St, Ann Arbor, Michigan 48104-1234')).toBe('Ann Arbor');
    expect(cityFromAddress('22 Elm St, Ann Arbor, Michigan, United States')).toBe('Ann Arbor');
  });

  it('survives an apartment line in front of the street', () => {
    expect(cityFromAddress('Apt 4B, 1418 Maplewood Ave, Royal Oak, MI 48067')).toBe('Royal Oak');
  });

  it('keeps two-word and hyphenated towns whole', () => {
    expect(cityFromAddress('900 Woodward Ave, Grosse Pointe Farms, MI')).toBe('Grosse Pointe Farms');
    expect(cityFromAddress('5 Main St, Wilkes-Barre, PA 18701')).toBe('Wilkes-Barre');
  });

  it('would rather say nothing than name a street as a town', () => {
    // The failure that matters: printing "(Maplewood Ave)" next to a name reads
    // as a place and would be believed.
    expect(cityFromAddress('1418 Maplewood Ave')).toBeNull();
    expect(cityFromAddress('PO Box 214')).toBeNull();
    expect(cityFromAddress('Maplewood Ave')).toBeNull();
  });

  it('gives nothing back for a bare state, ZIP or empty value', () => {
    expect(cityFromAddress('MI')).toBeNull();
    expect(cityFromAddress('48067')).toBeNull();
    expect(cityFromAddress('48067-1234')).toBeNull();
    expect(cityFromAddress('')).toBeNull();
    expect(cityFromAddress(null)).toBeNull();
    expect(cityFromAddress(undefined)).toBeNull();
  });

  it('refuses anything carrying a digit', () => {
    // "Suite 200" and "48067 Royal Oak" are not towns.
    expect(cityFromAddress('1418 Maplewood Ave, Suite 200')).toBeNull();
    expect(cityFromAddress('48067 Royal Oak')).toBeNull();
  });
});

describe('leadCityLabel', () => {
  it('prefers the address', () => {
    expect(leadCityLabel('1418 Maplewood Ave, Royal Oak, MI 48067', 'Ferndale')).toBe('Royal Oak');
  });

  it('falls back to what the estimator recorded', () => {
    expect(leadCityLabel(null, 'Ferndale, MI')).toBe('Ferndale');
    expect(leadCityLabel('', 'Ferndale')).toBe('Ferndale');
  });

  it('does not print a ZIP where a town was promised', () => {
    // The estimator often stores "Location given: 48072". "(48072)" after a
    // name looks like a bug; the Where row still shows it in full.
    expect(leadCityLabel(null, '48072')).toBeNull();
  });

  it('is null when neither field says where they are', () => {
    expect(leadCityLabel(null, null)).toBeNull();
    expect(leadCityLabel('1418 Maplewood Ave', undefined)).toBeNull();
  });
});

describe('streetFromAddress', () => {
  it('takes the street line out of a full address', () => {
    expect(streetFromAddress('1418 Maplewood Ave, Royal Oak, MI 48067, USA')).toBe('1418 Maplewood Ave');
    expect(streetFromAddress('22 Elm St, Ann Arbor, Michigan 48104-1234')).toBe('22 Elm St');
  });

  it('keeps the house number', () => {
    // "Maplewood Ave" is a road several customers may live on. The number is
    // what makes the row identify one of them.
    expect(streetFromAddress('1418 Maplewood Ave, Royal Oak')).toContain('1418');
  });

  it('reads a one-line address', () => {
    expect(streetFromAddress('1418 Maplewood Ave')).toBe('1418 Maplewood Ave');
    expect(streetFromAddress('Maplewood Ave')).toBe('Maplewood Ave');
    expect(streetFromAddress('PO Box 22')).toBe('PO Box 22');
  });

  it('skips what sits in front of the street', () => {
    // A business name, a care-of line or an apartment line is not the street,
    // and taking the first segment blindly would print it. "Apt 4B" is the one
    // worth pinning: it carries a digit and a unit word, so it looks street-ish
    // at a glance, but the suffix test anchors to the END of the segment and it
    // fails there — which is what lets the real street behind it win.
    expect(streetFromAddress('Whitfield Holdings, 1418 Maplewood Ave, Royal Oak')).toBe('1418 Maplewood Ave');
    expect(streetFromAddress('Apt 4B, 1418 Maplewood Ave, Royal Oak, MI 48067')).toBe('1418 Maplewood Ave');
  });

  it('never returns the state, ZIP or country tail', () => {
    // The tail is eligible by position in a short address; it must lose on shape.
    expect(streetFromAddress('Royal Oak, MI 48067')).toBeNull();
    expect(streetFromAddress('48067')).toBeNull();
    expect(streetFromAddress('MI')).toBeNull();
    expect(streetFromAddress('USA')).toBeNull();
  });

  it('is null when there is no street to find', () => {
    expect(streetFromAddress('Royal Oak')).toBeNull();
    expect(streetFromAddress('Royal Oak, MI, USA')).toBeNull();
    expect(streetFromAddress(null)).toBeNull();
    expect(streetFromAddress(undefined)).toBeNull();
    expect(streetFromAddress('')).toBeNull();
  });

  it('declines something too long to read in a list row', () => {
    expect(streetFromAddress(`${'1'.repeat(61)} Maplewood Ave`)).toBeNull();
  });

  it('and cityFromAddress do not both claim the same segment', () => {
    // The label chain tries street first and city second, so any address where
    // both matched the SAME text would silently make the city fallback dead.
    for (const address of [
      '1418 Maplewood Ave, Royal Oak, MI 48067, USA',
      'Apt 4B, 1418 Maplewood Ave, Royal Oak',
      '22 Elm St, Ann Arbor',
    ]) {
      const street = streetFromAddress(address);
      const city = cityFromAddress(address);
      expect(street, address).not.toBeNull();
      expect(city, address).not.toBeNull();
      expect(street, address).not.toBe(city);
    }
  });
});
