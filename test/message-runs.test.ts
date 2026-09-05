import { describe, it, expect } from 'vitest';
import { conversationPreview, dayDivider, groupByDay, groupRuns, initialsFor } from '../src/lib/message-context';

const at = (minutes: number, direction: string) => ({
  created_at: new Date(Date.UTC(2026, 7, 3, 9, minutes)).toISOString(),
  direction,
});

describe('groupRuns', () => {
  it('clusters consecutive messages from the same side', () => {
    const runs = groupRuns([at(0, 'outbound'), at(1, 'outbound'), at(2, 'outbound')]);
    expect(runs).toHaveLength(1);
    expect(runs[0].items).toHaveLength(3);
    expect(runs[0].direction).toBe('outbound');
  });

  it('starts a new run when the side changes', () => {
    const runs = groupRuns([at(0, 'outbound'), at(1, 'inbound'), at(2, 'outbound')]);
    expect(runs.map((run) => run.direction)).toEqual(['outbound', 'inbound', 'outbound']);
  });

  // The reason the gap exists: "on my way" and "running late" three hours apart
  // are two turns, and merging them would stamp the first with the second's time.
  it('starts a new run after a long gap on the same side', () => {
    const runs = groupRuns([at(0, 'outbound'), at(180, 'outbound')]);
    expect(runs).toHaveLength(2);
  });

  it('keeps messages together right up to the gap boundary', () => {
    expect(groupRuns([at(0, 'inbound'), at(5, 'inbound')])).toHaveLength(1);
    expect(groupRuns([at(0, 'inbound'), at(6, 'inbound')])).toHaveLength(2);
  });

  it('honours a custom gap', () => {
    expect(groupRuns([at(0, 'inbound'), at(30, 'inbound')], 60)).toHaveLength(1);
  });

  it('handles an empty thread', () => {
    expect(groupRuns([])).toEqual([]);
  });

  it('never loses or reorders a message', () => {
    const messages = [at(0, 'inbound'), at(1, 'outbound'), at(2, 'outbound'), at(90, 'outbound')];
    const flat = groupRuns(messages).flatMap((run) => run.items);
    expect(flat).toEqual(messages);
  });
});

describe('initialsFor', () => {
  it('takes the first and last name', () => {
    expect(initialsFor('Dana Whitfield')).toBe('DW');
  });

  it('skips middle names', () => {
    expect(initialsFor('Mary Jane Watson')).toBe('MW');
  });

  it('uses two letters of a single name', () => {
    expect(initialsFor('Cher')).toBe('CH');
  });

  it('tolerates messy spacing', () => {
    expect(initialsFor('  damon   pryce  ')).toBe('DP');
  });

  it('falls back rather than rendering empty', () => {
    expect(initialsFor('')).toBe('#');
    expect(initialsFor(null)).toBe('#');
    expect(initialsFor(undefined)).toBe('#');
  });
});

describe('conversationPreview', () => {
  it('shortens a link to its host so the preview is about the customer', () => {
    expect(conversationPreview('Your quote is ready: https://letsgetquoted.com/p/8f2a1c9b4d')).toBe(
      'Your quote is ready: letsgetquoted.com/…',
    );
  });

  it('drops www so two hosts do not read as two places', () => {
    expect(conversationPreview('See https://www.example.com/a/b')).toBe('See example.com/…');
  });

  it('shortens every link in the message, not just the first', () => {
    expect(conversationPreview('Quote https://a.com/1 and invoice https://b.com/2')).toBe(
      'Quote a.com/… and invoice b.com/…',
    );
  });

  it('drops the compliance tail, which is identical in every thread', () => {
    expect(conversationPreview('On my way, about 20 minutes. Reply STOP to opt out.')).toBe(
      'On my way, about 20 minutes.',
    );
  });

  // The tail is only boilerplate at the END. A customer quoting it back is a
  // thread that needs a human, and hiding that would be the opposite of useful.
  it('keeps the same words when they are not the tail', () => {
    expect(conversationPreview('I tried to Reply STOP to opt out and it did nothing')).toBe(
      'I tried to Reply STOP to opt out and it did nothing',
    );
  });

  it('collapses the newlines a multi-line text would otherwise spill', () => {
    expect(conversationPreview('Line one\n\nLine two')).toBe('Line one Line two');
  });

  it('survives empty and missing bodies, which a photo-only text has', () => {
    expect(conversationPreview('')).toBe('');
    expect(conversationPreview(null)).toBe('');
    expect(conversationPreview(undefined)).toBe('');
  });

  it('leaves an ordinary message exactly as written', () => {
    expect(conversationPreview('Can you come Tuesday?')).toBe('Can you come Tuesday?');
  });
});

describe('dayDivider', () => {
  it('formats dates in the specified timezone', () => {
    // 2026-08-04T02:00:00Z is 10:00 PM on Monday, August 3 in America/New_York (EDT)
    const iso = '2026-08-04T02:00:00.000Z';
    expect(dayDivider(iso, 'America/New_York')).toBe('Monday, August 3');
    expect(dayDivider(iso, 'UTC')).toBe('Tuesday, August 4');
  });
});

describe('groupByDay', () => {
  it('buckets evening texts into the contractor local day instead of next day UTC', () => {
    const eveningMsg = { created_at: '2026-08-04T02:30:00.000Z', text: '10:30 PM EST text' };
    const afternoonMsg = { created_at: '2026-08-03T19:00:00.000Z', text: '3:00 PM EST text' };
    const morningNextDayMsg = { created_at: '2026-08-04T13:00:00.000Z', text: '9:00 AM EST next day' };

    const grouped = groupByDay([afternoonMsg, eveningMsg, morningNextDayMsg], 'America/New_York');
    expect(grouped).toHaveLength(2);
    expect(grouped[0].key).toBe('2026-08-03');
    expect(grouped[0].label).toBe('Monday, August 3');
    expect(grouped[0].items).toEqual([afternoonMsg, eveningMsg]);
    expect(grouped[1].key).toBe('2026-08-04');
    expect(grouped[1].label).toBe('Tuesday, August 4');
    expect(grouped[1].items).toEqual([morningNextDayMsg]);
  });
});

