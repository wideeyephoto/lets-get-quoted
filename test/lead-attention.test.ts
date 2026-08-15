import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ATTENTION_BADGE_MAX,
  QUEUE_STAGES,
  attentionBadgeLabel,
  isLeadActive,
  isSetAside,
  needsResponse,
  queueStageLabel,
  stageCounts,
  type AttentionLead,
  type QueueLead,
} from '@/lib/lead-queue';
import { leadSummary } from '@/lib/lead-summary';
import { leadStageLabel } from '@/lib/lead-detail-labels';

/**
 * ONE PREDICATE BEHIND EVERY LEAD NUMBER.
 *
 * There were four, and they disagreed. Archive and Snooze write into the
 * `triage` blob and never touch `status`, so the Leads page was the only code
 * that read them back: a snoozed lead vanished from the board the owner was
 * looking at while the dashboard card, the rail badge and the alert banner all
 * went on counting it — for as long as the snooze ran.
 *
 * This is the cluster where a regression is invisible, because every symptom is
 * a number that is merely wrong rather than a page that breaks. So the tests
 * assert the property directly: put one lead down, and it leaves EVERY count.
 */

const now = new Date('2026-08-15T12:00:00Z');
const daysFromNow = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

function lead(over: Partial<AttentionLead> = {}): AttentionLead {
  return { status: 'new', ...over, triage: { score: 'warm', ...(over.triage ?? {}) } };
}

// The Leads page hands the queue full display rows. Only `status` decides a
// stage count, so everything else here is filler.
function asQueueLead(row: AttentionLead, index: number): QueueLead {
  return {
    id: `l${index}`,
    name: 'Dana Whitfield',
    status: row.status,
    detail: 'Roof replacement',
    address: null,
    location: null,
    city: null,
    createdAt: now.toISOString(),
    score: row.triage.score ?? 'warm',
    estimate: null,
    isUrgent: false,
  };
}

describe('set aside means set aside', () => {
  it('counts an archived lead as put down', () => {
    expect(isSetAside({ archived: true }, now)).toBe(true);
  });

  it('counts a snooze that has not run out yet', () => {
    expect(isSetAside({ snoozedUntil: daysFromNow(3) }, now)).toBe(true);
  });

  // The field is left on the row after a snooze ends, so testing it for
  // presence would bury the lead permanently.
  it('lets a lead back out when its snooze expires', () => {
    expect(isSetAside({ snoozedUntil: daysFromNow(-1) }, now)).toBe(false);
  });

  it('says no for a lead nobody has touched, and for a broken date', () => {
    expect(isSetAside({}, now)).toBe(false);
    expect(isSetAside({ snoozedUntil: null }, now)).toBe(false);
    expect(isSetAside({ snoozedUntil: 'not-a-date' }, now)).toBe(false);
  });
});

describe('active leads', () => {
  it('drops the closed ones', () => {
    for (const status of ['won', 'lost'] as const) {
      expect(isLeadActive(lead({ status }), now)).toBe(false);
    }
  });

  it('keeps everything still in the pipeline', () => {
    for (const status of ['new', 'contacted', 'quoted'] as const) {
      expect(isLeadActive(lead({ status }), now)).toBe(true);
    }
  });

  it('drops an archived or snoozed lead whatever stage it is at', () => {
    for (const status of ['new', 'contacted', 'quoted'] as const) {
      expect(isLeadActive(lead({ status, triage: { archived: true } }), now)).toBe(false);
      expect(isLeadActive(lead({ status, triage: { snoozedUntil: daysFromNow(5) } }), now)).toBe(false);
    }
  });
});

describe('needs response', () => {
  it('is every unanswered lead, not only the ones from the website', () => {
    // Non-website 'new' leads really exist — typed in by hand, and written by
    // the missed-call handler — and gating on source is what made two numbers
    // under one "Needs response" label disagree.
    expect(needsResponse(lead({ status: 'new' }), {}, now)).toBe(true);
  });

  it('stops the moment somebody has replied', () => {
    for (const status of ['contacted', 'quoted', 'won', 'lost'] as const) {
      expect(needsResponse(lead({ status }), {}, now)).toBe(false);
    }
  });

  it('says no for a lead that has been put down', () => {
    expect(needsResponse(lead({ triage: { archived: true } }), {}, now)).toBe(false);
    expect(needsResponse(lead({ triage: { snoozedUntil: daysFromNow(2) } }), {}, now)).toBe(false);
  });

  // The mute is the owner's own setting and only ever removes, so the badge can
  // read lower than the page it points at but never higher.
  it('honors the low-quality mute only when it is asked to', () => {
    const junk = lead({ triage: { score: 'low' } });
    expect(needsResponse(junk, { muteLowQuality: true }, now)).toBe(false);
    expect(needsResponse(junk, { muteLowQuality: false }, now)).toBe(true);
    expect(needsResponse(junk, {}, now)).toBe(true);
    // It is about quality, not about answering — a hot lead is never muted.
    expect(needsResponse(lead({ triage: { score: 'hot' } }), { muteLowQuality: true }, now)).toBe(true);
  });
});

/**
 * The regression this cluster exists to stop.
 *
 * Every counter in the product, fed the same list, has to agree that a snoozed
 * lead is not work. If any one of them re-derives the predicate by hand, this
 * is where it shows up.
 */
describe('a lead that is put down leaves every count', () => {
  const rows: AttentionLead[] = [
    lead({ status: 'new' }),
    lead({ status: 'new', triage: { snoozedUntil: daysFromNow(7) } }),
    lead({ status: 'contacted', triage: { archived: true } }),
    lead({ status: 'contacted' }),
    lead({ status: 'quoted' }),
  ];
  const active = rows.filter((row) => isLeadActive(row, now));

  it('leaves the Leads page board and its stage chips', () => {
    // What the page renders, and what the chips above it count.
    const counts = stageCounts(active.map(asQueueLead));
    expect(counts.all).toBe(3);
    expect(counts.new).toBe(1);
    expect(counts.contacted).toBe(1);
  });

  it('leaves the dashboard follow-up card', () => {
    // buildDashboardHome filters with isLeadActive before leadSummary; the card
    // reads needsYou, which used to include both put-down leads.
    const summary = leadSummary(active.map((row) => ({ status: row.status, source: 'website_form' })));
    expect(summary.needsYou).toBe(2);
    expect(summary.open).toBe(3);
  });

  it('leaves the rail badge and the alert banner', () => {
    expect(rows.filter((row) => needsResponse(row, { muteLowQuality: true }, now)).length).toBe(1);
  });

  // The number under "Needs response" on the Leads page and the number in the
  // rail badge were computed two different ways and could differ in either
  // direction. With the mute off they are now the same arithmetic.
  it('and the page ticker and the badge land on the same figure', () => {
    const ticker = stageCounts(active.map(asQueueLead)).new;
    const badge = rows.filter((row) => needsResponse(row, { muteLowQuality: false }, now)).length;
    expect(ticker).toBe(badge);
  });
});

describe('the badge stops being a number before it stops being true', () => {
  it('prints small counts as themselves', () => {
    expect(attentionBadgeLabel(0)).toBe('0');
    expect(attentionBadgeLabel(7)).toBe('7');
    expect(attentionBadgeLabel(ATTENTION_BADGE_MAX)).toBe('50');
  });

  // It used to be the length of a fifty-row fetch, so a stuck fifty and a real
  // fifty looked identical.
  it('says "50+" rather than sticking at fifty', () => {
    expect(attentionBadgeLabel(51)).toBe('50+');
    expect(attentionBadgeLabel(400)).toBe('50+');
  });
});

describe('one stage word per lead', () => {
  // The row badge and the chip above it describe the same lead, so they cannot
  // come from two maps any more. This is the cross-module half of the property;
  // lead-detail-labels.test.ts pins the wordings themselves.
  it('gives the same word as the queue for every stage, whatever the source', () => {
    for (const stage of QUEUE_STAGES) {
      expect(leadStageLabel(stage.id)).toBe(queueStageLabel(stage.id));
      expect(leadStageLabel(stage.id, 'website_form')).toBe(queueStageLabel(stage.id));
      expect(leadStageLabel(stage.id, 'missed_call')).toBe(queueStageLabel(stage.id));
    }
  });
});

describe('the shell and Leads page count the same production records', () => {
  it('applies the test-record filter to both shell lead queries', () => {
    const route = readFileSync('src/app/api/account/status/route.ts', 'utf8');
    expect(route.match(/applyTestRecordFilter\(/g)).toHaveLength(2);
    expect(route).not.toContain(".eq('source', 'website_form')");
  });
});
