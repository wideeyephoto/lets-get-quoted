import Link from 'next/link';
import type { SmsMessage } from '@/lib/messages';
import { groupRuns } from '@/lib/message-context';
import DemoInbox, { type DemoThreadView } from './DemoInbox';

export const dynamic = 'force-dynamic';

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type DemoThread = {
  phone: string;
  name: string;
  messages: { direction: SmsMessage['direction']; body: string; hoursAgo: number }[];
};

// Inline, read-only demo inbox for the fictional "Evergreen Lawn & Landscape".
// Client names/phones mirror DEMO_JOBS / DEMO_LEADS but are kept local so the
// shared demo-data module stays untouched.
const DEMO_THREADS: DemoThread[] = [
  {
    phone: '(248) 555-0176',
    name: 'Grace Foster',
    messages: [
      { direction: 'outbound', body: 'Hi Grace — the crew wrapped the French drain and regrade today. Everything drains away from the house now. Want me to text over the final invoice?', hoursAgo: 5 },
      { direction: 'inbound', body: 'Yes please! The yard already looks so much better after that storm last night. Thank you!', hoursAgo: 4 },
      { direction: 'outbound', body: 'Perfect. Invoice link is on its way. We seeded the disturbed strip too — keep it damp for a couple weeks and it’ll fill right in.', hoursAgo: 3 },
    ],
  },
  {
    phone: '(248) 555-0212',
    name: 'Taylor Brooks',
    messages: [
      { direction: 'inbound', body: 'Hi! We’d love a paver patio with a fire pit this summer. Roughly ballpark $12–16k. Can you come take a look?', hoursAgo: 26 },
      { direction: 'outbound', body: 'Absolutely, Taylor — that’s right in our wheelhouse. I can swing by Thursday around 4pm to measure and talk design. Does that work?', hoursAgo: 24 },
      { direction: 'inbound', body: 'Thursday at 4 is great. See you then!', hoursAgo: 23 },
      { direction: 'outbound', body: 'Booked you in. I’ll bring a few paver samples so you can see color options in person.', hoursAgo: 22 },
    ],
  },
  {
    phone: '(248) 555-0121',
    name: 'Marcus Delgado',
    messages: [
      { direction: 'outbound', body: 'Morning Marcus — the crew is on the way to mow and edge the front and back today. ETA about 20 minutes.', hoursAgo: 30 },
      { direction: 'inbound', body: 'Sounds good. Gate on the side is unlocked for you.', hoursAgo: 29 },
      { direction: 'outbound', body: 'All done — lawn’s cut, edged, and blown off. See you next visit!', hoursAgo: 28 },
    ],
  },
  {
    phone: '(248) 555-0110',
    name: 'Karen Whitfield',
    messages: [
      { direction: 'inbound', body: 'The new patio and fire pit are stunning. We had friends over this weekend and everyone asked who did it!', hoursAgo: 50 },
      { direction: 'outbound', body: 'That means a lot, Karen — thank you! If you’re ever up for it, a quick review would help us a ton. And enjoy those evenings by the fire.', hoursAgo: 49 },
    ],
  },
  {
    phone: '(248) 555-0120',
    name: 'Holly Sutton',
    messages: [
      { direction: 'inbound', body: 'Quick question — how often should I water the new hydroseed?', hoursAgo: 74 },
      { direction: 'outbound', body: 'Great question! Light watering 2–3 times a day for the first two weeks to keep it moist, then taper off as it germinates. Avoid mowing until it hits about 3 inches.', hoursAgo: 73 },
      { direction: 'inbound', body: 'Perfect, thank you!', hoursAgo: 72 },
    ],
  },
  {
    phone: '(248) 555-0109',
    name: 'Diego Alvarez',
    messages: [
      { direction: 'outbound', body: 'Hi Diego — sending over the quote link for the flagstone walkway and front-bed redesign. Let me know if you have any questions.', hoursAgo: 100 },
      { direction: 'inbound', body: 'Got it, looking now. Can we start the week after next?', hoursAgo: 98 },
      { direction: 'outbound', body: 'That works on our end. Approve the quote whenever you’re ready and I’ll lock in the date.', hoursAgo: 97 },
    ],
  },
];

/**
 * Fixture → what the pane renders, formatted here and not in the browser.
 *
 * The timestamps come off Date.now() and go through toLocaleString, both of
 * which answer differently on the server and on the client. Formatting on this
 * side keeps the demo a server render with one clock and one timezone.
 *
 * The demo is a fixed snapshot, so nothing is waiting on anybody — there is no
 * unread badge, which would be a number a prospect could never clear.
 */
function toThreadView(thread: DemoThread): DemoThreadView {
  const last = thread.messages[thread.messages.length - 1];
  const runs = groupRuns(
    thread.messages.map((message, index) => ({ ...message, id: index, created_at: hoursAgo(message.hoursAgo) })),
  );

  return {
    phone: thread.phone,
    name: thread.name,
    previewPrefix: last.direction === 'outbound' ? 'You: ' : '',
    previewBody: last.body,
    timeLabel: formatTime(hoursAgo(last.hoursAgo)),
    runs: runs.map((run) => ({
      key: `${thread.phone}:${run.items[0].id}`,
      direction: run.direction,
      bubbles: run.items.map((message) => message.body),
      timeLabel: formatTime(run.items[run.items.length - 1].created_at),
    })),
  };
}

export default function DemoMessagesPage() {
  const threads = DEMO_THREADS.map(toThreadView);

  // Slate, same as the real inbox. The demo is what a prospect believes the
  // product looks like, so it cannot go on showing a dressing the product no
  // longer has.
  return (
    <main className="wide-shell workspace-shell inbox-slate">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Messages</p>
          <h1 className="workspace-title">Text inbox</h1>
          <p className="workspace-lead">Every customer text and your replies, threaded in one place.</p>
        </div>
      </section>

      <DemoInbox threads={threads} />

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Reply to customers by text</h2>
        </div>
        <p className="workspace-card-copy">
          When a customer texts your business number, their message threads here automatically and you
          can reply in one tap. This demo account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
