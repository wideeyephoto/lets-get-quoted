import { describe, it, expect } from 'vitest';
import {
  composeOfferMessage,
  displayStatus,
  draftOfferBody,
  findPlacements,
  holdState,
  MAX_OFFER_BODY,
  MAX_OFFER_WINDOW_MINUTES,
  MIN_OFFER_WINDOW_MINUTES,
  offerBodyProblem,
  offerWindow,
  parseOfferReply,
  rankOfferSuggestions,
  windowProblem,
  type OfferCandidateLead,
  type PlacementInput,
} from '@/lib/estimate-offers';
import type { PlannedStop } from '@/lib/route-plan';

// Troy, MI and a few miles around it — real-ish coordinates so the haversine
// distances behave like distances rather than like arbitrary numbers.
const SHOP = { lat: 42.5803, lng: -83.1499 };
const NEARBY = { lat: 42.5891, lng: -83.1462 }; // ~0.6 mi north
const ACROSS_TOWN = { lat: 42.9, lng: -83.7 }; // ~35 mi away

function stop(overrides: Partial<PlannedStop> & { id: string; arrivalMinutes: number; departMinutes: number }): PlannedStop {
  return {
    stop: {
      id: overrides.id,
      label: overrides.stop?.label ?? overrides.id,
      address: null,
      lat: overrides.stop?.lat ?? SHOP.lat,
      lng: overrides.stop?.lng ?? SHOP.lng,
      scheduledTime: null,
      visitMinutes: 60,
      locked: false,
    },
    order: 1,
    arrivalMinutes: overrides.arrivalMinutes,
    arrivalTime: '00:00',
    departMinutes: overrides.departMinutes,
    legMiles: 0,
    legMinutes: 0,
    moved: false,
    committedMinutes: null,
    late: false,
    waitMinutes: 0,
  };
}

function planInput(planned: PlannedStop[], overrides: Partial<PlacementInput> = {}): PlacementInput {
  return {
    planned,
    homeBase: SHOP,
    workdayStartMinutes: 8 * 60,
    workdayEndMinutes: 17 * 60,
    bufferMinutes: 15,
    visitMinutes: 30,
    ...overrides,
  };
}

describe('findPlacements', () => {
  it('finds the hole between two jobs without moving either of them', () => {
    // 9:00–10:00 job, then nothing until a 2:00 PM job.
    const planned = [
      stop({ id: 'a', arrivalMinutes: 9 * 60, departMinutes: 10 * 60 }),
      stop({ id: 'b', arrivalMinutes: 14 * 60, departMinutes: 15 * 60 }),
    ];
    const placements = findPlacements(planInput(planned), NEARBY);
    const middle = placements.find((placement) => placement.index === 1);

    expect(middle).toBeTruthy();
    expect(middle!.afterStopId).toBe('a');
    expect(middle!.beforeStopLabel).toBe('b');
    // Free from the moment the first job is done...
    expect(middle!.earliestArrival).toBeGreaterThanOrEqual(10 * 60);
    // ...and gone with time to spare before the next customer's 2:00 PM.
    expect(middle!.latestArrival).toBeLessThanOrEqual(14 * 60 - 30);
  });

  it('never proposes a slot that would push the next customer back', () => {
    // Back-to-back: 9:00–10:00 then 10:15. There is no room for anybody.
    const planned = [
      stop({ id: 'a', arrivalMinutes: 9 * 60, departMinutes: 10 * 60 }),
      stop({ id: 'b', arrivalMinutes: 10 * 60 + 15, departMinutes: 11 * 60 + 15 }),
    ];
    const between = findPlacements(planInput(planned), NEARBY).filter((placement) => placement.index === 1);
    expect(between).toEqual([]);
  });

  it('offers the end of the day, bounded by when the workday closes', () => {
    const planned = [stop({ id: 'a', arrivalMinutes: 9 * 60, departMinutes: 10 * 60 })];
    const last = findPlacements(planInput(planned), NEARBY).find((placement) => placement.index === 1);
    expect(last).toBeTruthy();
    expect(last!.beforeStopLabel).toBeNull();
    // A 30-minute visit has to be finished by 5 PM.
    expect(last!.latestArrival).toBe(17 * 60 - 30);
  });

  it('charges the detour against the drive it replaces, not against zero', () => {
    const planned = [
      stop({ id: 'a', arrivalMinutes: 9 * 60, departMinutes: 10 * 60 }),
      stop({ id: 'b', arrivalMinutes: 14 * 60, departMinutes: 15 * 60 }),
    ];
    const near = findPlacements(planInput(planned), NEARBY).find((p) => p.index === 1)!;
    const far = findPlacements(planInput(planned), ACROSS_TOWN).find((p) => p.index === 1)!;
    expect(near.detourMiles).toBeLessThan(far.detourMiles);
    // A stop essentially on the way is barely any extra driving...
    expect(near.detourMinutes).toBeLessThan(5);
    // ...but the day still grows by the visit and the buffer, and says so.
    expect(near.addedMinutes).toBeGreaterThanOrEqual(45);
  });
});

describe('offerWindow', () => {
  const base = {
    index: 1,
    afterStopId: 'a',
    afterStopLabel: 'a',
    beforeStopLabel: 'b',
    detourMiles: 1,
    detourMinutes: 10,
  };

  it('sizes the window to the gap rather than using a fixed band', () => {
    const roomy = offerWindow({ ...base, earliestArrival: 10 * 60, latestArrival: 15 * 60 });
    expect(roomy).toBeTruthy();
    expect(roomy!.endMinutes - roomy!.startMinutes).toBe(MAX_OFFER_WINDOW_MINUTES);

    const snug = offerWindow({ ...base, earliestArrival: 10 * 60, latestArrival: 11 * 60 + 30 });
    expect(snug!.endMinutes - snug!.startMinutes).toBe(90);
  });

  it('quotes clean times, and never by borrowing time it does not have', () => {
    // Free from 10:02, and has to be gone by 1:07.
    const window = offerWindow({ ...base, earliestArrival: 10 * 60 + 2, latestArrival: 13 * 60 + 7 })!;
    expect(window.label).toBe('10:15 AM to 1:00 PM');
    // Both edges pulled inward, never outward.
    expect(window.startMinutes).toBeGreaterThanOrEqual(10 * 60 + 2);
    expect(window.endMinutes).toBeLessThanOrEqual(13 * 60 + 7);
  });

  it('drops a gap that only clears the minimum before rounding', () => {
    // 61 minutes of room, but rounding to the quarter hour leaves 45.
    expect(offerWindow({ ...base, earliestArrival: 10 * 60 + 1, latestArrival: 11 * 60 + 2 })).toBeNull();
  });

  it('declines to promise anything for a gap under an hour', () => {
    expect(offerWindow({ ...base, earliestArrival: 10 * 60, latestArrival: 10 * 60 + 45 })).toBeNull();
  });

  it('plans arrival at the open of the window it promises', () => {
    const window = offerWindow({ ...base, earliestArrival: 10 * 60, latestArrival: 15 * 60 })!;
    expect(window.arrivalMinutes).toBe(window.startMinutes);
    expect(window.label).toBe('10:00 AM to 1:00 PM');
  });
});

describe('rankOfferSuggestions', () => {
  const planned = [
    stop({ id: 'a', arrivalMinutes: 9 * 60, departMinutes: 10 * 60 }),
    stop({ id: 'b', arrivalMinutes: 15 * 60, departMinutes: 16 * 60 }),
  ];

  function lead(overrides: Partial<OfferCandidateLead> & { id: string }): OfferCandidateLead {
    return {
      name: 'Sam Rivera',
      phone: '+13135550142',
      address: '123 Maple St',
      projectType: 'Roof repair',
      lat: NEARBY.lat,
      lng: NEARBY.lng,
      ...overrides,
    };
  }

  it('suggests the closest lead first', () => {
    const suggestions = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [
        lead({ id: 'far', lat: 42.64, lng: -83.22 }),
        lead({ id: 'close' }),
      ],
      alreadyOfferedLeadIds: new Set(),
    });
    expect(suggestions.map((s) => s.lead.id)).toEqual(['close', 'far']);
  });

  it('never suggests a lead that has already been asked', () => {
    const suggestions = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [lead({ id: 'asked' })],
      alreadyOfferedLeadIds: new Set(['asked']),
    });
    expect(suggestions).toEqual([]);
  });

  it('skips a lead with no mobile and a lead with no coordinates', () => {
    const suggestions = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [lead({ id: 'nophone', phone: null }), lead({ id: 'nogeo', lat: null, lng: null })],
      alreadyOfferedLeadIds: new Set(),
    });
    expect(suggestions).toEqual([]);
  });

  it('will not claim a lead across the county is close to the route', () => {
    const suggestions = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [lead({ id: 'across', lat: ACROSS_TOWN.lat, lng: ACROSS_TOWN.lng })],
      alreadyOfferedLeadIds: new Set(),
    });
    expect(suggestions).toEqual([]);
  });

  it('will not offer a window somebody is already deciding about', () => {
    const free = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [lead({ id: 'one' })],
      alreadyOfferedLeadIds: new Set(),
    });
    expect(free).toHaveLength(1);

    const blocked = rankOfferSuggestions({
      placement: planInput(planned),
      leads: [lead({ id: 'one' })],
      alreadyOfferedLeadIds: new Set(),
      // The whole afternoon is held for someone else.
      blocked: [{ startMinutes: 10 * 60, endMinutes: 17 * 60 }],
    });
    expect(blocked).toEqual([]);
  });
});

describe('the message', () => {
  it('keeps the reply instruction and the opt-out line outside what the contractor edits', () => {
    const message = composeOfferMessage('Rivera Roofing', 'Hi Sam, we are nearby today.');
    expect(message.startsWith('Rivera Roofing: ')).toBe(true);
    expect(message).toContain('Reply YES');
    expect(message).toContain('Reply STOP to opt out.');
  });

  it('drafts something a person would actually send', () => {
    const body = draftOfferBody({
      leadName: 'Sam Rivera',
      projectType: 'Roof repair',
      windowLabel: '1:00 PM to 3:00 PM',
      dayWord: 'today',
    });
    expect(body).toContain('Hi Sam');
    expect(body).toContain('roof repair');
    expect(body).toContain('1:00 PM to 3:00 PM');
    expect(body.length).toBeLessThanOrEqual(MAX_OFFER_BODY);
  });

  it('does not shout back a name that was typed in caps lock', () => {
    const body = draftOfferBody({ leadName: 'HOLLY DOP', projectType: null, windowLabel: '10:15 AM to 1:00 PM', dayWord: 'today' });
    expect(body).toContain('Hi Holly');
    // A name that is merely capitalised oddly is left exactly as the customer wrote it.
    expect(draftOfferBody({ leadName: 'McBride Jones', projectType: null, windowLabel: 'x', dayWord: 'today' })).toContain('Hi McBride');
  });

  it('copes with a lead who never gave a name or a project', () => {
    const body = draftOfferBody({ leadName: null, projectType: null, windowLabel: '9:00 AM to 11:00 AM', dayWord: 'tomorrow' });
    expect(body).toContain('Hi there');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('for your ');
  });

  it('refuses an empty or overlong body', () => {
    expect(offerBodyProblem('   ')).toBeTruthy();
    expect(offerBodyProblem('x'.repeat(MAX_OFFER_BODY + 1))).toBeTruthy();
    expect(offerBodyProblem('Hi Sam, we are nearby today.')).toBeNull();
  });
});

describe('parseOfferReply', () => {
  it('takes a plain yes', () => {
    for (const reply of ['yes', 'YES', 'Yes!', 'y', 'sure', 'ok', 'Yes please', 'that works', '1']) {
      expect(parseOfferReply(reply)).toBe('accept');
    }
  });

  it('takes a plain no', () => {
    for (const reply of ['no', 'No.', 'nope', 'no thanks', 'Not today', "can't", '2']) {
      expect(parseOfferReply(reply)).toBe('decline');
    }
  });

  it('refuses to book anybody off an answer that is not one', () => {
    for (const reply of [
      'yes but can you do Tuesday instead',
      'what would that cost',
      'no idea, let me ask my wife and get back to you',
      'yes no',
      '',
      'maybe',
    ]) {
      expect(parseOfferReply(reply)).toBe('unclear');
    }
  });

  it('does not read a yes out of a sentence that merely contains one', () => {
    expect(parseOfferReply('I already said yes to another company')).toBe('unclear');
  });
});

describe('the hold', () => {
  const now = new Date('2026-07-31T14:00:00Z');

  it('counts down while it is running', () => {
    const state = holdState({ status: 'held', hold_expires_at: '2026-07-31T14:30:00Z' }, now);
    expect(state.holding).toBe(true);
    expect(state.minutesLeft).toBe(30);
  });

  it('is over the moment it is over, with no sweep required', () => {
    const offer = { status: 'held' as const, hold_expires_at: '2026-07-31T13:59:00Z' };
    expect(holdState(offer, now).holding).toBe(false);
    expect(displayStatus(offer, now)).toBe('expired');
  });

  it('leaves an answered offer alone whatever the clock says', () => {
    const offer = { status: 'accepted' as const, hold_expires_at: '2026-07-31T13:00:00Z' };
    expect(displayStatus(offer, now)).toBe('accepted');
  });
});

describe('windowProblem', () => {
  it('accepts what the panel offers', () => {
    expect(windowProblem({ startMinutes: 13 * 60, endMinutes: 15 * 60, arrivalMinutes: 13 * 60 })).toBeNull();
  });

  it('rejects a window too narrow to be worth waiting in', () => {
    expect(windowProblem({ startMinutes: 13 * 60, endMinutes: 13 * 60 + MIN_OFFER_WINDOW_MINUTES - 1, arrivalMinutes: 13 * 60 })).toBeTruthy();
  });

  it('rejects a window so wide it stops being an appointment', () => {
    expect(windowProblem({ startMinutes: 8 * 60, endMinutes: 17 * 60, arrivalMinutes: 8 * 60 })).toBeTruthy();
  });

  it('rejects a planned arrival outside the window we promised', () => {
    expect(windowProblem({ startMinutes: 13 * 60, endMinutes: 15 * 60, arrivalMinutes: 16 * 60 })).toBeTruthy();
  });
});
