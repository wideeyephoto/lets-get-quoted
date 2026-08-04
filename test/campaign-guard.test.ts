import { describe, it, expect } from 'vitest';
import {
  checkCampaign,
  hasBlockingFinding,
  rankFindings,
  shoutiness,
  smsSegments,
  unknownPlaceholders,
  type GuardInput,
} from '@/lib/campaign-guard';
import { buildCampaignReadInput, toGapFindings } from '@/lib/campaign-guard-ai';

const clean: GuardInput = {
  channel: 'email',
  subject: 'Booking heating tune-ups for October',
  body: [
    'Every year the first properly cold week generates a fortnight of emergency calls, and by then we are booked out.',
    'If your heating has not been looked at since last winter, now is the point where booking is still easy.',
    'Reply to this and we will find you a slot.',
  ].join('\n\n'),
  reachCount: 84,
  mailingAddress: '1418 Maplewood Ave, Royal Oak, MI 48073',
  daysSinceLastSend: 45,
  unsubscribesSinceLastSend: 0,
};

function ids(input: GuardInput): string[] {
  return checkCampaign(input).map((finding) => finding.id);
}

describe('unknownPlaceholders', () => {
  it('finds tokens that will be sent literally', () => {
    // {name} is the ONLY token the send path substitutes. Anything else lands
    // in the customer's inbox with the braces still in it.
    expect(unknownPlaceholders('Hi {first_name}, your {service} is due')).toEqual(['{first_name}', '{service}']);
  });

  it('leaves the one that actually works alone', () => {
    expect(unknownPlaceholders('Hi {name}, hope you are well')).toEqual([]);
    expect(unknownPlaceholders('Hi {Name}, and { name } too')).toEqual([]);
  });

  it('reports each stray once however often it appears', () => {
    expect(unknownPlaceholders('{first} and {first} again')).toEqual(['{first}']);
  });
});

describe('shoutiness', () => {
  it('counts capitalised words but not short ones', () => {
    // "I" and "AC" are ordinary; SPRING SALE is not.
    expect(shoutiness('I need my AC looked at').caps).toBe(0);
    expect(shoutiness('SPRING SALE now on').caps).toBe(2);
  });

  it('counts exclamation marks', () => {
    expect(shoutiness('Wow!!! Amazing!').bangs).toBe(4);
  });
});

describe('smsSegments', () => {
  it('allows for the business name and opt-out line the sender adds', () => {
    // 130 characters is under one segment on its own, but not once the prefix
    // and " Reply STOP to opt out." are appended.
    expect(smsSegments('x'.repeat(100))).toBe(1);
    expect(smsSegments('x'.repeat(130))).toBe(2);
  });
});

describe('checkCampaign', () => {
  it('says nothing about a message with nothing wrong with it', () => {
    expect(checkCampaign(clean)).toEqual([]);
  });

  it('catches a placeholder that would be sent as typed', () => {
    const found = checkCampaign({ ...clean, body: `Hi {first_name}, ${clean.body}` });
    expect(found.map((f) => f.id)).toContain('unknown-placeholder');
    // High, because it is embarrassing and it goes to everybody at once.
    expect(found.find((f) => f.id === 'unknown-placeholder')?.severity).toBe('high');
  });

  it('checks the subject for strays as well as the body', () => {
    expect(ids({ ...clean, subject: 'A note for {company}' })).toContain('unknown-placeholder');
  });

  it('ignores the subject entirely when it is a text-only send', () => {
    // There is no subject line on an SMS, so a stray token in an unused field
    // is not a finding — it is never sent.
    expect(ids({ ...clean, channel: 'sms', subject: 'Left over {company}' })).not.toContain('unknown-placeholder');
    expect(ids({ ...clean, channel: 'sms', subject: '' })).not.toContain('no-subject');
  });

  it('blocks an email with no postal address on file', () => {
    // CAN-SPAM. The send path throws on this anyway; the point is saying so
    // before the contractor writes rather than after.
    expect(ids({ ...clean, mailingAddress: null })).toContain('no-mailing-address');
    // ...and not on a text, which carries no postal address.
    expect(ids({ ...clean, channel: 'sms', mailingAddress: null })).not.toContain('no-mailing-address');
  });

  it('flags sending again within a week of the last one', () => {
    const found = checkCampaign({ ...clean, daysSinceLastSend: 3 });
    const crowding = found.find((f) => f.id === 'sent-recently');
    expect(crowding?.severity).toBe('high');
    expect(crowding?.title).toContain('3 days ago');
    expect(crowding?.source).toBe('history');
  });

  it('reads a same-day send as today rather than "0 days ago"', () => {
    expect(checkCampaign({ ...clean, daysSinceLastSend: 0 }).find((f) => f.id === 'sent-recently')?.title)
      .toContain('earlier today');
  });

  it('says nothing about frequency for an account that has never sent', () => {
    expect(ids({ ...clean, daysSinceLastSend: null })).not.toContain('sent-recently');
  });

  it('surfaces unsubscribes, because nothing else measures the damage', () => {
    // We do not track opens or clicks — that needs a pixel and a vendor. This
    // is the only honest feedback signal the product has.
    const one = checkCampaign({ ...clean, unsubscribesSinceLastSend: 1 });
    expect(one.find((f) => f.id === 'recent-unsubscribes')?.severity).toBe('low');
    expect(one.find((f) => f.id === 'recent-unsubscribes')?.title).toContain('1 person');

    const many = checkCampaign({ ...clean, unsubscribesSinceLastSend: 6 });
    expect(many.find((f) => f.id === 'recent-unsubscribes')?.severity).toBe('medium');
    expect(many.find((f) => f.id === 'recent-unsubscribes')?.title).toContain('6 people');
  });

  it('warns when a text would bill as several segments', () => {
    const found = checkCampaign({ ...clean, channel: 'sms', body: 'x'.repeat(400) });
    expect(found.find((f) => f.id === 'sms-long')?.title).toContain('3 segments');
  });

  it('catches shouting and filter-bait in the subject', () => {
    expect(ids({ ...clean, subject: 'FREE ESTIMATES this week' })).toEqual(
      expect.arrayContaining(['shouty', 'spam-words']),
    );
  });

  it('does not call an ordinary sentence shouty', () => {
    expect(ids({ ...clean, subject: 'Your AC service is due' })).not.toContain('shouty');
  });

  it('says nobody would receive it rather than letting it go out to nobody', () => {
    expect(ids({ ...clean, reachCount: 0 })).toContain('no-reach');
  });

  it('flags an email too thin to be worth opening', () => {
    expect(ids({ ...clean, body: 'Book now, call us.' })).toContain('thin-body');
  });
});

describe('rankFindings', () => {
  it('puts what blocks a send above what a model thought', () => {
    const ranked = rankFindings([
      { id: 'ai:tone', severity: 'low', title: 'a', detail: 'b', source: 'ai' },
      { id: 'no-subject', severity: 'high', title: 'c', detail: 'd', source: 'check' },
      { id: 'sent-recently', severity: 'high', title: 'e', detail: 'f', source: 'history' },
    ]);
    expect(ranked.map((f) => f.id)).toEqual(['no-subject', 'sent-recently', 'ai:tone']);
  });

  it('knows when something is serious enough to interrupt a send', () => {
    expect(hasBlockingFinding([{ id: 'x', severity: 'low', title: 'a', detail: 'b', source: 'ai' }])).toBe(false);
    expect(hasBlockingFinding(checkCampaign({ ...clean, mailingAddress: null }))).toBe(true);
  });
});

describe('the read half', () => {
  it('asks for json in the INPUT, not just the instructions', () => {
    // The Responses API 400s on text.format:json_object unless the word appears
    // in the input. That error is caught and returns [], which would mean the
    // read failing on every campaign while the panel looked like it had run.
    expect(buildCampaignReadInput({ trade: 'Plumbing', channel: 'email', subject: 's', body: 'b', monthName: 'October' }))
      .toMatch(/json/i);
  });

  it('tells the model what month it is, so "why now" is answerable', () => {
    const built = buildCampaignReadInput({ trade: null, channel: 'email', subject: '', body: 'b', monthName: 'October' });
    expect(built).toContain('October');
  });

  it('sends nothing about who will receive it', () => {
    const built = buildCampaignReadInput({ trade: 'Plumbing', channel: 'email', subject: 's', body: 'b', monthName: 'May' });
    expect(built).not.toMatch(/recipient|customer list|audience|reachable/i);
  });

  it('keeps a finding that names something missing', () => {
    const found = toGapFindings({ gaps: [{ id: 'why-now', title: 'No reason it is arriving now', why: 'Nothing ties it to October.', confidence: 'high' }] });
    expect(found).toHaveLength(1);
    expect(found[0].source).toBe('ai');
  });

  it('never lets the model outrank a real check', () => {
    // 'high' confidence becomes 'medium'. A model's read of tone sits below "you
    // have no mailing address on file", and topping the list with an opinion is
    // how the findings that block a send get scrolled past.
    expect(toGapFindings({ gaps: [{ title: 't', why: 'w', confidence: 'high' }] })[0].severity).toBe('medium');
    expect(toGapFindings({ gaps: [{ title: 't', why: 'w', confidence: 'low' }] })[0].severity).toBe('low');
  });

  it('drops a finding that strayed into rewriting the message', () => {
    // The instruction not to rewrite is a request; this is the rule. A
    // contractor handed a sentence will paste it, and then the message going to
    // their whole list was written by something that never saw their customers.
    expect(toGapFindings({ gaps: [{ title: 'Weak subject', why: 'Try: "Book before the freeze"' }] })).toEqual([]);
    expect(toGapFindings({ gaps: [{ title: 'Say: "we are booking October"', why: 'It reads flat.' }] })).toEqual([]);
  });

  it('drops anything with nothing in it, and caps the list', () => {
    expect(toGapFindings({ gaps: [{ title: '', why: 'w' }, { title: 't', why: '' }] })).toEqual([]);
    expect(toGapFindings({ gaps: Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, why: 'w' })) })).toHaveLength(4);
  });

  it('returns nothing rather than throwing on junk', () => {
    expect(toGapFindings(null)).toEqual([]);
    expect(toGapFindings({ gaps: 'not an array' })).toEqual([]);
    expect(toGapFindings({})).toEqual([]);
  });
});
