'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAV_ICON_PATHS } from '@/components/nav-icons';

/**
 * ONE JOB RECORD, FOUR STAGES.
 *
 * This replaced four stacked "capability bands" — a number, a heading, a
 * sentence and two or three tool cards, four times down the page. Every band
 * was true and none of them showed the thing the section is actually claiming,
 * which is that these are not four products. They are four stages of ONE
 * record, and the only way to say that is to keep the record on screen and let
 * the stages move it.
 *
 * So the panel never changes identity: JOB J-1048, Alex Morgan, Royal Oak, in
 * every stage. What changes is where the work has got to — the arrival tracker
 * advances, the crew row goes from "assigned" to hours logged, the message row
 * carries a different automatic text, and the money row moves from deposit to
 * balance to rebook. Same four slots, same job, later in the week.
 *
 * WHAT IS REAL. Every row names something the product does: arrival tracking
 * with its four states (lib/arrival.ts), the crew time clock, automatic
 * on-my-way texts, change orders, deposits and balances through Stripe, review
 * requests and rebook reminders. The job, the homeowner and the figures are
 * invented, which the panel says out loud.
 *
 * THE FOUR IDS ARE A CONTRACT. planning-and-scheduling, automations, payments
 * and website-and-growth are linked from the homepage's suite cards and from
 * /how-it-works, and there is a test that fails if either side is renamed
 * alone. They live on the tab buttons here, which is also what the tabs pattern
 * wants for aria-labelledby — and following one of those links now SELECTS the
 * stage rather than merely scrolling near it. See useHashStage.
 */

type Track = { steps: string[]; at: number };

type Row =
  | { kind: 'track'; icon: string; text: string; track: Track }
  | { kind: 'people'; icon: string; text: string; chips: string[]; pill: string }
  | { kind: 'status'; icon: string; text: string; badge: string; when: string }
  | { kind: 'action'; icon: string; text: string; action: string };

type Stage = {
  /** Also the anchor the homepage links to. */
  id: string;
  number: string;
  title: string;
  lead: string;
  /** Where the job has got to, top right of the record. */
  badge: string;
  rows: [Row, Row, Row, Row];
  /** The tools this stage is made of. Unchanged copy from the bands. */
  tools: [string, string][];
};

/* The arrival tracker's four states, in the order lib/arrival.ts moves through
   them. Written once because all four stages draw the same track at a
   different point — which is the entire argument of the section. */
const ARRIVAL = ['Scheduled', 'On the way', 'On site', 'Complete'];

const STAGES: Stage[] = [
  {
    id: 'planning-and-scheduling',
    number: '01',
    title: 'Plan & Schedule',
    lead: 'Put the approved work on the calendar, with everything the crew needs to arrive ready.',
    badge: 'Quote approved',
    rows: [
      {
        kind: 'track',
        icon: '/dashboard/schedule',
        text: 'Tuesday · 9–11 AM',
        track: { steps: ARRIVAL, at: 0 },
      },
      {
        kind: 'people',
        icon: '/dashboard/crew',
        text: 'Mike + Tanya assigned',
        chips: ['MK', 'TN', 'JD'],
        pill: 'Crew',
      },
      {
        kind: 'status',
        icon: '/dashboard/messages',
        text: 'Customer confirmation sent',
        badge: 'Sent',
        when: 'Mon, May 12 · 9:32 AM',
      },
      {
        kind: 'action',
        icon: '/dashboard/cash-flow',
        text: 'Next: collect $2,125 deposit',
        action: 'Send payment link',
      },
    ],
    tools: [
      ['Scheduling', 'Arrival windows, capacity and the details needed to keep the promise.'],
      ['Crew + labor', 'Assignments, time clock, hours and estimated pay.'],
    ],
  },
  {
    id: 'automations',
    number: '02',
    title: 'Automate & Follow Up',
    lead: 'The messages, reminders and repeat visits that would otherwise depend on remembering.',
    badge: 'On the way',
    rows: [
      {
        kind: 'track',
        icon: '/dashboard/schedule',
        text: 'Tuesday · 9–11 AM',
        track: { steps: ARRIVAL, at: 1 },
      },
      {
        kind: 'people',
        icon: '/dashboard/crew',
        text: 'Mike started the clock · 8:47 AM',
        chips: ['MK', 'TN', 'JD'],
        pill: 'Time clock',
      },
      {
        kind: 'status',
        icon: '/dashboard/messages',
        text: '“On my way” text sent for you',
        badge: 'Sent',
        when: 'Tue, May 13 · 8:47 AM',
      },
      {
        kind: 'action',
        icon: '/dashboard/recurring',
        text: 'Repeat visit every 8 weeks',
        action: 'See the plan',
      },
    ],
    tools: [
      ['Customer communication', 'Two-way texts and a job-specific client portal.'],
      ['Recurring work', 'Automatic visits, saved cards and predictable revenue.'],
    ],
  },
  {
    id: 'payments',
    number: '03',
    title: 'Get Paid Faster',
    lead: 'From the quote a customer approves to the money landing in your account.',
    badge: 'Deposit paid',
    rows: [
      {
        kind: 'track',
        icon: '/dashboard/schedule',
        text: 'On site since 9:04 AM',
        track: { steps: ARRIVAL, at: 2 },
      },
      {
        kind: 'people',
        icon: '/dashboard/crew',
        text: '6.5 hrs logged · $312 labor',
        chips: ['MK', 'TN'],
        pill: 'Labor',
      },
      {
        kind: 'status',
        icon: '/dashboard/jobs',
        text: 'Change order approved · +$480',
        badge: 'Signed',
        when: 'Tue, May 13 · 1:14 PM',
      },
      {
        kind: 'action',
        icon: '/dashboard/cash-flow',
        text: 'Balance due $6,375',
        action: 'Send the invoice',
      },
    ],
    tools: [
      ['Quotes + e-sign', 'Itemized proposals, optional upgrades and clear approvals.'],
      ['Payments', 'Deposits, balances and payment plans through Stripe.'],
      ['Cash flow', 'See customer money, payroll and bills before they move.'],
    ],
  },
  {
    id: 'website-and-growth',
    number: '04',
    title: 'Grow Your Business',
    lead: 'Turn finished work into reviews, repeat customers and the next job.',
    badge: 'Paid in full',
    rows: [
      {
        kind: 'track',
        icon: '/dashboard/schedule',
        text: 'Complete · Tue 3:10 PM',
        track: { steps: ARRIVAL, at: 3 },
      },
      {
        kind: 'people',
        icon: '/dashboard/crew',
        text: 'Tanya closed the job out',
        chips: ['TN'],
        pill: 'Crew',
      },
      {
        kind: 'status',
        icon: '/dashboard/reviews',
        text: 'Review request sent',
        badge: 'Sent',
        when: 'Wed, May 14 · 9:00 AM',
      },
      {
        kind: 'action',
        icon: '/dashboard/marketing',
        text: 'Rebook reminder in 8 weeks',
        action: 'See the campaign',
      },
    ],
    tools: [
      ['Reviews + growth', 'Follow-ups, review requests and AI-assisted marketing.'],
      [
        'Campaigns + blog',
        'Email and text campaigns, a blog that publishes to your site, and what each one did.',
      ],
    ],
  },
];

/** The dashboard rail's own glyphs, without its sidebar class. */
function Glyph({ href }: { href: string }) {
  const inner = NAV_ICON_PATHS[href];
  if (!inner) return null;
  return (
    <svg className="jrs-glyph" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

function CheckMark() {
  return (
    <svg className="jrs-tick" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.4 12.3 2.5 2.5 4.7-5" />
    </svg>
  );
}

function RecordRow({ row }: { row: Row }) {
  return (
    <div className="jrs-row" data-kind={row.kind}>
      <span className="jrs-row-ic">
        <Glyph href={row.icon} />
      </span>
      <span className="jrs-row-text">{row.text}</span>

      {row.kind === 'track' ? (
        // A list, because it is four named states in order and the current one
        // is a fact about the job — not a decoration on a bar.
        <ol className="jrs-track">
          {row.track.steps.map((step, i) => (
            <li key={step} data-state={i < row.track.at ? 'done' : i === row.track.at ? 'now' : 'todo'}>
              <i aria-hidden="true" />
              <span>{step}</span>
              {i === row.track.at ? <em className="sr-only"> (current)</em> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {row.kind === 'people' ? (
        <span className="jrs-people">
          <span className="jrs-chips" aria-hidden="true">
            {row.chips.map((chip) => (
              <b key={chip}>{chip}</b>
            ))}
          </span>
          <span className="jrs-pill">{row.pill}</span>
        </span>
      ) : null}

      {row.kind === 'status' ? (
        <span className="jrs-status">
          <span className="jrs-badge jrs-badge-ok">
            <CheckMark /> {row.badge}
          </span>
          <span className="jrs-when">{row.when}</span>
        </span>
      ) : null}

      {row.kind === 'action' ? (
        // Deliberately NOT a button. Nothing here is operable — it is a drawing
        // of the app, and a control that looks live and does nothing is worse
        // than one that plainly does not exist. It is styled as the affordance
        // it depicts and hidden from the accessibility tree's control list.
        <span className="jrs-action" aria-hidden="true">
          {row.action} <i>›</i>
        </span>
      ) : null}
    </div>
  );
}

function JobRecord({ stage }: { stage: Stage }) {
  return (
    <article className="jrs-record">
      <header className="jrs-record-head">
        <div>
          <h4>JOB J-1048</h4>
          <p>Alex Morgan · Royal Oak</p>
        </div>
        <span className="jrs-badge jrs-badge-stage">
          <CheckMark /> {stage.badge}
        </span>
      </header>

      <div className="jrs-rows">
        {stage.rows.map((row) => (
          <RecordRow key={row.text} row={row} />
        ))}
      </div>

      <p className="jrs-same">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="jrs-lock">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
        </svg>
        Same job record
      </p>
    </article>
  );
}

export default function JobRecordStages() {
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  /** Set while the keyboard is driving, so focus follows selection then only. */
  const movingRef = useRef(false);

  const select = useCallback((next: number) => {
    setActive(((next % STAGES.length) + STAGES.length) % STAGES.length);
  }, []);

  /**
   * FOLLOWING /features#payments SELECTS THAT STAGE.
   *
   * Those four fragments used to land on four separate bands. Now there is one
   * panel, so a link that only scrolled would leave a reader looking at
   * whichever stage happened to be open — usually not the one they clicked.
   * Read on mount and on every hashchange, because Next's client router
   * changes the hash without a navigation.
   */
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      const at = STAGES.findIndex((stage) => stage.id === id);
      if (at >= 0) setActive(at);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // Automatic activation, which is what the tabs pattern prescribes when the
  // panels are cheap — so focus has to travel with the selection, but ONLY when
  // an arrow key moved it. Doing it on every change would steal focus from a
  // reader who clicked and then tabbed away.
  useEffect(() => {
    if (!movingRef.current) return;
    movingRef.current = false;
    const tabs = railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[active]?.focus();
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowRight: active + 1,
      ArrowUp: active - 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: STAGES.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    movingRef.current = true;
    select(next);
  };

  return (
    <div className="jrs">
      <div
        className="jrs-rail"
        role="tablist"
        aria-orientation="vertical"
        aria-label="Stages of one job"
        ref={railRef}
        onKeyDown={onKeyDown}
      >
        {STAGES.map((stage, i) => (
          <button
            key={stage.id}
            type="button"
            role="tab"
            /* The anchor the homepage and /how-it-works link to. */
            id={stage.id}
            aria-selected={i === active}
            aria-controls={`${stage.id}-panel`}
            tabIndex={i === active ? 0 : -1}
            data-on={i === active ? 'true' : 'false'}
            onClick={() => select(i)}
          >
            <span className="jrs-num" aria-hidden="true">{stage.number}</span>
            <span className="jrs-name">{stage.title}</span>
            <span className="jrs-lead">{stage.lead}</span>
          </button>
        ))}
      </div>

      {/* All four panels are rendered. `hidden` keeps the three that are not
          open out of the tab order and out of the accessibility tree while
          leaving every tool description in the HTML — this section is the only
          place several of them are written down. */}
      {STAGES.map((stage, i) => (
        <div
          key={stage.id}
          className="jrs-panel"
          role="tabpanel"
          id={`${stage.id}-panel`}
          aria-labelledby={stage.id}
          hidden={i !== active}
          tabIndex={0}
        >
          <JobRecord stage={stage} />

          <ul className="jrs-tools">
            {stage.tools.map(([name, body]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="jrs-more">
        <Link href="/features/back-office">
          Explore the connected back office <span aria-hidden="true">→</span>
        </Link>
      </p>
    </div>
  );
}
