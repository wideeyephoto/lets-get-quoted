import Link from 'next/link';
import { formatFeedMoment, type ClientFeedItem, type FeedIconName } from '@/lib/client-feed';
import { formatMoneyExact as formatMoney } from '@/lib/jobs';

/**
 * THE PROJECT TRACKER, NOT THE AUDIT LOG.
 *
 * What was here: every event in an identical bordered card, each one a title, a
 * paragraph and a timestamp, all the same weight, oldest to newest with no
 * emphasis anywhere. Ten of those is a table of database rows with rounded
 * corners. A homeowner scanning it could not tell "$1,750 due" from "quote
 * prepared" without reading both in full, and the only action on any row was a
 * link that said "Open" — of what, it didn't say.
 *
 * What is here now:
 *
 *  - ONE CONTINUOUS RAIL. The cards are gone; a single vertical line runs the
 *    length of the feed with a glyph on it per event. Twelve borders is twelve
 *    things competing to be a box. One line is a sequence, which is what this
 *    is.
 *  - ONLY THE NEWEST IS LOUD. It gets the tint, the full type and the button.
 *    Everything below is quieter and tighter, because it is history — somebody
 *    arriving wants to know what just happened, not to re-read June.
 *  - COLOR MEANS SOMETHING. Green for agreed/paid/finished, orange for money
 *    owed or a decision waiting, sage for scheduling and information. Assigned
 *    per event kind in lib/client-feed, never chosen here.
 *  - THREE, THEN A DOOR. The first four events are open; the rest sit behind
 *    "View full history", which is a <details> and so needs no JavaScript and
 *    no client component. The rail runs straight through the summary, so the
 *    line itself is what tells you there is more underneath.
 *
 * Every word, glyph, color and button label arrives already decided from
 * toClientFeed. This file lays them out; it does not choose them. That is the
 * point — an event type gets a designed presentation once, in one table, rather
 * than a renderer guessing from strings.
 */

/** How many are worth reading on arrival. Beyond this is history. */
const RECENT = 4;

export default function JobTimeline({ items, businessName }: { items: ClientFeedItem[]; businessName: string }) {
  if (items.length === 0) {
    return <p className="empty-state">Nothing has happened yet. Updates from {businessName} will appear here.</p>;
  }

  const recent = items.slice(0, RECENT);
  const older = items.slice(RECENT);

  return (
    <div className="cfeed-wrap">
      <ol className="cfeed">
        {recent.map((item, index) => (
          <FeedRow item={item} latest={index === 0} key={item.id} />
        ))}
      </ol>
      {older.length > 0 ? (
        <details className="cfeed-more">
          <summary>
            <span className="cfeed-more-node" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5.5 9 6.5 6.5L18.5 9" />
              </svg>
            </span>
            <span className="cfeed-more-label">
              View full history<span className="cfeed-more-count"> · {older.length} more</span>
            </span>
          </summary>
          <ol className="cfeed">
            {older.map((item) => (
              <FeedRow item={item} latest={false} key={item.id} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function FeedRow({ item, latest }: { item: ClientFeedItem; latest: boolean }) {
  return (
    <li className={`cfeed-item tone-${item.tone}${latest ? ' is-latest' : ''}`}>
      <span className="cfeed-node" aria-hidden="true">
        <FeedIcon name={item.icon} />
      </span>
      <div className="cfeed-body">
        {/* Title, amount and status on ONE row, in that order. The amount used
            to float above the sentence that explained it and the status did not
            exist at all, so a payment request and a receipt looked identical. */}
        <p className="cfeed-head">
          <span className="cfeed-title">{item.title}</span>
          {item.amount ? <span className="cfeed-amount">{formatMoney(Number(item.amount))}</span> : null}
          {item.status ? <span className="cfeed-status">{item.status}</span> : null}
        </p>
        {item.body ? <p className="cfeed-copy">{item.body}</p> : null}
        {item.options.length > 0 ? (
          /* The dates as a list, because they were always a list. They reached
             this page as one paragraph of numbered prose — see shapeScheduled. */
          <ul className="cfeed-options">
            {item.options.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        ) : null}
        <p className="cfeed-when">
          {formatFeedMoment(item.at)}
          {/* Shown to the customer, not only to the person who changed it.
              Somebody who read "we'll be there Tuesday" and now sees Thursday
              is the one who planned their week around it. */}
          {item.editedAt ? <span className="feed-edited"> · edited {formatFeedMoment(item.editedAt)}</span> : null}
        </p>
        {item.actionUrl && item.actionLabel ? (
          /* A BUTTON THAT SAYS WHAT IT DOES. This was the word "Open", set in
             body text at the end of a timestamp line, on rows that might be a
             $1,750 payment request or a review form. */
          <Link href={item.actionUrl} className="cfeed-action">
            {item.actionLabel}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One glyph per kind of thing that happens, so the rail can be read down its
 * left edge without reading a word. Chosen in lib/client-feed and drawn here;
 * `currentColor` throughout so the tone class paints them.
 */
function FeedIcon({ name }: { name: FeedIconName }) {
  const paths: Record<FeedIconName, JSX.Element> = {
    check: <path d="M4.5 12.5 9 17l10.5-10.5" />,
    doc: (
      <>
        <path d="M6 3.5h7L18 8.5v12H6z" />
        <path d="M13 3.5V9h5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.75" y="5.5" width="16.5" height="15" rx="2.5" />
        <path d="M3.75 10.5h16.5M8.5 3v5M15.5 3v5" />
      </>
    ),
    card: (
      <>
        <rect x="2.75" y="5.5" width="18.5" height="13" rx="2.5" />
        <path d="M2.75 10h18.5" />
      </>
    ),
    receipt: (
      <>
        <path d="M5.5 3.5h13v17l-2.6-1.8-2.4 1.8-2.5-1.8L8.1 20.5 5.5 18.7z" />
        <path d="M9 9h6M9 13h6" />
      </>
    ),
    message: <path d="M20.5 12.5a7.5 7.5 0 0 1-7.5 7.5H4.5l2-3a7.5 7.5 0 1 1 14-4.5Z" />,
    tools: (
      <>
        <path d="M14.5 3.5a5 5 0 0 0 6.2 6.6L11 20l-4-4 9.9-9.7A5 5 0 0 0 14.5 3.5Z" />
        <path d="M6.5 17.5h.01" />
      </>
    ),
    shield: <path d="M12 3.2 20 6v6c0 4.6-3.3 7.7-8 8.8-4.7-1.1-8-4.2-8-8.8V6Z" />,
    star: <path d="m12 3.8 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 10.2l6-.9Z" />,
    alert: (
      <>
        <path d="M12 3.6 21.5 20H2.5Z" />
        <path d="M12 10v4.2M12 17.2h.01" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
