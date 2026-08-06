'use client';

import { useState } from 'react';

/**
 * The demo inbox's list and thread pane, switching in place.
 *
 * This used to be six <Link>s to /demo/messages?thread=…, which meant picking a
 * conversation was a NAVIGATION — and the router scrolls a new page to the top,
 * so every click threw the whole page up to the hero. `scroll={false}` fixes
 * that, and it is still the right fix for the real inbox, which genuinely has to
 * go back to the server for the thread's messages, its context rail and its
 * read receipts.
 *
 * The demo has none of that. All six threads are fixed fixtures already sitting
 * in the payload, so the round-trip was buying nothing and the scroll reset was
 * paying for it. Selecting in local state is both instant and immune to whatever
 * the router decides scrolling should mean.
 *
 * Everything here arrives pre-formatted. Timestamps are derived from Date.now()
 * and rendered with toLocaleString, so computing them on this side of the wire
 * would give the server's clock and zone one answer and the browser's another —
 * a hydration mismatch on every row. The server page does the formatting; this
 * component only chooses which thread to show.
 */

export type DemoRun = {
  key: string;
  direction: string;
  bubbles: string[];
  timeLabel: string;
};

export type DemoThreadView = {
  phone: string;
  name: string;
  /** 'You: ' when the last word was ours, otherwise empty. */
  previewPrefix: string;
  previewBody: string;
  timeLabel: string;
  runs: DemoRun[];
};

export default function DemoInbox({ threads }: { threads: DemoThreadView[] }) {
  const [activePhone, setActivePhone] = useState(threads[0]?.phone ?? '');
  const active = threads.find((thread) => thread.phone === activePhone) ?? threads[0];

  if (!active) return null;

  return (
    <section className="inbox-layout">
      <aside className="panel workspace-section-card inbox-list">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Conversations</p>
        </div>
        <div className="inbox-thread-list">
          {threads.map((thread) => (
            <button
              key={thread.phone}
              type="button"
              onClick={() => setActivePhone(thread.phone)}
              className={`inbox-thread-item${thread.phone === active.phone ? ' is-active' : ''}`}
              aria-current={thread.phone === active.phone ? 'true' : undefined}
            >
              <div className="inbox-thread-top">
                <strong>{thread.name}</strong>
                <span className="inbox-thread-time">{thread.timeLabel}</span>
              </div>
              <p className="inbox-thread-preview">
                {thread.previewPrefix}
                {thread.previewBody}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <div className="panel workspace-section-card inbox-thread">
        <div className="section-heading workspace-section-heading compact-heading inbox-thread-head">
          <div>
            <h2>{active.name}</h2>
            <p className="job-meta">{active.phone}</p>
          </div>
        </div>

        {/* Same run structure as the real inbox — the bubbles share its CSS,
            and a flat list here would render every message left-aligned the
            moment that CSS moved alignment onto the run. */}
        <div className="inbox-messages">
          {active.runs.map((run) => (
            <div className={`inbox-run inbox-run-${run.direction}`} key={run.key}>
              {/* No avatar: the bubble's side already says who spoke. */}
              <div className="inbox-run-stack">
                {run.bubbles.map((body, index) => (
                  <div
                    key={index}
                    className={`inbox-bubble inbox-bubble-${run.direction}${index === run.bubbles.length - 1 ? ' is-last' : ''}`}
                  >
                    <p>{body}</p>
                  </div>
                ))}
                <span className="inbox-run-time">
                  {run.timeLabel}
                  {run.direction === 'outbound' ? <> · Sent</> : null}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="inbox-reply-area">
          <form className="inbox-reply">
            <textarea rows={2} placeholder="Type a reply…" aria-label="Reply message" disabled />
            <button type="button" className="btn primary" disabled>Send</button>
          </form>
        </div>
      </div>
    </section>
  );
}
